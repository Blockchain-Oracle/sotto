"use client";

import { Skeleton } from "../ui";

/** Geometry-preserving marketplace skeleton (no shimmer, DESIGN.md §4). */
export function MarketplaceSkeleton() {
  return (
    <>
      <div className="app-page-head">
        <div>
          <Skeleton width={280} height={24} />
          <div style={{ marginTop: 8 }}>
            <Skeleton width={320} height={14} />
          </div>
        </div>
      </div>
      <div className="app-statband">
        {[0, 1, 2, 3].map((index) => (
          <div className="app-stat" key={index}>
            <Skeleton width={110} height={11} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width={56} height={18} />
            </div>
          </div>
        ))}
      </div>
      <div className="app-skeleton-rows">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} width="100%" height={46} />
        ))}
      </div>
    </>
  );
}

/** Detail-page skeleton preserving the sticky-header geometry. */
export function DetailSkeleton() {
  return (
    <>
      <div className="app-detail-head">
        <div className="app-detail-id">
          <Skeleton width={240} height={20} />
          <div style={{ marginTop: 8 }}>
            <Skeleton width={340} height={13} />
          </div>
        </div>
        <div className="app-head-actions">
          <Skeleton width={130} height={32} />
        </div>
      </div>
      <div className="app-skeleton-rows">
        <Skeleton width="100%" height={120} />
        <Skeleton width="100%" height={180} />
        <Skeleton width="100%" height={120} />
      </div>
    </>
  );
}

/** Table-page skeleton (Scan feed, Stats inventory, Ops queue). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <div className="app-page-head">
        <div>
          <Skeleton width={200} height={22} />
          <div style={{ marginTop: 8 }}>
            <Skeleton width={300} height={13} />
          </div>
        </div>
      </div>
      <div className="app-skeleton-rows">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} width="100%" height={40} />
        ))}
      </div>
    </>
  );
}
