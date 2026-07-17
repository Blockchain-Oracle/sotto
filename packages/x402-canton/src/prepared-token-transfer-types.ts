export type PreparedTokenTransferIntent = Readonly<{
  challenge: Readonly<{
    amountAtomic: string;
    instrument: Readonly<{ admin: string; id: string }>;
    payerParty: string;
    recipientParty: string;
  }>;
  tokenFactory: Readonly<{
    contractId: string;
    creationTemplateId: string;
    expectedAdmin: string;
    interfaceId: string;
  }>;
  packageSelection: Readonly<{
    packageIds: readonly string[];
    references: ReadonlyArray<
      Readonly<{ packageId: string; packageName: string }>
    >;
  }>;
}>;

export type PreparedTokenTransferExpectation = Readonly<{
  amount: string;
  inputHoldingCids: readonly string[];
}>;
