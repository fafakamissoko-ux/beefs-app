'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Eye, Users, Hash, User } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const TERMINAL_STATUSES = new Set(['ended', 'replay', 'cancelled']);

type MediatorUser = { username: string; display_name: string | null };

type BeefRow = {
  id: string;
  title: string;
  subject?: string;
  description?: string | null;
  status: string;
  created_at: string;
  started_at?: string | null;
  ended_at?: string | null;
  viewer_count?: number | null;
  tags?: string[] | null;
  mediator_id: string;
  users?: MediatorUser | null;
};

export default function BeefSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [beef, setBeef] = useState<BeefRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;

    (async () => {
      const { data, error } = await supabase
        .from('beefs')
        .select('id, title, subject, description, status, created_at, started_at, ended_at, viewer_count, tags, mediator_id, users!beefs_mediator_id_fkey(username, display_name)')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const raw = data as typeof data & { users?: MediatorUser | MediatorUser[] | null };
      const u = raw.users;
      const mediator = Array.isArray(u) ? u[0] : u;
      const row: BeefRow = { ...raw, users: mediator ?? null };
      if (!TERMINAL_STATUSES.has(row.status)) {
        router.replace(`/arena/${id}`);
        return;
      }

      setBeef(row);
      setLoading(false);
    })();
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !beef) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <p className="text-white font-semibold mb-4">Beef introuvable</p>
        <Link href="/feed" className="text-brand-400 font-medium">Retour au feed</Link>
      </div>
    );
  }

  const hostName = beef.users?.display_name || beef.users?.username || 'Médiateur';
  const mediatorUsername = beef.users?.username;
  const durationMin =
    beef.started_at && beef.ended_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(beef.ended_at).getTime() - new Date(beef.started_at).getTime()) / 60000
          )
        )
      : null;

  const statusLabel =
    beef.status === 'cancelled'
      ? 'Annulé'
      : beef.status === 'replay'
        ? 'Replay'
        : 'Terminé';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4 py-10">
      <div className="max-w-lg mx-auto space-y-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-purple-400" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-purple-400">{statusLabel}</p>
          <h1 className="text-2xl font-black text-white leading-tight">{beef.title}</h1>
          {beef.subject && beef.subject !== beef.title && (
            <p className="text-sm text-gray-500">{beef.subject}</p>
          )}
        </motion.div>

        {beef.description && (
          <p className="text-gray-400 text-sm leading-relaxed text-center">{beef.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 text-center">
            <Eye className="w-5 h-5 text-brand-400 mx-auto mb-1" />
            <p className="text-xl font-black text-white">{beef.viewer_count ?? 0}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Vues</p>
          </div>
          {durationMin !== null && durationMin > 0 && (
            <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 text-center">
              <Users className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
              <p className="text-xl font-black text-white">{durationMin} min</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Durée</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <User className="w-4 h-4" />
            <span>Médiateur</span>
          </div>
          {mediatorUsername ? (
            <Link
              href={`/profile/${mediatorUsername}`}
              className="flex items-center justify-between group"
            >
              <span className="text-white font-semibold group-hover:text-brand-400 transition-colors">{hostName}</span>
              <span className="text-brand-400 text-xs font-bold">Profil →</span>
            </Link>
          ) : (
            <span className="text-white font-semibold">{hostName}</span>
          )}
        </div>

        {beef.tags && beef.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {beef.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-gray-400 bg-white/[0.06] border border-white/10"
              >
                <Hash className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-600">
          Fin du direct ·{' '}
          {beef.ended_at
            ? new Date(beef.ended_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
            : new Date(beef.created_at).toLocaleDateString('fr-FR')}
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/live"
            className="w-full py-3.5 rounded-xl brand-gradient text-black font-bold text-sm text-center"
          >
            Voir les lives
          </Link>
          <Link
            href="/feed"
            className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold text-sm text-center hover:bg-white/15 transition-colors"
          >
            Retour au feed
          </Link>
        </div>
      </div>
    </div>
  );
}
