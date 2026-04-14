'use client';

import { useParams } from 'next/navigation';
import { ArenaRoomPage } from '@/components/ArenaRoomPage';
import { normalizeBeefId } from '@/lib/beef-id';

/** Entrée « Antichambre » : même shell que /arena/[roomId] (préjoin + TikTokStyleArena). */
export default function LiveBeefRoomPage() {
  const params = useParams();
  const raw = params.id;
  const roomIdParam = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';
  const roomId = normalizeBeefId(roomIdParam) ?? '';
  return <ArenaRoomPage roomIdParam={roomIdParam} roomId={roomId} />;
}
