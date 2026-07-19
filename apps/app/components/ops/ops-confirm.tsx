"use client";

import { Button, Dialog } from "../ui";
import type { OpsListing } from "../../lib/types";

export type OpsCommand = Readonly<{
  listing: OpsListing;
  action: "quarantine" | "restore";
}>;

/**
 * Operator confirmation overlay: names the affected listing and the
 * public effect before the command fires; a failed command reports the
 * API's own detail with no optimistic success.
 */
export function OpsConfirm({
  confirm,
  actionError,
  onCancel,
  onConfirm,
}: {
  confirm: OpsCommand | null;
  actionError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={confirm !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={
        confirm?.action === "quarantine"
          ? "Quarantine listing"
          : "Restore listing"
      }
    >
      {confirm === null ? null : (
        <div>
          <p>
            {confirm.action === "quarantine"
              ? "New discovery and Composer execution stop for this listing; historical Scan evidence remains."
              : "The listing returns to the public catalog and Composer."}
          </p>
          <p className="app-mono">
            {confirm.listing.providerDisplayName} · {confirm.listing.method}{" "}
            {confirm.listing.routeTemplate}
          </p>
          {actionError !== null ? (
            <p className="sv-field-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="app-head-actions">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant={confirm.action === "quarantine" ? "danger" : "primary"}
              onClick={onConfirm}
            >
              {confirm.action === "quarantine" ? "Quarantine" : "Restore"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
