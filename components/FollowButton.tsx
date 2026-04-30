'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type FollowButtonSuccessPayload = {
  /** État suivre après succès PG (ligne followers) */
  following: boolean;
  /** Prestige destinataire — lu sur `user_public_profile` après le trigger +10 / −10 */
  recipientLifetimePoints: number | null;
  /** Nombre d’abonnés du profil suivi — recalculé côté serveur */
  recipientFollowersCount: number | null;
};

type FollowButtonProps = {
  /** Utilisateur dont on ouvre la fiche (= destinataire du +10 / −10 prestige) */
  followingId: string;
  /** Suivi au chargement (vérité précédente) */
  initialFollowing: boolean;
  disabled?: boolean;
  classNameWhenFollowing?: string;
  classNameWhenNotFollowing?: string;
  showLabels?: boolean;
  labels?: {
    follow: string;
    unfollow: string;
  };
  /** Appelé uniquement après insert/delete réussi + refetch serveur du prestige et des abonnés */
  onSynced?: (payload: FollowButtonSuccessPayload) => void;
  /** Erreur RLS ou réseau */
  onError?: (message: string) => void;
  /** Chemin après login, ex. pathname courant */
  loginRedirectPath?: string;
  loginPath?: string;
};

/**
 * Suivi / désabonnement via la table `followers`.
 * Le prestige (+10 / −10 sur `lifetime_points` du destinataire) est appliqué par le trigger PG
 * (`follow_adjust_recipient_lifetime`). Après chaque mutation, on relit la vue `user_public_profile`
 * pour afficher exactement ce qu’a écrit la base — pas une simple simulation client.
 */
export function FollowButton({
  followingId,
  initialFollowing,
  disabled = false,
  classNameWhenFollowing = 'flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-white/10 text-white hover:bg-white/20',
  classNameWhenNotFollowing = 'flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all brand-gradient text-black transition-opacity hover:opacity-90',
  showLabels = true,
  labels = { follow: 'Suivre', unfollow: 'Ne plus suivre' },
  onSynced,
  onError,
  loginRedirectPath,
  loginPath = '/login',
}: FollowButtonProps) {
  const router = useRouter();
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
      if (willUnfollow) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', followingId);
        if (error) {
          onError?.(error.message);
          return;
        }
        setFollowing(false);
      } else {
        const { error } = await supabase.from('followers').insert({
          follower_id: user.id,
          following_id: followingId,
        });
        if (error) {
          onError?.(error.message);
          return;
        }
        setFollowing(true);
      }

      const nextFollowing = !willUnfollow;

      await new Promise<void>((r) => setTimeout(r, 200));

      const [{ data: auraRow, error: auraErr }, followerCountRes] = await Promise.all([
        supabase.from('user_public_profile').select('lifetime_points').eq('id', followingId).maybeSingle(),
        supabase
          .from('followers')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', followingId),
      ]);

      if (auraErr) {
        console.warn('[FollowButton] refetch prestige', auraErr);
      }
      const lp =
        auraRow && typeof auraRow === 'object' && 'lifetime_points' in auraRow && auraRow.lifetime_points != null
          ? Number(auraRow.lifetime_points as number)
          : null;

      const recipientFollowersCount =
        followerCountRes.error ? null : (followerCountRes.count ?? null);

      onSynced?.({
        following: nextFollowing,
        recipientLifetimePoints: lp,
        recipientFollowersCount,
      });
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
