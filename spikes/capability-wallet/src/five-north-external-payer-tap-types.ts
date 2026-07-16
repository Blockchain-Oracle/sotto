export type FiveNorthExternalPayerTapInput = Readonly<{
  amount: string;
  payerParty: string;
  preparedTransaction: Uint8Array;
  synchronizerId: string;
}>;

export type FiveNorthExternalPayerTapVerification = Readonly<{
  amount: string;
  createdHoldingCount: 1;
  payerParty: string;
  synchronizerId: string;
  version: "sotto-five-north-external-payer-tap-v1";
}>;
