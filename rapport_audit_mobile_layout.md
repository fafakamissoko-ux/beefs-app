# Rapport d'audit — Layout Mobile (Phase J.1)

**Date d'extraction :** 2026-05-31  
**Branche :** `main` (post I.1 — commit `76460d2`)  
**Mission :** Extraction chat + radiographie mobile avant correctifs dépassement horizontal vidéo et explosion verticale chat.  
**Contrainte :** Zéro modification du code source.

---

## Contexte Phase J.1

Bugs cibles :
1. **Vidéo mobile** — dépassement horizontal, boutons micro/caméra hors écran
2. **Chat mobile** — explosion verticale, chevauchement, perte de scroll

---

## 1. Composant Chat — `components/ArenaChatMessages.tsx`

**Points d'intérêt Architecte :**
- Mobile : `max-h-[30vh]`, `min-w-[50%]`, `w-fit max-w-[85%]`
- `scrollIntoView({ behavior: 'smooth' })` sur `[messages]` — peut agrandir le layout parent
- `[content-visibility:auto]` sur bulles
- Pas de `max-h` contraint sur le wrapper interne `mt-auto flex flex-col`

```tsx
'use client';

import { useLayoutEffect, useRef } from 'react';
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';

const getUsernameColor = (username: string) => {
  const colors = [
    'text-cyan-400',
    'text-emerald-400',
    'text-amber-400',
    'text-cyan-400',
    'text-rose-400',
    'text-sky-400',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface ArenaChatMessagesProps {
  isMobile?: boolean;
}

export function ArenaChatMessages({ isMobile }: ArenaChatMessagesProps) {
  const messages = useArenaVolatileStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  const containerClasses = isMobile
    ? 'pointer-events-none w-fit max-w-[85%] min-w-[50%] max-h-[30vh] overflow-y-auto overscroll-contain touch-pan-y px-3 mb-2 flex flex-col hide-scrollbar'
    : 'flex-1 overflow-y-auto pl-2 pr-4 py-2 hide-scrollbar';

  return (
    <div ref={scrollRef} className={containerClasses}>
      <div className="mt-auto flex flex-col justify-end">
        {messages.map((msg) =>
          isMobile ? (
            <div
              key={msg.id}
              className="mb-2 pointer-events-auto w-fit max-w-[70%] leading-tight [content-visibility:auto]"
            >
              <span className={`text-[11px] font-bold mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <span className="text-[13px] text-white font-medium break-all drop-shadow-md [text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]">
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={msg.id} className="mb-3 [content-visibility:auto]">
              <span className={`block mb-1 ml-2 text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <div className="inline-block rounded-2xl rounded-tl-sm bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-3 py-2 text-[13px] leading-snug text-white/90">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="h-px w-full shrink-0" />
      </div>
    </div>
  );
}
```

---

## 2. Radiographie mobile — `components/TikTokStyleArena.tsx`

> Pas de `if (isMobile)` React — le mobile est ciblé via **`lg:hidden`** / breakpoints Tailwind.  
> Route arène : `AppShell` rend `{children}` seul (immersive) — pas de `max-w-md` sur `/arena/[roomId]`.

### 2a. Conteneur racine du return (l.3026–3044)

**Viewport :** `fixed inset-0` — occupe le viewport, pas `100vw/100dvh` explicite.

```tsx
return (
  <div
    onPointerDown={() => {
      unlockArenaPlayback();
    }}
    onClick={(e) => {
      unlockArenaPlayback();
      if (!isCinematicMode) return;
      if ((e.target as Element).closest?.('[data-cinema-stay]')) return;
      setIsCinematicMode(false);
    }}
    onDoubleClick={(e) => {
      if (isCinematicMode) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, textarea, a, aside, [id^="dock-"], [data-cinema-stay]')) return;
      setIsCinematicMode(true);
    }}
    className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-transparent lg:flex-row"
  >
```

### 2b. Zone vidéo + overlay mobile (l.3361–3505)

**Conteneur vidéo :** `relative flex h-full min-w-0 flex-1 flex-col overflow-hidden`

**Split challengers :** délégué à `<ArenaLayoutManager />` (l.3427–3472) — voir annexe 2d.

**Overlay chat mobile :** `absolute inset-x-0 bottom-0 z-[160] lg:hidden` + `pt-32` + `pointer-events-none`

```tsx
      {/* === ZONE 2 : LA VIDÉO (AVEC OVERLAY CHAT MOBILE) === */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent z-10">

        {/* TICKER MOBILE */}
        {!isCinematicMode && arenaHasAnnouncement && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[190] flex h-7 items-center overflow-hidden border-b border-white/10 bg-slate-950/55 backdrop-blur-md lg:hidden">
            {/* ... marquee ... */}
          </div>
        )}

        {/* INDICATEURS SYSTÈME DISCRETS (Haut Droite) */}
        {!isCinematicMode && (
          <div className="pointer-events-none absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[500] flex items-center gap-2 sm:right-4 sm:top-4">
            {/* Live, viewers, DM, share, menu lg:hidden */}
          </div>
        )}

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
            speakingTurnActive={speakingTurnActive}
            effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
            structuredDebateEnabled={structuredDebateEnabled}
            micMutedByMediator={micMutedByMediator}
            mediatorHoldingFloor={mediatorHoldingFloor}
            micEnabled={micEnabled}
            camEnabled={camEnabled}
            onTapSupport={emitTapSupport}
            onPreferSide={preferSide}
            onOpenProfile={openProfile}
            onToggleMic={toggleMic}
            onToggleCam={toggleCam}
            onToast={toast}
            onFlipCamera={!isViewer ? () => void flipCamera() : undefined}
            webrtcNetworkQuality={networkQuality}
            activeSpeakerPeerId={activeSpeakerPeerId}
            mediatorParticipant={mediatorParticipant}
            mediatorIsLocal={mediatorIsLocal}
            mediatorName={mediatorName}
            auraMed={auraMed}
            isWaitingForMediator={isWaitingForMediator}
            isCameraInterrupted={isCameraInterrupted}
            onRecoverMediaDevices={recoverMediaDevices}
            mediatorGraceActive={mediatorGraceActive}
            mediatorGraceSeconds={mediatorGraceSeconds}
            mediatorHostId={host.id}
            isJoined={isJoined}
            timerActive={timerActive}
            timerPaused={timerPaused}
            beefTimeRemaining={beefTimeRemaining}
            formatBeefTime={formatBeefTime}
            onToggleMediatorSidebar={() => setMediatorSidebarOpen((o) => !o)}
            getMediatorDynamicColor={getMediatorDynamicColor}
            localCamEnabled={preJoinCamEnabled}
          />
        )}

        {/* OVERLAY CHAT MOBILE (Intégré à la vidéo, invisible sur PC) */}
        {!isCinematicMode && (
          <div
            data-cinema-stay
            className="absolute inset-x-0 bottom-0 z-[160] lg:hidden flex flex-col justify-end pt-32 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none"
          >
          <ArenaChatMessages isMobile />
          <div id="dock-mobile" className="pointer-events-auto mt-auto flex w-full shrink-0 items-center gap-2 px-3 pb-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full border border-white/[0.05] bg-black/40 px-4 py-2.5 text-[13px] text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder-white/30 focus:bg-black/60 focus:outline-none" />
            <button onClick={() => { setShowGiftPicker(false); setShowAllReactions(!showAllReactions); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-transform active:scale-95 disabled:opacity-30">😀</button>
            <button
              type="button"
              onClick={() => {
                if (requireAuth('Offre un cadeau', 'Crée un compte gratuit pour envoyer des cadeaux épiques et faire briller ton nom !')) return;
                setShowAllReactions(false);
                setShowGiftPicker(!showGiftPicker);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-pink-500/80 to-orange-400/80 shadow-[0_4px_16px_rgba(249,115,22,0.4),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-transform active:scale-95"
            >
              <Gift className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => void handleSendMessage()} disabled={!chatInput.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-transform active:scale-95 disabled:opacity-30"><Send className="h-4 w-4 text-white" /></button>
          </div>
        </div>
        )}

        {/* REACTIONS VOLANTES */}
        <div className="pointer-events-none absolute inset-0 z-[160]">
          <ArenaFlyingReactions />
        </div>
      </div>
```

**Desktop chat (référence) :** sidebar `<aside className="hidden lg:flex ...">` l.~3310 — `<ArenaChatMessages isMobile={false} />` l.3339.

---

## Annexe 2c — Coquille App (`components/AppShell.tsx`)

Route immersive arène : **pas de Header**, children seuls.

```tsx
function isRoomImmersiveRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/arena\/[^/]+/.test(pathname) || /^\/live\/[^/]+/.test(pathname);
}

if (standalone || roomImmersive) {
  return <>{children}</>;
}
```

Feed/autres : `h-[100dvh]` + `max-w-md` sur mobile (non appliqué à l'arène).

---

## Annexe 2d — Split challengers (délégation `ArenaLayoutManager`)

**Shell :** `absolute inset-0 z-0 bg-transparent p-1 sm:p-2`

**Mode 2 challengers (Nexus) :** `grid-cols-2 grid-rows-1` via `getNexusGridClass(2)`

```tsx
// components/Arena/nexus/NexusGrid.tsx
return (
  <div className={`relative h-full w-full grid gap-1 sm:gap-2 ${gridClass}`}>
    {tiles.map((tile, idx) => (
      <ArenaVideoSurface key={tile.id} variant="nexus" ... />
    ))}
  </div>
);
```

**Position chrome 2 tuiles (index 1) :** `top-[3.5rem] right-2 ... flex-row-reverse` — risque collision icônes header Live/DM.

---

## Annexe 2e — Contrôles micro / caméra (`ArenaVideoSurface.tsx`)

Rendu **sur chaque tuile locale** (`tile.isLocal`), position via `tile.uiPosClass` / `nexusChromeClass`.

```tsx
const localControls = tile.isLocal ? (
  <div className={`flex shrink-0 items-center gap-1.5 ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}>
    <button type="button" onClick={...} onToggleMic()} className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 ...">
      <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
    <button type="button" onClick={...} onToggleCam()} className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 ...">
      <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
    {onFlipCamera && (
      <button className="... md:hidden" title="Basculer la caméra">
        <SwitchCamera />
      </button>
    )}
  </div>
) : null;
```

**Note J.1 :** pas de conteneur dédié micro/caméra dans `TikTokStyleArena` — tout passe par `ArenaVideoSurface` + templates `nexusGridTemplates.ts`.

---

## Synthèse des zones à risque (J.1)

| Symptôme | Zone suspecte | Ligne / fichier |
|----------|---------------|-----------------|
| Vidéo déborde horizontal | `NexusGrid` `grid-cols-2` sans `min-w-0` / overflow sur tuiles | `NexusGrid.tsx`, `ArenaVideoSurface` |
| Boutons hors écran | Chrome position `getNexusChromeUiPos` + icônes header `z-[500]` | `nexusGridTemplates.ts`, l.3380 |
| Chat explosion verticale | Overlay `pt-32` + chat `max-h-[30vh]` + `scrollIntoView smooth` | l.3479, `ArenaChatMessages` |
| Perte scroll chat | Parent `pointer-events-none` + enfant `pointer-events-auto` partiel | l.3479–3481 |
| Chevauchement z-index | Chat overlay `z-[160]` = réactions volantes `z-[160]` | l.3479, l.3502 |

---

*Fin du rapport — extraction Phase J.1.*
