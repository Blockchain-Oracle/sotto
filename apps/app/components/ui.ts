"use client";

/**
 * Client boundary for @sotto/ui. The package ships uncompiled ESM without
 * "use client" directives; re-exporting through this module marks every
 * primitive for the app router's client graph in one place.
 */
export * from "@sotto/ui";
