import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Beefs - Débats en live';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Sources TTF (fonts.gstatic) — alignées sur next/font (Space Grotesk + JetBrains Mono, latin). */
const OG_FONT_SPACE_GROTESK = {
  w400:
    'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oUUsj.ttf',
  w700:
    'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf',
} as const;

const OG_FONT_JETBRAINS_MONO = {
  w400:
    'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPQ.ttf',
} as const;

export default async function Image() {
  const [spaceGrotesk400, spaceGrotesk700, jetbrainsMono400] = await Promise.all([
    fetch(OG_FONT_SPACE_GROTESK.w400).then((res) => res.arrayBuffer()),
    fetch(OG_FONT_SPACE_GROTESK.w700).then((res) => res.arrayBuffer()),
    fetch(OG_FONT_JETBRAINS_MONO.w400).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 50%, #0d0d0d 100%)',
          fontFamily: '"Space Grotesk", sans-serif',
        }}
      >
        {/* Fire gradient accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: 'linear-gradient(90deg, #FF6B2C, #E83A14, #B91C0C)',
          }}
        />

        {/* Logo text */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 72, color: '#E83A14' }}>🔥</span>
          <span
            style={{
              fontSize: 80,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #FF6B2C, #E83A14)',
              backgroundClip: 'text',
              color: 'transparent',
              fontFamily: '"Space Grotesk", sans-serif',
            }}
          >
            Beefs
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: 32,
            color: '#ffffff',
            fontWeight: 700,
            marginBottom: 8,
            fontFamily: '"Space Grotesk", sans-serif',
          }}
        >
          Débats en live
        </p>
        <p
          style={{
            fontSize: 22,
            color: '#888888',
            maxWidth: 600,
            textAlign: 'center',
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 400,
          }}
        >
          Crée un beef, invite des challengers et laisse le public voter
        </p>

        {/* Bottom accent */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            gap: 24,
            color: '#555',
            fontSize: 16,
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 400,
          }}
        >
          <span>🎤 Débats</span>
          <span>🗳️ Votes</span>
          <span>🎁 Gifts</span>
          <span>📺 Live</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Space Grotesk',
          data: spaceGrotesk400,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Space Grotesk',
          data: spaceGrotesk700,
          style: 'normal',
          weight: 700,
        },
        {
          name: 'JetBrains Mono',
          data: jetbrainsMono400,
          style: 'normal',
          weight: 400,
        },
      ],
    },
  );
}
