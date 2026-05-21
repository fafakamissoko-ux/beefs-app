'use client';

type StarSize = 'sm' | 'md' | 'lg';

interface StarSpec {
  left: string;
  top: string;
  size: StarSize;
  delay: string;
  duration: string;
}

/** Positions fixes — pas de Math.random() au render (SSR-safe). */
const STARS: StarSpec[] = [
  { left: '4%', top: '8%', size: 'sm', delay: '0s', duration: '3.2s' },
  { left: '11%', top: '22%', size: 'md', delay: '0.8s', duration: '4.1s' },
  { left: '18%', top: '5%', size: 'sm', delay: '1.4s', duration: '3.8s' },
  { left: '26%', top: '14%', size: 'lg', delay: '0.3s', duration: '5.2s' },
  { left: '33%', top: '28%', size: 'sm', delay: '2.1s', duration: '3.5s' },
  { left: '41%', top: '6%', size: 'md', delay: '1.1s', duration: '4.4s' },
  { left: '48%', top: '18%', size: 'sm', delay: '0.5s', duration: '3.9s' },
  { left: '55%', top: '9%', size: 'lg', delay: '1.7s', duration: '5.5s' },
  { left: '62%', top: '24%', size: 'sm', delay: '2.4s', duration: '3.3s' },
  { left: '70%', top: '11%', size: 'md', delay: '0.9s', duration: '4.7s' },
  { left: '77%', top: '20%', size: 'sm', delay: '1.9s', duration: '3.6s' },
  { left: '84%', top: '7%', size: 'lg', delay: '0.2s', duration: '5.1s' },
  { left: '92%', top: '16%', size: 'sm', delay: '2.7s', duration: '3.4s' },
  { left: '7%', top: '38%', size: 'md', delay: '1.3s', duration: '4.2s' },
  { left: '15%', top: '48%', size: 'sm', delay: '2.0s', duration: '3.7s' },
  { left: '23%', top: '42%', size: 'lg', delay: '0.6s', duration: '5.3s' },
  { left: '31%', top: '52%', size: 'sm', delay: '1.6s', duration: '3.1s' },
  { left: '39%', top: '35%', size: 'md', delay: '2.3s', duration: '4.6s' },
  { left: '57%', top: '44%', size: 'sm', delay: '0.4s', duration: '3.8s' },
  { left: '65%', top: '36%', size: 'lg', delay: '1.8s', duration: '5.0s' },
  { left: '73%', top: '50%', size: 'sm', delay: '2.5s', duration: '3.2s' },
  { left: '81%', top: '40%', size: 'md', delay: '1.0s', duration: '4.3s' },
  { left: '89%', top: '46%', size: 'sm', delay: '2.8s', duration: '3.5s' },
  { left: '5%', top: '62%', size: 'lg', delay: '0.7s', duration: '5.4s' },
  { left: '13%', top: '72%', size: 'sm', delay: '1.5s', duration: '3.9s' },
  { left: '21%', top: '58%', size: 'md', delay: '2.2s', duration: '4.5s' },
  { left: '29%', top: '68%', size: 'sm', delay: '0.1s', duration: '3.3s' },
  { left: '37%', top: '78%', size: 'lg', delay: '1.2s', duration: '5.6s' },
  { left: '45%', top: '62%', size: 'sm', delay: '2.6s', duration: '3.6s' },
  { left: '53%', top: '72%', size: 'md', delay: '0.8s', duration: '4.8s' },
  { left: '61%', top: '58%', size: 'sm', delay: '1.4s', duration: '3.4s' },
  { left: '69%', top: '68%', size: 'lg', delay: '2.1s', duration: '5.2s' },
  { left: '77%', top: '78%', size: 'sm', delay: '0.3s', duration: '3.7s' },
  { left: '85%', top: '62%', size: 'md', delay: '1.9s', duration: '4.1s' },
  { left: '93%', top: '72%', size: 'sm', delay: '2.9s', duration: '3.2s' },
  { left: '9%', top: '88%', size: 'sm', delay: '1.1s', duration: '3.5s' },
  { left: '17%', top: '92%', size: 'md', delay: '2.4s', duration: '4.4s' },
  { left: '35%', top: '90%', size: 'lg', delay: '0.5s', duration: '5.3s' },
  { left: '52%', top: '86%', size: 'sm', delay: '1.7s', duration: '3.8s' },
  { left: '68%', top: '92%', size: 'md', delay: '2.0s', duration: '4.6s' },
  { left: '86%', top: '88%', size: 'sm', delay: '0.9s', duration: '3.1s' },
  { left: '96%', top: '84%', size: 'lg', delay: '1.6s', duration: '5.1s' },
  { left: '44%', top: '48%', size: 'sm', delay: '2.7s', duration: '3.9s' },
  { left: '58%', top: '30%', size: 'md', delay: '1.3s', duration: '4.2s' },
  { left: '72%', top: '84%', size: 'sm', delay: '0.2s', duration: '3.6s' },
];

const SIZE_CLASS: Record<StarSize, string> = {
  sm: 'h-px w-px opacity-40',
  md: 'h-0.5 w-0.5 opacity-60',
  lg: 'h-1 w-1 opacity-80 shadow-[0_0_4px_rgba(255,255,255,0.55)]',
};

function StarLayer({ stars, layerOpacity }: { stars: StarSpec[]; layerOpacity: string }) {
  return (
    <div className={`absolute inset-0 ${layerOpacity}`}>
      {stars.map((star, i) => (
        <span
          key={`${star.left}-${star.top}-${i}`}
          className={`absolute animate-pulse rounded-full bg-white ${SIZE_CLASS[star.size]}`}
          style={{
            left: star.left,
            top: star.top,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}

export function StarField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(30,27,75,0.35),transparent_70%)]" />
      <StarLayer stars={STARS.filter((s) => s.size === 'sm')} layerOpacity="opacity-70" />
      <StarLayer stars={STARS.filter((s) => s.size === 'md')} layerOpacity="opacity-80" />
      <StarLayer stars={STARS.filter((s) => s.size === 'lg')} layerOpacity="opacity-90" />
    </div>
  );
}
