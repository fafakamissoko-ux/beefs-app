# Rapport d'audit — Phase G.2

- **Date :** 2026-07-21
- **Commit ref :** `6fc365a`
- **Contrainte :** zéro modification du dépôt — lecture seule

---

## Synthèse architecturale

Deux anomalies distinctes sont documentées ci-dessous :

### A. Fuite Realtime — modale de convocation déclenchée à tort

Le correctif **G.0** a migré le **montage initial** (`useEffect` L.321–334) vers la table `beef_invitations` (`status === 'sent'`). **Le bypass persiste** via le canal Realtime `spectator_invite_sync_*` dans `hooks/useArenaRealtime.ts` : il écoute encore **`beef_participants`** et appelle `onSpectatorReceivedRefInvite()` dès que `invite_status` passe à `'pending'`.

**Chaîne de déclenchement complète :**

```
POST /api/beef/raise-hand
  └─ upsert beef_participants { invite_status: 'pending' }   ← sans beef_invitations
       └─ postgres_changes (event: '*') sur beef_participants
            └─ useArenaRealtime L.412-414
                 └─ onSpectatorReceivedRefInvite()
                      └─ TikTokStyleArena L.2924 → setRefInviteAlert(true)
                           └─ Modal « Le Ref te convoque »
```

**Note :** `components/TikTokStyleArena.tsx` ne contient **aucun** appel direct à `supabase.channel(...)`. Les abonnements Postgres Changes sont centralisés dans `hooks/useArenaRealtime.ts`, instancié par `TikTokStyleArena` via `useArenaRealtime(...)`.

### B. Badge « Absent » sur la grille en mode Spectateur

La chaîne littérale `"ABSENT"` en majuscules **n'existe pas** dans le dépôt. Le libellé affiché est **`Absent`** (capitalisation mixte) dans `components/Arena/shared/ArenaVideoSurface.tsx` L.138–141.

**Condition d'affichage :** `!tile.panel` — c'est-à-dire qu'aucun `CallParticipant` n'a été résolu pour ce slot challenger, même si `expectedUids` prévoit une tuile (participant accepté en DB).

**Chaîne de rendu :**

```
physicalPeers (useDailyCall / Daily WebRTC)
  └─ reconcilePeers (lib/participant-identity.ts)
       └─ challengerRemoteSlots[idx] = physicalPeerToCallParticipant(...)
            └─ useArenaLayoutTiles → tile.panel = challengerRemoteSlots[idx] ?? null
                 └─ ArenaVideoSurface : badge « Absent » si !tile.panel
```

En mode spectateur (`isViewer=true`), si les tracks distants ne sont pas souscrits ou si la réconciliation identité échoue (UUID / alias), `panel` reste `null` → badge « Absent » malgré des flux potentiellement présents dans `remoteParticipants`.

**Code mort détecté :** `leftChallengerAbsent` / `rightChallengerAbsent` (TikTokStyleArena L.2731–2743) sont **calculés mais jamais consommés** dans le JSX actuel.

---

## Cartographie fichiers

| Fichier | Rôle |
|---------|------|
| `hooks/useArenaRealtime.ts` | Canaux Supabase Realtime (`spectator_invite_sync_*`, `beef_participants_live_*`, `live_*`) |
| `components/TikTokStyleArena.tsx` | État `refInviteAlert`, callbacks realtime, montage initial invitations, rendu modale |
| `app/api/beef/raise-hand/route.ts` | Upsert `beef_participants.pending` — source du bypass |
| `components/Arena/useArenaLayoutTiles.ts` | Construction VM tuiles (`panel`, `hasActiveVideo`) |
| `components/Arena/shared/ArenaVideoSurface.tsx` | Rendu vidéo + badge « Absent » |
| `lib/participant-identity.ts` | `reconcilePeers` — mapping flux physique → slots |
| `hooks/useDailyCall.ts` | `physicalPeers`, `physicalPeerToCallParticipant`, `viewerMode` |

---

# 1. Extraction — Abonnements Realtime (faille bypass)

## 1.1 Câblage dans `components/TikTokStyleArena.tsx`

### État et montage initial (G.0 — déjà corrigé)

```typescript
  /** Spectateur promu co-hôte : le médiateur a accepté l'invitation (beef_participants). */
  const [acceptedInviteAlert, setAcceptedInviteAlert] = useState(false);
  /** Spectateur invité par le Ref en direct. */
  const [refInviteAlert, setRefInviteAlert] = useState(false);

  useEffect(() => {
    if (isViewer && userId) {
      void supabase
        .from('beef_invitations')
        .select('status')
        .eq('beef_id', roomId)
        .eq('invitee_id', userId)
        .eq('status', 'sent')
        .maybeSingle()
        .then(({ data }) => {
          if (data?.status === 'sent') setRefInviteAlert(true);
        });
    }
  }, [isViewer, userId, roomId]);
```

### Callbacks realtime → `setRefInviteAlert(true)`

```typescript
  const arenaRealtimeCallbacks = {
    getAuraBoost: () => 15,
    onReactionReceived: (emoji: string, supportSlot?: ArenaSupportSlotId, _source?: 'broadcast' | 'poll') => {
      addRemoteReaction(emoji, supportSlot ?? undefined);
    },
    // ... autres callbacks ...
    onLiveBroadcastSubscribed: () => {
      const b = auraBufferRef.current;
      if (!hasAnyAuraBatchDelta(b)) return;
      arenaOutboundRef.current.broadcastAuraBatch?.({ ...b });
      auraBufferRef.current = createZeroAuraBatch();
    },
    onSpectatorSelfInviteAccepted: () => setAcceptedInviteAlert(true),
    onSpectatorReceivedRefInvite: () => setRefInviteAlert(true),
    onBeefParticipantsTableChanged: () => {
      if (isHost) void fetchPendingInvites();
      void loadParticipants();
    },
  } satisfies ArenaRealtimeCallbacks;

  const arenaRealtime = useArenaRealtime(
    { roomId, userId, userName, userRole, isHost },
    arenaRealtimeCallbacks,
  );
```

### Handler raise-hand (source du `pending` non filtré)

```typescript
  const handleRaiseHand = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/beef/raise-hand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ beefId: roomId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast('Demande envoyée ! Le Ref va te répondre.', 'success');
    } catch (error) {
      console.error('Erreur lors de la demande');
      const msg = error instanceof Error ? error.message : 'Impossible d'envoyer la demande.';
      toast(msg, 'error');
    }
  }, [userId, roomId, toast]);
```

---

## 1.2 Canal critique — `hooks/useArenaRealtime.ts` (source réelle des `postgres_changes`)

### Interface callback documentée

```typescript
  /** Invite spectateur → ligne `beef_participants` acceptée pour l'utilisateur courant (UPDATE Realtime). */
  onSpectatorSelfInviteAccepted?: () => void;

  /** Le Ref a invité ce spectateur (UPDATE Realtime vers pending). */
  onSpectatorReceivedRefInvite?: () => void;

  /** Mutation `beef_participants` pour ce beef (Postgres Changes). Le parent filtre médiateur / refetch invités. */
  onBeefParticipantsTableChanged?: () => void;
```

### ⚠️ FAILLE — Canal `spectator_invite_sync_${roomId}_${userId}` (L.387–428)

```typescript
  /** Canal spectateur invitation (purifié) */
  useEffect(() => {
    if (!roomId || !userId) return undefined;
    const currentRole = identityRef.current.userRole;
    if (currentRole !== 'viewer' && currentRole !== 'spectator') return undefined;

    let ch: ReturnType<typeof supabase.channel> | null = null;

    const initTimer = window.setTimeout(() => {
      const topic = `spectator_invite_sync_${roomId}_${userId}`;
      ch = supabase
        .channel(topic)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'beef_participants', filter: `beef_id=eq.${roomId}` },
          (payload: { new: Record<string, unknown>; old?: Record<string, unknown>; eventType: string }) => {
            const newRow = payload.new;
            const oldRow = payload.old || {};
            const rawUid = newRow.user_id;
            const rowUserStr = typeof rawUid === 'string' ? rawUid : rawUid != null ? String(rawUid) : '';
            if (rowUserStr !== String(userId)) return;

            if (newRow.invite_status === 'accepted' && oldRow?.invite_status !== 'accepted') {
              callbacksRef.current.onSpectatorSelfInviteAccepted?.();
            }
            if (newRow.invite_status === 'pending' && oldRow?.invite_status !== 'pending') {
              callbacksRef.current.onSpectatorReceivedRefInvite?.();
            }
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[Live] spectator_invite_sync canal indisponible');
          }
        });
    }, 150);

    return () => {
      window.clearTimeout(initTimer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [roomId, userId]);
```

**Événement déclencheur exact de la modale :**

| Condition | Callback | Effet UI |
|-----------|----------|----------|
| `newRow.invite_status === 'pending'` **ET** `oldRow.invite_status !== 'pending'` **ET** `rowUserStr === userId` | `onSpectatorReceivedRefInvite()` | `setRefInviteAlert(true)` |
| `newRow.invite_status === 'accepted'` **ET** transition depuis non-accepted | `onSpectatorSelfInviteAccepted()` | `setAcceptedInviteAlert(true)` |

**Écart G.0 vs G.2 :** le montage initial lit `beef_invitations.status = 'sent'`, mais le Realtime live réagit encore à **`beef_participants.invite_status = 'pending'`** — incluant les upserts raise-hand.

### Canal auxiliaire — `beef_participants_live_${roomId}` (L.429–456)

```typescript
  useEffect(() => {
    if (!roomId) return undefined;

    let ch: ReturnType<typeof supabase.channel> | null = null;

    const initTimer = window.setTimeout(() => {
      ch = supabase
        .channel(`beef_participants_live_${roomId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'beef_participants',
            filter: `beef_id=eq.${roomId}`,
          },
          () => {
            callbacksRef.current.onBeefParticipantsTableChanged?.();
          },
        )
        .subscribe();
    }, 150);

    return () => {
      window.clearTimeout(initTimer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [roomId]);
```

Ce canal **ne déclenche pas directement** la modale ; il provoque un refetch `loadParticipants()` côté arène.

---

## 1.3 Source API — `app/api/beef/raise-hand/route.ts`

```typescript
/**
 * Spectateur : demande à rejoindre le ring (beef_participants.pending).
 * Contournement RLS via service role — la policy INSERT client est réservée au médiateur.
 */
export async function POST(request: NextRequest) {
  // ...
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
  // ...
}
```

**Aucune ligne `beef_invitations` n'est créée.** L'upsert émet un événement Realtime capté par `spectator_invite_sync_*`.

---

# 2. Extraction — Logique grille « Absent » (mode Spectateur)

## 2.1 Note de recherche `"ABSENT"`

Recherche globale : la chaîne `"ABSENT"` en majuscules **absente** du code applicatif. Le badge UI est :

```tsx
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
```

(Fichier : `components/Arena/shared/ArenaVideoSurface.tsx` L.138–141 — classe CSS `uppercase` rend visuellement « ABSENT ».)

---

## 2.2 Source WebRTC — `hooks/useDailyCall.ts`

```typescript
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
  // ...
}
```

Dans `TikTokStyleArena` L.1346 :

```typescript
  } = useDailyCall(effectiveDailyRoomUrl, userName, isViewer, userId, meetingTokenForDaily);
```

---

## 2.3 Chargement participants DB — slots attendus (`expectedUids`)

```typescript
  const loadParticipants = useCallback(async () => {
    const { data } = await supabase
      .from('beef_participants')
      .select('user_id, role, is_main, invite_status, created_at')
      .eq('beef_id', roomId);

    // ...

    // Seuls les "accepted" obtiennent un halo dans la grille géométrique
    const validData = (data as ParticipantRow[]).filter(
      (p) =>
        p.role !== 'witness' &&
        p.invite_status === 'accepted',
    );

    // ...
    setParticipantRoles(roles);
    setParticipantUidOrder(sorted.map((p) => p.user_id));
  }, [roomId, userId, isViewer, isHost, toast]);

  const expectedUids = useMemo(() => {
    const mid = host.id?.trim().toLowerCase() ?? '';
    const ordered = participantUidOrder.filter((uid) => uid !== mid && participantRoles[uid]);
    if (ordered.length > 0) return ordered;
    return Object.keys(participantRoles).filter((uid) => uid !== mid);
  }, [participantRoles, participantUidOrder, host.id]);
```

**Conséquence :** la grille pré-alloue des tuiles pour chaque UID `accepted` en DB, **indépendamment** de la présence WebRTC.

---

## 2.4 Réconciliation identité — `components/TikTokStyleArena.tsx`

```typescript
  const reconcileExpected = useMemo(
    (): ReconcileExpectedRoles => ({
      mediatorUserId: host.id,
      mediatorDisplayName: host.name,
      challengerUidsOrdered: expectedUids,
      roles: participantRoles,
    }),
    [host.id, host.name, expectedUids, participantRoles],
  );

  const reconciledPeers = useMemo(
    () => reconcilePeers(physicalPeers, reconcileExpected),
    [physicalPeers, reconcileExpected],
  );

  /** Grille challengers : index = slot attribué par reconcilePeers (A=0 … F=5). */
  const challengerRemoteSlots = useMemo((): Array<CallParticipant | null> => {
    const panels: Array<CallParticipant | null> = Array.from(
      { length: ARENA_CHALLENGER_SLOT_COUNT },
      () => null,
    );
    for (const r of reconciledPeers) {
      const idx = r.semantic.expectedSlotIndex;
      if (idx >= 0 && idx < ARENA_CHALLENGER_SLOT_COUNT) {
        panels[idx] = physicalPeerToCallParticipant(r.physical);
      }
    }
    return panels;
  }, [reconciledPeers]);

  const displayPanelsFixed = challengerRemoteSlots;
```

### Algorithme `reconcilePeers` — `lib/participant-identity.ts`

```typescript
export function reconcilePeers(
  physicalPeers: readonly PhysicalPeer[],
  expected: ReconcileExpectedRoles,
): ReconciledPeer[] {
  const { mediatorUserId, mediatorDisplayName, challengerUidsOrdered, roles } = expected;
  const nSlots = 6;
  const slotUsed: boolean[] = Array.from({ length: nSlots }, () => false);
  const assigned = new Map<string, SemanticIdentity>();
  const needPhysical = [...physicalPeers];

  // 1 — Médiateur (expectedSlotIndex: -1)
  // 2 — UUID challenger attendu (match arenaUserId → challengerUidsOrdered)
  // 3 — Alias pseudo → UID
  // 4 — Orphelins : slot libre, kind: 'orphan'

  return physicalPeers.map((p) => ({
    physical: p,
    semantic: assigned.get(p.sessionId)!,
  }));
}
```

**Si aucun flux physique ne correspond à un UID attendu**, `challengerRemoteSlots[idx]` reste `null` → tuile sans `panel`.

---

## 2.5 Construction tuiles VM — `components/Arena/useArenaLayoutTiles.ts`

```typescript
function hasActiveVideo(
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
): boolean {
  return panel?.videoOn === true;
}

function resolveIsLocal(
  uid: string | undefined,
  panel: UseArenaLayoutTilesParams['challengerRemoteSlots'][number],
  localUserId: string,
  localSessionId: string | null | undefined,
  isViewer: boolean,
): boolean {
  if (isViewer) return false;
  if (uid && userIdsEqual(uid, localUserId)) return true;
  return panel != null && panel.sessionId === localSessionId;
}

export function useArenaLayoutTiles(params: UseArenaLayoutTilesParams): ArenaTileVM[] {
  // ...
    for (let idx = 0; idx < tileCount; idx++) {
      const uid = expectedUids[idx];
      const panel = challengerRemoteSlots[idx] ?? null;
      // ...
      tiles.push({
        id: `arena-tile-${slot}`,
        slot,
        name,
        arenaUserId,
        panel,
        aura: auras[slot],
        colorRgb: CHALLENGER_SLOT_COLORS[slot],
        hasActiveVideo: hasActiveVideo(panel),
        isLocal: resolveIsLocal(uid, panel, localUserId, localSessionId, isViewer),
        avatarUrl,
        cellClass: getNexusCellClass(idx, tileCount),
        uiPosClass: getNexusChromeUiPos(idx, tileCount),
      });
    }
  // ...
}
```

---

## 2.6 Rendu surface vidéo + badge — `components/Arena/shared/ArenaVideoSurface.tsx`

```tsx
  const pseudoBadge = (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      <div className="flex min-w-0 max-w-full overflow-hidden items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 ...">
        {/* ... pseudo @name ... */}
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
      </div>
      {/* ... DIRECT badge si isSpeaking ... */}
    </div>
  );

  // Corps tuile :
        {tile.hasActiveVideo && tile.panel?.videoTrack ? (
          <ParticipantVideo
            videoTrack={tile.panel.videoTrack}
            muted={tile.isLocal}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : tile.avatarUrl ? (
          // avatar fallback
        ) : (
          // initiale pseudo
        )}
```

**Décision UI résumée :**

| État | Badge | Vidéo |
|------|-------|-------|
| `panel === null` | **Absent** | Avatar ou initiale |
| `panel !== null` && `!hasActiveVideo` | *(pas de badge Absent)* | Avatar ou initiale |
| `panel !== null` && `hasActiveVideo` | *(pas de badge)* | `<ParticipantVideo>` |

---

## 2.7 Passage props grille — `components/TikTokStyleArena.tsx` → `ArenaLayoutManager`

```tsx
        {!showVsScreen && (
          <ArenaLayoutManager
            expectedUids={expectedUids}
            challengerRemoteSlots={displayPanelsFixed}
            reconciledPeers={reconciledPeers}
            participantRoles={participantRoles}
            auras={auras}
            localUserId={userId}
            localSessionId={localParticipant?.sessionId}
            isViewer={isViewer}
            isHost={isHost}
            // ...
          />
        )}
```

---

## 2.8 Variables « absent » legacy (non branchées au rendu)

```typescript
  const leftChallengerAbsent =
    isJoined &&
    !beefEnded &&
    challengersEverJoinedRef.current &&
    !leftPanel &&
    expectedChallengers.length >= 1;

  const rightChallengerAbsent =
    isJoined &&
    !beefEnded &&
    challengersEverJoinedRef.current &&
    !rightPanel &&
    expectedChallengers.length >= 2;
```

**Ces deux booléens ne sont référencés nulle part ailleurs dans `TikTokStyleArena.tsx`.** Le badge « Absent » visible provient exclusivement de `ArenaVideoSurface` via `!tile.panel`.

---

## 2.9 Heuristique spectateur « LIVE chaud » (contexte)

```typescript
  const challengerOnAir = useMemo(() => {
    const hasGridVideo = reconciledPeers.some(
      (r) => r.semantic.expectedSlotIndex >= 0 && r.physical.videoTrack,
    );
    if (hasGridVideo) return true;
    if (!isViewer) return false;
    const nonMediator = remoteParticipants.filter(
      (p) => !remoteMatchesMediator(p, host.id, host.name),
    );
    if (nonMediator.length === 0) return false;
    if (!hasExpectedChallengers) return true;
    return false;
  }, [reconciledPeers, remoteParticipants, host.id, host.name, isViewer, hasExpectedChallengers]);
```

Le badge LIVE peut être « chaud » via `remoteParticipants` alors que la grille affiche « Absent » sur les slots `expectedUids` non réconciliés.

---

# 3. Extraction — Modale de convocation Ref

## 3.1 États contrôlant l'affichage

| État | Initialisation | Ouverture | Fermeture |
|------|----------------|-----------|-----------|
| `refInviteAlert` | `useState(false)` L.319 | Montage : `beef_invitations.status === 'sent'` L.331 ; Realtime : `onSpectatorReceivedRefInvite` L.2924 | Refus L.4041 ; fin beef (`beefEnded`) |
| `beefEnded` | `useState(false)` | — | Condition `{refInviteAlert && !beefEnded && (...)}` |

---

## 3.2 JSX complet — `components/TikTokStyleArena.tsx` L.3984–4068

```tsx
      <AnimatePresence>
        {refInviteAlert && !beefEnded && (
          <motion.div
            key="ref-invite-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90 p-6 text-center shadow-[0_0_80px_rgba(0,240,255,0.12)] backdrop-blur-md"
            >
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/20">
                <span className="text-4xl" aria-hidden>
                  🎙️
                </span>
              </div>
              <h2 className="mb-2 font-mono text-xl font-black uppercase tracking-tight text-white">
                Le Ref te convoque
              </h2>
              <p className="mb-6 text-sm text-white/60">
                Tu es invité à entrer sur scène. Prépare ta caméra et ton micro.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    await supabase
                      .from('beef_participants')
                      .update({
                        invite_status: 'accepted',
                        responded_at: new Date().toISOString(),
                      })
                      .eq('beef_id', roomId)
                      .eq('user_id', userId);
                    await supabase
                      .from('beef_invitations')
                      .update({
                        status: 'accepted',
                        responded_at: new Date().toISOString(),
                      })
                      .eq('beef_id', roomId)
                      .eq('invitee_id', userId);
                    window.location.reload();
                  }}
                  className="w-full rounded-full bg-cyan-500 py-3.5 font-mono text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-transform hover:bg-cyan-400 active:scale-95"
                >
                  Prendre la parole
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setRefInviteAlert(false);
                    await supabase
                      .from('beef_participants')
                      .update({
                        invite_status: 'declined',
                        responded_at: new Date().toISOString(),
                      })
                      .eq('beef_id', roomId)
                      .eq('user_id', userId);
                    await supabase
                      .from('beef_invitations')
                      .update({
                        status: 'declined',
                        responded_at: new Date().toISOString(),
                      })
                      .eq('beef_id', roomId)
                      .eq('invitee_id', userId);
                    toast('Convocation déclinée', 'info');
                  }}
                  className="w-full rounded-full border border-white/10 bg-white/5 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Rester dans le public
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
```

### Actions associées

| Bouton | Effet DB | Effet UI |
|--------|----------|----------|
| **Prendre la parole** | `beef_participants.invite_status → accepted` + `beef_invitations.status → accepted` | `window.location.reload()` |
| **Rester dans le public** | `beef_participants.invite_status → declined` + `beef_invitations.status → declined` | `setRefInviteAlert(false)` + toast |

**Note :** si la convocation provient uniquement du raise-hand (sans ligne `beef_invitations`), le bouton « Prendre la parole » met à jour `beef_invitations` avec 0 ligne matchée — le reload promeut quand même via `beef_participants.accepted`.

---

# Verdict Architecte — Pistes correction G.2

## Fuite Realtime (priorité P0)

1. **Migrer `spectator_invite_sync_*`** pour écouter `beef_invitations` (`status → 'sent'`) au lieu de `beef_participants.invite_status → 'pending'`.
2. **Ou** conserver `beef_participants` mais exiger une jointure / flag prouvant une invitation Ref (`beef_invitations` existante avec `status = 'sent'`).
3. **Corriger la source** : `POST /api/beef/raise-hand` ne doit **pas** écrire `invite_status: 'pending'` sur `beef_participants` — utiliser une table dédiée (`raise_hand_requests`) ou `beef_invitations` avec statut distinct (`requested`).

## Grille « Absent » spectateur (priorité P1)

1. Vérifier que `viewerMode` + `subscribeToTracksAutomatically` alimentent bien `physicalPeers` (G.0).
2. Si flux présents mais non réconciliés : enrichir le matching (`arenaUserId` Daily userData) ou afficher les orphelins sur slots libres au lieu de marquer « Absent » les slots `expectedUids`.
3. Distinguer **« absent de la room »** (`panel === null` après grace period) vs **« caméra off »** (`panel !== null && !hasActiveVideo`) — aujourd'hui seul le premier cas affiche le badge.
4. Nettoyer le code mort `leftChallengerAbsent` / `rightChallengerAbsent` ou le rebrancher si un overlay dédié est souhaité.

---

*Fin du rapport — Phase G.2 — extraction seule, aucune modification applicative.*
