"use client";

/**
 * @sotto/ui ships framework-neutral components without "use client"
 * banners; the ones that use hooks must enter the Next.js tree through a
 * client boundary. Pure components (CantonMark, StateChip, Veil) are
 * imported directly by server components instead.
 */
export { SottoMark, DynamicMarking, CopyChip } from "@sotto/ui";
