# Rapport d'audit source — Fetching secondaire (Phase B.2 suite)

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** préparer la migration `@tanstack/react-query` de `FollowListModal`, `AuraGiversModal`, et `app/points/page.tsx`

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/FollowListModal.tsx` | 270 | Modal abonnés / abonnements |
| `components/AuraGiversModal.tsx` | 221 | Modal donateurs Aura / spectateurs |
| `app/points/page.tsx` | 169 | Dashboard Lingots (solde + historique) |

---

## Synthèse — FollowListModal

### Cascade de chargement

| Étape | Déclencheur | Appel | Notes |
|-------|-------------|-------|-------|
| 1 | Montage modal (`useEffect` → `loadList`) | `followers.select('follower_id' \| 'following_id')` | Selon `type` |
| 2 | IDs extraits | `fetchUserPublicByIds(supabase, ids, 'id, username, display_name, avatar_url')` | Batch via vue `user_public_profile` |
| 3 | 2e `useEffect` si `user` + `rows` | `followers.select('following_id').eq('follower_id', user.id).in('following_id', ids)` | État « je suis déjà abonné à X » |

### Mutations (hors fetch)

- `handleToggleFollow` : `followers.delete` ou `followers.insert` — mise à jour locale `followingIds` (Set), **pas de re-fetch liste**

### Candidats query keys

| Clé | Contenu |
|-----|---------|
| `['followers-list', userId]` | Liste abonnés (IDs + profils publics) |
| `['following-list', userId]` | Liste abonnements |
| `['my-following-ids', viewerId, targetIdsHash]` | Sous-ensemble follow state pour la modal |

### Invalidation croisée

- Follow/unfollow dans modal → invalider `['public-profile', username]` (compteurs followers)
- Aligner avec `FollowButton` / profil public déjà migré en B2

---

## Synthèse — AuraGiversModal

### Déclencheur

`useEffect` quand `isOpen === true` (deps : `isOpen`, `targetId`, `type`, `ownerId`).

### Branches RPC

| Condition | RPC | Paramètres |
|-----------|-----|------------|
| `type === 'views'` | `get_beef_viewers` | `p_beef_id: targetId`, `p_owner_id: ownerId` |
| Sinon (profile, beef, teaser, avatar, banner) | `get_universal_aura_givers` | `p_target_id: targetId`, `p_type: type`, `p_owner_id: ownerId` |

### Prérequis session

- `supabase.auth.getSession()` — si **pas de session** → `givers = []`, UI cadenas « Rejoindre l'Agora »
- Pas de fetch pour visiteurs anonymes (liste vide volontaire)

### Type retour RPC

**`get_universal_aura_givers`** → `AuraGiver[]` :
```typescript
{ giver_id, display_name, username, avatar_url, created_at }
```

**`get_beef_viewers`** → mappé vers même shape :
```typescript
{ viewer_id → giver_id, viewed_at → created_at, ... }
```

### Limite affichage

- Si `currentUser !== ownerId && givers.length === 7` → message « Seul le propriétaire peut voir la liste complète » (RPC tronque côté serveur pour non-propriétaires)

### Candidat query key

```typescript
['aura-givers', targetId, type, ownerId]
enabled: isOpen && !!session
staleTime: 30_000 // modal ré-ouverte
```

---

## Synthèse — app/points/page.tsx

### Fetch actuel

Single `useEffect` avec `Promise.all` :

| Requête | Table | Select | Limite |
|---------|-------|--------|--------|
| Solde | `users` | `points` | `.single()` |
| Historique | `transactions` | `id, type, amount, balance_after, description, metadata, created_at` | **80** |

### Duplication avec settings

`app/settings/page.tsx` (L177–191) charge aussi `transactions` :
- Même table, même `user_id`
- Select partiel (sans `metadata`)
- Limite **50** vs **80** sur `/points`

→ Candidat unification :

```typescript
queryKey: ['transactions', userId]
queryFn: () => Promise.all([users.points, transactions...])
// Sélecteurs dérivés : balance = data.balance, list = data.transactions
```

Invalidation après : achat Lingots, gift, retrait, accès beef.

---

# SOURCE — `components/FollowListModal.tsx`

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

type ListType = 'followers' | 'following';

interface ListedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FollowListModalProps {
  userId: string;
  type: ListType;
  onClose: () => void;
}

export function FollowListModal({ userId, type, onClose }: FollowListModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);

  const title = type === 'followers' ? 'Abonnés' : 'Abonnements';

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('followers')
          .select('follower_id')
          .eq('following_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const followerIds = (data || []).map((r: { follower_id: string }) => r.follower_id).filter(Boolean);
        const pubMap = await fetchUserPublicByIds(supabase, followerIds, 'id, username, display_name, avatar_url');
        const list: ListedUser[] = followerIds.map((id) => {
          const u = pubMap.get(id);
          return {
            id,
            username: u?.username ?? 'user',
            display_name: displayNameFromPublicRow(u, u?.username ?? 'Utilisateur'),
            avatar_url: u?.avatar_url ?? null,
          };
        });
        setRows(list);
      } else {
        const { data, error } = await supabase
          .from('followers')
          .select('following_id')
          .eq('follower_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const followingIdsList = (data || []).map((r: { following_id: string }) => r.following_id).filter(Boolean);
        const pubMap = await fetchUserPublicByIds(supabase, followingIdsList, 'id, username, display_name, avatar_url');
        const list: ListedUser[] = followingIdsList.map((id) => {
          const u = pubMap.get(id);
          return {
            id,
            username: u?.username ?? 'user',
            display_name: displayNameFromPublicRow(u, u?.username ?? 'Utilisateur'),
            avatar_url: u?.avatar_url ?? null,
          };
        });
        setRows(list);
      }
    } catch {
      console.error('FollowListModal load error');
      toast('Impossible de charger la liste', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, type, toast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!user || rows.length === 0) {
      setFollowingIds(new Set());
      return;
    }
    const ids = rows.map((r) => r.id).filter((id) => id !== user.id);
    if (ids.length === 0) {
      setFollowingIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', ids);
      if (!cancelled) {
        setFollowingIds(new Set((data || []).map((d) => d.following_id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, rows]);

  const handleToggleFollow = async (targetId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push('/login');
      return;
    }
    setActionId(targetId);
    try {
      if (followingIds.has(targetId)) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId);
        if (error) throw error;
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        toast('Vous ne suivez plus cet utilisateur', 'success');
      } else {
        const { error } = await supabase.from('followers').insert({
          follower_id: user.id,
          following_id: targetId,
        });
        if (error) throw error;
        setFollowingIds((prev) => new Set(prev).add(targetId));
        toast('Vous suivez cet utilisateur', 'success');
      }
    } catch {
      console.error('FollowListModal follow action error');
      toast('Erreur lors de l\'action', 'error');
    } finally {
      setActionId(null);
    }
  };

  const goToProfile = (uname: string) => {
    onClose();
    router.push(`/profile/${uname}`);
  };

  return (
    <AnimatePresence>
      <motion.div
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
      >
        <div
          className="absolute inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm"
          aria-hidden
          onClick={onClose}
        />
        <motion.div
          role="dialog"
          aria-labelledby="follow-list-title"
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="relative z-modal card w-full max-w-md max-h-[min(70vh,520px)] flex flex-col bg-black border border-white/10 rounded-[2rem] shadow-modal overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 id="follow-list-title" className="text-lg font-black text-white">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-12">Aucun compte pour le moment.</p>
            ) : (
              rows.map((u, index) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, type: 'spring', stiffness: 400, damping: 28 }}
                  className="card flex items-center gap-3 p-3 rounded-[2rem] bg-black border border-white/10 hover:border-white/15 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => goToProfile(u.username)}
                    className="flex flex-1 items-center gap-3 min-w-0 text-left"
                  >
                    <div className="relative w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 overflow-hidden">
                      {u.avatar_url ? (
                        <Image src={u.avatar_url} alt="" fill className="object-cover" sizes="44px" />
                      ) : (
                        (u.display_name || u.username)[0]?.toUpperCase() || '?'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold text-sm truncate">{u.display_name}</p>
                      <p className="text-gray-500 text-xs truncate">@{u.username}</p>
                    </div>
                  </button>
                  {user && user.id !== u.id && (
                    <button
                      type="button"
                      disabled={actionId === u.id}
                      onClick={(e) => handleToggleFollow(u.id, e)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        followingIds.has(u.id)
                          ? 'bg-white/10 hover:bg-white/15 text-white'
                          : 'brand-gradient text-black hover:opacity-90'
                      } ${actionId === u.id ? 'opacity-60' : ''}`}
                    >
                      {followingIds.has(u.id) ? (
                        <>
                          <UserMinus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Ne plus suivre</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Suivre</span>
                        </>
                      )}
                    </button>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

---

# SOURCE — `components/AuraGiversModal.tsx`

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface AuraGiver {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

interface BeefViewerRow {
  viewer_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  viewed_at: string;
}

interface AuraGiversModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  type: 'profile' | 'beef' | 'teaser' | 'avatar' | 'banner' | 'views';
  ownerId: string;
}

export const AuraGiversModal: React.FC<AuraGiversModalProps> = ({
  isOpen,
  onClose,
  targetId,
  type,
  ownerId,
}) => {
  const router = useRouter();
  const [givers, setGivers] = useState<AuraGiver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      setCurrentUser(session?.user?.id || null);

      if (session?.user?.id) {
        if (type === 'views') {
          const { data } = await supabase.rpc('get_beef_viewers', {
            p_beef_id: targetId,
            p_owner_id: ownerId,
          });
          if (!cancelled) {
            const rows = (data as BeefViewerRow[] | null) || [];
            const mappedData: AuraGiver[] = rows.map((v) => ({
              giver_id: v.viewer_id,
              display_name: v.display_name,
              username: v.username,
              avatar_url: v.avatar_url,
              created_at: v.viewed_at,
            }));
            setGivers(mappedData);
          }
        } else {
          const { data } = await supabase.rpc('get_universal_aura_givers', {
            p_target_id: targetId,
            p_type: type,
            p_owner_id: ownerId,
          });
          if (!cancelled) {
            setGivers((data as AuraGiver[] | null) || []);
          }
        }
      } else {
        setGivers([]);
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetId, type, ownerId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aura-givers-title"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
        <div className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-xl text-prestige-gold" aria-hidden>
              ✦
            </span>
            <h3 id="aura-givers-title" className="text-base font-black uppercase tracking-wider text-white">
              {type === 'views' ? 'CITOYENS' : 'AURA'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              <p className="text-sm font-bold text-cyan-400">Déchiffrement de l&apos;Aura...</p>
            </div>
          ) : !currentUser ? (
            /* ÉTAT ANONYME (CADENAS SPATIAL OS) */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                <Lock className="h-8 w-8 text-white/40" strokeWidth={1.5} />
              </div>
              <h4 className="mb-2 text-lg font-black text-white">L&apos;élite de l&apos;Agora</h4>
              <p className="mb-8 text-sm text-gray-400">
                Rejoignez la plateforme pour voir l&apos;identité des donateurs.
              </p>
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="w-full max-w-[200px] rounded-xl bg-white py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95"
              >
                Rejoindre l&apos;Agora
              </button>
            </div>
          ) : givers.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              {type === 'views' ? 'Aucun spectateur enregistré.' : "Personne n'a encore envoyé d'Aura."}
            </p>
          ) : (
            <>
              {givers.map((giver) => (
                <div
                  key={giver.giver_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {giver.avatar_url ? (
                      <img
                        src={giver.avatar_url}
                        alt=""
                        className="h-10 w-10 flex-shrink-0 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/20 to-slate-800 text-xs font-bold uppercase text-cyan-400">
                        {giver.display_name?.[0] || giver.username?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold text-white">{giver.display_name}</span>
                      <span className="truncate text-xs text-cyan-400">@{giver.username}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="flex-shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-white hover:text-black active:scale-95"
                  >
                    Suivre
                  </button>
                </div>
              ))}
              {currentUser !== ownerId && givers.length === 7 && (
                <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Seul le propriétaire peut voir la liste complète.
                </p>
              )}
            </>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
```

---

# SOURCE — `app/points/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Coins, History, ShoppingBag, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackButton } from '@/components/AppBackButton';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';

type TxRow = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Achat',
  gift_sent: 'Cadeau envoyé',
  gift_received: 'Cadeau reçu',
  beef_access: 'Accès direct',
  beef_access_revenue: 'Revenu accès',
  withdrawal_hold: 'Retrait (bloqué)',
  refund: 'Remboursement',
  reward: 'Récompense',
};

export default function PointsDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/points');
      return;
    }

    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: tx, error }] = await Promise.all([
        supabase.from('users').select('points').eq('id', user.id).single(),
        supabase
          .from('transactions')
          .select('id, type, amount, balance_after, description, metadata, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);
      if (cancelled) return;
      if (u) setBalance(u.points ?? 0);
      if (!error && tx) setTransactions(tx as TxRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="page-ambient-gradient" aria-hidden />
      <div className="relative z-[1] max-w-lg mx-auto px-4 py-8">
        <AppBackButton className="mb-6" />

        <main aria-labelledby="points-page-title">
        <h1 id="points-page-title" className="sr-only">
          Mes Lingots
        </h1>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center" aria-hidden>
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Solde actuel</p>
              <p className="text-3xl font-black text-white tabular-nums" aria-live="polite">
                {loading ? '…' : (balance ?? 0).toLocaleString('fr-FR')}
                <span className="text-lg font-bold text-gray-400 ml-1">Lingots</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openBuyPointsPage(router, pathname)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white brand-gradient hover:opacity-95 transition-opacity"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden />
            Recharger mes Lingots
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </motion.div>

        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-brand-400" aria-hidden />
          <h2 className="text-lg font-bold text-white">Historique</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          Achats, cadeaux, accès aux directs et autres mouvements de Lingots.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center border border-white/[0.06] rounded-xl">
            Aucune transaction pour l’instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm"
              >
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {TYPE_LABEL[t.type] || t.type}
                    </p>
                    {t.description && (
                      <p className="text-gray-500 text-xs truncate">{t.description}</p>
                    )}
                    <p className="text-gray-600 text-[10px] mt-1">
                      {new Date(t.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <span
                    className={`font-bold tabular-nums flex-shrink-0 ${
                      t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {t.amount >= 0 ? '+' : ''}
                    {t.amount.toLocaleString('fr-FR')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        </main>
      </div>
    </div>
  );
}
```

---

## Plan de migration recommandé (Phase B.2 fin)

| Priorité | Cible | Query key | Mutation |
|----------|-------|-----------|----------|
| P1 | `app/points/page.tsx` + settings wallet tab | `['wallet', userId]` ou `['transactions', userId]` | invalidate après achat/retrait |
| P2 | `FollowListModal.tsx` | `['followers-list', userId]` / `['following-list', userId]` | `useMutation` follow + invalidate profil |
| P3 | `AuraGiversModal.tsx` | `['aura-givers', targetId, type, ownerId]` | enabled: `isOpen` |

---

*Extraction terminée — aucune modification du code source applicatif.*
