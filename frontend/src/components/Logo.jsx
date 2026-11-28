export function LogoMark({ size = 32, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 320 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AuInt"
    >
      <rect width="320" height="320" rx="60" fill="#FFFFFF" />
      <path d="M103.45 266L151.3 54H168.7L216.55 266H199.15L160 112.579L120.85 266H103.45Z" fill="#242B30" />
      <path d="M127.375 176.737L153.475 210.211L201.325 148.842L214.375 165.579L153.475 243.684L114.325 193.474L127.375 176.737Z" fill="#80868C" />
    </svg>
  );
}

export function Brand({ onClick }) {
  return (
    <button type="button" className="brand" onClick={onClick} aria-label="AuInt — на главную">
      <LogoMark size={32} />
      <span className="brand-name">AuInt</span>
    </button>
  );
}
