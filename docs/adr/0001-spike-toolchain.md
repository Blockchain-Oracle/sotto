# ADR 0001: Spike Toolchain

## Status

Accepted on 2026-07-12 for the DevNet evidence spike only.

## Decision

- Node 24.18.0 LTS and pnpm 11.12.0.
- TypeScript 6.0.3, ESLint 10.7.0, Prettier 3.9.5, and Vitest 4.1.10.
- Eclipse Temurin Java 21.0.11+10.
- DPM launcher 1.0.21 and Daml SDK 3.5.2.
- GitHub Actions runs on `ubuntu-24.04` with actions pinned by commit SHA.
- Apache-2.0 for original spike source. Third-party source reuse still requires
  a separate license and attribution decision.

## Reasons

Node 24 is the current LTS line and is accepted by Vitest 4. pnpm is pinned in
`packageManager` so the lockfile and CI use the same major. TypeScript 6.0.3 is
the newest release supported by the selected `typescript-eslint` release.

Daml manifests pin SDK 3.5.2, matching the current Five North toolchain
research. DPM requires Java 17 or newer; Java 21 is the current
long-term-support choice. The DPM release archive and CI actions are checksum or
commit pinned.

## Sources

- [Node releases](https://nodejs.org/en/about/previous-releases)
- [pnpm installation](https://pnpm.io/installation)
- [pnpm CI guidance](https://pnpm.io/continuous-integration)
- [DPM documentation](https://docs.digitalasset.com/build/3.5/dpm/dpm.html)
- [DPM 1.0.21 release](https://github.com/digital-asset/dpm/releases/tag/1.0.21)
- [Eclipse Temurin releases](https://adoptium.net/temurin/releases/)

## Consequences

This decision establishes reproducible spike tooling. It does not select the
production web, API, worker, database, queue, container, or Coolify topology.
