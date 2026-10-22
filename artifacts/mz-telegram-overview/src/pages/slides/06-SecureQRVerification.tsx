export default function SecureQRVerification() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg">
      <div className="deck-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="absolute bottom-0 left-0 h-[17vh] w-screen bg-primary" aria-hidden="true" />
      <div className="absolute bottom-[2vh] right-[7vw] flex h-[13vh] w-[17vw] items-center justify-center rounded-full border border-bg/25" aria-hidden="true">
        <svg className="h-[9vh] w-[9vh] text-bg" viewBox="0 0 240 280" fill="none">
          <path d="M120 20L202 52V119C202 177 164 228 120 252C76 228 38 177 38 119V52L120 20Z" stroke="currentColor" strokeWidth="7" />
          <path d="M80 133L108 161L164 101" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="absolute left-[6vw] top-[7vh] w-[84vw]">
        <h1 className="font-display text-[5vw] font-semibold leading-[1.02] tracking-[-.04em] text-text text-wrap-balance">
          Secure QR and two-step verification
        </h1>
        <div className="deck-rule mt-[2.5vh] h-[.35vh] w-[15vw]" aria-hidden="true" />
      </div>
      <div className="absolute left-[4vw] top-[29vh] w-[91vw]">
        <div className="deck-row flex min-h-[10vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">The owner starts a QR sign-in from the protected dashboard</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">If Telegram requests two-step verification, a dedicated password field appears</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">The password is sent once to the authenticated API and is not stored or logged</p>
        </div>
        <div className="deck-row flex min-h-[10vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Teleproto performs Telegram's password verification</p>
        </div>
        <div className="flex min-h-[10vh] items-center gap-[2vw] py-[1.2vh]">
          <span className="deck-bullet text-[2.4vw]" aria-hidden="true">—</span>
          <p className="font-body text-[2.05vw] leading-[1.3] text-text text-wrap-pretty">Only the confirmed reader session is encrypted and stored for reuse</p>
        </div>
      </div>
    </div>
  );
}
