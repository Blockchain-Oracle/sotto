import { useSyncExternalStore } from "react";
import { dismissToast, getToasts, subscribeToasts } from "./toast-store.js";

/**
 * toast — renderer for the secondary-notice store. Mount one <Toaster />
 * per app. See toast-store.ts for the binding rule: payment/settlement/
 * delivery results NEVER live in a toast.
 */
export function Toaster() {
  const notices = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (notices.length === 0) return null;
  return (
    <div className="sv-toaster" role="status" aria-live="polite">
      {notices.map((notice) => (
        <div className="sv-toast" data-tone={notice.tone} key={notice.id}>
          <div className="sv-toast-body">
            <p className="sv-toast-title">{notice.title}</p>
            {notice.detail === undefined ? null : (
              <p className="sv-toast-detail">{notice.detail}</p>
            )}
          </div>
          <button
            type="button"
            className="sv-toast-dismiss"
            aria-label="Dismiss notice"
            onClick={() => dismissToast(notice.id)}
          >
            <svg viewBox="0 0 10 10" width={9} height={9} aria-hidden="true">
              <path
                d="M 1 1 L 9 9 M 9 1 L 1 9"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
