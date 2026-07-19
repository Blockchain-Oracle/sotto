import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import {
  loadVerifiedSottoControlDar,
  verifiedSottoControlDarBytes,
} from "../src/five-north-dar-artifact.js";
import { APPROVED_SOTTO_CONTROL_DAR_PACKAGES } from "../src/sotto-control-dar-inventory.js";

const sourceCommit = "a".repeat(40);
const directories: string[] = [];

function inspection(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

async function artifact(overrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "sotto-dar-test-"));
  directories.push(directory);
  const darPath = join(
    directory,
    "daml/sotto-control/.daml/dist/sotto-control-0.2.0.dar",
  );
  await mkdir(join(directory, "daml/sotto-control/.daml/dist"), {
    recursive: true,
  });
  await writeFile(darPath, "production dar bytes");
  const executeDpm = vi.fn(
    async (_command: string, arguments_: readonly string[]) => {
      if (arguments_.length === 1 && arguments_[0] === "version") {
        return " * 3.5.2 \n";
      }
      return arguments_.includes("inspect-dar")
        ? JSON.stringify(inspection(overrides))
        : "DAR is valid";
    },
  );
  const executeGit = vi.fn(async (arguments_: readonly string[]) =>
    arguments_.includes("rev-parse") ? `${sourceCommit}\n` : "",
  );
  return {
    darPath,
    executeDpm,
    executeGit,
    value: await loadVerifiedSottoControlDar({
      executeDpm,
      executeGit,
      workspaceRoot: directory,
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("verified sotto-control DAR artifact", () => {
  it("loads only the validated production DAR from one clean source commit", async () => {
    const loaded = await artifact();
    expect(loaded.executeDpm).toHaveBeenNthCalledWith(1, "dpm", ["version"]);
    expect(loaded.executeDpm).toHaveBeenNthCalledWith(2, "dpm", [
      "validate-dar",
      expect.stringMatching(/sotto-control-0\.2\.0\.dar$/u),
    ]);
    expect(loaded.executeDpm).toHaveBeenNthCalledWith(3, "dpm", [
      "damlc",
      "inspect-dar",
      expect.stringMatching(/sotto-control-0\.2\.0\.dar$/u),
      "--json",
    ]);
    expect(loaded.value).toMatchObject({
      packageId: SOTTO_CONTROL_PACKAGE_ID,
      sourceCommit,
    });
    expect(loaded.value).not.toHaveProperty("bytes");
    expect(loaded.executeGit).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["wrong main package", { main_package_id: "0".repeat(64) }],
    ["wrong package inventory", { packages: {} }],
  ])("rejects %s", async (_label, override) => {
    await expect(artifact(override)).rejects.toThrow();
  });

  it("rejects a mixed production and test DAR inventory", async () => {
    await expect(
      artifact({
        packages: {
          ...inspection().packages,
          ["1".repeat(64)]: {
            name: "sotto-control-tests",
            path: "sotto-control-tests.dalf",
            version: "0.1.0",
          },
        },
      }),
    ).rejects.toThrow("inventory");
  });

  it("uploads the byte snapshot that DPM validated despite source changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sotto-dar-race-test-"));
    directories.push(directory);
    const darPath = join(
      directory,
      "daml/sotto-control/.daml/dist/sotto-control-0.2.0.dar",
    );
    await mkdir(join(directory, "daml/sotto-control/.daml/dist"), {
      recursive: true,
    });
    const original = new TextEncoder().encode("original production dar");
    await writeFile(darPath, original);
    const executeDpm = vi.fn(
      async (_command: string, arguments_: readonly string[]) => {
        if (arguments_.length === 1 && arguments_[0] === "version") {
          return " * 3.5.2 \n";
        }
        if (arguments_.includes("validate-dar")) {
          await writeFile(darPath, "mutated after snapshot");
          return "DAR is valid";
        }
        return JSON.stringify(inspection());
      },
    );
    const value = await loadVerifiedSottoControlDar({
      executeDpm,
      executeGit: vi.fn(async (arguments_: readonly string[]) =>
        arguments_.includes("rev-parse") ? `${sourceCommit}\n` : "",
      ),
      workspaceRoot: directory,
    });
    expect(String(executeDpm.mock.calls[1]![1][1])).not.toBe(darPath);
    expect(verifiedSottoControlDarBytes(value)).toEqual(original);
  });

  it("rejects source changes that happen during DAR verification", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sotto-dar-source-race-"));
    directories.push(directory);
    const darDirectory = join(directory, "daml/sotto-control/.daml/dist");
    await mkdir(darDirectory, { recursive: true });
    await writeFile(join(darDirectory, "sotto-control-0.2.0.dar"), "dar");
    const executeGit = vi
      .fn()
      .mockResolvedValueOnce(`${sourceCommit}\n`)
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce(`${sourceCommit}\n`)
      .mockResolvedValueOnce(" M daml/source.daml\n");

    await expect(
      loadVerifiedSottoControlDar({
        executeDpm: vi.fn(async (_command, arguments_) => {
          if (arguments_.length === 1 && arguments_[0] === "version") {
            return " * 3.5.2 \n";
          }
          return arguments_.includes("inspect-dar")
            ? JSON.stringify(inspection())
            : "DAR is valid";
        }),
        executeGit,
        workspaceRoot: directory,
      }),
    ).rejects.toThrow("clean working tree");
  });

  it("rejects an unpinned active Daml SDK before validation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sotto-dar-sdk-test-"));
    directories.push(directory);
    const darDirectory = join(directory, "daml/sotto-control/.daml/dist");
    await mkdir(darDirectory, { recursive: true });
    await writeFile(join(darDirectory, "sotto-control-0.2.0.dar"), "dar");
    const executeDpm = vi.fn(async () => " * 3.6.0 \n");

    await expect(
      loadVerifiedSottoControlDar({
        executeDpm,
        executeGit: vi.fn(async (arguments_) =>
          arguments_.includes("rev-parse") ? `${sourceCommit}\n` : "",
        ),
        workspaceRoot: directory,
      }),
    ).rejects.toThrow("Daml SDK 3.5.2");
    expect(executeDpm).toHaveBeenCalledOnce();
  });

  it("rejects dirty source before invoking DPM", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sotto-dar-dirty-test-"));
    directories.push(directory);
    const darDirectory = join(directory, "daml/sotto-control/.daml/dist");
    await mkdir(darDirectory, { recursive: true });
    await writeFile(join(darDirectory, "sotto-control-0.2.0.dar"), "dar");
    const executeDpm = vi.fn();
    await expect(
      loadVerifiedSottoControlDar({
        executeDpm,
        executeGit: vi
          .fn()
          .mockResolvedValueOnce(`${sourceCommit}\n`)
          .mockResolvedValueOnce(" M daml/source.daml\n"),
        workspaceRoot: directory,
      }),
    ).rejects.toThrow("clean working tree");
    expect(executeDpm).not.toHaveBeenCalled();
  });
});
