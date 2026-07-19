import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import { loadVerifiedSottoControlDar } from "../src/five-north-dar-artifact.js";
import {
  initializeFiveNorthPackageDeploymentJournal,
  markFiveNorthPackageUploadStarted,
} from "../src/five-north-package-deployment-journal.js";
import { startJournaledFiveNorthPackageDeployment } from "../src/five-north-package-deployment-journal-runner.js";
import type {
  FiveNorthPackageDeploymentAuthority,
  FiveNorthPackageDeploymentTransport,
} from "../src/five-north-package-deployment.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "../src/sotto-control-dar-inventory.js";

const roots: string[] = [];
const synchronizerId = `global-domain::1220${"c".repeat(64)}`;

async function fixture(commit = "a".repeat(40), contents = "production dar") {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "sotto-package-security-"),
  );
  roots.push(workspaceRoot);
  const directory = join(workspaceRoot, "daml/sotto-control/.daml/dist");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "sotto-control-0.2.0.dar"), contents);
  const packages = Object.fromEntries(
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
  );
  const artifact = await loadVerifiedSottoControlDar({
    executeDpm: vi.fn(async (_command, arguments_) => {
      if (arguments_.length === 1 && arguments_[0] === "version") {
        return " * 3.5.2 \n";
      }
      return arguments_.includes("inspect-dar")
        ? JSON.stringify({
            main_package_id: SOTTO_CONTROL_PACKAGE_ID,
            packages,
          })
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

function transport(
  observed = authority(),
): FiveNorthPackageDeploymentTransport &
  Record<string, ReturnType<typeof vi.fn>> {
  return {
    listPackageIds: vi.fn(),
    observeDeploymentAuthority: vi.fn(async () => observed),
    readPackagePresence: vi.fn(),
    uploadDar: vi.fn(),
    validateDar: vi.fn(),
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("Five North package journal security", () => {
  it("rejects changed source or DAR before any network call", async () => {
    const original = await fixture();
    const initialized = await initializeFiveNorthPackageDeploymentJournal({
      ...original,
      authority: authority(),
    });
    await markFiveNorthPackageUploadStarted({
      operationId: initialized.operationId,
      workspaceRoot: original.workspaceRoot,
    });
    const changed = await fixture("f".repeat(40), "changed production dar");
    const network = transport();
    await expect(
      startJournaledFiveNorthPackageDeployment({
        artifact: changed.artifact,
        transport: network,
        workspaceRoot: original.workspaceRoot,
      }),
    ).rejects.toThrow("artifact does not match");
    expect(network.listPackageIds).not.toHaveBeenCalled();
    expect(network.observeDeploymentAuthority).not.toHaveBeenCalled();
  });

  it("rejects corrupt journal state before any network call", async () => {
    const input = await fixture();
    await initializeFiveNorthPackageDeploymentJournal({
      ...input,
      authority: authority(),
    });
    await writeFile(
      join(
        input.workspaceRoot,
        "tmp/devnet-sotto-control-package/00-intent.json",
      ),
      "{}\n",
    );
    const network = transport();
    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: network,
      }),
    ).rejects.toThrow("keys are invalid");
    expect(network.listPackageIds).not.toHaveBeenCalled();
    expect(network.observeDeploymentAuthority).not.toHaveBeenCalled();
  });

  it("rejects changed authority before validation or upload", async () => {
    const input = await fixture();
    await initializeFiveNorthPackageDeploymentJournal({
      ...input,
      authority: authority(),
    });
    const changedAuthority = {
      ...authority(),
      authenticatedUserSha256: `sha256:${"9".repeat(64)}`,
    } as FiveNorthPackageDeploymentAuthority;
    const network = transport(changedAuthority);
    await expect(
      startJournaledFiveNorthPackageDeployment({
        ...input,
        transport: network,
      }),
    ).rejects.toThrow("authority does not match");
    expect(network.validateDar).not.toHaveBeenCalled();
    expect(network.uploadDar).not.toHaveBeenCalled();
  });
});
