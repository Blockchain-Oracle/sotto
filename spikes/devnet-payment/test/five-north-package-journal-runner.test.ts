import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { loadVerifiedSottoControlDar } from "../src/five-north-dar-artifact.js";
import {
  initializeFiveNorthPackageDeploymentJournal,
  loadFiveNorthPackageDeploymentJournal,
  markFiveNorthPackageUploadStarted,
} from "../src/five-north-package-deployment-journal.js";
import { startJournaledFiveNorthPackageDeployment } from "../src/five-north-package-deployment-journal-runner.js";
import type {
  FiveNorthPackageDeploymentAuthority,
  FiveNorthPackageDeploymentTransport,
} from "../src/five-north-package-deployment.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "../src/sotto-control-dar-inventory.js";

const roots: string[] = [];
const sourceCommit = "a".repeat(40);
const otherPackage = "b".repeat(64);
const synchronizerId = `global-domain::1220${"c".repeat(64)}`;

function inspection() {
  return {
    main_package_id: SOTTO_CONTROL_PACKAGE_ID,
    packages: Object.fromEntries(
      APPROVED_SOTTO_CONTROL_DAR_PACKAGES.map(([id, name, version]) => [
        id,
        {
          name,
          path:
            id === SOTTO_CONTROL_PACKAGE_ID
              ? `sotto-control-0.2.0-${id}/sotto-control-0.2.0-${id}.dalf`
              : `${name}-${id}.dalf`,
          version,
        },
      ]),
    ),
  };
}

async function fixture(
  commit = sourceCommit,
  darContents = "production dar bytes",
) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-package-runner-"));
  roots.push(workspaceRoot);
  const directory = join(workspaceRoot, "daml/sotto-control/.daml/dist");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "sotto-control-0.2.0.dar"), darContents);
  const artifact = await loadVerifiedSottoControlDar({
    executeDpm: vi.fn(async (_command, arguments_) => {
      if (arguments_.length === 1 && arguments_[0] === "version") {
        return " * 3.5.2 \n";
      }
      return arguments_.includes("inspect-dar")
        ? JSON.stringify(inspection())
        : "DAR is valid";
    }),
    executeGit: vi.fn(async (arguments_) =>
      arguments_.includes("rev-parse") ? `${commit}\n` : "",
    ),
    workspaceRoot,
  });
  return { artifact, workspaceRoot };
}

function authority() {
  return {
    authenticatedUserSha256: `sha256:${"d".repeat(64)}`,
    observationId: `sha256:${"e".repeat(64)}`,
    observedAt: "2026-07-13T20:00:00.000Z",
    synchronizerId,
  } as FiveNorthPackageDeploymentAuthority;
}

function present() {
  return {
    archivePayloadSha256: SOTTO_CONTROL_PACKAGE_ID,
    packageId: SOTTO_CONTROL_PACKAGE_ID,
  };
}

function transport(input: {
  authority?: FiveNorthPackageDeploymentAuthority;
  lists: unknown[];
  preflightError?: Error;
  upload?: () => Promise<void>;
}): FiveNorthPackageDeploymentTransport &
  Record<string, ReturnType<typeof vi.fn>> {
  return {
    listPackageIds: vi.fn(async () => {
      const value = input.lists.shift();
      if (value instanceof Error) throw value;
      return value;
    }),
    observeDeploymentAuthority: vi.fn(
      async () => input.authority ?? authority(),
    ),
    readPackagePresence: vi.fn(async () => present()),
    uploadDar: vi.fn(
      async (
        _bytes: Uint8Array,
        _authority: FiveNorthPackageDeploymentAuthority,
        beforeDispatch: () => Promise<void>,
      ) => {
        if (input.preflightError !== undefined) throw input.preflightError;
        await beforeDispatch();
        await input.upload?.();
      },
    ),
    validateDar: vi.fn(async () => undefined),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("journaled Five North package deployment", () => {
  it("persists dispatch before one upload and returns terminal without network", async () => {
    const input = await fixture();
    let dispatchWasDurable = false;
    const first = transport({
      lists: [
        { packageIds: [otherPackage] },
        { packageIds: [SOTTO_CONTROL_PACKAGE_ID] },
      ],
      upload: async () => {
        dispatchWasDurable = (
          await loadFiveNorthPackageDeploymentJournal(input.workspaceRoot)
        ).uploadStarted;
      },
    });

    await expect(
      startJournaledFiveNorthPackageDeployment({ ...input, transport: first }),
    ).resolves.toMatchObject({
      outcome: "present-after-dispatch",
      status: "present",
    });
    expect(dispatchWasDurable).toBe(true);
    expect(first.uploadDar).toHaveBeenCalledOnce();

    const terminal = transport({ lists: [] });
    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: terminal,
      }),
    ).resolves.toMatchObject({
      outcome: "present-after-dispatch",
      status: "present",
    });
    expect(terminal.listPackageIds).not.toHaveBeenCalled();
    expect(terminal.observeDeploymentAuthority).not.toHaveBeenCalled();
    expect(terminal.uploadDar).not.toHaveBeenCalled();
  });

  it("reconciles a lost upload response without a second upload", async () => {
    const input = await fixture();
    const first = transport({
      lists: [
        { packageIds: [otherPackage] },
        { packageIds: [SOTTO_CONTROL_PACKAGE_ID] },
      ],
      upload: async () => {
        throw new Error("connection reset");
      },
    });

    await expect(
      startJournaledFiveNorthPackageDeployment({ ...input, transport: first }),
    ).resolves.toMatchObject({
      outcome: "present-after-dispatch",
      status: "present",
    });
    expect(first.uploadDar).toHaveBeenCalledOnce();
  });

  it("keeps an unresolved dispatch read-only across restart", async () => {
    const input = await fixture();
    const first = transport({
      lists: [{ packageIds: [otherPackage] }, { packageIds: [otherPackage] }],
      upload: async () => {
        throw new Error("timeout");
      },
    });
    await expect(
      startJournaledFiveNorthPackageDeployment({ ...input, transport: first }),
    ).resolves.toMatchObject({
      outcome: "dispatch-unresolved",
      status: "unknown",
    });

    const recovery = transport({ lists: [{ packageIds: [otherPackage] }] });
    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: recovery,
      }),
    ).resolves.toMatchObject({
      outcome: "dispatch-unresolved",
      status: "unknown",
    });
    expect(recovery.observeDeploymentAuthority).not.toHaveBeenCalled();
    expect(recovery.validateDar).not.toHaveBeenCalled();
    expect(recovery.uploadDar).not.toHaveBeenCalled();
  });

  it("leaves no dispatch marker when upload preflight fails", async () => {
    const input = await fixture();
    const network = transport({
      lists: [{ packageIds: [otherPackage] }],
      preflightError: new Error("upload token preflight failed"),
    });

    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: network,
      }),
    ).rejects.toThrow("upload token preflight failed");
    await expect(
      loadFiveNorthPackageDeploymentJournal(input.workspaceRoot),
    ).resolves.toMatchObject({ uploadStarted: false });
  });

  it("never uploads after a durable pre-dispatch crash marker", async () => {
    const input = await fixture();
    const initialized = await initializeFiveNorthPackageDeploymentJournal({
      ...input,
      authority: authority(),
    });
    await markFiveNorthPackageUploadStarted({
      operationId: initialized.operationId,
      workspaceRoot: input.workspaceRoot,
    });
    const recovery = transport({ lists: [{ packageIds: [otherPackage] }] });

    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: recovery,
      }),
    ).resolves.toMatchObject({ status: "unknown" });
    expect(recovery.uploadDar).not.toHaveBeenCalled();
  });

  it("serializes concurrent starters to exactly one upload", async () => {
    const input = await fixture();
    const shared = transport({
      lists: [
        { packageIds: [otherPackage] },
        { packageIds: [SOTTO_CONTROL_PACKAGE_ID] },
      ],
    });

    const results = await Promise.allSettled([
      startJournaledFiveNorthPackageDeployment({ ...input, transport: shared }),
      startJournaledFiveNorthPackageDeployment({ ...input, transport: shared }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(shared.uploadDar).toHaveBeenCalledOnce();

    await expect(
      startJournaledFiveNorthPackageDeployment({ ...input, transport: shared }),
    ).resolves.toMatchObject({ status: "present" });
    expect(shared.uploadDar).toHaveBeenCalledOnce();
  });
});
