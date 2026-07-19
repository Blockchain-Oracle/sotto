export const OPENRPC_SDK_METHOD_NOT_FOUND = Symbol(
  "OpenRPC SDK method not found",
);

export type OpenRpcSdkRequest = Readonly<{
  method: string;
  params: Readonly<Record<string, unknown>>;
}>;

export type OpenRpcSdkProvider<
  Request extends OpenRpcSdkRequest = OpenRpcSdkRequest,
> = Readonly<{
  request: (request: Request) => Promise<unknown>;
}>;

function rpcErrorCode(value: unknown): number | undefined {
  if (typeof value === "object" && value !== null && "code" in value) {
    const code = (value as { code?: unknown }).code;
    if (Number.isSafeInteger(code)) return code as number;
  }
  if (!(value instanceof Error)) return undefined;
  const match = /^RPC error: (-?[0-9]+) - /u.exec(value.message);
  if (match === null) return undefined;
  const code = Number(match[1]);
  return Number.isSafeInteger(code) ? code : undefined;
}

function providerFailure(value: unknown): unknown {
  const code = rpcErrorCode(value);
  if (code === -32601) return OPENRPC_SDK_METHOD_NOT_FOUND;
  if (code !== undefined) {
    throw new Error(`OpenRPC wallet provider returned error code ${code}`);
  }
  throw new Error("OpenRPC wallet provider request failed");
}

export function callOpenRpcSdkProvider<Request extends OpenRpcSdkRequest>(
  provider: OpenRpcSdkProvider<Request>,
  request: Request,
  signal: AbortSignal,
): Promise<unknown | typeof OPENRPC_SDK_METHOD_NOT_FOUND> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() =>
        reject(new Error("OpenRPC wallet provider request cancelled")),
      );
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    let result: unknown;
    try {
      result = provider.request(request);
    } catch (error) {
      finish(() => {
        try {
          resolve(providerFailure(error));
        } catch (failure) {
          reject(failure);
        }
      });
      return;
    }
    void Promise.resolve(result).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) =>
        finish(() => {
          try {
            resolve(providerFailure(error));
          } catch (failure) {
            reject(failure);
          }
        }),
    );
  });
}
