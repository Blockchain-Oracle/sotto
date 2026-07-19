export const INVALID_ROUTE = "/weather/invalid-payment";

export function invalidPaymentResponse(): Response {
  const challenge = {
    x402Version: 2,
    resource: {
      url: `https://weather.example.com${INVALID_ROUTE}`,
    },
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: "2500000000",
        asset: "A".repeat(65),
        payTo: "sotto-weather-provider::1220provider",
        maxTimeoutSeconds: 60,
        extra: {
          assetTransferMethod: "transfer-factory",
          executeBeforeSeconds: 45,
          feePayer: "sotto-payer::1220payer",
          instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
          synchronizerId: "global-domain::1220sync",
        },
      },
    ],
  };
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
        "base64",
      ),
    },
  });
}
