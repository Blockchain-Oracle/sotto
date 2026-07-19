const UNSAFE_FORMAT = /\p{Cf}/u;

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function hasUnsafeText(
  value: string,
  allowAsciiSpaces: boolean,
): boolean {
  return (
    hasUnpairedSurrogate(value) ||
    hasControl(value) ||
    UNSAFE_FORMAT.test(value) ||
    (allowAsciiSpaces ? /[^\S ]/u.test(value) : /\s/u.test(value))
  );
}
