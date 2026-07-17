type Closeable = Readonly<{ close: () => Promise<void> }>;

const PROVIDER_CLOSE_TIMEOUT_MS = 5_000;

async function closeProvider(provider: Closeable | undefined): Promise<void> {
  if (provider === undefined) return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      complete();
    };
    const timer = setTimeout(() => finish(resolve), PROVIDER_CLOSE_TIMEOUT_MS);
    void provider.close().then(
      () => finish(resolve),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export async function closeFiveNorthHumanProviderResources(
  provider: Closeable | undefined,
  tunnel: Closeable,
): Promise<void> {
  let tunnelError: unknown;
  try {
    await tunnel.close();
  } catch (error) {
    tunnelError = error;
  }
  try {
    await closeProvider(provider);
  } catch (error) {
    if (tunnelError === undefined) throw error;
  }
  if (tunnelError !== undefined) throw tunnelError;
}
