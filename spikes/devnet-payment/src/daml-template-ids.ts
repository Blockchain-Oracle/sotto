const packageIdPattern = /^[0-9a-f]{64}$/;
const moduleName = "Sotto.Control.PrivacyProbe";

export type SottoTemplateEntity =
  "PurchaseContextProbe" | "PurchasePolicyProbe";

export function requirePackageId(
  packageId: string,
  name = "Sotto package ID",
): string {
  if (!packageIdPattern.test(packageId)) {
    throw new Error(`${name} must be a 64-character lowercase package hash`);
  }
  return packageId;
}

export function sottoTemplateId(
  packageId: string,
  entity: SottoTemplateEntity,
): string {
  return `${requirePackageId(packageId)}:${moduleName}:${entity}`;
}
