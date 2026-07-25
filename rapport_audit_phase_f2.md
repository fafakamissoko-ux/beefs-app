# Rapport d'Audit — `TikTokStyleArena.tsx`

**Phase :** F2 — Démantèlement architectural  
**Fichier :** `components/TikTokStyleArena.tsx`  
**Lignes totales :** 4 316  
**Date :** 24 juillet 2026  

---

## 1. Cartographie des blocs fonctionnels

| # | Bloc fonctionnel | Début | Fin | Lignes | Dépendances inter-blocs |
|---|---|---|---|---|---|
| A | **Imports, constantes & interfaces** | 1 | 224 | 224 | Aucune (fondation) |
| B | **Déclaration composant + Auth / Pre-join** | 225 | 296 | 72 | Props, router, toast, supabase |
| C | **États UI toggles** | 298 | 326 | 29 | `userId`, `roomId`, `isViewer` |
| D | **Système Aura / Ferveur Sociale** | 328 | 342 | 15 | Stores `arenaVolatileStore`, `arenaPulseVoicesStore` |
| E | **État de fin de beef (End-of-Beef)** | 344 | 371 | 28 | `statsRef`, `beefEndsAtMsRef`, `supportBurstRef`, `runBeefManage` |
| F | **Système de tour de parole (Speaking Turn)** | 374 | 399 | 26 | Timer refs, `challengerRemoteSlots`, `arenaOutboundRef` |
| G | **Store selectors (Volatile/Wallet)** | 401 | 427 | 27 | Zustand stores externes |
| H | **Notifications DM temps réel** | 429 | 464 | 36 | `supabase` channel, `userId` |
| I | **Dock Picker (position + fermeture)** | 465 | 566 | 102 | `showAllReactions`, `showGiftPicker`, `mediatorSidebarOpen`, DOM measurements |
| J | **Contrôles modérateur (invitations / pending)** | 574 | 647 | 74 | `isHost`, `runBeefManage`, `supabase`, `participantRoles` |
| K | **Chat temps réel (messages entrants)** | 648 | 733 | 86 | `addMessage`, `addReaction`, `seenMsgKeys`, `arenaVolatileStore` |
| L | **Système Aura tap / boost** | 736 | 761 | 26 | `auraBufferRef`, `auras`, `auraMed`, `requireAuth` |
| M | **Gestion des rôles participants (DB)** | 770 | 862 | 93 | `supabase`, `participantRoles`, `participantUidOrder`, `loadParticipants` |
| N | **Chrono global du beef (Timer)** | 864 | 1101 | 238 | `beefEndsAtMsRef`, `timerActive`, `timerPaused`, `beefTimeRemaining`, `scheduleBeefGlobalTimerBroadcast` |
| O | **Fin du beef (endBeef)** | 1104 | 1234 | 131 | `statsRef`, `supportBurstRef`, `arenaOutboundRef`, `leaveRef`, `runBeefManage` |
| P | **Système verdict médiateur** | 1172 | 1218 | 47 | `endBeef`, `arenaVerdictStore`, `arenaOutboundRef`, `runBeefManage` |
| Q | **Aura decay & Global Heat** | 1242 | 1299 | 58 | `auras`, `auraMed`, `globalHeat`, `auraFeverMed` |
| R | **Intégration Daily Call (WebRTC)** | 1313 | 1462 | 150 | `useDailyCall`, `reconciledPeers`, `physicalPeers`, `participantRoles` |
| S | **Détection auto-end (médiateur / challengers)** | 1464 | 1521 | 58 | `remoteParticipants`, `mediatorGraceRef`, `isHost`, `endBeef` |
| T | **Auto-join Daily** | 1523 | 1537 | 15 | `hasJoined`, `dailyRoomUrl`, `meetingTokenForDaily`, `join` |
| U | **Raise hand (spectateur)** | 1539 | 1566 | 28 | `supabase`, `userId`, `roomId` |
| V | **Calcul layout panneaux (left/right)** | 1585 | 1698 | 114 | `challengerRemoteSlots`, `localParticipant`, `isHost`, `isViewer`, `reconciledPeers` |
| W | **Détection audio néon** | 1697 | 1716 | 20 | `activeSpeakerPeerId`, panneaux, `mediatorParticipant` |
| X | **Mediator Remote Rows (régie)** | 1718 | 1765 | 48 | `reconciledPeers`, `participantRoles`, `expectedUids`, `challengerRemoteSlots` |
| Y | **Gestion tour de parole avancée** | 1812 | 2298 | 487 | `speakingTurn*`, `debaters`, `challengerRemoteSlots`, `hardMuteParticipant`, `arenaOutboundRef` |
| Z | **Invitation débatteurs** | 2300 | 2369 | 70 | `runBeefManage`, `supabase`, `debaters`, `inviteInput` |
| AA | **Profil utilisateur (modal)** | 2371 | 2502 | 132 | `supabase`, `profileCache`, `selectedProfile`, `profileFollowsTarget` |
| AB | **Bannière d'annonce** | 2504 | 2547 | 44 | `announcementTicker`, `announcementClearTimerRef`, `arenaOutboundRef` |
| AC | **Envoi de messages chat** | 2549 | 2658 | 110 | `chatInput`, `addMessage`, `supabase`, `messageSendChainRef`, `arenaOutboundRef` |
| AD | **Handlers Join / Leave** | 2660 | 2748 | 89 | `leave`, `endBeef`, `stopAllMediaTracks`, `router` |
| AE | **Callbacks Arena Realtime** | 2750 | 2934 | 185 | Quasi-tous les states : `auras`, `auraMed`, `globalHeat`, speaking turn, timer, verdict… |
| AF | **Hook useArenaRealtime + Presence** | 2936 | 3036 | 101 | `arenaOutboundRef`, `beefGlobalTimerFlushRef`, `auraBufferRef` |
| AG | **JSX — Return principal** | 3039 | 4285 | 1 247 | Tous les states et handlers ci-dessus |
| AH | **Sous-composant `ArenaFlyingReactions`** | 4291 | 4315 | 25 | `arenaVolatileStore` |

---

## 2. Inventaire des `useState`

| # | Variable | Type | Ligne | Lu par (blocs) | Modifié par (blocs) | Candidat extraction | Justification |
|---|---|---|---|---|---|---|---|
| 1 | `authHook` | `{ title; subtitle; mandatory? } \| null` | 269 | AG (modal auth) | B (requireAuth), AG | Oui | Hook auth indépendant |
| 2 | `hasJoined` | `boolean` | 282 | AD, T, AG | AD (handleJoin) | Oui | Pre-join flow |
| 3 | `showPreJoin` | `boolean` | 283 | AG | B, AD | Oui | Pre-join flow |
| 4 | `rolesLoaded` | `boolean` | 284 | AG (VsTransition) | M | Oui | Rôles participants |
| 5 | `preJoinMediaStream` | `MediaStream \| null` | 291 | T, R | AD (handleJoin) | Oui | Pre-join flow |
| 6 | `preJoinCamEnabled` | `boolean` | 292 | T, AG | AD (handleJoin) | Oui | Pre-join flow |
| 7 | `chatInput` | `string` | 298 | AC, AG | AC, AG | Oui | Chat system |
| 8 | `mediatorSidebarOpen` | `boolean` | 300 | I, J, AG | AG, I | Non | UI toggle transversal |
| 9 | `showGiftPicker` | `boolean` | 301 | I, AG | I, AG | Non | UI toggle transversal |
| 10 | `giftTarget` | `string` | 302 | AG (gift picker) | AG | Oui | Gift system |
| 11 | `showViewerList` | `boolean` | 303 | AG | AG | Non | UI toggle simple |
| 12 | `showArenaMenu` | `boolean` | 304 | AG | AG | Non | UI toggle simple |
| 13 | `isCinematicMode` | `boolean` | 306 | AG | AG | Non | UI toggle simple |
| 14 | `showVsScreen` | `boolean` | 307 | AG, T | AD (handleVsComplete) | Oui | Pre-join flow |
| 15 | `acceptedInviteAlert` | `boolean` | 309 | AG | AE | Oui | Invitation system |
| 16 | `refInviteAlert` | `boolean` | 311 | AG | C, AE | Oui | Invitation system |
| 17 | `auras` | `Record<ChallengerSlotId, number>` | 329 | D, Q, V, AG, AE | D, L, Q, AE | Oui | Aura system entier |
| 18 | `auraMed` | `number` | 334 | D, Q, AG, AE | D, L, Q, AE, AG | Oui | Aura system |
| 19 | `auraFeverMed` | `boolean` | 335 | Q | Q | Oui | Aura system |
| 20 | `globalHeat` | `number` | 337 | AG, Q | K, L, AC, AE | Oui | Aura system |
| 21 | `handsRaised` | `Array<{ userId; label }>` | 338 | J, AG | J | Oui | Invitation system |
| 22 | `refInvites` | `Array<{ userId; label }>` | 339 | J, AG | J | Oui | Invitation system |
| 23 | `parolePresetSec` | `number` | 340 | AG | AG | Oui | Régie system |
| 24 | `announcementTicker` | `string` | 341 | AB, AG | AB, AE | Oui | Annonce system |
| 25 | `gloryChallengerSlot` | `null \| 'A' \| 'B'` | 342 | V, AG | AG | Non | Éphémère (auto-clear) |
| 26 | `beefEnded` | `boolean` | 345 | O, S, AG, AD | O, AE | Oui | End-of-beef system |
| 27 | `endSummary` | `object \| null` | 346 | AG | O, AE | Oui | End-of-beef system |
| 28 | `mediatorGraceActive` | `boolean` | 361 | S, AG | S | Oui | Auto-end system |
| 29 | `mediatorGraceSeconds` | `number` | 362 | AG | S | Oui | Auto-end system |
| 30 | `profileFollowsTarget` | `boolean` | 372 | AA, AG | AA | Oui | Profil system |
| 31 | `speakingTurnActive` | `boolean` | 375 | F, Y, V, AG, AE | Y, AE | Oui | Speaking turn system |
| 32 | `speakingTurnTarget` | `string \| null` | 376 | F, Y, V | Y, AE | Oui | Speaking turn system |
| 33 | `speakingTurnRemaining` | `number` | 381 | Y | Y, AE | Oui | Speaking turn system |
| 34 | `speakingTurnPaused` | `boolean` | 382 | Y, V | Y, AE | Oui | Speaking turn system |
| 35 | `speakingTurnDuration` | `number` | 383 | Y | Y, AE | Oui | Speaking turn system |
| 36 | `floorAnnouncement` | `{ name; slot } \| null` | 387 | V, AG | Y, AE | Oui | Speaking turn system |
| 37 | `structuredDebateEnabled` | `boolean` | 393 | Y, V, AG | AE | Oui | Débat structuré |
| 38 | `debateBudgetMinutes` | `number` | 394 | AG | AE | Oui | Débat structuré |
| 39 | `challengerBudgetRemaining` | `number` | 395 | Y | Y | Oui | Débat structuré |
| 40 | `mediatorHoldingFloor` | `boolean` | 397 | Y, V, AG | Y, AE | Oui | Speaking turn system |
| 41 | `micMutedByMediator` | `boolean` | 399 | Y, AG | AE | Oui | Speaking turn system |
| 42 | `showReportModal` | `boolean` | 407 | AG | AG, AA | Non | UI toggle simple |
| 43 | `reportTargetUser` | `{ id; userName } \| null` | 408 | AG | AG, AA | Non | UI toggle simple |
| 44 | `isOffline` | `boolean` | 412 | AG | H (listeners) | Non | UI toggle simple |
| 45 | `contextMenuMsg` | `string \| null` | 425 | AC, AG | AC | Oui | Chat system |
| 46 | `unreadDMsCount` | `number` | 427 | AG | H | Oui | DM notifications |
| 47 | `showAllReactions` | `boolean` | 465 | I, AG | I, AG | Non | UI toggle transversal |
| 48 | `dockPickersMounted` | `boolean` | 467 | AG | I | Non | Technique (portal) |
| 49 | `dockPickerPos` | `{ bottom; right } \| null` | 468 | AG | I | Oui | Dock picker system |
| 50 | `participantRoles` | `Record<string, BeefParticipantRowMeta>` | 772 | M, V, X, Y, AE, AG | M | Oui | Rôles participants |
| 51 | `participantUidOrder` | `string[]` | 774 | M, V | M | Oui | Rôles participants |
| 52 | `beefTimeRemaining` | `number` | 865 | N, O, AG | N, AE | Oui | Timer system |
| 53 | `timerActive` | `boolean` | 869 | N, AG, AF | N, AE | Oui | Timer system |
| 54 | `timerPaused` | `boolean` | 870 | N, AG, AF | N, AE | Oui | Timer system |
| 55 | `myVote` | `ChallengerSlotId \| null` | 940 | AG (handleReaction) | preferSide | Oui | Pulse voices |
| 56 | `supportBurst` | `AuraBatchPayload` | 942 | L, O, AG | L, D, AE | Oui | Aura system |
| 57 | `giftPrestigeFlash` | `number` | 947 | AG | AG (gift handler) | Oui | Gift system |
| 58 | `verdictConfetti` | `boolean` | 948 | AG | P, AE | Oui | Verdict system |
| 59 | `rematchSequence` | `boolean` | 949 | AG | P, AE | Oui | Verdict system |
| 60 | `startingBeef` | `boolean` | 1065 | N | N | Oui | Timer system |
| 61 | `ringParticipants` | `RingParticipant[]` | 1800 | Aucun lecteur actif | Aucun setter actif | Oui (supprimer) | **Dead state** — jamais lu dans le JSX |
| 62 | `participationRequests` | `ParticipationRequest[]` | 1801 | Y | Y | Oui (supprimer) | **Dead state** — jamais lu dans le JSX |
| 63 | `debaters` | `Debater[]` | 1802 | Y, Z, AG | Y, Z, M | Oui | Tour de parole / régie |
| 64 | `currentSpeaker` | `string \| null` | 1807 | Aucun lecteur actif | Y | Oui (supprimer) | **Dead state** — jamais lu dans le JSX |
| 65 | `timerRunning` | `boolean` | 1808 | Aucun lecteur actif | Y, AE | Oui (supprimer) | **Dead state** — doublon de `speakingTurnActive` |
| 66 | `inviteInput` | `string` | 1809 | Z, AG | Z | Oui | Invitation system |
| 67 | `showDebateTitle` | `boolean` | 1810 | Aucun lecteur actif | AG (effect) | Oui (supprimer) | **Dead state** — jamais lu dans le JSX |
| 68 | `showProfile` | `boolean` | 1839 | AG | AA, AG | Oui | Profil system |
| 69 | `selectedProfile` | `UserProfile \| null` | 1840 | AG, AA | AA | Oui | Profil system |
| 70 | `isLeaving` | `boolean` | 2676 | AG | AD | Non | UI toggle simple |
| 71 | `showLeaveConfirm` | `boolean` | 2677 | AG | AD | Non | UI toggle simple |

**Total : 71 `useState`** (dont **5 dead states** identifiés : `ringParticipants`, `participationRequests`, `currentSpeaker`, `timerRunning`, `showDebateTitle`).

---

## 3. Inventaire des `useRef`

| # | Variable | Type | Ligne | Lu/modifié par | Candidat extraction |
|---|---|---|---|---|---|
| 1 | `preJoinMediaStreamRef` | `MediaStream \| null` | 293 | B, R, AD | Oui (pre-join) |
| 2 | `reactionDockRef` | `HTMLDivElement \| null` | 470 | I | Oui (dock picker) |
| 3 | `announcementClearTimerRef` | `ReturnType<typeof setTimeout> \| null` | 471 | AB, AE | Oui (annonce) |
| 4 | `auraBufferRef` | `AuraBatchPayload` | 473 | L, AF, AE | Oui (aura) |
| 5 | `auraSnapshotRef` | `AuraBatchPayload` | 475 | AF | Oui (aura) |
| 6 | `endSummaryTimerRef` | `NodeJS.Timeout \| null` | 359 | O, AE, AG | Oui (end-of-beef) |
| 7 | `mediatorGraceRef` | `NodeJS.Timeout \| null` | 360 | S | Oui (auto-end) |
| 8 | `beefEndedRef` | `boolean` | 363 | O, S, AE, AD | Oui (end-of-beef) |
| 9 | `mediatorWasConnectedRef` | `boolean` | 364 | R, S | Oui (auto-end) |
| 10 | `challengersEverJoinedRef` | `boolean` | 366 | R, S | Oui (auto-end) |
| 11 | `challengersAllLeftNotifiedRef` | `boolean` | 368 | S | Oui (auto-end) |
| 12 | `speakingTurnTargetRef` | `string \| null` | 377 | Y | Oui (speaking turn) |
| 13 | `speakingTurnIntervalRef` | `NodeJS.Timeout \| null` | 384 | Y, AE | Oui (speaking turn) |
| 14 | `stopTimerRef` | `() => void` | 385 | Y | Oui (speaking turn) |
| 15 | `statsRef` | `{ beefTimeRemaining; liveViewerCount; messagesCount; votesA-F }` | 650 | O, K, N | Oui (stats) |
| 16 | `seenMsgKeys` | `Set<string>` | 664 | K, AC | Oui (chat) |
| 17 | `beefWarning5Shown` | `boolean` | 866 | N | Oui (timer) |
| 18 | `beefWarning1Shown` | `boolean` | 867 | N | Oui (timer) |
| 19 | `beefEndsAtMsRef` | `number \| null` | 871 | N, O, AE | Oui (timer) |
| 20 | `beefWallClockStartedAtRef` | `number \| null` | 872 | N, O | Oui (timer) |
| 21 | `beefTimeRemainingRef` | `number` | 873 | N, AF, AE | Oui (timer) |
| 22 | `timerActiveRef` | `boolean` | 874 | N, AF | Oui (timer) |
| 23 | `timerPausedRef` | `boolean` | 875 | N, AF | Oui (timer) |
| 24 | `isHostRef` | `boolean` | 876 | N, AF | Oui (timer) |
| 25 | `endBeefRef` | `() => Promise<void>` | 890 | N (tick → auto-end) | Oui (end-of-beef) |
| 26 | `leaveRef` | `() => Promise<void>` | 892 | O, AE, AD | Oui (daily/leave) |
| 27 | `stopAllMediaTracksRef` | `() => void` | 893 | O, R | Oui (daily) |
| 28 | `arenaOutboundRef` | `Partial<UseArenaRealtimeResult>` | 896 | Y, AB, AC, O, P, AF, K | Oui (realtime bus) |
| 29 | `beefGlobalTimerFlushRef` | `(() => void) \| null` | 897 | N, AF | Oui (timer) |
| 30 | `messageSendChainRef` | `Promise<void>` | 903 | AC | Oui (chat) |
| 31 | `auraFeverRef` | `boolean` | 1243 | Q | Oui (aura) |
| 32 | `pulseBroadcastPending` | `{ A; B }` | 937 | D | Oui (pulse) |
| 33 | `pulseBroadcastTimerRef` | `ReturnType<typeof setTimeout> \| null` | 939 | D | Oui (pulse) |
| 34 | `lastPulseSideRef` | `ChallengerSlotId \| null` | 941 | D, AG | Oui (pulse) |
| 35 | `supportBurstRef` | `AuraBatchPayload` | 943 | O | Oui (aura) |
| 36 | `rematchVerdictTimerRef` | `number \| null` | 950 | P | Oui (verdict) |
| 37 | `rematchExitTimerRef` | `number \| null` | 951 | AG | Non (usage ponctuel) |
| 38 | `longPressTimerRef` | `ReturnType<typeof setTimeout> \| null` | 426 | Aucun usage actif | Oui (supprimer) |
| 39 | `profileCache` | `Record<string, UserProfile>` | 1842 | AA | Oui (profil) |
| 40 | `leftPanelRef` | `CallParticipant \| null` | 1767 | Aucun lecteur actif | Oui (supprimer) |
| 41 | `rightPanelRef` | `CallParticipant \| null` | 1768 | Aucun lecteur actif | Oui (supprimer) |
| 42 | `prevViewerCountRef` | `number` | 2986 | AF | Oui (presence) |
| 43 | `joinAttemptedRef` | `boolean` | 1523 | T | Oui (pre-join) |
| 44 | `speakingTurnPausedRef` | `boolean` | 2192 | Y | Oui (speaking turn) |

**Total : 44 `useRef`** (dont **3 dead refs** identifiées : `longPressTimerRef`, `leftPanelRef`, `rightPanelRef`).

---

## 4. Inventaire des `useCallback` et fonctions

| # | Nom | Ligne | States/refs lus ou modifiés | Candidat hook custom |
|---|---|---|---|---|
| 1 | `runBeefManage` | 250 | `supabase`, `toast` | Oui → `useBeefManage` |
| 2 | `requireAuth` | 274 | `userId`, `setAuthHook` | Oui → `useAuthGate` |
| 3 | `measureDockPickerPosition` | 485 | `showAllReactions`, `showGiftPicker`, DOM | Oui → `useDockPicker` |
| 4 | `fetchPendingInvites` | 577 | `isHost`, `roomId`, `supabase` → `setHandsRaised`, `setRefInvites` | Oui → `usePendingInvites` |
| 5 | `handleAcceptPendingInvite` | 620 | `runBeefManage`, `roomId`, `toast` | Oui → `usePendingInvites` |
| 6 | `handleRejectPendingInvite` | 635 | `runBeefManage`, `roomId` | Oui → `usePendingInvites` |
| 7 | `addRemoteMessage` | 666 | `seenMsgKeys`, `addMessage`, `setGlobalHeat` | Oui → `useArenaChat` |
| 8 | `addRemoteReaction` | 695 | `statsRef`, `setSupportBurst`, `addReaction` | Oui → `useArenaReactions` |
| 9 | `emitTapSupport` | 738 | `requireAuth`, `setGlobalHeat`, `setSupportBurst`, `setAuras`, `setAuraMed`, `auraBufferRef` | Oui → `useAuraEngine` |
| 10 | `goBuyPoints` | 763 | Aucun state | Oui → utilitaire pur |
| 11 | `loadParticipants` | 780 | `supabase`, `roomId`, `userId` → `setParticipantRoles`, `setParticipantUidOrder` | Oui → `useParticipantRoles` |
| 12 | `adjustBeefTime` | 1020 | `setBeefTimeRemaining`, `beefTimeRemainingRef`, `beefEndsAtMsRef`, timer refs | Oui → `useBeefTimer` |
| 13 | `resetBeefTimerToFull` | 1035 | Même que ci-dessus | Oui → `useBeefTimer` |
| 14 | `pauseBeefTimer` | 1047 | Timer refs et states | Oui → `useBeefTimer` |
| 15 | `resumeBeefTimer` | 1058 | Timer refs et states | Oui → `useBeefTimer` |
| 16 | `handleStartBeef` | 1067 | `startingBeef`, `runBeefManage`, timer states/refs | Oui → `useBeefTimer` |
| 17 | `endBeef` | 1104 | `beefEndedRef`, `statsRef`, `supportBurstRef`, `runBeefManage`, `arenaOutboundRef`, `leaveRef` | Oui → `useBeefLifecycle` |
| 18 | `handleMediatorVerdict` | 1172 | `isHost`, `endBeef`, `arenaOutboundRef`, `arenaVerdictStore` | Oui → `useBeefVerdict` |
| 19 | `scheduleBeefGlobalTimerBroadcast` | 898 | `beefGlobalTimerFlushRef` | Oui → `useBeefTimer` |
| 20 | `preferSide` | 954 | `setMyVote`, `lastPulseSideRef` | Oui → `usePulseVoices` |
| 21 | `flushPulseBroadcast` | 961 | `pulseBroadcastPending`, `arenaOutboundRef` | Oui → `usePulseVoices` |
| 22 | `queuePulseBroadcast` | 972 | `pulseBroadcastPending`, `pulseBroadcastTimerRef` | Oui → `usePulseVoices` |
| 23 | `handlePulseVoice` | 982 | `lastPulseSideRef`, `addPulseVoices`, `queuePulseBroadcast` | Oui → `usePulseVoices` |
| 24 | `handleLeaveAsMediator` | 1302 | `isHost`, `endBeef` | Non (usage ponctuel, mort ?) |
| 25 | `stopAllMediaTracks` | 1340 | `preJoinMediaStreamRef`, `localParticipant`, `physicalPeers`, `stopCamera` | Oui → `useDailyCall` |
| 26 | `getSlotForUser` | 1615 | `expectedUids`, `challengerRemoteSlots` | Oui → `useParticipantRoles` |
| 27 | `handleMediatorChallengerMute` | 1812 | `hardMuteParticipant`, `setDebaters`, `arenaOutboundRef`, `speakingTurnTargetRef` | Oui → `useSpeakingTurn` |
| 28 | `handleMuteAll` | 1830 | `remoteParticipants`, `hardMuteParticipant`, `toast` | Oui → `useSpeakingTurn` |
| 29 | `startHotMicTurn` | 2026 | `speakingTurnActive`, `challengerRemoteSlots`, `hardMuteParticipant`, speaking turn states | Oui → `useSpeakingTurn` |
| 30 | `stopTimer` | 2091 | Speaking turn states/refs, `hardMuteParticipant`, `arenaOutboundRef` | Oui → `useSpeakingTurn` |
| 31 | `pauseSpeakingTurn` | 2120 | `speakingTurnActive`, `hotMicSpeakerSlot`, `challengerRemoteSlots`, `hardMuteParticipant` | Oui → `useSpeakingTurn` |
| 32 | `resumeSpeakingTurn` | 2149 | Idem | Oui → `useSpeakingTurn` |
| 33 | `restartSpeakingTurn` | 2178 | `hotMicSpeakerSlot`, `speakingTurnDuration`, `stopTimer`, `startHotMicTurn` | Oui → `useSpeakingTurn` |
| 34 | `clearAnnouncementBanner` | 2504 | `announcementClearTimerRef`, `setAnnouncementTicker`, `arenaOutboundRef` | Oui → `useAnnouncementBanner` |
| 35 | `publishAnnouncementBanner` | 2515 | Idem | Oui → `useAnnouncementBanner` |
| 36 | `handleLeave` | 2680 | `stopAllMediaTracks`, `leaveRef`, `router`, `isHost`, `endBeef` | Non (orchestrateur) |
| 37 | `confirmHostLeave` | 2707 | `endBeef` | Non (thin wrapper) |
| 38 | `handleVsComplete` | 2731 | `setShowVsScreen`, `setShowPreJoin`, `isViewer` | Non (usage ponctuel) |
| 39 | `unlockArenaPlayback` | 3029 | DOM | Non (utilitaire pur) |

### Fonctions non-useCallback notables

| Nom | Ligne | Type | Candidat extraction |
|---|---|---|---|
| `getAuraBoost` | 736 | Fonction inline → retourne 15 | Oui (constante) |
| `formatBeefTime` | 1236 | Fonction inline | Oui → utilitaire pur |
| `handleReaction` | 1866 | Fonction inline (handler) | Oui → `useArenaReactions` |
| `toggleMediatorFloor` | 1971 | Fonction inline | Oui → `useSpeakingTurn` |
| `runTossForFirstSpeaker` | 1980 | Fonction inline | Oui → `useSpeakingTurn` |
| `startTimer` | 1990 | Fonction inline (non-useCallback) | Oui → `useSpeakingTurn` |
| `toggleMute` | 2273 | Fonction inline | Oui → `useSpeakingTurn` |
| `acceptRequest` | 2284 | Fonction inline | Oui → `useParticipationRequests` |
| `rejectRequest` | 2296 | Fonction inline | Oui → `useParticipationRequests` |
| `removeDebater` | 2300 | Fonction inline | Oui → `useSpeakingTurn` |
| `inviteDebater` | 2304 | Fonction async inline | Oui → `useDebaterInvites` |
| `handleInviteFromModal` | 2344 | Fonction async inline | Oui → `useDebaterInvites` |
| `openProfile` | 2371 | Fonction async inline | Oui → `useArenaProfile` |
| `toggleFollowProfileTarget` | 2486 | Fonction async inline | Oui → `useArenaProfile` |
| `handleSendMessage` | 2549 | Fonction inline (handler) | Oui → `useArenaChat` |
| `isUuid` | 2635 | Utilitaire inline | Oui → `lib/` utilitaire |
| `handleDeleteMessage` | 2638 | Fonction async inline | Oui → `useArenaChat` |
| `handleJoin` | 2662 | Fonction inline (handler) | Oui → `usePreJoin` |
| `getMediatorDynamicColor` | 2715 | Fonction inline | Oui → utilitaire pur |

**Total : 39 `useCallback` + 19 fonctions inline notables = 58 fonctions.**

---

## 5. Inventaire des `useEffect` et `useLayoutEffect`

| # | Ligne | Description | Candidat extraction |
|---|---|---|---|
| 1 | 286 | `hasJoined → setShowPreJoin(false)` | usePreJoin |
| 2 | 294 | Sync `preJoinMediaStreamRef` | usePreJoin |
| 3 | 313 | Fetch `beef_invitations` (spectateur) | useRefInvite |
| 4 | 378 | Sync `speakingTurnTargetRef` | useSpeakingTurn |
| 5 | 415 | Network offline/online listeners | useNetworkStatus |
| 6 | 429 | Unread DMs Supabase channel | useUnreadDMs |
| 7 | 477 | Sync `auraSnapshotRef` | useAuraEngine |
| 8 | 481 | `setDockPickersMounted(true)` | useDockPicker |
| 9 | 502 | **useLayoutEffect** — measure dock position | useDockPicker |
| 10 | 508 | Resize listeners dock picker | useDockPicker |
| 11 | 521 | Pointerdown outside → close pickers | useDockPicker |
| 12 | 535 | Escape key → close pickers | useDockPicker |
| 13 | 547 | `mediatorSidebarOpen → close pickers` | Non (cross-cutting) |
| 14 | 555 | Click outside mediator sidebar | Non (cross-cutting) |
| 15 | 568 | Auto-clear `gloryChallengerSlot` (15 s) | Non (ponctuel) |
| 16 | 758 | Fetch pending invites on sidebar open | usePendingInvites |
| 17 | 776 | `participantRoles → setRolesLoaded` | useParticipantRoles |
| 18 | 850 | `loadParticipants()` trigger | useParticipantRoles |
| 19 | 877 | Sync `isHostRef` | useBeefTimer |
| 20 | 880 | Sync `timerActiveRef` | useBeefTimer |
| 21 | 883 | Sync `timerPausedRef` | useBeefTimer |
| 22 | 886 | Sync `beefTimeRemainingRef` | useBeefTimer |
| 23 | 906 | **Tick chrono principal** (setInterval 1 s) | useBeefTimer |
| 24 | 944 | Sync `supportBurstRef` | useAuraEngine |
| 25 | 991 | Reset pulse voices on `roomId` change | usePulseVoices |
| 26 | 1009 | Cleanup pulseBroadcast timer | usePulseVoices |
| 27 | 1204 | `beefEnded → cleanup rematch` | useBeefVerdict |
| 28 | 1214 | Cleanup `rematchVerdictTimerRef` | useBeefVerdict |
| 29 | 1221 | Sync `endBeefRef` | useBeefLifecycle |
| 30 | 1222 | Sync `statsRef` (beefTimeRemaining, messagesCount) | useBeefLifecycle |
| 31 | 1230 | Subscribe `arenaVolatileStore` → messagesCount | useBeefLifecycle |
| 32 | 1244 | Sync `auraFeverRef` | useAuraEngine |
| 33 | 1246 | **Aura decay** (setInterval 500 ms) | useAuraEngine |
| 34 | 1263 | **Global heat decay** (setInterval 1 s) | useAuraEngine |
| 35 | 1271 | **Auto-fever mediator** (setTimeout 15 s) | useAuraEngine |
| 36 | 1297 | Reset `challengersEverJoinedRef` on `roomId` | useAutoEnd |
| 37 | 1308 | Wallet init | Non (1 ligne) |
| 38 | 1373 | Sync `stopAllMediaTracksRef` | useDailyCall (interne) |
| 39 | 1377 | Cleanup `stopAllMediaTracks` on unmount | useDailyCall (interne) |
| 40 | 1421 | Sync `leaveRef` | Non (technique) |
| 41 | 1431 | Track mediator connected (remote) | useAutoEnd |
| 42 | 1442 | Track host is joined | useAutoEnd |
| 43 | 1448 | Track challenger joined (reconciliation) | useAutoEnd |
| 44 | 1465 | **Auto-end detection** (médiateur absent / challengers partis) | useAutoEnd |
| 45 | 1525 | **Auto-join Daily** | usePreJoin |
| 46 | 1687 | Gift target default fallback | Non (ponctuel) |
| 47 | 1844 | Sync `debaters` from `participantRoles` | useSpeakingTurn |
| 48 | 1859 | Clear messages/reactions on `roomId` change | useArenaChat |
| 49 | 1952 | Debate title animation (show 5 s / 60 s) | Non (dead — `showDebateTitle` jamais lu) |
| 50 | 2188 | Sync `stopTimerRef` | useSpeakingTurn |
| 51 | 2193 | Sync `speakingTurnPausedRef` | useSpeakingTurn |
| 52 | 2198 | **Speaking turn countdown** (setInterval 1 s) | useSpeakingTurn |
| 53 | 2234 | **Micro challengers logic** (mute auto) | useSpeakingTurn |
| 54 | 2539 | Cleanup `announcementClearTimerRef` | useAnnouncementBanner |
| 55 | 2650 | Context menu auto-close | useArenaChat |
| 56 | 2987 | Viewer count → global heat | useAuraEngine |
| 57 | 2995 | Sync `statsRef.liveViewerCount` | useBeefLifecycle |
| 58 | 3002 | Global timer broadcast (setInterval 10 s) | useBeefTimer |
| 59 | 3009 | Aura buffer flush (setInterval 1.5 s) | useAuraEngine |
| 60 | 3020 | Aura master sync (setInterval 3 s) | useAuraEngine |

**Total : 59 `useEffect` + 1 `useLayoutEffect` = 60 effets.**

---

## 6. Sous-composants internes

### Composants définis dans le même fichier

| Nom | Lignes | Props implicites (closures) | Complexité d'extraction |
|---|---|---|---|
| `IngotIcon` | 100–124 | Aucune (composant pur) | **Triviale** — déplacer tel quel |
| `ArenaFlyingReactions` | 4291–4315 | Aucune (Zustand direct) | **Triviale** — déplacer tel quel |

### Blocs JSX inliné massifs (pseudo-composants)

| Description | Lignes | Props implicites (closures sur le scope) | Complexité d'extraction |
|---|---|---|---|
| **Écran VS overlay** | 3058–3078 | `showVsScreen`, `rolesLoaded`, `expectedUids`, `participantRoles`, `debateTitle`, `handleVsComplete` | Faible (déjà délégué à `<VsTransition>`) |
| **Écran Pre-join overlay** | 3080–3096 | `showVsScreen`, `hasJoined`, `showPreJoin`, `effectiveDailyRoomUrl`, `handleJoin`, `isViewer`, `mediatorName`, `userName` | Faible |
| **Bandeau annonce desktop** | 3098–3113 | `isCinematicMode`, `arenaHasAnnouncement`, `announcementTicker` | Faible |
| **Bouton quitter cinématique** | 3115–3131 | `isCinematicMode`, `setIsCinematicMode` | Triviale |
| **Overlay leaving** | 3133–3141 | `isLeaving`, `beefEnded` | Triviale |
| **Verdict overlays** | 3143–3154 | `verdictConfetti`, `rematchSequence`, `beefEnded`, `router`, `roomId` | Faible (déjà délégué) |
| **End summary modal** | 3155–3261 | `beefEnded`, `endSummary`, `router`, `roomId`, `endSummaryTimerRef` | Moyenne (JSX dense, closures multiples) |
| **Reconnection overlay** | 3263–3274 | `isOffline`, `beefEnded` | Triviale |
| **Aside chat desktop** | 3276–3381 | `isCinematicMode`, `showArenaMenu`, `liveBadgeHot`, `actualViewerCount`, `chatInput`, `showAllReactions`, `showGiftPicker`, `handleSendMessage`, `handleRaiseHand`, `walletBalance`, `goBuyPoints`, `unreadDMsCount`, `router`, etc. | **Élevée** — 20+ closures |
| **Chat overlay mobile** | 3482–3519 | Même closures que desktop | **Élevée** |
| **Ticker mobile** | 3386–3398 | `isCinematicMode`, `arenaHasAnnouncement`, `announcementTicker` | Faible |
| **HUD indicateurs système** | 3400–3431 | `isCinematicMode`, `arenaHasAnnouncement`, `liveBadgeHot`, `actualViewerCount`, `showArenaMenu`, `beefEnded`, `isLeaving` | Moyenne |
| **ArenaLayoutManager** | 3433–3480 | 30+ props passées explicitement | Déjà extrait (composant enfant) |
| **Réactions volantes** | 3521–3524 | Aucune (composant enfant) | Déjà extrait |
| **MediatorSidebar** | 3527–3594 | 30+ props passées + callbacks inline (`onEjectParticipant`) | Déjà extrait (composant enfant) |
| **Portail dock (reactions + gifts)** | 3596–3793 | `dockPickersMounted`, `dockPickerPos`, `showAllReactions`, `showGiftPicker`, `handleReaction`, `PICKER_REACTIONS`, `giftRecipients`, `giftTarget`, `GIFT_CATALOG`, `walletBalance`, `optimisticDebit`, gift logic | **Très élevée** — handler gift inline 70+ lignes |
| **Profil utilisateur modal** | 3795–3937 | `showProfile`, `selectedProfile`, `profileFollowsTarget`, `toggleFollowProfileTarget`, `router`, `openDrawer`, `setReportTargetUser`, `setShowReportModal` | **Élevée** |
| **Modal invitation acceptée** | 3939–3988 | `acceptedInviteAlert`, `beefEnded`, `roomId` | Faible |
| **Modal invitation Ref** | 3991–4075 | `refInviteAlert`, `beefEnded`, `roomId`, `userId`, `supabase` | Moyenne (async inline) |
| **ViewerListModal** | 4077–4088 | Déjà extrait | Triviale |
| **ReportBlockModal** | 4090–4099 | Déjà extrait | Triviale |
| **Menu mobile drawer** | 4101–4189 | `showArenaMenu`, `walletBalance`, `goBuyPoints`, `isCinematicMode`, `openDrawer`, `unreadDMsCount`, `onShare`, `router`, `handleLeave` | Élevée |
| **Auth hook modal** | 4191–4248 | `authHook`, `router` | Faible |
| **Style JSX global** | 4250–4268 | Aucune | Triviale |
| **ConfirmModal leave** | 4277–4284 | `showLeaveConfirm`, `confirmHostLeave` | Déjà extrait |

---

## 7. Blocs CSS / Style injectés

### `<style jsx global>` (lignes 4250–4268)

```css
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

@keyframes marquee-continuous {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-marquee-continuous { animation: marquee-continuous 20s linear infinite; }
.animate-marquee-continuous-fast { animation: marquee-continuous 8s linear infinite; }
```

### Classes CSS inline massives

Les classes Tailwind sont omniprésentes mais certaines chaînes sont excessivement longues (200+ caractères) et dupliquées entre mobile et desktop :

| Pattern dupliqué | Occurrences | Lignes |
|---|---|---|
| Chat input styling (rounded-full, shadow, focus:ring) | 2 | 3364, 3503 |
| Bouton emoji 😀 (shadow, transition) | 2 | 3365, 3504 |
| Bouton cadeau Gift (gradient pink→orange) | 2 | 3366–3376, 3505–3515 |
| Bouton Send (disabled:opacity) | 2 | 3377, 3516 |
| Bouton ✋ raise hand | 2 | 3352–3363, 3491–3501 |
| Badge LIVE (animate-pulse, rose-600) | 3 | 3282–3285, 3404–3407, AG |
| Monétisation solde + bouton Recharger | 2 | 3295–3305, 4128–4139 |
| Grille d'actions (Ciné, Messages, Partager, Profil) | 2 | 3309–3326, 4143–4168 |
| Actions secondaires (Feed, Paramètres) | 2 | 3329–3335, 4172–4178 |
| Bouton « Quitter le Direct » | 2 | 3339–3343, 4182–4184 |

### Migration recommandée

1. **`.hide-scrollbar`** → `globals.css` (utilitaire global, déjà applicable partout).
2. **`@keyframes marquee-continuous`** → `globals.css` + classes Tailwind personnalisées dans `tailwind.config.ts` (`extend.animation` / `extend.keyframes`).
3. **Classes dupliquées desktop/mobile** → Extraire dans des composants `ChatDock`, `ArenaMenuGrid`, `ArenaBadgeLive` pour mutualiser les classes.

---

## 8. Métriques de complexité

| Métrique | Valeur |
|---|---|
| **Nombre total de `useState`** | **71** (dont 5 dead states) |
| **Nombre total de `useRef`** | **44** (dont 3 dead refs) |
| **Nombre total de `useCallback`** | **39** |
| **Nombre total de fonctions inline** | **19** |
| **Nombre total de `useEffect`** | **59** |
| **Nombre total de `useLayoutEffect`** | **1** |
| **Nombre total de `useMemo`** | **16** |
| **Nombre total d'effets (useEffect + useLayoutEffect)** | **60** |
| **Nombre de sous-composants internes** | **2** (IngotIcon, ArenaFlyingReactions) |
| **Nombre de blocs JSX inliné massifs** | **~24** identifiés |
| **Profondeur JSX maximale estimée** | **~12 niveaux** (portail gift → AnimatePresence → motion.div → div grid → button → img) |
| **Lignes de logique (hooks, handlers, states)** | **~2 813** (lignes 225–3038) |
| **Lignes de JSX (return)** | **~1 247** (lignes 3039–4285) |
| **Lignes d'imports / interfaces / constantes** | **~224** (lignes 1–224) |
| **Lignes sous-composants hors TikTokStyleArena** | **~32** (4289–4316 + 100–124) |
| **Ratio logique/JSX** | **69% / 31%** |

---

## 9. Plan de découpage proposé

### Architecture cible

```
components/Arena/
├── ArenaView.tsx                    ← Composant orchestrateur (ex-TikTokStyleArena, ~400 lignes)
├── ArenaLayoutManager.tsx           ← Existant, inchangé
├── ArenaEndSummary.tsx              ← Modal fin de beef
├── ArenaChatDock.tsx                ← Barre input + boutons (desktop & mobile mutualisés)
├── ArenaMenuDesktop.tsx             ← Menu hamburger desktop
├── ArenaMenuMobile.tsx              ← Drawer mobile
├── ArenaProfileModal.tsx            ← Modal profil inline
├── ArenaInviteAlerts.tsx            ← Modales invitation (accepted + ref invite)
├── ArenaReactionPickerPortal.tsx    ← Portail réactions + cadeaux
├── ArenaGiftPicker.tsx              ← Grille cadeaux (logique achat incluse)
├── ArenaAuthHookModal.tsx           ← Modal de conversion auth
├── ArenaAnnouncementTicker.tsx      ← Bandeau ticker (desktop + mobile)
├── ArenaCinematicOverlay.tsx        ← Bouton quitter ciné + overlays
├── ArenaSystemHud.tsx               ← HUD Live badge + viewers + menu toggle
├── FullscreenGiftAnimation.tsx      ← Existant, inchangé
├── MediatorSidebar.tsx              ← Existant, inchangé
├── VsTransition.tsx                 ← Existant, inchangé
├── PreJoinScreen.tsx                ← Existant, inchangé
├── VerdictEffects.tsx               ← Existant, inchangé
└── shared/
    └── IngotIcon.tsx                ← Icône SVG lingot

hooks/
├── useBeefTimer.ts                  ← Chrono global (8 useState, 7 useRef, 6 useCallback, 3 useEffect)
├── useBeefLifecycle.ts              ← endBeef, stats, roomId lifecycle
├── useBeefVerdict.ts                ← Verdict médiateur (confetti, rematch, endBeef)
├── useAuraEngine.ts                 ← Auras, auraMed, globalHeat, decay, fever, buffer, masterSync
├── useSpeakingTurn.ts               ← Tour de parole, floor, structured debate, mute
├── useArenaChat.ts                  ← chatInput, sendMessage, deleteMessage, seenMsgKeys
├── useArenaReactions.ts             ← handleReaction, addRemoteReaction, flying reactions
├── useArenaProfile.ts               ← openProfile, toggleFollow, profileCache
├── usePulseVoices.ts                ← Pulse broadcast, preferSide, myVote
├── useParticipantRoles.ts           ← loadParticipants, expectedUids, roles, getSlotForUser
├── usePendingInvites.ts             ← fetchPendingInvites, accept, reject
├── useDebaterInvites.ts             ← inviteDebater, handleInviteFromModal
├── usePreJoin.ts                    ← hasJoined, showPreJoin, showVsScreen, preJoinMediaStream, autoJoin
├── useAutoEnd.ts                    ← Détection médiateur absent, challengers partis, grace period
├── useAnnouncementBanner.ts         ← publishAnnouncement, clearAnnouncement, ticker state
├── useDockPicker.ts                 ← Position dock, mount, listeners resize/close
├── useAuthGate.ts                   ← requireAuth, authHook modal state
├── useNetworkStatus.ts              ← isOffline, listeners offline/online
├── useUnreadDMs.ts                  ← Supabase channel, unreadDMsCount
└── useBeefManage.ts                 ← Wrapper postBeefManage + auth session

lib/
├── format-beef-time.ts              ← formatBeefTime
├── getMediatorDynamicColor.ts       ← Calcul couleur dynamique aura
└── goBuyPoints.ts                   ← Ouvrir popup achat
```

### Détail par fichier cible

#### `hooks/useBeefTimer.ts`
- **States migrés :** `beefTimeRemaining`, `timerActive`, `timerPaused`, `startingBeef`
- **Refs migrés :** `beefEndsAtMsRef`, `beefWallClockStartedAtRef`, `beefTimeRemainingRef`, `timerActiveRef`, `timerPausedRef`, `isHostRef`, `beefWarning5Shown`, `beefWarning1Shown`, `beefGlobalTimerFlushRef`
- **Callbacks migrés :** `adjustBeefTime`, `resetBeefTimerToFull`, `pauseBeefTimer`, `resumeBeefTimer`, `handleStartBeef`, `scheduleBeefGlobalTimerBroadcast`, `formatBeefTime`
- **Effects migrés :** Tick chrono (906), sync refs (877–886), broadcast interval (3002)
- **Props reçues :** `roomId`, `isHost`, `toast`, `runBeefManage`, `broadcastFn`
- **API retournée :** `{ beefTimeRemaining, timerActive, timerPaused, startingBeef, adjustBeefTime, resetBeefTimerToFull, pauseBeefTimer, resumeBeefTimer, handleStartBeef, formatBeefTime, beefEndsAtMsRef, ... }`

#### `hooks/useAuraEngine.ts`
- **States migrés :** `auras`, `auraMed`, `auraFeverMed`, `globalHeat`, `supportBurst`
- **Refs migrés :** `auraBufferRef`, `auraSnapshotRef`, `auraFeverRef`, `supportBurstRef`
- **Callbacks migrés :** `emitTapSupport`, `getAuraBoost` (constante)
- **Effects migrés :** Aura decay (1246), heat decay (1263), auto-fever (1271), snapshot sync (477), buffer flush (3009), master sync (3020), viewer heat (2987)
- **Props reçues :** `isHost`, `requireAuth`, `broadcastAuraBatch`, `broadcastAuraMasterSync`, `beefEnded`, `liveConnected`

#### `hooks/useSpeakingTurn.ts`
- **States migrés :** `speakingTurnActive`, `speakingTurnTarget`, `speakingTurnRemaining`, `speakingTurnPaused`, `speakingTurnDuration`, `floorAnnouncement`, `structuredDebateEnabled`, `debateBudgetMinutes`, `challengerBudgetRemaining`, `mediatorHoldingFloor`, `micMutedByMediator`, `currentSpeaker`, `timerRunning`, `debaters`
- **Refs migrés :** `speakingTurnTargetRef`, `speakingTurnIntervalRef`, `stopTimerRef`, `speakingTurnPausedRef`
- **Callbacks migrés :** `startHotMicTurn`, `stopTimer`, `pauseSpeakingTurn`, `resumeSpeakingTurn`, `restartSpeakingTurn`, `toggleMediatorFloor`, `handleMediatorChallengerMute`, `handleMuteAll`, `startTimer`, `toggleMute`, `runTossForFirstSpeaker`
- **Props reçues :** `isHost`, `isViewer`, `isJoined`, `userId`, `challengerRemoteSlots`, `hardMuteParticipant`, `arenaOutboundRef`, `toast`, `setLocalAudioEnabled`, `localParticipant`

#### `hooks/useArenaChat.ts`
- **States migrés :** `chatInput`, `contextMenuMsg`
- **Refs migrés :** `seenMsgKeys`, `messageSendChainRef`
- **Callbacks migrés :** `addRemoteMessage`, `handleSendMessage`, `handleDeleteMessage`
- **Props reçues :** `roomId`, `userId`, `userName`, `requireAuth`, `addMessage`, `deleteMessage`, `arenaOutboundRef`, `toast`, `supabase`

#### `hooks/useParticipantRoles.ts`
- **States migrés :** `participantRoles`, `participantUidOrder`, `rolesLoaded`
- **Callbacks migrés :** `loadParticipants`, `getSlotForUser`
- **Memos migrés :** `expectedUids`, `reconcileExpected`, `reconciledPeers`, `challengerRemoteSlots`, `hostRemoteParticipant`, `hasExpectedChallengers`, `expectedChallengers`, `mediatorRemoteRows`

#### `hooks/usePreJoin.ts`
- **States migrés :** `hasJoined`, `showPreJoin`, `showVsScreen`, `preJoinMediaStream`, `preJoinCamEnabled`
- **Refs migrés :** `preJoinMediaStreamRef`, `joinAttemptedRef`
- **Callbacks migrés :** `handleJoin`, `handleVsComplete`
- **Effects migrés :** Auto-join Daily (1525), sync preJoinMediaStreamRef (294), hasJoined toggle (286)

#### `hooks/useAutoEnd.ts`
- **States migrés :** `mediatorGraceActive`, `mediatorGraceSeconds`
- **Refs migrés :** `mediatorGraceRef`, `mediatorWasConnectedRef`, `challengersEverJoinedRef`, `challengersAllLeftNotifiedRef`
- **Effects migrés :** Détection médiateur absent (1465), track mediator connected (1431, 1442, 1448), reset on roomId (1297)

### Ordre d'extraction recommandé

| Priorité | Hook / Composant | Risque | Justification |
|---|---|---|---|
| 1 | `IngotIcon` → `components/shared/IngotIcon.tsx` | **Nul** | Composant pur, 0 closure |
| 2 | `ArenaFlyingReactions` → fichier séparé | **Nul** | Composant Zustand, 0 closure |
| 3 | `useNetworkStatus` | **Nul** | 1 state, 1 effect, 0 dépendance |
| 4 | `useUnreadDMs` | **Très faible** | 1 state, 1 effect, dépend de `userId` uniquement |
| 5 | `useAuthGate` | **Très faible** | 1 state + 1 callback, aucune dépendance inter-bloc |
| 6 | `lib/format-beef-time.ts` + `lib/getMediatorDynamicColor.ts` + `lib/goBuyPoints.ts` | **Nul** | Fonctions pures |
| 7 | `useDockPicker` | **Faible** | 3 states, DOM measurement, dépend de `showAllReactions`, `showGiftPicker` |
| 8 | `useAnnouncementBanner` | **Faible** | 1 state, 1 ref, 2 callbacks, dépend de `isHost` + `arenaOutboundRef` |
| 9 | `usePreJoin` | **Faible** | 5 states, 2 refs, dépend de `join()` de Daily |
| 10 | `useArenaChat` | **Moyen** | 2 states, 2 refs, dépend de `addMessage` (store) + `arenaOutboundRef` |
| 11 | `useArenaProfile` | **Moyen** | 3 states, 1 ref (cache), 3 callbacks, requêtes Supabase |
| 12 | `usePulseVoices` | **Moyen** | 2 states, 4 refs, dépend de `arenaOutboundRef` + `arenaPulseVoicesStore` |
| 13 | `usePendingInvites` + `useDebaterInvites` | **Moyen** | Dépend de `runBeefManage` + `participantRoles` |
| 14 | `useBeefManage` | **Faible** | 1 callback, dépend de `supabase` + `toast` |
| 15 | `useParticipantRoles` | **Élevé** | Noyau identitaire, 3 states, 10+ memos, lu par quasi tous les blocs |
| 16 | `useAuraEngine` | **Élevé** | 5 states, 5 refs, 7+ effects, interactions avec store + broadcast |
| 17 | `useBeefTimer` | **Élevé** | 4 states, 9 refs, 7 callbacks, chrono critique |
| 18 | `useSpeakingTurn` | **Très élevé** | 14 states, 4 refs, 11 callbacks, couplage fort avec Daily + arenaOutbound |
| 19 | `useAutoEnd` | **Élevé** | Dépend de `remoteParticipants`, `isHost`, `endBeef` |
| 20 | `useBeefLifecycle` (endBeef + verdict) | **Très élevé** | Orchestrateur final, dépend de timer, stats, media, arenaOutbound, router |
| 21 | Composants JSX (modales, menus, dock) | **Moyen** | Extraction post-hooks (les closures sont résolues) |
| 22 | `ArenaView.tsx` (orchestrateur) | **Dernière étape** | Câble les hooks + passe les props aux composants extraits |

### Risques identifiés par extraction

| Risque | Description | Mitigation |
|---|---|---|
| **Closure circulaire** | `endBeef` lit `statsRef`, `supportBurstRef` qui sont dans d'autres hooks → refs doivent être partagées | Passer les refs en paramètres ou utiliser un context dédié `ArenaSessionContext` |
| **arenaOutboundRef transversal** | Utilisé par 12+ callbacks dans 8+ blocs → ne peut pas être scoped à un seul hook | Conserver comme ref unique dans l'orchestrateur, passée à chaque hook |
| **Ordering des hooks** | `useSpeakingTurn` dépend de `challengerRemoteSlots` (qui vient de `useParticipantRoles`) et de `hardMuteParticipant` (qui vient de `useDailyCall`) | Respecter l'ordre d'appel : Roles → Daily → SpeakingTurn |
| **arenaRealtimeCallbacks** | L'objet callbacks (lignes 2750–2934) lit et modifie des states de 8+ systèmes → ne peut pas être découpé sans contexte | Transformer en dispatch centralisé ou garder comme objet assemblé dans l'orchestrateur |
| **Stale closures** | 9+ refs « sync » (`timerActiveRef`, `beefTimeRemainingRef`, etc.) existent pour éviter des closures stale dans les setInterval → doivent migrer avec leur state | Garder chaque paire state/ref dans le même hook |
| **Dead code** | 5 states + 3 refs + 1 effect ne sont jamais lus → supprimer avant extraction | Nettoyage préalable (phase 0) |

---

## 10. Résumé exécutif

Le composant `TikTokStyleArena` est un **monolithe de 4 316 lignes** concentrant :
- **71 useState**, **44 useRef**, **39 useCallback**, **60 effects**, **16 memos**, **58 fonctions** au total
- **~10 systèmes fonctionnels** fortement couplés (timer, aura, speaking turn, chat, realtime, daily, profil, invitations, verdict, pre-join)
- **5 dead states** et **3 dead refs** à supprimer immédiatement
- Un ratio logique/JSX de **69/31%**, indiquant que la logique métier domine et doit être extraite en hooks

Le couplage principal passe par `arenaOutboundRef` (bus de broadcast) et l'objet `arenaRealtimeCallbacks` (185 lignes) qui touche quasi tous les systèmes.

**Recommandation :** Procéder en 3 phases :
1. **Phase 0 (nettoyage)** — Supprimer les dead states/refs/effects (1 h)
2. **Phase 1 (hooks indépendants)** — Extraire les 10 premiers hooks (priorités 1–14) qui n'ont pas de dépendance inter-systèmes (4 h)
3. **Phase 2 (hooks couplés + composants)** — Extraire les hooks critiques (timer, aura, speaking turn, lifecycle) puis les composants JSX (8 h)
