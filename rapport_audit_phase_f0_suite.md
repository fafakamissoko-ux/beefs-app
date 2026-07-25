# Rapport d'audit — Phase F.0 suite (WebRTC + Recherche régie + Raise Hand)

**Date d'extraction :** 2026-07-20  
**Commit de référence :** `b9e99a5 fix(arena): listen to INSERT on spectator invite sync channel (Phase E.2)`  
**Contrainte :** Zéro modification du code source.

---

## Synthèse diagnostic Phase F.0 suite

### A. Moteur WebRTC (`useDailyCall.ts`)

| Fait | Détail |
|------|--------|
| Taille | **128 lignes** — **façade uniquement** |
| Moteur réel | `hooks/useDailyMeetingEngine.ts` (non extrait ici) |
| `viewerMode` | Passé L.77 → engine L.106+ |
| `subscribeToTracksAutomatically` | **Absent de useDailyCall** — présent dans engine L.260, L.461 |
| `track-started` | **Absent de useDailyCall** — handler engine L.165+ |

**Verdict spectateurs sans vidéo :** l'analyse `subscribeToTracksAutomatically` / `track-started` doit cibler **`useDailyMeetingEngine.ts`**. `useDailyCall` ne fait que mapper `engine.peersBySessionId` → `CallParticipant`.

---

### B. Recherche régie (`MediatorInviteInline.tsx`)

| Zone | Ligne | Comportement |
|------|-------|--------------|
| Pattern ilike | L.84 | `` `%${escapeIlikePattern(q)}%` `` sur `username` + `display_name` |
| Vue | L.89–97 | `user_public_profile` (double requête parallèle) |
| Exclusion | L.113–117 | `excludeParticipantIds` + `currentUserId` filtrés post-merge |
| Debounce | L.60–63 | 160 ms ; anti-race `requestSeq` |

**Câblage exclusion (TikTokStyleArena — référence) :**

```typescript
inviteExcludeParticipantIds = [...debaters.map(d => d.id), userId]
```

| Bug expulsés | Cause probable |
|--------------|----------------|
| Utilisateur expulsé invisible | ID encore dans `debaters` state local **ou** ligne `beef_participants` non purgée mais exclue ailleurs |
| Recherche vide intermittente | RLS / vue `user_public_profile` ; erreur → phase `error` L.103 |

---

### C. Raise Hand vs Convocation Ref (`raise-hand/route.ts`)

**Insert raise-hand (spectateur initiateur) :**

```json
{
  "beef_id": "...",
  "user_id": "<self>",
  "role": "participant",
  "is_main": false,
  "invite_status": "pending"
}
```

**Pas de** `beef_invitations` créée.

**INVITE_PARTICIPANT (Ref — manage/route.ts L.229–254) :** même upsert `beef_participants` **+** insert `beef_invitations` (`inviter_id` = Ref).

| Type | `beef_participants` | `beef_invitations` | Distinction UI régie |
|------|---------------------|--------------------|--------------------|
| Raise hand | pending, is_main false | **absent** | JOIN ou flag `invited_by` manquant |
| Convocation Ref | pending, is_main false | **présent** (status sent) | Filtrer via `beef_invitations` |

**Verdict régie :** `fetchPendingInvites` (TikTokStyleArena L.583–609) liste **tous** les `pending` sans JOIN — impossible de différencier demande spectateur vs convocation Ref.

---

## 1. Code source intégral — `hooks/useDailyCall.ts`

```ts
'use client';

import { useMemo } from 'react';
import { useDailyMeetingEngine, type MeetingConnectionStatus, type WebRtcNetworkQuality } from '@/hooks/useDailyMeetingEngine';
import type { PhysicalPeer } from '@/lib/participant-identity';

export interface CallParticipant {
  sessionId: string;
  userName: string;
  arenaUserId: string | null;
  isLocal: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  videoOn: boolean;
  audioOn: boolean;
}

export type { WebRtcNetworkQuality } from '@/hooks/useDailyMeetingEngine';

export interface UseDailyCallReturn {
  join: (preAcquiredStream?: MediaStream | null, opts?: { camEnabled?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  stopCamera: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  setLocalAudioEnabled: (enabled: boolean) => void;
  setRemoteParticipantAudio: (sessionId: string, enabled: boolean) => void;
  hardMuteParticipant: (sessionId: string, muted: boolean) => void;
  ejectRemoteParticipant: (sessionId: string) => Promise<boolean>;
  isJoined: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  /** Paires Daily triées (réconciliation identité). */
  physicalPeers: PhysicalPeer[];
  connectionStatus: MeetingConnectionStatus;
  localParticipant: CallParticipant | null;
  remoteParticipants: CallParticipant[];
  activeSpeakerPeerId: string | null;
  error: string | null;
  isCameraInterrupted: boolean;
  recoverMediaDevices: () => Promise<void>;
  networkQuality: WebRtcNetworkQuality;
  flipCamera: () => Promise<void>;
}

/** Mappe un {@link PhysicalPeer} vers le format affichage arène (pistes Daily). */
export function physicalPeerToCallParticipant(p: PhysicalPeer): CallParticipant {
  const vBlocked = p.videoTrackState === 'off' || p.videoTrackState === 'blocked';
  const aBlocked = p.audioTrackState === 'off' || p.audioTrackState === 'blocked';
  return {
    sessionId: p.sessionId,
    userName: p.displayName,
    arenaUserId: p.arenaUserId,
    isLocal: p.isLocal,
    videoTrack: p.videoTrack,
    audioTrack: p.audioTrack,
    videoOn: !!p.videoTrack && !vBlocked,
    audioOn: !!p.audioTrack && !aBlocked,
  };
}

/**
 * Façade arène : mappe le moteur {@link useDailyMeetingEngine} vers l’ancien `CallParticipant`.
 * Aucun fetch réseau — jeton fourni par la Phase 1 uniquement.
 */
export function useDailyCall(
  roomUrl: string | null,
  userName: string,
  viewerMode = false,
  arenaUserId: string | null = null,
  accessMeetingToken: string | null | undefined = undefined,
): UseDailyCallReturn {
  const engine = useDailyMeetingEngine({
    roomUrl,
    userName,
    viewerMode,
    arenaUserId,
    meetingToken: accessMeetingToken,
  });

  const physicalPeers = useMemo(() => {
    const list = Object.values(engine.peersBySessionId);
    return list.slice().sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  }, [engine.peersBySessionId]);

  const localParticipant = useMemo(() => {
    const lp = Object.values(engine.peersBySessionId).find((x) => x.isLocal);
    return lp ? physicalPeerToCallParticipant(lp) : null;
  }, [engine.peersBySessionId]);

  const remoteParticipants = useMemo(
    () =>
      Object.values(engine.peersBySessionId)
        .filter((x) => !x.isLocal)
        .map(physicalPeerToCallParticipant),
    [engine.peersBySessionId],
  );

  const isJoined = engine.status === 'joined';
  const isJoining = engine.status === 'joining';

  return {
    join: engine.join,
    leave: engine.leave,
    stopCamera: engine.stopCamera,
    toggleMic: engine.toggleMic,
    toggleCam: engine.toggleCam,
    setLocalAudioEnabled: engine.setLocalAudioEnabled,
    setRemoteParticipantAudio: engine.setRemoteParticipantAudio,
    hardMuteParticipant: engine.hardMuteParticipant,
    ejectRemoteParticipant: engine.ejectRemoteParticipant,
    isJoined,
    isJoining,
    micEnabled: engine.micEnabled,
    camEnabled: engine.camEnabled,
    physicalPeers,
    connectionStatus: engine.status,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId: engine.activeSpeakerPeerId,
    error: engine.error,
    isCameraInterrupted: engine.isCameraInterrupted,
    recoverMediaDevices: engine.recoverMediaDevices,
    networkQuality: engine.networkQuality,
    flipCamera: engine.flipCamera,
  };
}

```

---

## 2. Code source intégral — `components/MediatorInviteInline.tsx` (Recherche régie)

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Search, UserPlus, Check, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';

export type MediatorInviteSearchUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function escapeIlikePattern(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/^@+/u, '');
}

function mergeUserRows(
  a: MediatorInviteSearchUser[],
  b: MediatorInviteSearchUser[],
): MediatorInviteSearchUser[] {
  const seen = new Set<string>();
  const out: MediatorInviteSearchUser[] = [];
  for (const row of [...a, ...b]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= 25) break;
  }
  return out;
}

type MediatorInviteInlineProps = {
  excludeParticipantIds: string[];
  currentUserId: string | null | undefined;
  onInvite: (userId: string) => void | Promise<void>;
};

type SearchPhase = 'idle' | 'debouncing' | 'loading' | 'results' | 'empty' | 'error';

export function MediatorInviteInline({
  excludeParticipantIds,
  currentUserId,
  onInvite,
}: MediatorInviteInlineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [results, setResults] = useState<MediatorInviteSearchUser[]>([]);
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 160);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const normalizedTyping = normalizeSearchQuery(searchQuery);
  const normalizedDebounced = normalizeSearchQuery(debouncedQuery);
  const isDebouncing =
    normalizedTyping.length > 0 && normalizedTyping !== normalizedDebounced;

  const runSearch = useCallback(async () => {
    const q = normalizeSearchQuery(debouncedQuery);
    if (!q) {
      requestSeq.current += 1;
      setResults([]);
      setPhase('idle');
      setErrorMessage(null);
      return;
    }

    const seq = ++requestSeq.current;
    setPhase('loading');
    setErrorMessage(null);

    const pattern = `%${escapeIlikePattern(q)}%`;

    try {
      const [byUsername, byDisplayName] = await Promise.all([
        supabase
          .from('user_public_profile')
          .select('id, username, display_name, avatar_url')
          .ilike('username', pattern)
          .limit(20),
        supabase
          .from('user_public_profile')
          .select('id, username, display_name, avatar_url')
          .ilike('display_name', pattern)
          .limit(20),
      ]);

      if (seq !== requestSeq.current) return;

      const err = byUsername.error || byDisplayName.error;
      if (err) {
        console.warn('[MediatorInvite] search users indisponible');
        setResults([]);
        setPhase('error');
        setErrorMessage(
          'Les suggestions ne sont pas disponibles pour le moment. Vérifie ta connexion et réessaie.',
        );
        return;
      }

      const ex = new Set(excludeParticipantIds.filter(Boolean));
      const merged = mergeUserRows(
        (byUsername.data ?? []) as MediatorInviteSearchUser[],
        (byDisplayName.data ?? []) as MediatorInviteSearchUser[],
      ).filter((u) => !ex.has(u.id) && u.id !== currentUserId);

      setResults(merged);
      setPhase(merged.length > 0 ? 'results' : 'empty');
    } catch {
      if (seq !== requestSeq.current) return;
      console.warn('[MediatorInvite] search exception');
      setResults([]);
      setPhase('error');
      setErrorMessage('Erreur lors de la recherche. Réessaie dans un instant.');
    }
  }, [debouncedQuery, excludeParticipantIds, currentUserId]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const handleInvite = async (uid: string) => {
    if (invitedUsers.includes(uid)) return;
    setInvitedUsers((prev) => [...prev, uid]);
    await onInvite(uid);
    setTimeout(() => {
      setInvitedUsers((prev) => prev.filter((x) => x !== uid));
      setSearchQuery('');
      setDebouncedQuery('');
      setResults([]);
      setPhase('idle');
      setErrorMessage(null);
    }, 900);
  };

  const feedbackLine = (() => {
    if (!normalizedTyping) {
      return 'Commence à taper un @pseudo ou un nom : les suggestions apparaissent ici.';
    }
    if (isDebouncing) {
      return 'Recherche des profils…';
    }
    if (phase === 'loading') {
      return 'Chargement des suggestions…';
    }
    if (phase === 'error' && errorMessage) {
      return errorMessage;
    }
    if (phase === 'empty') {
      return `Aucun profil pour « ${normalizedDebounced} ». Essaie un autre pseudo ou nom.`;
    }
    if (phase === 'results') {
      return `${results.length} suggestion${results.length > 1 ? 's' : ''} — touche une ligne pour inviter.`;
    }
    return null;
  })();

  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <p className="font-mono text-[9px] leading-relaxed text-white/50">
        Invite un co-hôte : pseudo (@optionnel) ou nom affiché.
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="@pseudo ou nom…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-white/12 bg-black/40 py-2.5 pl-9 pr-3 font-mono text-[11px] text-white placeholder-white/30 focus:border-cobalt-500/50 focus:outline-none"
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 font-mono text-[10px] leading-snug text-white/55"
      >
        {(isDebouncing || phase === 'loading') && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cobalt-400" aria-hidden />
        )}
        {phase === 'error' && (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
        )}
        <span className="min-w-0 flex-1">{feedbackLine}</span>
      </div>

      <div className="space-y-1.5 pr-0.5">
        {normalizedTyping.length > 0 &&
          !isDebouncing &&
          phase !== 'loading' &&
          phase === 'results' &&
          results.map((u) => {
            const isInvited = invitedUsers.includes(u.id);
            const label = u.display_name?.trim() || u.username;
            return (
              <motion.button
                key={u.id}
                type="button"
                disabled={isInvited}
                onClick={() => void handleInvite(u.id)}
                whileTap={!isInvited ? { scale: 0.98 } : {}}
                className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                  isInvited
                    ? 'cursor-not-allowed border-emerald-500/35 bg-emerald-500/10'
                    : 'border-white/10 bg-white/[0.04] hover:border-cobalt-500/40 hover:bg-cobalt-500/10'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-pink-600 font-mono text-xs font-bold text-white">
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-[11px] font-bold leading-tight text-white">
                      {label}
                    </p>
                    <p className="break-all font-mono text-[9px] leading-tight text-cobalt-200/80">
                      @{u.username}
                    </p>
                  </div>
                </div>
                {isInvited ? (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                    <Check className="h-4 w-4" strokeWidth={2} />
                    Envoyé
                  </span>
                ) : (
                  <UserPlus className="h-4 w-4 shrink-0 text-cobalt-300" strokeWidth={1.5} />
                )}
              </motion.button>
            );
          })}
      </div>
    </div>
  );
}

```

---

## 3. Code source intégral — `app/api/beef/raise-hand/route.ts` (Backend Raise Hand)

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

/**
 * Spectateur : demande à rejoindre le ring (beef_participants.pending).
 * Contournement RLS via service role — la policy INSERT client est réservée au médiateur.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = (await request.json()) as { beefId?: string };
    const beefId = body.beefId ? normalizeBeefId(body.beefId) : null;
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beefId)
      .single();

    if (beefErr?.code === 'PGRST116' || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }
    if (beef.status !== 'live') {
      return NextResponse.json({ error: 'Le beef n’est pas en direct' }, { status: 400 });
    }
    if (beef.mediator_id === user.id) {
      return NextResponse.json({ error: 'Le médiateur n’a pas besoin de lever la main' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('beef_participants')
      .select('invite_status')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.invite_status === 'accepted') {
      return NextResponse.json({ error: 'Tu participes déjà à ce beef' }, { status: 400 });
    }

    const { error: upsertErr } = await supabaseAdmin.from('beef_participants').upsert(
      {
        beef_id: beefId,
        user_id: user.id,
        role: 'participant',
        is_main: false,
        invite_status: 'pending',
      },
      { onConflict: 'beef_id,user_id' },
    );

    if (upsertErr) {
      console.error('[raise-hand] upsert', upsertErr);
      return NextResponse.json({ error: 'Impossible d’enregistrer la demande' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[raise-hand]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

```
