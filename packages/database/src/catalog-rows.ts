import { CatalogConflictError } from "./catalog-types.js";
import type {
  ProviderOriginRecord,
  ProviderOriginRegistrationResult,
} from "./catalog-types.js";
import type { ValidatedProviderOrigin } from "./catalog-validation.js";

export type CatalogRow = Readonly<{
  registrationId: string;
  requestHash: string;
  ownerId: string;
  ownerPartyId: string;
  providerId: string;
  providerDisplayName: string;
  originId: string;
  normalizedOrigin: string;
}>;

export const CATALOG_SELECT = `
  SELECT
    registration.registration_id AS "registrationId",
    registration.request_hash AS "requestHash",
    owner.id AS "ownerId",
    owner.party_id AS "ownerPartyId",
    provider.id AS "providerId",
    provider.display_name AS "providerDisplayName",
    origin.id AS "originId",
    origin.normalized_origin AS "normalizedOrigin"
  FROM sotto.catalog_registrations AS registration
  JOIN sotto.origins AS origin ON origin.id = registration.origin_id
  JOIN sotto.providers AS provider ON provider.id = origin.provider_id
  JOIN sotto.owners AS owner ON owner.id = provider.owner_id
`;

export function recordFromRow(row: CatalogRow): ProviderOriginRecord {
  const { requestHash: _requestHash, ...record } = row;
  void _requestHash;
  return Object.freeze(record);
}

export function registrationResult(
  row: CatalogRow,
  input: ValidatedProviderOrigin,
  outcome: "created" | "replayed",
): ProviderOriginRegistrationResult {
  if (
    row.requestHash !== input.requestHash ||
    row.ownerId !== input.ownerId ||
    row.ownerPartyId !== input.ownerPartyId ||
    row.providerId !== input.providerId ||
    row.providerDisplayName !== input.providerDisplayName ||
    row.originId !== input.originId ||
    row.normalizedOrigin !== input.normalizedOrigin
  ) {
    throw new CatalogConflictError();
  }
  return Object.freeze({ ...recordFromRow(row), outcome });
}
