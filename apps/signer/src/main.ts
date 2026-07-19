import { readSignerEnvironment } from "./env.js";
import { createSignerServer } from "./server.js";

async function main(): Promise<void> {
  const env = readSignerEnvironment(process.env);
  const server = await createSignerServer({ env });
  const address = await server.listen({ host: "127.0.0.1", port: env.port });
  // Never log secrets or key material; the address and gate state only.
  process.stdout.write(
    `sotto-signer listening on ${address} (Five North ${
      env.fiveNorth === undefined ? "unavailable" : "configured"
    })\n`,
  );
  const close = () => {
    void server.close().then(() => process.exit(0));
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `sotto-signer failed to start: ${
      error instanceof Error ? error.message : "unknown error"
    }\n`,
  );
  process.exitCode = 1;
});
