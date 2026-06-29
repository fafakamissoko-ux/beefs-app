interface BeefLogoProps {
  className?: string;
  size?: number;
}

export function BeefLogo({ className = '', size = 40 }: BeefLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Fond App (Tailwind slate-950) */}
      <rect width="512" height="512" fill="#020617" rx="64" />

      {/* Ambient Glows (simulant les halos de l'arène) */}
      <circle cx="100" cy="100" r="200" fill="#0891b2" opacity="0.15" filter="blur(60px)" />
      <circle cx="400" cy="400" r="150" fill="#06b6d4" opacity="0.1" filter="blur(50px)" />

      {/* Starry Glass (Étoiles vectorielles) */}
      <g fill="#ffffff">
        <circle cx="80" cy="150" r="1.5" opacity="0.8" />
        <circle cx="120" cy="300" r="1" opacity="0.4" />
        <circle cx="250" cy="80" r="2" opacity="0.9" />
        <circle cx="420" cy="180" r="1.5" opacity="0.6" />
        <circle cx="380" cy="350" r="2" opacity="0.8" />
        <circle cx="180" cy="450" r="1" opacity="0.5" />
        <circle cx="280" cy="380" r="1.5" opacity="0.7" />
        <circle cx="450" cy="80" r="1" opacity="0.3" />
        <circle cx="60" cy="420" r="2" opacity="0.6" />
        <circle cx="480" cy="280" r="1.5" opacity="0.8" />
      </g>

      <defs>
        {/* Moteur de luminescence (Triple passe optimisée) */}
        <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#22d3ee" floodOpacity="1" />
          <feDropShadow dx="0" dy="0" stdDeviation="15" floodColor="#06b6d4" floodOpacity="0.8" />
          <feDropShadow dx="0" dy="0" stdDeviation="30" floodColor="#0891b2" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* Vecteur Éclair */}
      <path d="M286 90 L156 280 L236 280 L196 422 L356 210 L266 210 Z" fill="#ffffff" filter="url(#neon-glow)" />
    </svg>
  );
}
