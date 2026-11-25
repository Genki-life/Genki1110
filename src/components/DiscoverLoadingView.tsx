import React from 'react';

export function DiscoverLoadingView() {
  return (
    <div
      id="discover-loading-view"
      role="status"
      aria-label="Loading discover"
      aria-busy="true"
      className="flex-1 overflow-y-auto px-5 pt-3 pb-[calc(100px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3"
    >
      <span className="sr-only">Loading discover…</span>
      <div aria-hidden="true" className="h-[18px] w-36 rounded-md bg-[#5E5BAE]/10 motion-safe:animate-pulse" />
      <div aria-hidden="true" className="flex flex-col gap-4">
        {[0, 1].map((idx) => (
          <div
            key={idx}
            className="bg-white/92 rounded-[24px] p-4 border border-black/[0.04] shadow-[0_4px_16px_-4px_rgba(28,28,45,0.05),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-3 motion-safe:animate-pulse"
          >
            <div className="w-full aspect-[2/1] rounded-[16px] bg-[#5E5BAE]/10" />
            <div className="flex flex-col">
              <div className="h-[23px] w-2/5 rounded-lg bg-[#5E5BAE]/10" />
              <div className="mt-1 h-[21px] w-4/5 rounded-lg bg-[#5E5BAE]/[0.06]" />
              <div className="mt-2 h-[18px] w-28 rounded-md bg-[#5E5BAE]/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
