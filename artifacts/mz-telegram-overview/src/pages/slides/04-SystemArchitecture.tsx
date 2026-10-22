export default function SystemArchitecture() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="absolute left-0 top-0 h-[100vh] w-[1.1vw] bg-primary" aria-hidden="true" />
      <div className="absolute right-0 top-0 h-[27vh] w-[30vw] bg-accent/75" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[7vh] w-[90vw]">
        <h1 className="font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          A clear, separate system architecture
        </h1>
        <div className="deck-rule mt-[2.4vh] h-[.35vh] w-[15vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[8vw] top-[29vh] w-[84vw]">
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">React and TypeScript provide the Arabic, right-to-left dashboard</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Express exposes the authenticated management API</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">PostgreSQL stores configuration, delivery records, and the persistent queue</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">A background worker processes deliveries independently of the browser</p>
        </div>
        <div className="flex min-h-[10.5vh] items-center gap-[2vw] py-[1.6vh]">
          <span className="h-[1.2vh] w-[1.2vh] shrink-0 rounded-full bg-primary" aria-hidden="true" />
          <p className="font-body text-[2.05vw] leading-[1.25] text-text text-wrap-pretty">Teleproto handles MTProto reader authorization; Bot API handles publishing</p>
        </div>
      </div>
      <div className="absolute bottom-[7vh] right-[6vw] h-[.45vh] w-[31vw] bg-primary/35" aria-hidden="true">
        <div className="h-full w-[19vw] bg-primary" />
      </div>
    </div>
  );
}
