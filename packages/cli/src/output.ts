/**
 * Terminal output helpers bound to DESIGN.md §6: truncation keeps hint +
 * tail for party IDs and first-8 + last-4 for update IDs, amounts always
 * carry the asset, and `--json` returns the full untruncated values.
 * NO_COLOR or a non-TTY stream turns every escape sequence off.
 */
export type Io = Readonly<{
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  isTTY: boolean;
}>;

export function colorEnabled(io: Io): boolean {
  return io.isTTY && io.env.NO_COLOR === undefined;
}

export function bold(io: Io, text: string): string {
  return colorEnabled(io) ? `[1m${text}[0m` : text;
}

export function dim(io: Io, text: string): string {
  return colorEnabled(io) ? `[2m${text}[0m` : text;
}

export function truncateParty(partyId: string): string {
  const separator = partyId.indexOf("::");
  if (separator === -1 || partyId.length <= separator + 12) return partyId;
  const hint = partyId.slice(0, separator);
  const namespace = partyId.slice(separator + 2);
  return `${hint}::${namespace.slice(0, 4)}…${namespace.slice(-5)}`;
}

export function truncateUpdateId(updateId: string): string {
  if (updateId.length <= 14) return updateId;
  return `${updateId.slice(0, 8)}…${updateId.slice(-4)}`;
}

export function truncateAttemptId(attemptId: string): string {
  if (attemptId.length <= 20) return attemptId;
  return `${attemptId.slice(0, 15)}…${attemptId.slice(-4)}`;
}

export function amountWithAsset(atomic: string, asset: string): string {
  return `${atomic} ${asset} (atomic units)`;
}

export function resourceUrl(origin: string, route: string): string {
  return `${origin}${route}`;
}

export function printJson(io: Io, value: unknown): void {
  io.stdout(JSON.stringify(value, null, 2));
}

/** `[x]` done / `[>]` active / `[ ]` pending station line with mono timestamp. */
export function railLine(
  mark: "done" | "active" | "pending",
  timestamp: string | null,
  label: string,
): string {
  const box = mark === "done" ? "[x]" : mark === "active" ? "[>]" : "[ ]";
  const at = timestamp === null ? "                        " : timestamp;
  return `${box} ${at}  ${label}`;
}

export function table(
  rows: readonly (readonly string[])[],
  header: readonly string[],
): readonly string[] {
  const all = [header, ...rows];
  const widths = header.map((_, column) =>
    Math.max(...all.map((row) => (row[column] ?? "").length)),
  );
  return all.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd(),
  );
}
