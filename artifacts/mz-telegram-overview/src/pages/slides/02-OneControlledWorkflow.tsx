export default function OneControlledWorkflow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="absolute right-0 top-0 h-[36vh] w-[30vw] bg-accent/70" aria-hidden="true" />
      <div className="absolute right-[7vw] top-[9vh] h-[19vh] w-[19vw] rounded-full border border-primary/35" aria-hidden="true" />
      <div className="absolute right-[10vw] top-[12vh] h-[13vh] w-[13vw] rounded-full border border-primary/55" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[8vh] w-[80vw]">
        <h1 className="max-w-[90vw] font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          One controlled publishing workflow
        </h1>
        <div className="deck-rule mt-[2.6vh] h-[.35vh] w-[13vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[7vw] top-[29vh] w-[85vw]">
        <div className="deck-row flex min-h-[12vh] items-center gap-[2vw] py-[2.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.1vw] leading-[1.3] text-text text-wrap-pretty">Read supported public channels through an authorized MTProto account</p>
        </div>
        <div className="deck-row flex min-h-[12vh] items-center gap-[2vw] py-[2.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.1vw] leading-[1.3] text-text text-wrap-pretty">Apply routing and content settings</p>
        </div>
        <div className="deck-row flex min-h-[12vh] items-center gap-[2vw] py-[2.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.1vw] leading-[1.3] text-text text-wrap-pretty">Publish to configured destinations through Telegram Bot API</p>
        </div>
        <div className="flex min-h-[12vh] items-center gap-[2vw] py-[2.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.1vw] leading-[1.3] text-text text-wrap-pretty">Monitor delivery from one owner dashboard</p>
        </div>
      </div>
      <div className="absolute bottom-[8vh] left-[7vw] h-[.4vh] w-[86vw] bg-primary/20" aria-hidden="true">
        <div className="h-full w-[22vw] bg-primary" />
      </div>
    </div>
  );
}
