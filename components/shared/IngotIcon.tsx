export function IngotIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="25%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#EAB308" />
          <stop offset="75%" stopColor="#CA8A04" />
          <stop offset="100%" stopColor="#A16207" />
        </linearGradient>
        <linearGradient id="goldInner" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#854D0E" />
          <stop offset="50%" stopColor="#CA8A04" />
          <stop offset="100%" stopColor="#FDE047" />
        </linearGradient>
      </defs>
      <rect x="1" y="6" width="22" height="12" rx="3" fill="url(#goldGrad)" stroke="#713F12" strokeWidth="1" />
      <rect x="5" y="9" width="14" height="6" rx="1.5" fill="url(#goldInner)" stroke="#854D0E" strokeWidth="0.5" />
      <circle cx="9" cy="12" r="1" fill="#FEF08A" />
      <circle cx="12" cy="12" r="1" fill="#FEF08A" />
      <circle cx="15" cy="12" r="1" fill="#FEF08A" />
    </svg>
  );
}
