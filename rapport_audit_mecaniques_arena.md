# Rapport d'audit — Mécaniques Arène & CTAs

**Date :** 31 mai 2026  
**Périmètre :** routage Ref, WebRTC/rôles, empilement CTAs modale Teaser  
**Statut :** exploration uniquement — **aucun correctif implémenté**

---

## Synthèse exécutive

| Anomalie | Cause probable (audit) | Fichiers clés |
|----------|------------------------|---------------|
| Ref → loader infini `/live/[id]` | Route `/live` sans sas « Check Matériel » ; spinner `FETCH_TICKET` ou VS bloqué sur `rolesLoaded` | `app/feed/page.tsx`, `app/live/[id]/page.tsx`, `app/arena/[roomId]/page.tsx` |
| Spectateur traité comme combattant (caméra) | Rôle client `userRole` ≠ token Daily ; `challenger` si `invite_status === 'accepted'` ; PreJoin + `getUserMedia` si `!isViewer` | `app/arena/[roomId]/page.tsx`, `components/TikTokStyleArena.tsx`, `components/PreJoinScreen.tsx` |
| CTAs superposés BeefCard | Bloc `scheduled \|\| pending` : conditions **indépendantes** (`&&`), pas de branches `else if` exclusives | `components/BeefCard.tsx` |

---

## 1. Cartographie des fichiers Arène

| Fichier | Rôle |
|---------|------|
| **`app/arena/[roomId]/page.tsx`** | Route publique salle d'attente `/arena/[id]` — auth, billet Daily, **sas Check Matériel**, puis arène |
| **`app/live/[id]/page.tsx`** | Route régie `/live/[id]` — auth obligatoire, billet Daily, **pas de sas**, arène directe |
| **`components/TikTokStyleArena.tsx`** | Écran VS (`VsTransition`), PreJoin, moteur Daily, UI ring |
| **`components/PreJoinScreen.tsx`** | Preview caméra/micro (`getUserMedia`) — combattants / Ref uniquement |
| **`hooks/useDailyCall.ts`** | Façade → `useDailyMeetingEngine` |
| **`hooks/useDailyMeetingEngine.ts`** | Join Daily, `viewerMode`, activation pistes locales |
| **`lib/client/fetch-beef-video-ticket.ts`** | GET `/api/beef/access?beefId=` |
| **`app/api/beef/access/route.ts`** | Rôle token (`mediator` / `participant` / `spectator`), création room Daily |

---

## 2. Failles WebRTC — écran VS, caméra, rôles

### 2.1 Écran « VS » et pile d'entrée (`TikTokStyleArena.tsx`)

Ordre des couches :

1. **`showVsScreen`** (z-9999) → `VsTransition` ou **spinner** si `!rolesLoaded`
2. **`PreJoinScreen`** si `!showVsScreen && !hasJoined && showPreJoin`
3. Arène Daily une fois `hasJoined`

```3121:3150:components/TikTokStyleArena.tsx
      {/* --- COUCHE 1 : ÉCRAN VS (Priorité 1) --- */}
      <AnimatePresence>
        {showVsScreen && (
          <div className="absolute inset-0 z-[9999] bg-black/40 backdrop-blur-sm">
            {rolesLoaded ? (
              <VsTransition
                challengers={...}
                debateTitle={debateTitle}
                onComplete={handleVsComplete}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {!showVsScreen && !hasJoined && showPreJoin && (
        <div className="absolute inset-0 z-[8000] bg-black/40 backdrop-blur-sm">
          <PreJoinScreen userName={userName} onJoin={handleJoin} viewerMode={isViewer} mediatorName={mediatorName} />
```

**`rolesLoaded`** : passé à `true` seulement si `Object.keys(participantRoles).length > 0` (l. 857). Si vide → **loader VS infini**.

---

### 2.2 Dérivation spectateur vs combattant (client)

```269:313:components/TikTokStyleArena.tsx
  const isViewer = userRole === 'viewer' || userRole === 'spectator';

  useEffect(() => {
    if (isViewer) {
      setShowPreJoin(false);
      setHasJoined(true);
    }
  }, [isViewer]);
```

Spectateur : **skip PreJoin**, auto-`hasJoined` → join Daily en `viewerMode`.

---

### 2.3 Assignation rôle — `app/arena/[roomId]/page.tsx`

```171:188:app/arena/[roomId]/page.tsx
      setIsHost(userIdsEqual(effectiveHostId, uidTrim));

      if (userIdsEqual(effectiveHostId, uidTrim)) {
        setUserRole('mediator');
      } else {
        const uidNorm = userId.trim().toLowerCase();
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', uidNorm)
          .maybeSingle();

        if (participation && participation.invite_status === 'accepted') {
          setUserRole('challenger');
        } else {
          setUserRole('viewer');
        }
      }
```

| Condition | `userRole` |
|-----------|------------|
| `userId === mediator_id \|\| created_by` (effectiveHostId) | `mediator` |
| `beef_participants.invite_status === 'accepted'` | `challenger` |
| Sinon | `viewer` |

**Note :** requête participant avec `user_id` en **lowercase** — risque de non-match UUID si casse divergente en DB.

**État initial :** `'spectator'` (l. 36) puis écrasé par la logique ci-dessus.

---

### 2.4 Activation caméra — `PreJoinScreen.tsx` + `getUserMedia`

```131:138:components/PreJoinScreen.tsx
  useEffect(() => {
    if (!viewerMode) {
      void startPreviewRef.current();
    }
    return () => {
      releasePreJoinResources({ stopTracks: !mediaHandedOffRef.current });
    };
  }, [viewerMode, releasePreJoinResources]);
```

```86:90:components/PreJoinScreen.tsx
      const constraints: MediaStreamConstraints = {
        video: camEnabled ? (camId ? { deviceId: { exact: camId } } : true) : false,
        audio: micId ? { deviceId: { exact: micId } } : true,
      };
      const s = await navigator.mediaDevices.getUserMedia(constraints);
```

**Confirmé :** `getUserMedia` appelé **uniquement** si `viewerMode === false` (combattant / Ref).

Mode spectateur PreJoin (UI sans caméra) :

```180:181:components/PreJoinScreen.tsx
  if (viewerMode) {
    return (
```

---

### 2.5 Join Daily — `useDailyMeetingEngine.ts`

```106:107:hooks/useDailyMeetingEngine.ts
  const [micEnabled, setMicEnabled] = useState(!viewerMode);
  const [camEnabled, setCamEnabled] = useState(!viewerMode);
```

```219:265:hooks/useDailyMeetingEngine.ts
        const vm = viewerModeRef.current;
        const shouldStartVideoOff = vm || opts?.camEnabled === false;

        let videoSource: boolean | MediaStreamTrack = !vm && !shouldStartVideoOff;
        let audioSource: boolean | MediaStreamTrack = !vm;
        // ...
        const co = DailyIframe.createCallObject(
          vm
            ? { subscribeToTracksAutomatically: true }
            : { audioSource, videoSource },
        );
        // ...
        await co.join({
          url,
          token,
          userName: userNameRef.current,
          startVideoOff: shouldStartVideoOff,
          startAudioOff: vm,
        });
```

**Confirmé :** en `viewerMode`, pas de sources audio/vidéo locales à l'join.

---

### 2.6 Faille spectateur → caméra (diagnostic)

Si un utilisateur est classé **`challenger` ou `mediator`** côté client alors qu'il se croit spectateur :

- `isViewer === false`
- PreJoin lance **`getUserMedia`**
- Daily join avec pistes locales

Déclencheurs possibles :

1. Ligne participant `accepted` en DB (créateur auto-accepté, ou acceptation réelle).
2. Confusion **Ref** (`effectiveHostId` = `mediator_id ?? created_by`) → rôle `mediator`.
3. **Désalignement** : API `/api/beef/access` calcule le rôle token indépendamment (canonical UUID), la page arène calcule `userRole` — le join utilise **`userRole` client**, pas `ticket.role`.

---

### 2.7 Sas de préparation — `/arena` uniquement

```373:437:app/arena/[roomId]/page.tsx
  const needsStaging = userRole === 'mediator' || userRole === 'challenger';

  if (needsStaging && !isStagingPassed) {
    return (
      // ... Check Matériel — Caméra / Micro — bouton "JE SUIS PRÊT"
      onClick={() => setIsStagingPassed(true)}
    );
  }
```

**`/live/[id]/page.tsx` n'a pas ce sas** — enchaîne directement sur `TikTokStyleArena` après billet OK.

---

## 3. Routage Ref — `app/feed/page.tsx`

### 3.1 Confirmation `onPrepareAudience` → `/live/`

```1054:1058:app/feed/page.tsx
                    onPrepareAudience={
                      (beef.status === 'scheduled' || beef.status === 'pending') && user?.id === beef.mediator_id
                        ? () => router.push(`/live/${beef.id}`)
                        : undefined
                    }
```

**Confirmé :** le Ref est envoyé vers **`/live/${beef.id}`**, pas `/arena/${beef.id}`.

### 3.2 Clic carte générique → `/arena/`

```792:802:app/feed/page.tsx
  const handleBeefClick = (beef: Beef) => {
    if (beef.status === 'ended' || ...) {
      router.push(`/beef/${beef.id}/summary`);
      return;
    }
    router.push(`/arena/${beef.id}`);
  };
```

Spectateurs / challengers acceptés : **salle d'attente** `/arena/[id]`.

### 3.3 Rôle de `/live/[id]/page.tsx`

- Auth **obligatoire** (redirect `/login` si absent)
- Fetch billet Daily (même API)
- **Aucun** `isStagingPassed` / Check Matériel
- Render direct `TikTokStyleArena` (l. 308–323)

### 3.4 Loader infini Ref — mécanismes identifiés

| Écran | Condition | Fichier |
|-------|-----------|---------|
| Spinner cyan | `entryPhase === 'FETCH_TICKET'` | `live/[id]/page.tsx` l. 266–273 |
| Spinner VS | `showVsScreen && !rolesLoaded` | `TikTokStyleArena.tsx` l. 3138–3141 |
| « Préparation room vidéo… » | PreJoin sans URL Daily | `TikTokStyleArena.tsx` l. 3151–3155 |

Pour beef **pending/scheduled** sans room Daily créée : spectateurs reçoivent `ROOM_NOT_FOUND` ; **médiateur** passe par `ensureDailyRoomExistsForBeef` (création salle). Si le Ref va sur `/live` avant que la room soit prête ou si l'effet ticket ne termine pas → **FETCH_TICKET** persistant.

**Piste :** rediriger le Ref vers **`/arena/[id]`** pour le sas Check Matériel + parité avec challengers (salle d'attente).

---

## 4. Empilement CTAs — `components/BeefCard.tsx`

### 4.1 Bloc intégral `scheduled || pending` (l. 743–855)

Structure : **`<div className="flex flex-col gap-2">`** contenant des blocs **séquentiels indépendants** :

| # | Condition | Rendu | Exclusif ? |
|---|-----------|-------|------------|
| 1 | `onPrepareAudience` | 🎛️ Préparer la Régie | Non |
| 2 | `isManifesto && onApply` | + Rôle au ring | Non |
| 3 | `pending && onSaisirAffaire && !mediator_name && !isParticipant` | Devenir le Ref | Non |
| 4 | `pending && mediator_name && onValiderRef` | Valider / Refuser Ref | Non |
| 5 | `pending && mediator_name && !onValiderRef && !onSaisirAffaire && pendingRefText` | Texte attente | Non |
| 6 | Ternaire `userInviteStatus` | Convocation / refus / Rejoindre | Partiel (`!onPrepareAudience`) |
| 7 | `scheduled && onSeDesister` | Se désister | Non |

```743:839:components/BeefCard.tsx
                ) : status === 'scheduled' || status === 'pending' ? (
                  <div className="flex flex-col gap-2">
                    {onPrepareAudience && ( /* Préparer la Régie */ )}
                    {isManifesto && onApply && ( /* + Rôle au ring */ )}
                    {status === 'pending' && onSaisirAffaire && !mediator_name && !isParticipant && ( /* Devenir le Ref */ )}
                    {status === 'pending' && !!mediator_name && onValiderRef && ( /* Valider / Refuser */ )}
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && pendingRefText && ( /* pendingRefText */ )}

                    {!onPrepareAudience && userInviteStatus === 'pending' ? (
                      /* ⚠️ Convocation en attente */
                    ) : !onPrepareAudience && userInviteStatus === 'declined' ? (
                      /* ❌ Convocation refusée */
                    ) : !onPrepareAudience && (!onValiderRef && !onSaisirAffaire && !onApply) ? (
                      /* Rejoindre la salle d'attente */
                    ) : null}
```

### 4.2 Diagnostic empilement

**Confirmé :** pas de **`else if`** entre blocs 1–5 et le ternaire 6. Plusieurs CTAs peuvent s'afficher **simultanément** :

- Ref médiateur : **Préparer la Régie** + **pendingRefText** (si `mediator_name` et pas `onValiderRef`)
- Challenger pending : **⚠️ Convocation** + **pendingRefText** (si `mediator_name` renseigné)
- Manifesto : **Préparer la Régie** + **+ Rôle au ring** + **Devenir le Ref** selon combinaison props

Le ternaire final (6) exclut seulement « Rejoindre » si `onPrepareAudience` ou handlers manifesto présents — **ne masque pas** les blocs 1–5.

---

## 5. Pistes correctives anticipées (non implémentées)

| Priorité | Action |
|----------|--------|
| P0 | `onPrepareAudience` → `router.push(/arena/${id})` au lieu de `/live/` |
| P0 | CTAs BeefCard : branches **mutuellement exclusives** par persona (Ref / challenger / spectateur / créateur manifesto) |
| P1 | Aligner lookup `beef_participants.user_id` (canonical UUID, pas lowercase seul) |
| P1 | Propager `ticket.role` API → `userRole` arène pour cohérence WebRTC |
| P2 | Fallback `rolesLoaded` si participants vides (éviter VS spinner infini) |

---

**Validation audit : chemins, extraits rôles WebRTC et bloc CTAs documentés. En attente GO pour implémentation.**
