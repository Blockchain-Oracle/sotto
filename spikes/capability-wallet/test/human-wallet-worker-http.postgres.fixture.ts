import { once } from "node:events";
import { createServer } from "node:http";

export async function createBoundedLocalExecuteEndpoint(
  readLifecycle: () => Promise<Readonly<{ state: string }>>,
) {
  const server = createServer();
  let executeCalls = 0;
  let fenceObserved = false;
  let receivedSignature = false;
  server.on("request", async (request, response) => {
    try {
      executeCalls += 1;
      if (
        request.method !== "POST" ||
        request.url !== "/v2/interactive-submission/execute"
      ) {
        throw new Error("local execute request identity is invalid");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > 3_145_728) throw new Error("execute body too large");
        chunks.push(bytes);
      }
      fenceObserved = (await readLifecycle()).state === "execution-started";
      if (!fenceObserved) throw new Error("execution fence is absent");
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        partySignatures?: { signatures?: Array<{ signatures?: unknown[] }> };
      };
      receivedSignature =
        body.partySignatures?.signatures?.[0]?.signatures?.length === 1;
      if (!receivedSignature) throw new Error("wallet signature is absent");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("local execute endpoint is absent");
  }
  return Object.freeze({
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    executeCalls: () => executeCalls,
    fenceObserved: () => fenceObserved,
    receivedSignature: () => receivedSignature,
    url: `http://127.0.0.1:${address.port}/v2/interactive-submission/execute`,
  });
}
