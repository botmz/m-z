export default function VerificationAndNextStep() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_88%,hsl(43_30%_17%/.75),transparent_42%)]" aria-hidden="true" />
      <div className="absolute bottom-0 left-0 h-[1.2vh] w-[100vw] bg-primary" aria-hidden="true" />
      <div className="absolute left-[6vw] top-[7vh] w-[86vw]">
        <h1 className="font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          Verification status and next step
        </h1>
        <div className="deck-rule mt-[2.4vh] h-[.35vh] w-[15vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[5.5vw] top-[29vh] w-[89vw]">
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.7vh]">
          <span className="deck-bullet text-[2.3vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2vw] leading-[1.25] text-text text-wrap-pretty">21 automated tests pass; workspace type checks pass</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.7vh]">
          <span className="deck-bullet text-[2.3vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2vw] leading-[1.25] text-text text-wrap-pretty">QR generation and API protection have been checked</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.7vh]">
          <span className="deck-bullet text-[2.3vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2vw] leading-[1.25] text-text text-wrap-pretty">Final account-level 2FA sign-in and session recovery still need owner verification</p>
        </div>
        <div className="deck-row flex min-h-[10.5vh] items-center gap-[2vw] py-[1.7vh]">
          <span className="deck-bullet text-[2.3vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2vw] leading-[1.25] text-text text-wrap-pretty">Next: scan a fresh QR, complete 2FA in the dashboard, confirm “Connected,” then restart the API and verify reconnection</p>
        </div>
        <div className="flex min-h-[10.5vh] items-center gap-[2vw] py-[1.7vh]">
          <span className="deck-bullet text-[2.3vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2vw] leading-[1.25] text-text text-wrap-pretty">End-to-end publishing still requires a source and destination the owner is authorized to use</p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] right-[7vw] h-[.4vh] w-[21vw] bg-primary/45" aria-hidden="true" />
    </div>
  );
}
