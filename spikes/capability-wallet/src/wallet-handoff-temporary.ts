const TEMP_FILE_PATTERN =
  /^\.tmp-([1-9][0-9]*)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== "ESRCH";
  }
}

export function walletHandoffTemporaryStatus(
  name: string,
): "abandoned" | "active" | undefined {
  const match = TEMP_FILE_PATTERN.exec(name);
  if (match === null) return undefined;
  return processIsAlive(Number(match[1])) ? "active" : "abandoned";
}
