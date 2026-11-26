import React from 'react';

export function DiscoverLoadingView() {
  return (
    <div
      id="discover-loading-view"
      role="status"
      aria-label="Loading discover"
      aria-busy="true"
      className="flex-1 overflow-y-auto px-[12px] pt-2 pb-[calc(100px+env(safe-area-inset-bottom,0px))] flex flex-col gap-3"
    >
      <span className="sr-only">Loading discover…</span>
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-x-[8px] items-start w-full min-w-0"
      >
        <div className="flex flex-col gap-[12px] min-w-0">
          {(['aspect-[5/4]', 'aspect-[5/4]'] as const).map((aspectClass, idx) => (
            <div
              key={`left-${idx}`}
              className="bg-white/92 rounded-[20px] overflow-hidden border border-black/[0.04] shadow-[0_4px_16px_-4px_rgba(28,28,45,0.05),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col motion-safe:animate-pulse"
            >
              <div className={`w-full ${aspectClass} bg-[#5E5BAE]/10`} />
              <div className="flex flex-col px-[10px] pt-[9px] pb-[10px]">
                <div className="h-[20px] w-4/5 rounded-md bg-[#5E5BAE]/10" />
                <div className="mt-[3px] h-[16px] w-14 rounded-md bg-[#5E5BAE]/[0.08]" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-[12px] min-w-0">
          {(['aspect-square', 'aspect-[5/4]'] as const).map((aspectClass, idx) => (
            <div
              key={`right-${idx}`}
              className="bg-white/92 rounded-[20px] overflow-hidden border border-black/[0.04] shadow-[0_4px_16px_-4px_rgba(28,28,45,0.05),0_1px_3px_rgba(0,0,0,0.02)] flex flex-col motion-safe:animate-pulse"
            >
              <div className={`w-full ${aspectClass} bg-[#5E5BAE]/10`} />
              <div className="flex flex-col px-[10px] pt-[9px] pb-[10px]">
                <div className="h-[20px] w-3/4 rounded-md bg-[#5E5BAE]/10" />
                <div className="mt-[3px] h-[16px] w-14 rounded-md bg-[#5E5BAE]/[0.08]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
