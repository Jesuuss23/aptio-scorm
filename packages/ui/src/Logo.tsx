export function Logo() {
  return (
    <span className="ap-logo" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="2.6" fill="#fff" />
        <circle cx="5" cy="6" r="2" />
        <circle cx="19" cy="6" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="18" r="2" />
        <path d="M6.6 7.3 10 10.3M17.4 7.3 14 10.3M6.6 16.7 10 13.7M17.4 16.7 14 13.7" />
      </svg>
    </span>
  );
}

export function Marca({ subtitulo }: { subtitulo?: string }) {
  return (
    <>
      <Logo />
      <span>
        <span className="ap-nombre">
          Aptio <span>SCORM</span>
        </span>
        {subtitulo ? <span className="ap-sub">{subtitulo}</span> : null}
      </span>
    </>
  );
}
