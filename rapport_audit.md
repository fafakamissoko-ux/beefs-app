# Rapport d'Audit Structurel — Phase 0 (Reconnaissance)

**Date** : 24 juillet 2026
**Cible principale** : `components/TikTokStyleArena.tsx` (~4 327 lignes)
**Mission** : Analyse statique d'architecture et de dépendances — zéro modification de code

---

## 1. Arbre des imports internes de `TikTokStyleArena.tsx`

### 1.1 — React & Next.js

| Import | Source |
|--------|--------|
| `useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo` | `react` |
| `createPortal` | `react-dom` |
| `useRouter, usePathname` | `next/navigation` |
| `Image` | `next/image` |

### 1.2 — Librairies tierces

| Import | Source |
|--------|--------|
| `motion, AnimatePresence` | `framer-motion` |
| Icônes : `Eye, Gift, X, PanelRight, Send, Award, Share2, Calendar, Menu, MessageCircle, Home, User, ...` | `lucide-react` |

### 1.3 — Composants internes (UI)

| Import | Source | Rôle |
|--------|--------|------|
| `ConfirmModal` | `@/components/ConfirmModal` | Modale de confirmation Glass (fin de beef host) |
| `ReportBlockModal` | `@/components/ReportBlockModal` | Signalement / blocage utilisateur |
| `VsTransition` | `./VsTransition` | Animation "VS" au lancement |
| `ChatPanel` | `./ChatPanel` | Chat arène (messages Supabase) |
| `PreJoinScreen` | `./PreJoinScreen` | Pré-join cam/mic |
| `ArenaChatMessages` | `./ArenaChatMessages` | Rendu messages via Zustand store |
| `ArenaLayoutManager` | `@/components/Arena/ArenaLayoutManager` | Choix du layout (constellation/nexus) |
| `PremiumNotificationBadge` | `@/components/shared/PremiumNotificationBadge` | Badge notification premium |
| `FeatureGuide` | `./FeatureGuide` | Guide onboarding in-arène |
| `ViewerListModal` | `./ViewerListModal` | Liste des spectateurs |
| `ProfileUserLink` | `@/components/ProfileUserLink` | Lien vers profil utilisateur |
| `MediatorSupportHalo` | `./MediatorSupportHalo` | Halo visuel aura médiateur |
| `VerdictConfettiBurst, RematchVerdictOverlay` | `./VerdictEffects` | Effets visuels verdict/rematch |
| `MediatorSidebar, MediatorRemoteRow` | `./MediatorSidebar` | Command Deck médiateur |
| `FullscreenGiftAnimation` | `./Arena/FullscreenGiftAnimation` | Animation plein écran gifts |
| `MeetingAudioOutlet` | `@/components/MeetingAudioOutlet` | Sortie audio cachée peers Daily |

### 1.4 — Hooks internes

| Import | Source | Rôle dans l'arène |
|--------|--------|-------------------|
| `physicalPeerToCallParticipant, useDailyCall, CallParticipant` | `@/hooks/useDailyCall` | Façade Daily.co : join/leave, peers, mic/cam |
| `useArenaRealtime, UseArenaRealtimeResult, ArenaRealtimeCallbacks, StructuredDebateBroadcastPayload` | `@/hooks/useArenaRealtime` | Supabase Realtime/broadcast : chat, aura, présence, débat |
| `useMediaSession` | `@/hooks/useMediaSession` | Audio silence iOS lock screen |
| `useWakeLock` | `@/hooks/useWakeLock` | Anti-veille écran |

### 1.5 — Librairies internes (lib/)

| Import | Source | Rôle |
|--------|--------|------|
| `supabase` | `@/lib/supabase/client` | Client Supabase singleton |
| `userIdsEqual` | `@/lib/user-id-equal` | Comparaison UUID normalisée |
| `sanitizeMessage` | `@/lib/security` | Sanitisation du chat |
| `openBuyPointsPage` | `@/lib/navigation-buy-points` | Redirection achat lingots |
| `postBeefManage, BeefManageAction` | `@/lib/beef-manage-client` | Client API manage médiateur |
| `escapeForIlikeExact` | `@/lib/ilike-exact` | Échappement SQL wildcards |
| `ARENA_QUICK_REACTIONS` | `@/lib/arena-quick-reactions` | Catalogue réactions rapides |
| `playRematchThunderSfx` | `@/lib/playVerdictSfx` | Son SFX verdict/rematch |
| `GIFT_CATALOG` | `@/lib/constants/gifts` | Catalogue gifts arène |

### 1.6 — Stores Zustand

| Import | Source | Rôle |
|--------|--------|------|
| `useArenaVolatileStore, ArenaBigGiftPayload` | `@/lib/stores/arenaVolatileStore` | Messages, queue gifts, réactions éphémères |
| `useArenaPulseVoicesStore` | `@/lib/stores/arenaPulseVoicesStore` | Feedback audio/visuel audience |
| `useArenaVerdictStore` | `@/lib/stores/arenaVerdictStore` | État verdict/rematch |
| `useWalletStore` | `@/lib/stores/walletStore` | Solde lingots utilisateur |

### 1.7 — Contexts React

| Import | Source |
|--------|--------|
| `useToast` | `@/components/Toast` |
| `useMessagesDrawer` | `@/contexts/MessagesDrawerContext` |

### 1.8 — Types internes Arena

| Import | Source |
|--------|--------|
| Types arène, slots, aura batch | `@/lib/arena-slots` (lignes 47–76) |
| Types participant-identity | `@/lib/participant-identity` (lignes 86–91) |

---

## 2. Cartographie des states locaux — Overlays UI

### 2.1 — Overlays, modales, pickers (UI visible/invisible)

| State | Ligne | Type | Contrôle |
|-------|-------|------|----------|
| `showPreJoin` | 283 | `boolean` | Écran pré-join (masqué après join) |
| `mediatorSidebarOpen` | 310 | `boolean` | Command Deck médiateur |
| `showGiftPicker` | 311 | `boolean` | Picker de cadeaux |
| `giftTarget` | 312 | `string` | Cible du cadeau |
| `showViewerList` | 313 | `boolean` | Liste des spectateurs |
| `showArenaMenu` | 314 | `boolean` | Menu contextuel arène |
| `isCinematicMode` | 316 | `boolean` | Mode cinématique (masque UI) |
| `showVsScreen` | 317 | `boolean` | Animation VS au lancement |
| `acceptedInviteAlert` | 319 | `boolean` | Alerte invitation acceptée |
| `refInviteAlert` | 321 | `boolean` | Alerte invitation du Ref |
| `showReportModal` | 417 | `boolean` | Modale signalement |
| `reportTargetUser` | 418 | `object \| null` | Cible du signalement |
| `showAllReactions` | 475 | `boolean` | Panel réactions étendu |
| `dockPickersMounted` | 477 | `boolean` | Montage du dock pickers |
| `dockPickerPos` | 478 | `object \| null` | Position du dock pickers |
| `showLeaveConfirm` | 2686 | `boolean` | Modale Glass de confirmation sortie host |
| `authHook` | 269 | `object \| null` | Modale d'auth pour anonymes |

### 2.2 — States métier critiques (non-UI mais impactant le rendu)

| State | Ligne | Type | Rôle |
|-------|-------|------|------|
| `hasJoined` | 282 | `boolean` | Session Daily active |
| `rolesLoaded` | 284 | `boolean` | Rôles participants chargés |
| `beefEnded` | 355 | `boolean` | Session terminée |
| `endSummary` | 356 | `object \| null` | Données fin de beef |
| `timerActive` | 879 | `boolean` | Chronomètre en cours |
| `timerPaused` | 880 | `boolean` | Chrono en pause |
| `speakingTurnActive` | 385 | `boolean` | Tour de parole actif |
| `startingBeef` | 1075 | `boolean` | Démarrage en cours |
| `verdictConfetti` | 958 | `boolean` | Confetti de verdict |
| `rematchSequence` | 959 | `boolean` | Séquence rematch |
| `isOffline` | 422 | `boolean` | Détection hors-ligne |

### 2.3 — Refs critiques (timers, lifecycle)

| Ref | Ligne | Rôle |
|-----|-------|------|
| `preJoinMediaStreamRef` | 303 | MediaStream pré-join (handoff Daily) |
| `endSummaryTimerRef` | 369 | Timer auto-redirect post-beef |
| `mediatorGraceRef` | 370 | Timer grâce déconnexion médiateur |
| `beefEndedRef` | 373 | Flag synchrone fin de beef |
| `joinAttemptedRef` | 1533 | Anti-double-join Daily |
| `endBeefRef` | 900 | Closure `endBeef` (remplie après useDailyCall) |
| `leaveRef` | 902 | Closure `leave` Daily |
| `stopAllMediaTracksRef` | 903 | Kill-switch média |
| `arenaOutboundRef` | 906 | API broadcast Realtime |
| `messageSendChainRef` | 913 | Chaîne séquentielle d'envoi messages |

---

## 3. Interdépendances des hooks vitaux

### 3.1 — `useDailyCall` (ligne 1348)

```
TikTokStyleArena
  └── useDailyCall(effectiveDailyRoomUrl, userName, isViewer, userId, meetingTokenForDaily)
        └── useDailyMeetingEngine({ roomUrl, userName, viewerMode, arenaUserId, meetingToken })
              └── Daily.co SDK (callObject)
```

**Entrées** : `effectiveDailyRoomUrl` (string), `userName` (string), `isViewer` (boolean), `userId` (string), `meetingTokenForDaily` (string)

**Sorties consommées par l'arène** :
- `join`, `leave`, `stopCamera` — lifecycle
- `toggleMic`, `toggleCam`, `setLocalAudioEnabled`, `setRemoteParticipantAudio`, `hardMuteParticipant`, `ejectRemoteParticipant` — contrôles AV
- `isJoined`, `isJoining`, `micEnabled`, `camEnabled` — états
- `physicalPeers` — liste reconciliée des peers (identité Daily ↔ Supabase)
- `localParticipant`, `remoteParticipants` — participants mappés pour l'UI
- `activeSpeakerPeerId`, `networkQuality` — indicateurs
- `isCameraInterrupted`, `recoverMediaDevices`, `flipCamera` — résilience

**Stockage dans des refs** (pour closures stables) :
- `leaveRef.current = leave` (ligne 902)
- `stopAllMediaTracksRef.current = stopAllMediaTracks` (ligne 903)
- `isHostRef.current = isHost` (ligne 886)

### 3.2 — `useArenaRealtime` (ligne 2946)

```
TikTokStyleArena
  └── useArenaRealtime({ roomId, userId, userName, userRole, isHost }, arenaRealtimeCallbacks)
        ├── Supabase channel `live_${roomId}` (broadcast)
        ├── Supabase channel polling (secours)
        └── Callbacks: onMessage, onAura, onHandRaise, onAnnouncement, onGift, ...
```

**Entrées** : params objet `{ roomId, userId, userName, userRole, isHost }` + objet `arenaRealtimeCallbacks` (lignes ~2850–2944)

**Sorties consommées** :
- Stockées dans `arenaOutboundRef.current` (ligne 906) : `broadcastMessage`, `broadcastAura`, `broadcastAnnouncement`, `broadcastVerdict`, etc.
- `beefGlobalTimerFlushRef.current` : flush synchrone du timer broadcast

**Callbacks définis dans le composant** (objet `arenaRealtimeCallbacks`, ~100 lignes) :
- `onRemoteMessage` → `addRemoteMessage` (dédup via `seenMsgKeys`)
- `onAuraBatch` → `setAuras` + `setSupportBurst`
- `onHandRaise` → `setHandsRaised`
- `onRefInvite` → `setRefInvites`
- `onAnnouncement` → `setAnnouncementTicker`
- `onGlory` → `setGloryChallengerSlot`
- `onGift` → `useArenaVolatileStore.addMessage` + `enqueueBigGift`
- `onVerdict` → `useArenaVerdictStore`
- `onBeefTimerSync` → `setBeefTimeRemaining`
- `onStructuredDebate` → `setStructuredDebateEnabled` + `setChallengerBudgetRemaining`
- `onMediatorHoldFloor` → `setMediatorHoldingFloor`
- `onRemoteMute` → `setMicMutedByMediator`

---

## 4. Localisation exacte des alertes F-01, F-03, F-04, F-05

### F-01 — Métriques fabriquées (likes aléatoires)

| Donnée | Valeur |
|--------|--------|
| **Fichier** | `components/ChatPanel.tsx` |
| **Ligne exacte** | **263** |
| **Code fautif** | `const [likes, setLikes] = useState(Math.floor(Math.random() * 50));` |
| **Fonction parente** | `CommentsStyleMessage` (composant interne, ligne 261) |
| **Impact aval** | Rendu dans le JSX à la ligne 321 : `<span>{likes}</span>` |
| **Dépendances** | Aucune — state local isolé, pas de propagation DB |

### F-03 — Annonces médiateur non sanitisées

| Donnée | Valeur |
|--------|--------|
| **Fichier** | `components/MediatorSidebar.tsx` |
| **Ligne exacte** | **479** |
| **Code fautif** | `onPublishAnnouncement(announceDraft.trim(), announceDurationSec);` |
| **Variable non assainie** | `announceDraft` (state local, ligne 129) |
| **Source de la variable** | Textarea ligne 448–454, remplie par `onChange={(e) => setAnnounceDraft(e.target.value)}` |
| **Consommateur aval** | `TikTokStyleArena.tsx` → `arenaOutboundRef.current.broadcastAnnouncement?.(text, durationSec)` → broadcast Supabase à tous les spectateurs |
| **Rendu final** | `setAnnouncementTicker(text)` → affiché en JSX (React échappe par défaut, mais si utilisé dans un autre contexte : risque) |

### F-04 — API manage : inputs `mediationSummary` et `endReason` non validés

| Donnée | Valeur |
|--------|--------|
| **Fichier** | `app/api/beef/manage/route.ts` |
| **Lignes exactes** | **312–313** (`mediationSummary`) et **327–328** (`endReason`) |
| **Code fautif (summary)** | `typeof body.mediationSummary === 'string' && body.mediationSummary.trim() ? body.mediationSummary.trim() : '...'` → stocké directement dans `mediation_summary` |
| **Code fautif (reason)** | `typeof body.endReason === 'string' && body.endReason.trim() ? body.endReason.trim() : 'Terminé par le médiateur'` → passé à `resolutionFromEndReason()` puis stocké |
| **Validation actuelle** | Type check `typeof === 'string'` + `.trim()` — **aucune** validation de longueur, format, ou sanitisation HTML |
| **Stockage** | `supabaseAdmin.from('beefs').update({ mediation_summary: summary })` (ligne 318) et `resolution_status` (ligne 344) |

### F-05 — Variable shadowing `beef` dans APPROVE_MANIFESTO

| Donnée | Valeur |
|--------|--------|
| **Fichier** | `app/api/beef/manage/route.ts` |
| **Ligne exacte** | **112** |
| **Code fautif** | `const { data: beef } = await supabaseAdmin.from('beefs').select('title, mediator_id').eq('id', beefId).single();` |
| **Variable masquée** | `beef` déclaré en ligne 89 : `const { data: beef, error: beefErr } = await supabaseAdmin.from('beefs').select('id, mediator_id, created_by, status').eq('id', beefId).maybeSingle();` |
| **Risque** | Le `beef` de la ligne 112 ne contient que `title` et `mediator_id`. Si un développeur référence `beef.status` après ce bloc, il obtiendra `undefined` au lieu de la valeur réelle. Le scope `if` protège partiellement mais le shadowing reste un anti-pattern dangereux. |

---

*Fin du rapport — Phase 0 Reconnaissance — aucune modification appliquée au code source.*
