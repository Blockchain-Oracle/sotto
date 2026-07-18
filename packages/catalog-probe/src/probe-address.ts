import { isIP } from "node:net";

function ipv4Bytes(value: string): readonly [number, number, number, number] {
  const parts = value.split(".");
  if (parts.length !== 4) throw new Error("probe address family is invalid");
  const bytes = parts.map((part) => {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) {
      throw new Error("probe address is not canonical");
    }
    const byte = Number(part);
    if (byte > 255) throw new Error("probe address is invalid");
    return byte;
  });
  return bytes as unknown as readonly [number, number, number, number];
}

function publicIpv4(value: string): boolean {
  const [a, b, c] = ipv4Bytes(value);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6Words(value: string): readonly number[] {
  if (value.includes("%") || value.split("::").length > 2) {
    throw new Error("probe address is invalid");
  }
  let source = value.toLowerCase();
  const ipv4 = /(?:^|:)([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)$/u.exec(source);
  if (ipv4?.[1] !== undefined) {
    const bytes = ipv4Bytes(ipv4[1]);
    source = `${source.slice(0, -ipv4[1].length)}${(
      (bytes[0] << 8) |
      bytes[1]
    ).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const [leftSource, rightSource] = source.split("::");
  const left = leftSource === "" ? [] : leftSource!.split(":");
  const right =
    rightSource === undefined || rightSource === ""
      ? []
      : rightSource.split(":");
  const missing = 8 - left.length - right.length;
  if ((rightSource === undefined && missing !== 0) || missing < 0) {
    throw new Error("probe address is invalid");
  }
  const parts = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    parts.length !== 8 ||
    parts.some((part) => !/^[a-f0-9]{1,4}$/u.test(part))
  ) {
    throw new Error("probe address is invalid");
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

function publicIpv6(value: string): boolean {
  const words = ipv6Words(value);
  const mapped =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (mapped) {
    const high = words[6]!;
    const low = words[7]!;
    return publicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if ((words[0]! & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1]! <= 0x01ff) return false;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false;
  if (words[0] === 0x2002 || words[0] === 0x3ffe) return false;
  return true;
}

export function requirePublicProbeAddress(
  address: unknown,
  family: unknown,
): Readonly<{ address: string; family: 4 | 6; key: string }> {
  if (typeof address !== "string" || (family !== 4 && family !== 6)) {
    throw new Error("probe DNS answer is invalid");
  }
  const actualFamily = isIP(address);
  if (actualFamily !== family)
    throw new Error("probe address family is invalid");
  const isPublic = family === 4 ? publicIpv4(address) : publicIpv6(address);
  if (!isPublic) throw new Error("probe DNS answer must use a public address");
  const key =
    family === 4
      ? `4:${ipv4Bytes(address).join(".")}`
      : `6:${ipv6Words(address)
          .map((word) => word.toString(16).padStart(4, "0"))
          .join(":")}`;
  return Object.freeze({ address, family, key });
}
