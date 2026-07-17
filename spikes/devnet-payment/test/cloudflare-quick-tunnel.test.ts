import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCloudflareQuickTunnelOrigin,
  startCloudflareQuickTunnel,
  type CloudflareTunnelProcess,
} from "../src/cloudflare-quick-tunnel.js";

class FakeProcess extends EventEmitter implements CloudflareTunnelProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  readonly kills: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.kills.push(signal);
    this.exitCode = 0;
    queueMicrotask(() => this.emit("exit", 0, signal));
    return true;
  }
}

class StubbornProcess extends FakeProcess {
  override kill(signal: NodeJS.Signals): boolean {
    this.kills.push(signal);
    if (signal === "SIGKILL") {
      this.exitCode = 0;
      queueMicrotask(() => this.emit("exit", 0, signal));
    }
    return true;
  }
}

afterEach(() => vi.useRealTimers());

describe("Cloudflare quick tunnel", () => {
  it("accepts only one canonical single-label quick-tunnel origin", () => {
    expect(
      parseCloudflareQuickTunnelOrigin(
        "INF Your quick Tunnel has been created! Visit it at https://clear-sky-7.trycloudflare.com",
      ),
    ).toBe("https://clear-sky-7.trycloudflare.com");
    expect(() =>
      parseCloudflareQuickTunnelOrigin("https://nested.name.trycloudflare.com"),
    ).toThrow();
    expect(() =>
      parseCloudflareQuickTunnelOrigin(
        "https://first.trycloudflare.com https://second.trycloudflare.com",
      ),
    ).toThrow();
  });

  it("owns the exact cloudflared process and closes it", async () => {
    const child = new FakeProcess();
    const spawnProcess = vi.fn(() => child);
    const pending = startCloudflareQuickTunnel(
      { port: 8_791, signal: new AbortController().signal },
      { spawnProcess },
    );
    child.stderr.write("INF +https://human-wallet.trycloudflare.com ready\n");

    const tunnel = await pending;
    expect(tunnel.origin).toBe("https://human-wallet.trycloudflare.com");
    expect(spawnProcess).toHaveBeenCalledWith("/opt/homebrew/bin/cloudflared", [
      "tunnel",
      "--no-autoupdate",
      "--url",
      "http://127.0.0.1:8791",
    ]);
    await tunnel.close();
    expect(child.kills).toEqual(["SIGTERM"]);
  });

  it("kills a tunnel whose caller cancels before readiness", async () => {
    const child = new FakeProcess();
    const controller = new AbortController();
    const pending = startCloudflareQuickTunnel(
      { port: 8_791, signal: controller.signal },
      { spawnProcess: () => child },
    );
    const rejection = expect(pending).rejects.toThrow(/cancelled/iu);

    controller.abort("private reason");
    await rejection;
    expect(child.kills).toEqual(["SIGTERM"]);
  });

  it("waits for failed-start cleanup and force-kills a stubborn tunnel", async () => {
    vi.useFakeTimers();
    const child = new StubbornProcess();
    const controller = new AbortController();
    const pending = startCloudflareQuickTunnel(
      { port: 8_791, signal: controller.signal },
      { spawnProcess: () => child },
    );
    const rejection = expect(pending).rejects.toThrow(/cancelled/iu);
    controller.abort();

    await vi.advanceTimersByTimeAsync(5_001);

    await rejection;
    expect(child.kills).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
