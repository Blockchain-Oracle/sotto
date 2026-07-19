import type { HumanPurchaseBindingResolver } from "@sotto/database";

const MAX_PENDING_BINDINGS = 1_024;

export type RegisteredBinding = Readonly<{
  ownerId: string;
  resourceRevisionId: string;
  beginExclusive: number;
  resource: Readonly<{ method: string; origin: string; path: string }>;
}>;

export type PurchaseBindingRegistry = Readonly<{
  register(attemptId: string, binding: RegisteredBinding): void;
  resolver: HumanPurchaseBindingResolver;
}>;

/**
 * Bridges purchase initiation to the repository's binding resolver. The
 * initiation service registers the buyer's owner, the exact resource
 * revision, and the real ledger offset under the attempt ID before calling
 * `initializeHumanPurchaseAttempt`; the resolver hands that binding back
 * only when the journal intent's resource matches what was registered.
 * Process-local by design — the API is the only initializer (Q-006) and an
 * unmatched intent fails closed.
 */
export function createPurchaseBindingRegistry(): PurchaseBindingRegistry {
  const pending = new Map<string, RegisteredBinding>();
  return Object.freeze({
    register: (attemptId, binding) => {
      while (pending.size >= MAX_PENDING_BINDINGS) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      pending.set(attemptId, binding);
    },
    resolver: async (intent) => {
      const binding = pending.get(intent.attemptId);
      pending.delete(intent.attemptId);
      if (binding === undefined) {
        throw new Error(
          "purchase attempt was not registered by this API process",
        );
      }
      if (
        intent.resource.method !== binding.resource.method ||
        intent.resource.origin !== binding.resource.origin ||
        intent.resource.path !== binding.resource.path
      ) {
        throw new Error("purchase intent resource does not match the binding");
      }
      return Object.freeze({
        ownerId: binding.ownerId,
        resourceRevisionId: binding.resourceRevisionId,
        beginExclusive: binding.beginExclusive,
      });
    },
  });
}
