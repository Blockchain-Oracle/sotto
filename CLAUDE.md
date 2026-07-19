# CLAUDE.md

## Project Snapshot

Sotto is the Canton-focused marketplace, execution surface, and evidence layer
for x402-paid APIs. The repository is currently executing the clean split and
Five North DevNet spike. No production runtime exists yet.

## Working Rules

- Read `AGENTS.md` first; it is the canonical project router.
- Follow the tracked product contract, decisions, spike plan, and quality
  contract in the order listed there.
- Research, specification, stories/design, planning, implementation, and
  verification are separate stages.
- Do not import payroll code, prototype fixtures, raw research clones, secrets,
  generated output, or archived product actors.
- Never simulate successful payment, settlement, DevNet deployment, contract
  visibility, or product activity.
- Keep wallet sessions, Sotto sessions, human approval, and autonomous signer
  authority distinct.

## Commands

Use Node 24.18.0 and pnpm 11.12.0. The single deterministic gate is:

```text
pnpm install --frozen-lockfile
pnpm verify
```

Focused commands are `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`,
and `pnpm format:check`. Spike CLIs live in the owning spike package:
`pnpm --filter @sotto/devnet-payment-spike run <name>` (see
`spikes/*/package.json`). DevNet diagnostics live in `scripts/diagnostics/`.
Live DevNet execution is intentionally outside `pnpm verify`.

## Project Context

Required authority is tracked under `docs/`. Optional private depth is restored
under ignored `.thoughts` from `context/manifest.json`; it is supporting
context, not a replacement for tracked product authority.

## Skill Routing

Use `.claude/skills/hackathon-idea-scout/SKILL.md` only for a new research-first
hackathon idea comparison. It does not override the accepted Sotto direction.
