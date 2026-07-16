const PHYSICAL_VERSION = /^[1-9]\d{0,9}-[1-9]\d{0,9}$/u;

export function preparedSynchronizerMatches(
  prepared: string,
  logical: string,
): boolean {
  if (prepared === logical) return true;
  const logicalParts = logical.split("::");
  const preparedParts = prepared.split("::");
  return (
    logicalParts.length === 2 &&
    preparedParts.length === 3 &&
    preparedParts[0] === logicalParts[0] &&
    preparedParts[1] === logicalParts[1] &&
    PHYSICAL_VERSION.test(preparedParts[2] ?? "")
  );
}
