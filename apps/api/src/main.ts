import { pathToFileURL } from "node:url";
import { createApiRuntime } from "./composition.js";
import { readApiEnvironment } from "./env.js";
import { buildServer } from "./server.js";

/**
 * Process entry: validate the environment, compose the runtime, listen,
 * and drain cleanly on SIGTERM/SIGINT — in-flight responses finish, pools
 * close, then the process exits.
 */
export async function runApi(
  environmentSource: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const environment = readApiEnvironment(environmentSource);
  const runtime = createApiRuntime(environment);
  const server = await buildServer(runtime.dependencies);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void server
      .close()
      .then(() => runtime.close())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  await server.listen({ host: "0.0.0.0", port: environment.port });
  process.stdout.write(
    `${JSON.stringify({
      code: "API_STARTED",
      port: environment.port,
      fiveNorth: environment.fiveNorth === undefined ? "absent" : "configured",
    })}\n`,
  );
}

const executedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
  runApi().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "api failed"}\n`,
    );
    process.exit(1);
  });
}
