"use client";

import { useState } from "react";

import { Dialog } from "../ui";
import { useSession } from "../../lib/session";
import { HostedPath } from "./hosted-path";
import { ExternalPath } from "./external-path";

type Path = "picker" | "hosted" | "external";

/**
 * Owner session set (surface map 07). The connector list holds only what
 * is real on this deployment: the Sotto Reference Wallet (hosted, signer-
 * held on Five North) and the external party-proof path for wallet-owning
 * users. No CIP-103 extension discovery is wired here yet, so no browser
 * wallet brands are listed — an honest "none detected" line stands in
 * their place instead of fake options.
 */
export function ConnectOverlay() {
  const session = useSession();
  const [path, setPath] = useState<Path>("picker");

  const close = () => {
    session.closeConnect();
    setPath("picker");
  };

  return (
    <Dialog
      open={session.connectOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={
        path === "picker"
          ? "Connect a Canton wallet"
          : path === "hosted"
            ? "Sotto Reference Wallet"
            : "Sign in with your Canton party"
      }
      {...(path === "picker"
        ? {
            description:
              "The wallet proves control of your party and approves transactions.",
          }
        : {})}
      voice="display"
    >
      {path === "picker" ? (
        <div className="app-overlay-list">
          <button
            type="button"
            className="app-connector"
            onClick={() => setPath("hosted")}
          >
            <div>
              <div className="app-cell-main">Sotto Reference Wallet</div>
              <div className="app-cell-sub">
                Hosted signer on Canton DevNet — creates a party for you.
              </div>
            </div>
          </button>
          <button
            type="button"
            className="app-connector"
            onClick={() => setPath("external")}
          >
            <div>
              <div className="app-cell-main">Existing Canton party</div>
              <div className="app-cell-sub">
                Prove control by signing a one-use Sotto challenge.
              </div>
            </div>
          </button>
          <p className="app-note">
            No compatible wallet extension detected. Browser-wallet (CIP-103)
            discovery is not wired on this deployment; only the paths above are
            real.
          </p>
        </div>
      ) : path === "hosted" ? (
        <HostedPath onDone={close} onBack={() => setPath("picker")} />
      ) : (
        <ExternalPath onDone={close} onBack={() => setPath("picker")} />
      )}
    </Dialog>
  );
}
