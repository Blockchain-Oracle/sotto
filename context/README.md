# Private Context Bootstrap

`context/manifest.json` is the exact allowlist for optional private Context
Engineering material. The files themselves live under ignored `.thoughts` and
are never required to understand the tracked product contract.

Generate the manifest only from the approved archive workspace:

```text
node scripts/context-manifest.mjs --source <archive-root> --output context/manifest.json <approved paths...>
```

Copy and verify the exact files:

```text
node scripts/context-sync.mjs copy --source <archive-root>
node scripts/context-sync.mjs verify --strict --source <archive-root>
```

Initial copy and `verify --strict` reject undeclared destination files. Routine
`verify` permits new local Context Engineering files but still fails missing or
changed imported files, checksum mismatch, symlink, or unsafe path.

Run Gitleaks against both the curated source copy and destination with directory
scanning. Git ignore rules do not make private context safe.
