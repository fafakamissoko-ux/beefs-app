interface BeefLogoProps {
  className?: string;
  size?: number;
}

export function BeefLogo({ className = '', size = 40 }: BeefLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="flameGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF0000" />
          <stop offset="100%" stopColor="#FF6B35" />
        </linearGradient>
      </defs>
      
      {/* Geometric flame shape */}
      <path
        d="M50 10 L35 40 L25 35 L30 60 L15 65 L35 85 L40 70 L50 90 L60 70 L65 85 L85 65 L70 60 L75 35 L65 40 L50 10Z"
        fill="url(#flameGradient)"
        className="drop-shadow-lg"
      />
      
      {/* Inner flame detail */}
      <path
        d="M50 30 L42 50 L50 65 L58 50 L50 30Z"
        fill="#FFF"
        opacity="0.3"
      />
    </svg>
  );
}
