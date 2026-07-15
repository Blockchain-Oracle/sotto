import { claimWalletHandoffArtifact } from "./wallet-handoff-path.js";
import type {
  OwnerOnlyWalletArtifactKind,
  OwnerOnlyWalletArtifactRecord,
  OwnerOnlyWalletStorage,
} from "./wallet-handoff-types.js";

export async function claimWalletHandoffRecord<
  Kind extends OwnerOnlyWalletArtifactKind,
>(
  root: string,
  id: string,
  kind: Kind,
  read: OwnerOnlyWalletStorage<Kind>["read"],
): Promise<OwnerOnlyWalletArtifactRecord<Kind>> {
  const initial = await read(id, kind);
  await claimWalletHandoffArtifact(root, initial.id, initial.kind);
  const claimed = await read(id, kind);
  if (JSON.stringify(initial) !== JSON.stringify(claimed)) {
    throw new Error("wallet handoff artifact changed while being claimed");
  }
  return claimed;
}
