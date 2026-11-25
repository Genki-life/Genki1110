import React from 'react';

export function PlanLoadingView() {
  return (
    <div
      id="plan-loading-view"
      role="status"
      aria-label="Loading plan"
      aria-busy="true"
      className="flex-1 overflow-y-auto px-5 pt-[18px] pb-[calc(88px+env(safe-area-inset-bottom,0px))] flex flex-col gap-6"
    >
      <span className="sr-only">Loading plan…</span>
      {['Your focus', 'This week', 'Up next'].map((title, index) => (
        <section key={title} aria-hidden="true" className="flex flex-col gap-2.5">
          <h2 className="text-[18px] font-semibold leading-[24px] tracking-[-0.015em] text-[#1C1C1E]">
            {title}
          </h2>
          <div className="rounded-[24px] p-4 bg-white/88 border border-black/[0.04] flex flex-col gap-4 motion-safe:animate-pulse">
            <div className="h-6 w-3/5 rounded-lg bg-[#5E5BAE]/10" />
            <div className="h-4 w-4/5 rounded-lg bg-[#5E5BAE]/[0.06]" />
            {index === 1 && <div className="h-4 w-2/3 rounded-lg bg-[#5E5BAE]/[0.06]" />}
            <div className="h-4 w-1/3 rounded-lg bg-[#5E5BAE]/[0.06]" />
          </div>
        </section>
      ))}
    </div>
  );
}
