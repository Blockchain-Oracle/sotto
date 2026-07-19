"use client";

import { RouteFailure } from "../../components/route-error";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteFailure surface="Add API" error={error} reset={reset} />;
}
