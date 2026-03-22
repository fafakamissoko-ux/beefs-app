interface BeefLogoProps {
  className?: string;
  size?: number;
}

export function BeefLogo({ className = '', size = 40 }: BeefLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="fireGrad" x1="24" y1="6" x2="24" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF6B2C" />
          <stop offset="0.5" stopColor="#E83A14" />
          <stop offset="1" stopColor="#B91C0C" />
        </linearGradient>
        <linearGradient id="innerFire" x1="24" y1="18" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD600" />
          <stop offset="1" stopColor="#FF6B2C" />
        </linearGradient>
      </defs>

      {/* Outer flame — left fork */}
      <path
        d="M14 42C14 42 8 32 12 22C14.5 16 18 14 20 10C20 10 20 18 24 22C22 18 19 12 22 6C22 6 30 14 32 22C34 14 36 12 36 10C36 10 42 18 40 28C38.5 36 34 42 34 42H14Z"
        fill="url(#fireGrad)"
      />

      {/* Inner flame — bright core */}
      <path
        d="M20 42C20 42 16 36 18 30C19.5 25 22 24 24 20C24 20 26 26 28 28C30 24 30 22 30 20C30 20 35 26 33 32C31.5 37 28 42 28 42H20Z"
        fill="url(#innerFire)"
      />

      {/* Hottest center */}
      <ellipse cx="24" cy="38" rx="3" ry="4" fill="white" opacity="0.85" />
    </svg>
  );
}
