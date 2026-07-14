import { lstatSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const [artifact, ...extraArguments] = process.argv.slice(2);
if (artifact === undefined || extraArguments.length !== 0) {
  throw new Error("Usage: check-package-boundary-audit.mjs <artifact>");
}

const expectedRoot = resolve(".thoughts/verification");
const artifactPath = resolve(artifact);
const relativePath = relative(expectedRoot, artifactPath);
if (
  relativePath !== "2026-07-14-package-selection-signer-boundary.md" ||
  relativePath.startsWith("..")
) {
  throw new Error("Unexpected package-boundary audit path");
}

const metadata = lstatSync(artifactPath);
if (!metadata.isFile() || metadata.isSymbolicLink()) {
  throw new Error("Package-boundary audit must be a regular file");
}
if (metadata.size < 1 || metadata.size > 98_304) {
  throw new Error("Package-boundary audit exceeds its byte boundary");
}

const audit = readFileSync(artifactPath, "utf8");
for (const required of [
  "# Verification Audit: Package Selection And Signer Boundary",
  "## Verdict",
  "## Artifacts Checked",
  "## Requirement Traceability",
  "## Acceptance Criteria Coverage",
  "## Quality Gates",
  "## Deviations From Plan",
  "## Gaps And Risks",
  "## Follow-ups",
  "## Evidence Log",
  "[AUDIT:closure-exhaustiveness=PASS]",
  "[AUDIT:source-id-name-provenance=PASS]",
  "[AUDIT:package-toctou=PASS_PREPARE_ONLY]",
  "[AUDIT:process-bound-branding=BLOCK_LIVE_SIGNER]",
  "[AUDIT:ambiguous-outcome-refresh=BLOCK_LIVE_SIGNER]",
  "[AUDIT:shared-credential-bypass=BLOCK_LIVE_SIGNER]",
  "[AUDIT:evidence-privacy=PASS]",
  "[AUDIT:version-migration=PASS_SPIKE_ONLY]",
  "[AUDIT:zero-signing=PASS]",
  "[AUDIT:no-live-sign-or-spend=PASS]",
  "[AUDIT:prepare-only-observation=NOT_PROVEN_CAPABILITY]",
  "[AUDIT:production=NO_GO]",
  "58 package IDs, 48 names",
  "914 TypeScript tests",
  "CAPABILITY_COUNT",
  "Provider requests: zero",
  "No environment value, token, Party ID",
]) {
  if (!audit.includes(required)) {
    throw new Error(`Package-boundary audit omits marker: ${required}`);
  }
}

for (const prohibited of [
  /FIVE_NORTH_[A-Z0-9_]+\s*=/u,
  /PAYER_SIGNER_URL\s*=/u,
  /Authorization:\s*Bearer\s+/iu,
  /"access_token"\s*:/u,
  /BEGIN (?:EC |RSA )?PRIVATE KEY/u,
  /[a-f0-9]{32}::1220[a-f0-9]{64}/u,
  /"preparedTransaction"\s*:/u,
  /[A-Za-z0-9+/]{512,}={0,2}/u,
]) {
  if (prohibited.test(audit)) {
    throw new Error("Package-boundary audit contains prohibited material");
  }
}

function requireSource(path, required, prohibited = []) {
  const source = readFileSync(path, "utf8");
  for (const marker of required) {
    if (!source.includes(marker)) {
      throw new Error(`${path} omits audited source marker: ${marker}`);
    }
  }
  for (const pattern of prohibited) {
    if (pattern.test(source)) {
      throw new Error(`${path} contains prohibited audited source`);
    }
  }
}

requireSource("packages/x402-canton/src/purchase-commitment.ts", [
  '"sotto-purchase-v3"',
  '"sotto-purchase-attempt-v3"',
  "packageSelection",
]);
requireSource("packages/x402-canton/src/bounded-purchase-command.ts", [
  "claimBoundedPurchaseCommandPreference",
  "packageIdSelectionPreference",
  "sotto-purchase-v3-",
]);
requireSource("packages/x402-canton/src/bounded-purchase-signer-boundary.ts", [
  "requireBoundedPurchaseCommandPreferenceFresh",
  "verifyPreparedPurchaseHash",
  "claimAttempt",
  "signOpaque",
]);
requireSource(
  "spikes/devnet-payment/src/prepare-only-purchase.ts",
  ['status: "prepared-not-signed"', "createPreparedPurchaseObserver"],
  [/signBoundedPurchase/u, /signOpaque/u, /executeTransaction/u],
);

process.stdout.write("package-selection signer-boundary audit verified\n");
