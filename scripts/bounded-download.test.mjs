import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readBoundedFile, readBoundedResponse } from "./bounded-download.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("bounded artifact reads", () => {
  it("rejects an oversized cached file before returning bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sotto-dar-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "artifact.dar");
    await writeFile(path, new Uint8Array(6));

    await expect(readBoundedFile(path, 5)).rejects.toThrow(
      "artifact.dar exceeds 5 bytes",
    );
  });

  it("rejects an oversized response declared by content-length", async () => {
    const response = new Response(new Uint8Array(1), {
      headers: { "content-length": "6" },
    });

    await expect(
      readBoundedResponse(response, 5, "artifact.dar"),
    ).rejects.toThrow("artifact.dar exceeds 5 bytes");
  });

  it("rejects a streamed response as soon as chunks exceed the cap", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
          controller.close();
        },
      }),
    );

    await expect(
      readBoundedResponse(response, 5, "artifact.dar"),
    ).rejects.toThrow("artifact.dar exceeds 5 bytes");
  });

  it("returns exact bytes at the response limit", async () => {
    const expected = new Uint8Array([1, 2, 3, 4, 5]);
    const actual = await readBoundedResponse(
      new Response(expected, { headers: { "content-length": "5" } }),
      5,
      "artifact.dar",
    );

    expect(actual).toEqual(expected);
  });
});
