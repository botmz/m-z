export default function TelegramConnections() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="absolute right-0 top-0 h-[100vh] w-[3vw] bg-primary" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[7vh] w-[86vw]">
        <h1 className="max-w-[92vw] font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.08em] text-text text-wrap-balance">
          Two Telegram connections, two different jobs
        </h1>
        <div className="deck-rule mt-[2.5vh] h-[.35vh] w-[15vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[7vw] top-[27vh] w-[85vw]">
        <div className="grid min-h-[16vh] grid-cols-[1.3fr_5fr] items-center gap-[3vw] border-b border-primary/30 py-[1.2vh]">
          <div className="flex h-[13vh] items-center justify-center bg-accent">
            <svg className="h-[8vh] w-[8vh] text-primary" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <circle cx="50" cy="50" r="32" stroke="currentColor" strokeWidth="4" />
              <path d="M50 18V50L72 67" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              <circle cx="50" cy="50" r="5" fill="currentColor" />
            </svg>
          </div>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">- Reader account (MTProto): reads supported public channels after account authorization</p>
        </div>
        <div className="grid min-h-[14vh] grid-cols-[1.3fr_5fr] items-center gap-[3vw] border-b border-primary/30 py-[1.2vh]">
          <div className="flex h-[11vh] items-center justify-center bg-accent/70">
            <svg className="h-[7vh] w-[7vh] text-primary" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <path d="M20 51L80 20L61 81L48 57L20 51Z" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
              <path d="M48 57L80 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </div>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">- Publisher bot (Bot API): posts to configured destinations</p>
        </div>
        <div className="flex min-h-[13vh] items-center gap-[2vw] border-b border-primary/30 py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">The bot must have permission to publish in each destination</p>
        </div>
        <div className="flex min-h-[13vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">The reader session and bot token remain separate credentials</p>
        </div>
      </div>
      <div className="absolute bottom-[7vh] left-[7vw] h-[.4vh] w-[86vw] bg-primary/20" aria-hidden="true">
        <div className="h-full w-[43vw] bg-primary" />
      </div>
    </div>
  );
}
