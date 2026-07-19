const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function canonicalDisclosureBlob(
  value: unknown,
  label: string,
  maximumBytes: number,
): Readonly<{ value: string; bytes: number }> {
  if (
    typeof value !== "string" ||
    value === "" ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new Error(`${label} must be canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`${label} must be canonical base64`);
  }
  if (decoded.byteLength > maximumBytes) {
    throw new Error(`${label} exceeds byte limit`);
  }
  return { value, bytes: decoded.byteLength };
}
