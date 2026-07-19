"use client";

import { RouteFailure } from "../../components/route-error";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteFailure surface="Composer" error={error} reset={reset} />;
}
