import React from 'react';

export const MatchCardSkeleton: React.FC = () => (
  <div className="card p-3">
    <div className="skeleton mb-3 h-3 w-28" />
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="skeleton h-6 w-6 rounded-full" />
          <div className="skeleton h-3 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <div className="skeleton h-6 w-6 rounded-full" />
          <div className="skeleton h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-2.5">
        <div className="skeleton h-4 w-5" />
        <div className="skeleton h-4 w-5" />
      </div>
    </div>
  </div>
);

export const ListSkeleton: React.FC<{ count?: number; compact?: boolean }> = ({ count = 4 }) => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: count }).map((_, i) => (
      <MatchCardSkeleton key={i} />
    ))}
  </div>
);

export const PageSkeleton: React.FC<{ children?: never }> = () => (
  <div className="flex flex-col gap-3 animate-fadeIn">
    <div className="card p-4">
      <div className="skeleton mx-auto mb-4 h-20 w-full max-w-md rounded-xl" />
      <div className="skeleton h-3 w-40 mx-auto mb-2" />
      <div className="skeleton h-3 w-56 mx-auto" />
    </div>
    <div className="skeleton h-10 w-full" />
    <ListSkeleton count={3} />
  </div>
);

/** Generic content block skeleton used inside detail pages. */
export const BlockSkeleton: React.FC<{ height?: string }> = ({ height = 'h-32' }) => (
  <div className={`skeleton ${height} w-full`} />
);
