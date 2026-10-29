export default function WhatOwnersManage() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute inset-y-0 right-0 w-[34vw] bg-primary" aria-hidden="true" />
      <div className="absolute inset-y-0 right-[34vw] w-[1vw] bg-primary/25" aria-hidden="true" />
      <div className="absolute right-[4vw] top-[11vh] h-[78vh] w-[25vw] rounded-[50%] border border-bg/20" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[8vh] w-[65vw]">
        <h1 className="font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          What owners can manage
        </h1>
        <div className="mt-[3vh] h-[.35vh] w-[14vw] bg-primary" aria-hidden="true" />
      </div>
      <div className="absolute left-[7vw] top-[27vh] w-[57vw]">
        <div className="deck-row flex min-h-[10vh] items-center gap-[1.8vw] py-[1.8vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Sources, destinations, and multi-channel routing rules</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[1.8vw] py-[1.8vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Link filtering and source-link settings</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[1.8vw] py-[1.8vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Optional market-price overlays</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[1.8vw] py-[1.8vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Message previews, delivery logs, and retries</p>
        </div>
        <div className="flex min-h-[10vh] items-center gap-[1.8vw] py-[1.8vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Preview changes without publishing</p>
        </div>
      </div>
      <svg className="absolute right-[6vw] top-[31vh] h-[34vh] w-[24vw] text-bg" viewBox="0 0 420 360" fill="none" aria-hidden="true">
        <rect x="64" y="48" width="294" height="264" rx="8" stroke="currentColor" strokeOpacity=".75" strokeWidth="3" />
        <path d="M104 103H274M104 145H318M104 187H246M104 229H292" stroke="currentColor" strokeOpacity=".55" strokeWidth="7" strokeLinecap="round" />
        <circle cx="315" cy="102" r="12" fill="currentColor" />
        <circle cx="271" cy="187" r="12" fill="currentColor" />
      </svg>
      <div className="absolute bottom-[7vh] left-[7vw] h-[.4vh] w-[25vw] bg-primary/50" aria-hidden="true" />
    </div>
  );
}
