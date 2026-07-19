"use client";

import { RouteFailure } from "../../../components/route-error";

export default function SegmentError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <RouteFailure surface="provider" error={error} reset={reset} />;
}
