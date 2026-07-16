import {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  PREPARED_CAPABILITY_BOOTSTRAP_PATH,
  PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
} from "@sotto/x402-canton";
import { expect, it, vi } from "vitest";
import { createFiveNorthWalletCapabilityTransport } from "../src/five-north-wallet-capability-transport.js";
import type { FiveNorthPrepareTransport } from "../src/five-north-prepare-transport.js";

it("uses fresh offsets and the exact prepare-only envelope", async () => {
  const readLedgerEnd = vi
    .fn()
    .mockResolvedValueOnce({ offset: 10 })
    .mockResolvedValueOnce({ offset: 20 })
    .mockResolvedValueOnce({ offset: 30 });
  const readCapabilityContracts = vi.fn(async (offset: number) => [offset]);
  const readPrepare = vi.fn(async () => new Uint8Array([7]));
  const prepareTransport = {
    readAuthenticatedUserId: vi.fn(async () => "validator-devnet-m2m"),
    readCapabilityContracts,
    readLedgerEnd,
    readPrepare,
  } as unknown as FiveNorthPrepareTransport;
  const execute = vi.fn();
  const readCompletion = vi.fn();
  const transport = createFiveNorthWalletCapabilityTransport({
    execute,
    prepareTransport,
    readCompletion,
  });
  const body = Object.freeze({ commandId: "approved-create" });

  await expect(transport.readActiveCapabilities()).resolves.toEqual([10]);
  await expect(transport.readActiveCapabilities()).resolves.toEqual([20]);
  await expect(transport.readLedgerEndOffset()).resolves.toBe(30);
  await expect(
    transport.prepare({
      body: body as never,
      contentType: "application/json",
      maximumResponseBytes: MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
      method: "POST",
      path: PREPARED_CAPABILITY_BOOTSTRAP_PATH,
      redirect: "error",
      timeoutMilliseconds: PREPARED_CAPABILITY_BOOTSTRAP_TIMEOUT_MS,
    }),
  ).resolves.toEqual(new Uint8Array([7]));

  expect(readCapabilityContracts).toHaveBeenNthCalledWith(1, 10);
  expect(readCapabilityContracts).toHaveBeenNthCalledWith(2, 20);
  expect(readPrepare).toHaveBeenCalledWith(body);
  expect(transport.execute).toBe(execute);
  expect(transport.readCompletion).toBe(readCompletion);
  expect(transport).not.toHaveProperty("submit");
});
