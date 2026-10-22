export default function MZTelegramBots() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-80" aria-hidden="true" />
      <div className="deck-orbit absolute inset-y-0 right-0 w-[43vw] bg-primary/10" aria-hidden="true" />
      <div className="absolute right-[2vw] top-[12vh] h-[78vh] w-[36vw] rounded-full border border-primary/30" aria-hidden="true" />
      <div className="absolute right-[6vw] top-[22vh] h-[55vh] w-[28vw] rounded-full border border-primary/20" aria-hidden="true" />
      <svg className="absolute right-[11vw] top-[27vh] h-[45vh] w-[31vw] text-primary" viewBox="0 0 600 420" fill="none" aria-hidden="true">
        <path d="M36 224C126 224 115 82 244 82C364 82 342 338 468 338C514 338 535 299 564 269" stroke="currentColor" strokeOpacity=".7" strokeWidth="3" />
        <path d="M36 224C126 224 115 82 244 82C364 82 342 338 468 338C514 338 535 299 564 269" stroke="currentColor" strokeOpacity=".2" strokeWidth="22" />
        <circle cx="36" cy="224" r="18" fill="#11100E" stroke="currentColor" strokeWidth="4" />
        <circle cx="244" cy="82" r="23" fill="currentColor" />
        <circle cx="468" cy="338" r="19" fill="#11100E" stroke="currentColor" strokeWidth="4" />
        <circle cx="564" cy="269" r="12" fill="currentColor" />
        <path d="M210 82H278M434 338H502" stroke="#11100E" strokeOpacity=".65" strokeWidth="2" />
      </svg>
      <div className="absolute left-[7vw] top-[17vh] w-[52vw]">
        <h1 className="max-w-[48vw] font-display text-[6.2vw] font-bold leading-[.98] tracking-[-.05em] text-text text-wrap-balance">
          MZ Telegram Bots
        </h1>
        <div className="deck-rule mt-[4vh] h-[.45vh] w-[17vw]" aria-hidden="true" />
        <p className="mt-[3vh] max-w-[47vw] font-body text-[2.25vw] leading-[1.35] text-muted text-wrap-pretty">
          An owner-operated dashboard for managing Telegram channel intake, content preparation, and publishing.
        </p>
      </div>
      <div className="absolute bottom-[8vh] left-[7vw] h-[.7vh] w-[86vw] bg-primary/20" aria-hidden="true">
        <div className="h-full w-[34vw] bg-primary" />
      </div>
    </div>
  );
}
