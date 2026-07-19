import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistLocalPrepareArtifact } from "../src/local-prepare-artifact.js";

const workspaces: string[] = [];

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sotto-local-artifact-"));
  workspaces.push(root);
  await mkdir(join(root, "tmp"), { mode: 0o700 });
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    workspaces
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("local prepare artifact", () => {
  it("atomically persists a new owner-only artifact below workspace tmp", async () => {
    const root = await workspace();
    const target = "tmp/nested/prepared.json";
    const bytes = new TextEncoder().encode("prepared");

    await persistLocalPrepareArtifact(root, target, bytes);

    expect(await readFile(join(root, target), "utf8")).toBe("prepared");
    expect((await lstat(join(root, target))).mode & 0o777).toBe(0o600);
  });

  it("rejects traversal and leaves the outside path absent", async () => {
    const root = await workspace();
    const outside = join(root, "outside.json");

    await expect(
      persistLocalPrepareArtifact(
        root,
        "tmp/../outside.json",
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(/workspace tmp/i);
    await expect(lstat(outside)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked parents", async () => {
    const root = await workspace();
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, "tmp", "linked"));

    await expect(
      persistLocalPrepareArtifact(
        root,
        "tmp/linked/prepared.json",
        new Uint8Array([1]),
      ),
    ).rejects.toThrow(/symlink/i);
  });

  it("never overwrites or changes the mode of an existing target", async () => {
    const root = await workspace();
    const target = join(root, "tmp", "prepared.json");
    await writeFile(target, "existing", { mode: 0o644 });
    await chmod(target, 0o644);

    await expect(
      persistLocalPrepareArtifact(
        root,
        "tmp/prepared.json",
        new TextEncoder().encode("replacement"),
      ),
    ).rejects.toThrow(/already exists/i);
    expect(await readFile(target, "utf8")).toBe("existing");
    expect((await lstat(target)).mode & 0o777).toBe(0o644);
  });
});
