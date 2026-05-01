'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, UserPlus } from 'lucide-react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';

/** Code SQLSTATE / texte PostgREST incluant P0001 (`raise_exception`). */
function isP0001PostgresError(err: PostgrestError | null): boolean {
  if (!err) return false;
  const blob = `${err.code ?? ''}|${err.message ?? ''}|${err.details ?? ''}|${err.hint ?? ''}`;
  return blob.includes('P0001');
}

function isP0001OrProfileReservedError(err: PostgrestError | null): boolean {
  if (!err) return false;
  if (isP0001PostgresError(err)) return true;
  const blob = `${err.message ?? ''}|${err.details ?? ''}`;
  return /réservée au compte connecté|Mise à jour de profil réservée/i.test(blob);
}

function followErrorUserMessage(err: PostgrestError | null): string {
  if (!err?.message) return 'Erreur lors du suivi';
  return err.message;
}

export type FollowButtonSuccessPayload = {
  following: boolean;
  /** Prestige destinataire — valeur optimiste (+10 / −10) */
  recipientLifetimePoints: number | null;
  /** Abonnés du profil suivi — valeur optimiste (+1 / −1) */
  recipientFollowersCount: number | null;
};

type FollowButtonProps = {
  /** Utilisateur dont on ouvre la fiche (= destinataire du +10 / −10 prestige) */
  followingId: string;
  /** Suivi au chargement (vérité précédente) */
  initialFollowing: boolean;
  /** Compteur abonnés affiché (profil suivi) — base du calcul optimiste */
  currentFollowersCount?: number;
  /** Prestige lifetime affiché (profil suivi) — base du calcul optimiste */
  currentLifetimePoints?: number;
  disabled?: boolean;
  classNameWhenFollowing?: string;
  classNameWhenNotFollowing?: string;
  showLabels?: boolean;
  labels?: {
    follow: string;
    unfollow: string;
  };
  /** Appelé après mutation suivie/non suivie avec valeurs dérivées en local (+10 Aura, ±1 abonné) */
  onSynced?: (payload: FollowButtonSuccessPayload) => void;
  /** Erreur RLS ou réseau */
  onError?: (message: string) => void;
  /** Chemin après login, ex. pathname courant */
  loginRedirectPath?: string;
  loginPath?: string;
};

/**
 * Suivi / désabonnement via la table `followers`.
 * Les +10 / −10 prestige sont appliqués côté PG ; l’UI se met à jour tout de suite par calcul optimiste.
 */
export function FollowButton({
  followingId,
  initialFollowing,
  currentFollowersCount,
  currentLifetimePoints,
  disabled = false,
  classNameWhenFollowing = 'flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-white/10 text-white hover:bg-white/20',
  classNameWhenNotFollowing =
    'flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-[#00F0FF] text-black shadow-[0_0_18px_rgba(0,240,255,0.45)] hover:brightness-110 active:scale-[0.98]',
  showLabels = true,
  labels = { follow: 'Suivre', unfollow: 'Ne plus suivre' },
  onSynced,
  onError,
  loginRedirectPath,
  loginPath = '/login',
}: FollowButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing, followingId]);

  const handleClick = async () => {
    if (!user) {
      const path =
        loginRedirectPath ??
        (typeof window !== 'undefined' ? window.location.pathname : '/feed');
      router.push(`${loginPath}?redirect=${encodeURIComponent(path)}`);
      return;
    }
    if (user.id === followingId) return;
    if (busy || disabled) return;

    setBusy(true);
    const willUnfollow = following;

    try {
      const mutateFollow = async (): Promise<{ error: PostgrestError | null }> => {
        if (willUnfollow) {
          return supabase
            .from('followers')
            .delete()
            .eq('follower_id', user.id)
            .eq('following_id', followingId);
        }
        return supabase.from('followers').insert({
          follower_id: user.id,
          following_id: followingId,
        });
      };

      let { error } = await mutateFollow();
      if (error && isP0001OrProfileReservedError(error)) {
        ({ error } = await mutateFollow());
      }

      const emitOptimistic = (nextFollowing: boolean) => {
        setFollowing(nextFollowing);
        const newFollowers =
          currentFollowersCount != null
            ? currentFollowersCount + (nextFollowing ? 1 : -1)
            : null;
        const newPoints =
          currentLifetimePoints != null
            ? currentLifetimePoints + (nextFollowing ? 10 : -10)
            : null;
        onSynced?.({
          following: nextFollowing,
          recipientLifetimePoints: newPoints,
          recipientFollowersCount: newFollowers,
        });
      };

      if (error) {
        if (isP0001PostgresError(error) && !willUnfollow) {
          toast('Erreur de synchronisation du prestige. Réessaie dans 5 secondes.', 'error', {
            durationMs: 6500,
          });
          emitOptimistic(true);
          return;
        }
        if (isP0001PostgresError(error)) {
          toast('Erreur de synchronisation du prestige. Réessaie dans 5 secondes.', 'error', {
            durationMs: 6500,
          });
        } else {
          onError?.(followErrorUserMessage(error));
        }
        return;
      }

      emitOptimistic(!willUnfollow);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors du suivi';
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };

  const isSelfProfile = !!(user && user.id === followingId);

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy || isSelfProfile}
      className={following ? classNameWhenFollowing : classNameWhenNotFollowing}
    >
      {following ? (
        <>
          <UserMinus className="h-4 w-4 shrink-0" aria-hidden />
          {showLabels ? <span className="hidden sm:inline">{labels.unfollow}</span> : null}
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden />
          {showLabels ? <span className="hidden sm:inline">{labels.follow}</span> : null}
        </>
      )}
    </button>
  );
}
