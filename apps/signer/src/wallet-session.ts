import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SignerContext } from "./context.js";
import { WALLET_SESSION_COOKIE } from "./context.js";
import { escapeHtml, renderPage } from "./html.js";
import {
  ensureOwnerOnlyDirectory,
  readOwnerJson,
  removeOwnerJson,
  writeOwnerJson,
  RECORD_ID_PATTERN,
} from "./store.js";

const LINK_TTL_MS = 10 * 60 * 1_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1_000;

type LinkRecord = Readonly<{ expiresAt: string; walletId: string }>;

function parseLinkRecord(value: unknown): LinkRecord | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.walletId !== "string" ||
    !RECORD_ID_PATTERN.test(record.walletId) ||
    typeof record.expiresAt !== "string"
  ) {
    return undefined;
  }
  return { expiresAt: record.expiresAt, walletId: record.walletId };
}

export function readWalletSession(
  request: FastifyRequest,
  context: SignerContext,
): string | undefined {
  const raw = request.cookies[WALLET_SESSION_COOKIE];
  if (raw === undefined) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || unsigned.value === null) return undefined;
  let session: unknown;
  try {
    session = JSON.parse(unsigned.value);
  } catch {
    return undefined;
  }
  if (typeof session !== "object" || session === null) return undefined;
  const record = session as Record<string, unknown>;
  if (
    typeof record.walletId !== "string" ||
    !RECORD_ID_PATTERN.test(record.walletId) ||
    typeof record.expiresAt !== "number" ||
    record.expiresAt <= context.now()
  ) {
    return undefined;
  }
  return record.walletId;
}

export function sessionRequired(reply: FastifyReply): null {
  void reply
    .status(401)
    .type("text/html; charset=utf-8")
    .send(
      renderPage(
        "Wallet session",
        `<h1>Wallet session required</h1>
<p class="note">Open the wallet link issued for this wallet to start a
session.</p>`,
      ),
    );
  return null;
}

export async function registerWalletSessionRoutes(
  server: FastifyInstance,
  context: SignerContext,
): Promise<void> {
  const links = await ensureOwnerOnlyDirectory(
    join(context.env.keyDirectory, "links"),
  );

  server.post("/internal/wallets/:walletId/link", async (request, reply) => {
    const { walletId } = request.params as Readonly<{ walletId: string }>;
    const wallet = await context.wallets.read(walletId);
    if (wallet === undefined) {
      return reply.status(404).send({ error: "wallet-unknown" });
    }
    const token = randomBytes(16).toString("hex");
    const record: LinkRecord = {
      expiresAt: new Date(context.now() + LINK_TTL_MS).toISOString(),
      walletId: wallet.walletId,
    };
    await writeOwnerJson(links, `${token}.json`, record);
    return reply
      .status(201)
      .send({ linkUrl: `${context.env.publicWalletOrigin}/link/${token}` });
  });

  server.get("/link/:token", async (request, reply) => {
    const { token } = request.params as Readonly<{ token: string }>;
    const record = RECORD_ID_PATTERN.test(token)
      ? parseLinkRecord(await readOwnerJson(links, `${token}.json`))
      : undefined;
    if (record !== undefined) {
      // One-use: the token file is removed before the session is issued.
      await removeOwnerJson(links, `${token}.json`);
    }
    if (record === undefined || Date.parse(record.expiresAt) <= context.now()) {
      return reply
        .status(410)
        .type("text/html; charset=utf-8")
        .send(
          renderPage(
            "Wallet link",
            `<h1>Wallet link expired</h1>
<p class="note">Request a new wallet link to start a session.</p>`,
          ),
        );
    }
    void reply.setCookie(
      WALLET_SESSION_COOKIE,
      JSON.stringify({
        expiresAt: context.now() + SESSION_TTL_MS,
        walletId: record.walletId,
      }),
      {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: context.env.publicWalletOrigin.startsWith("https:"),
        signed: true,
      },
    );
    return reply.redirect("/wallet", 303);
  });

  server.get("/wallet", async (request, reply) => {
    const walletId = readWalletSession(request, context);
    if (walletId === undefined) return sessionRequired(reply);
    const pending = await context.approvals.listPendingForWallet(walletId);
    const items = pending
      .map(
        (record) => `<li><a href="/approve/${escapeHtml(record.approvalId)}">
${escapeHtml(record.approval.method)} ${escapeHtml(record.approval.resourceOrigin)}${escapeHtml(record.approval.resourcePath)}</a>
<span class="deadline">expires ${escapeHtml(record.expiresAt)}</span></li>`,
      )
      .join("");
    const list =
      items === ""
        ? `<p class="note">No approvals waiting. New payment approvals for this
wallet appear here.</p>`
        : `<ul class="approvals">${items}</ul>`;
    return reply.type("text/html; charset=utf-8").send(
      renderPage(
        "Sotto wallet",
        `<h1>Pending approvals</h1>
<p class="note">Wallet <code>${escapeHtml(walletId)}</code></p>
<section>${list}</section>`,
      ),
    );
  });
}
