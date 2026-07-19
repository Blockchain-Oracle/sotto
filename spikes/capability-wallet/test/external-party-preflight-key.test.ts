import { expect, it } from "vitest";
import { createEphemeralExternalPartyPreflightIdentity } from "../src/index.js";

it("creates fresh verifiable identities for read-only topology preflight", async () => {
  const first = await createEphemeralExternalPartyPreflightIdentity();
  const second = await createEphemeralExternalPartyPreflightIdentity();
  const transactions = [Buffer.from("topology").toString("base64")];

  expect(first.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/u);
  expect(Buffer.from(first.publicKey, "base64")).toHaveLength(32);
  expect(first.fingerprint).toMatch(/^1220[0-9a-f]{64}$/u);
  const hash = await first.hashTopology(transactions);
  expect(Buffer.from(hash, "base64")).toHaveLength(34);
  expect(Buffer.from(hash, "base64").toString("base64")).toBe(hash);
  expect(second.publicKey).not.toBe(first.publicKey);
});
