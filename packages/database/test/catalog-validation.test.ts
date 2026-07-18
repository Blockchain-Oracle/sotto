import { expect, it } from "vitest";
import { createCatalogRepository } from "../src/catalog.js";
import { normalizeCatalogOrigin } from "../src/catalog-validation.js";

it("rejects database configuration without retaining credentials", () => {
  const secret = "private-catalog-password";
  let error: unknown;
  try {
    createCatalogRepository({ databaseUrl: `postgresql://owner:${secret}@` });
  } catch (caught) {
    error = caught;
  }

  expect(error).toEqual(new Error("catalog database URL is invalid"));
  const rendered = [
    String(error),
    error instanceof Error ? error.stack : "",
    error instanceof Error ? String(error.cause ?? "") : "",
  ].join("\n");
  expect(rendered).not.toContain(secret);
});

it.each([
  ["empty", ""],
  ["whitespace", " postgresql://owner@database.internal/sotto "],
  ["missing hostname", "postgresql:///sotto"],
  ["missing username", "postgresql://database.internal/sotto"],
  ["missing database", "postgresql://owner@database.internal"],
  ["wrong scheme", "https://owner@database.internal/sotto"],
])("rejects a %s database URL", (_name, databaseUrl) => {
  expect(() => createCatalogRepository({ databaseUrl })).toThrow(
    "catalog database URL is invalid",
  );
});

it.each([0, 17, 1.5])("rejects a %s connection pool limit", (maximum) => {
  expect(() =>
    createCatalogRepository({
      databaseUrl: "postgresql://owner:secret@database.internal/sotto",
      maxConnections: maximum,
    }),
  ).toThrow("catalog connection limit must be between 1 and 16");
});

it.each(["", "Sotto", "sotto catalog", "a".repeat(64)])(
  "rejects the application name %j",
  (applicationName) => {
    expect(() =>
      createCatalogRepository({
        applicationName,
        databaseUrl: "postgresql://owner@database.internal/sotto",
      }),
    ).toThrow("catalog application name is invalid");
  },
);

it("accepts a 63-byte application name boundary", async () => {
  const repository = createCatalogRepository({
    applicationName: "a".repeat(63),
    databaseUrl: "postgresql://owner@database.internal/sotto",
  });
  await repository.close();
});

it.each([
  "application_name=override",
  "host=elsewhere.internal",
  "database=elsewhere",
  "statement_timeout=0",
  "lock_timeout=0",
  "query_timeout=0",
  "options=-c%20statement_timeout%3D0",
])("rejects the database URL override %s", (parameter) => {
  expect(() =>
    createCatalogRepository({
      databaseUrl: `postgresql://owner@database.internal/sotto?${parameter}`,
    }),
  ).toThrow("catalog database URL parameters are invalid");
});

it("permits a TLS-only database URL parameter", async () => {
  const repository = createCatalogRepository({
    databaseUrl:
      "postgresql://owner@database.internal/sotto?sslmode=verify-full",
  });
  await repository.close();
});

it("rejects port zero before database access", () => {
  expect(() => normalizeCatalogOrigin("https://api.example.com:0/")).toThrow(
    "catalog origin port is invalid",
  );
});
