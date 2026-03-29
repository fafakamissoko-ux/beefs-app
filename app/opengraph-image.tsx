import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Beefs - Débats en live';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
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
          fontFamily: 'sans-serif',
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
              fontWeight: 900,
              background: 'linear-gradient(135deg, #FF6B2C, #E83A14)',
              backgroundClip: 'text',
              color: 'transparent',
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
            fontWeight: 600,
            marginBottom: 8,
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
          }}
        >
          <span>🎤 Débats</span>
          <span>🗳️ Votes</span>
          <span>🎁 Gifts</span>
          <span>📺 Live</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
