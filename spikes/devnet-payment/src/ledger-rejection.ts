type ExpectedLedgerRejection = Readonly<{
  reason: string;
  status: number;
}>;

export function matchesLedgerRejection(
  error: unknown,
  expected: ExpectedLedgerRejection,
): boolean {
  return (
    error instanceof Error &&
    expected.reason !== "" &&
    error.message.includes(
      `Five North request failed with HTTP ${expected.status}`,
    ) &&
    error.message.includes(expected.reason)
  );
}
