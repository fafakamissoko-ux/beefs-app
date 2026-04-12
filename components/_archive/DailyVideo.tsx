'use client';

import { useRef, useState } from 'react';
import { PreJoinScreen } from '../PreJoinScreen';

interface DailyVideoProps {
  roomUrl: string;
  userName?: string;
}

export function DailyVideo({ roomUrl, userName = 'User' }: DailyVideoProps) {
  const [phase, setPhase] = useState<'prejoin' | 'joined'>('prejoin');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const dailyUrl = `${roomUrl}?name=${encodeURIComponent(userName)}&showLeaveButton=true&showFullscreenButton=true`;

  if (phase === 'prejoin') {
    return <PreJoinScreen userName={userName} onJoin={() => setPhase('joined')} />;
  }

  return (
    <div className="w-full h-full relative">
      <iframe
        ref={iframeRef}
        src={dailyUrl}
        allow="camera *; microphone *; fullscreen *; speaker *; display-capture *; autoplay *"
        className="absolute inset-0 w-full h-full border-0 rounded-xl"
        title="Daily.co Video Call"
      />
    </div>
  );
}
