import { expect, it, vi } from "vitest";
import { runFiveNorthExternalPayerTapCli } from "../src/five-north-external-payer-tap-cli.js";
import {
  TAP_PAYER,
  TAP_SYNCHRONIZER,
} from "./five-north-external-payer-tap.fixtures.js";

const fingerprint = `1220${"b".repeat(64)}`;

it("runs the exact unattended tap without a confirmation argument", async () => {
  const signal = new AbortController().signal;
  const prepareTap = vi.fn();
  const acquirePreparation = vi.fn(async () => prepareTap);
  const runTap = vi.fn(async () => ({ completed: true }));
  const environment = { SAFE: "value" };

  await expect(
    runFiveNorthExternalPayerTapCli(
      {
        arguments: [
          "--expected-fingerprint",
          fingerprint,
          "--key-file",
          "/wallet/payer.key",
          "--payer-party",
          TAP_PAYER,
          "--synchronizer-id",
          TAP_SYNCHRONIZER,
        ],
        environment,
        signal,
      },
      { acquirePreparation, runTap },
    ),
  ).resolves.toEqual({ completed: true });

  expect(acquirePreparation).toHaveBeenCalledWith(environment, signal);
  expect(runTap).toHaveBeenCalledWith(
    {
      amount: "1.0000000000",
      expectedFingerprint: fingerprint,
      keyFile: "/wallet/payer.key",
      payerParty: TAP_PAYER,
      signal,
      submissionId: expect.stringMatching(
        /^sotto-external-payer-tap-v1-[0-9a-f]{64}$/u,
      ),
      synchronizerId: TAP_SYNCHRONIZER,
    },
    { prepareTap },
  );
});

it("rejects missing or unknown arguments before SDK initialization", async () => {
  const acquirePreparation = vi.fn();
  const runTap = vi.fn();
  await expect(
    runFiveNorthExternalPayerTapCli(
      {
        arguments: ["--approve", "anything"],
        environment: {},
        signal: new AbortController().signal,
      },
      { acquirePreparation, runTap },
    ),
  ).rejects.toThrow(/arguments/iu);
  expect(acquirePreparation).not.toHaveBeenCalled();
  expect(runTap).not.toHaveBeenCalled();
});
