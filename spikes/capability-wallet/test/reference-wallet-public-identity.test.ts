import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import { SDK } from "@canton-network/wallet-sdk";
import { buildBoundedCapabilityBootstrap } from "../../../packages/x402-canton/src/index.js";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  validPreparedCapabilityBootstrap,
} from "../../../packages/x402-canton/test/prepared-capability-bootstrap.fixtures.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readReferenceWalletPublicIdentity,
  recomputeReferenceWalletPreparedHash,
} from "../src/reference-wallet-public-identity.js";

const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

it("derives only the public identity and official prepared hash", async () => {
  const parent = await mkdtemp(join(tmpdir(), "sotto-wallet-identity-"));
  cleanups.push(() => rm(parent, { force: true, recursive: true }));
  const wallet = join(parent, "wallet");
  await mkdir(wallet, { mode: 0o700 });
  const sdk = SDK.createOffline();
  const keys = sdk.keys.generate();
  const keyFile = join(wallet, "payer.key");
  await writeFile(keyFile, Buffer.from(keys.privateKey, "base64"), {
    mode: 0o600,
  });
  const identity = await readReferenceWalletPublicIdentity(keyFile);
  const request = buildBoundedCapabilityBootstrap({
    ...CAPABILITY_BOOTSTRAP_INPUT,
    transferFactoryContractId: `00${"f".repeat(64)}`,
  });
  const fixture = validPreparedCapabilityBootstrap(request);
  const root = fixture.transaction?.nodes[0]?.versionedNode;
  if (root?.oneofKind !== "v1") throw new Error("test root is absent");
  const node = root.v1.nodeType;
  if (node.oneofKind !== "create") throw new Error("test root is invalid");
  node.create.contractId = `00${"c".repeat(64)}`;
  const prepared = PreparedTransaction.toBinary(fixture, {
    writeUnknownFields: false,
  });
  const expectedHash = await sdk.utils.hash.preparedTransaction(
    Buffer.from(prepared).toString("base64"),
  );

  expect(identity).toEqual({
    fingerprint: await sdk.keys.fingerprint(keys.publicKey),
    publicKey: keys.publicKey,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
  });
  expect(Object.isFrozen(identity)).toBe(true);
  expect(await recomputeReferenceWalletPreparedHash(prepared)).toEqual(
    new Uint8Array(Buffer.from(expectedHash.toHex(), "hex")),
  );
  expect(JSON.stringify(identity)).not.toContain(keys.privateKey);
});
