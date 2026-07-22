import React from 'react';
import { useRouter } from 'next/navigation';
import { BeefCard } from '@/components/BeefCard';
import { Flame } from 'lucide-react';

export interface GridBeef {
  id: string;
  title: string;
  status: string;
  created_at: string;
  viewer_count?: number;
  tags?: string[];
  scheduled_at?: string;
  host_name?: string;
  host_username?: string | null;
  resolution_status?: string | null;
  mediation_summary?: string | null;
  mediator_id?: string;
}

export interface ProfileBeefGridProps {
  beefs: GridBeef[];
  emptyMessage?: string;
  emptyIcon?: React.ElementType;
  emptyAction?: React.ReactNode;
  renderExtra?: (beef: GridBeef) => React.ReactNode;
}

export function ProfileBeefGrid({
  beefs,
  emptyMessage = 'Aucun beef pour le moment',
  emptyIcon: EmptyIcon = Flame,
  emptyAction,
  renderExtra,
}: ProfileBeefGridProps) {
  const router = useRouter();

  if (beefs.length === 0) {
    return (
      <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <EmptyIcon className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <p className="text-white/50 mb-4">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      {beefs.map((beef, idx) => (
        <div key={beef.id} className="space-y-2">
          <div className="aspect-[3/4] max-h-[70dvh]">
          <BeefCard
            id={beef.id}
            index={idx}
            title={beef.title}
            host_name={beef.host_name || 'Utilisateur'}
            host_username={beef.host_username}
            status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
            created_at={beef.created_at}
            viewer_count={beef.viewer_count || 0}
            tags={beef.tags}
            scheduled_at={beef.scheduled_at}
            onClick={() => {
              if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                router.push(`/beef/${beef.id}/summary`);
              } else {
                router.push(`/arena/${beef.id}`);
              }
            }}
          />
          </div>
          {renderExtra && renderExtra(beef)}
        </div>
      ))}
    </div>
  );
}
