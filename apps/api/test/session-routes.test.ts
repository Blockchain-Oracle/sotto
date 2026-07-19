import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  cantonPublicKeyFingerprint,
  challengeBytes,
  type SessionChallenge,
} from "../src/auth/challenge.js";
import { buildServer } from "../src/server.js";
import { fakeDependencies, signerResult } from "./fakes.js";

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function sessionCookie(response: {
  cookies: ReadonlyArray<{ name: string; value: string }>;
}): { name: string; value: string } {
  const cookie = response.cookies.find((c) => c.name === "sotto_session");
  if (cookie === undefined) throw new Error("session cookie absent");
  return cookie;
}

describe("owner-session routes", () => {
  it("guards session-required routes with a boundary-naming 401", async () => {
    server = await buildServer(fakeDependencies());
    for (const [method, url] of [
      ["POST", "/v1/purchases"],
      ["GET", "/v1/purchases"],
      ["POST", "/v1/origins"],
      ["POST", "/v1/compose-assist"],
    ] as const) {
      const response = await server.inject({ method, url });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: "session-required" });
    }
  });

  it("establishes a hosted session from a real signer onboarding", async () => {
    const party = `sotto-judge::1220${"d".repeat(64)}`;
    server = await buildServer(
      fakeDependencies({
        signer: {
          createWallet: async (ownerHint) =>
            signerResult(201, {
              fingerprint: `1220${"d".repeat(64)}`,
              partyId: party,
              walletId: "0".repeat(32),
              ownerHint,
            }),
          fundWallet: async () =>
            signerResult(200, { amount: "5000000000", updateId: "1220x" }),
          linkWallet: async () =>
            signerResult(201, { linkUrl: "http://127.0.0.1:4402/link/t" }),
          readWalletProfile: async () =>
            signerResult(200, { partyId: party, walletId: "0".repeat(32) }),
          readWalletProfileByParty: async () => signerResult(404, {}),
        },
      }),
    );
    const response = await server.inject({
      method: "POST",
      url: "/v1/onboarding/hosted",
      payload: { ownerHint: "Judge One" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      partyId: party,
      walletUrl: "http://127.0.0.1:4402/link/t",
    });
    const cookie = sessionCookie(response);
    const guarded = await server.inject({
      method: "GET",
      url: "/v1/purchases",
      cookies: { [cookie.name]: cookie.value },
    });
    expect(guarded.statusCode).toBe(200);
    expect(guarded.json()).toEqual({ attempts: [] });
  });

  it("passes the signer's five-north-unavailable through honestly", async () => {
    server = await buildServer(
      fakeDependencies({
        signer: {
          createWallet: async () =>
            signerResult(503, { error: "five-north-unavailable" }),
          fundWallet: async () => signerResult(503, {}),
          linkWallet: async () => signerResult(503, {}),
          readWalletProfile: async () => signerResult(503, {}),
          readWalletProfileByParty: async () => signerResult(503, {}),
        },
      }),
    );
    const response = await server.inject({
      method: "POST",
      url: "/v1/onboarding/hosted",
      payload: { ownerHint: "Judge" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "five-north-unavailable" });
  });

  it("verifies external party control and revokes on DELETE", async () => {
    server = await buildServer(fakeDependencies());
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = Buffer.from(
      (publicKey.export({ format: "jwk" }).x as string) ?? "",
      "base64url",
    );
    const fingerprint = cantonPublicKeyFingerprint(raw);
    const party = `sotto-external::${fingerprint}`;
    const issued = await server.inject({
      method: "POST",
      url: "/v1/session/challenge",
      payload: { partyId: party },
    });
    expect(issued.statusCode).toBe(201);
    const challenge = issued.json().challenge as SessionChallenge;
    const signature = signEd25519(null, challengeBytes(challenge), privateKey);
    const verified = await server.inject({
      method: "POST",
      url: "/v1/session/verify",
      payload: {
        challengeId: challenge.challengeId,
        signature: signature.toString("base64"),
        publicKeyBase64: raw.toString("base64"),
        fingerprint,
      },
    });
    expect(verified.statusCode).toBe(201);
    expect(verified.json()).toMatchObject({ partyId: party });
    const cookie = sessionCookie(verified);

    const replay = await server.inject({
      method: "POST",
      url: "/v1/session/verify",
      payload: {
        challengeId: challenge.challengeId,
        signature: signature.toString("base64"),
        publicKeyBase64: raw.toString("base64"),
        fingerprint,
      },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({
      reason: "challenge-unknown-or-used",
    });

    const revoked = await server.inject({
      method: "DELETE",
      url: "/v1/session",
      cookies: { [cookie.name]: cookie.value },
    });
    expect(revoked.statusCode).toBe(204);
    const afterRevoke = await server.inject({
      method: "GET",
      url: "/v1/purchases",
      cookies: { [cookie.name]: cookie.value },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });
});
