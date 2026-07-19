/**
 * toast-store — tiny external store for secondary notices.
 *
 * BINDING (DESIGN.md §5/§8): toasts carry SECONDARY confirmations only
 * ("Copied", "Draft saved"). Payment, settlement, and delivery results
 * NEVER live in a toast — they land on the system-rail and state chips
 * where they persist. Do not add payment result helpers here.
 */
export interface ToastNotice {
  id: number;
  title: string;
  detail?: string;
  tone: "neutral" | "ambra" | "rosso";
}

export interface ToastInput {
  title: string;
  detail?: string;
  tone?: ToastNotice["tone"];
  /** Auto-dismiss delay; 0 keeps the notice until dismissed. */
  durationMs?: number;
}

type Listener = () => void;

let nextId = 1;
let notices: ToastNotice[] = [];
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastNotice[] {
  return notices;
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const remaining = notices.filter((notice) => notice.id !== id);
  if (remaining.length !== notices.length) {
    notices = remaining;
    emit();
  }
}

export function toast(input: ToastInput): number {
  const id = nextId++;
  const notice: ToastNotice = {
    id,
    title: input.title,
    tone: input.tone ?? "neutral",
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  };
  notices = [...notices, notice];
  const duration = input.durationMs ?? 5000;
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration),
    );
  }
  emit();
  return id;
}

/** Test helper: clears all notices and timers. */
export function resetToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  notices = [];
  emit();
}
