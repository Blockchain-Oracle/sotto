import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCapabilityBootstrapCompletion } from "../src/capability-bootstrap-completion.js";
import {
  bootstrapRequest,
  checkpointEntry,
  completionEntry,
} from "./capability-bootstrap-completion.fixtures.js";

function read(input: {
  beginExclusive?: number;
  end?: number;
  pages: unknown[];
}) {
  const bootstrap = bootstrapRequest();
  const readPage = vi.fn();
  for (const page of input.pages) readPage.mockResolvedValueOnce(page);
  return {
    bootstrap,
    readPage,
    result: readCapabilityBootstrapCompletion({
      beginExclusive: input.beginExclusive ?? 41,
      readLedgerEndOffset: async () => input.end ?? 42,
      readPage,
      request: bootstrap,
    }),
  };
}

describe("capability bootstrap completion security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T19:30:00.000Z") });
  });

  it("classifies rejection and complete absence", async () => {
    const rejected = read({
      pages: [[completionEntry(bootstrapRequest(), { statusCode: 7 })]],
    });
    await expect(rejected.result).resolves.toEqual({
      classification: "REJECTED",
      completionOffset: 42,
      statusCode: 7,
    });

    const absent = read({ pages: [[checkpointEntry(42)]] });
    await expect(absent.result).resolves.toEqual({
      classification: "ABSENT_COMPLETE",
      completionOffset: 42,
    });
  });

  it("rejects a status code outside google.rpc.Code", async () => {
    const setup = read({
      pages: [[completionEntry(bootstrapRequest(), { statusCode: 17 })]],
    });

    await expect(setup.result).rejects.toThrow(/status/iu);
  });

  it("accepts the official Empty variant without weakening coverage", async () => {
    const empty = { completionResponse: { Empty: {} } };
    const setup = read({ pages: [[empty, checkpointEntry(42)]] });

    await expect(setup.result).resolves.toMatchObject({
      classification: "ABSENT_COMPLETE",
    });
  });

  it("rejects contradictory completion variants", async () => {
    const bootstrap = bootstrapRequest();
    const contradictory = completionEntry(bootstrap);
    const response = contradictory.completionResponse as Record<
      string,
      unknown
    >;
    response.OffsetCheckpoint = {
      value: { offset: 42 },
    };

    await expect(read({ pages: [[contradictory]] }).result).rejects.toThrow(
      /variant|keys/iu,
    );
  });

  it("rejects a matching completion at the excluded cursor", async () => {
    const bootstrap = bootstrapRequest();
    const setup = read({
      end: 42,
      pages: [
        [completionEntry(bootstrap, { offset: 41 }), checkpointEntry(42)],
      ],
    });

    await expect(setup.result).rejects.toThrow(/exclusive|offset/iu);
  });

  it("rejects offset regression inside a page", async () => {
    const bootstrap = bootstrapRequest();
    const setup = read({
      end: 43,
      pages: [
        [
          completionEntry(bootstrap, {
            commandId: "another-command",
            offset: 43,
          }),
          checkpointEntry(42),
        ],
      ],
    });

    await expect(setup.result).rejects.toThrow(/monotonic|offset/iu);
  });

  it("rejects duplicate exact completions and authority substitution", async () => {
    const bootstrap = bootstrapRequest();
    await expect(
      read({
        pages: [[completionEntry(bootstrap), completionEntry(bootstrap)]],
      }).result,
    ).rejects.toThrow(/duplicate/iu);

    await expect(
      read({
        pages: [[completionEntry(bootstrap, { userId: "different-user" })]],
      }).result,
    ).rejects.toThrow(/authority/iu);
  });

  it("rejects a non-advancing page and a backwards captured end", async () => {
    await expect(read({ end: 42, pages: [[]] }).result).rejects.toThrow(
      /advance/iu,
    );
    await expect(
      read({ beginExclusive: 42, end: 41, pages: [] }).result,
    ).rejects.toThrow(/backwards/iu);
  });

  it("caps pagination before an unbounded scan", async () => {
    const pages = Array.from({ length: 32 }, (_, index) => [
      checkpointEntry(42 + index),
    ]);
    await expect(read({ end: 74, pages }).result).rejects.toThrow(
      /page limit/iu,
    );
  });
});
