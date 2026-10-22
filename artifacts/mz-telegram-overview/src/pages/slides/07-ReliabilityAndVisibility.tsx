export default function ReliabilityAndVisibility() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="absolute right-0 top-0 h-[100vh] w-[1vw] bg-primary/70" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[7vh] w-[86vw]">
        <h1 className="font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          Reliability and operational visibility
        </h1>
        <div className="deck-rule mt-[2.4vh] h-[.35vh] w-[15vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[8vw] top-[29vh] w-[83vw]">
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Persistent PostgreSQL queue with delivery records</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Retry backoff and uniqueness constraints help prevent duplicate processing</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Delivery status and event logs help the owner inspect failures</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">The background worker runs without the dashboard remaining open</p>
        </div>
        <div className="flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Protected Telegram content is not bypassed</p>
        </div>
      </div>
      <div className="absolute bottom-[7vh] left-[8vw] h-[.45vh] w-[42vw] bg-primary/25" aria-hidden="true">
        <div className="h-full w-[28vw] bg-primary" />
      </div>
    </div>
  );
}
