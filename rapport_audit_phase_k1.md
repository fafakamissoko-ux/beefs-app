# Rapport d'audit — Phase K.1

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (post J.1 — commit `722279e`)  
**Objectifs K.1 :** Bug scroll Safari mobile (chat), suppression bouton flip caméra, mise à jour icône PWA.  
**Contrainte :** Zéro modification du code source.

---

## 1. Composant Chat — `components/ArenaChatMessages.tsx`

**Cible bug Safari :** classes scroll mobile, `scrollIntoView({ behavior: 'smooth' })`, `overscroll-contain`, `touch-pan-y`, `pointer-events` passthrough.

**Note Architecte :** le conteneur mobile a `max-h-[30vh]` alors que l'overlay parent (`TikTokStyleArena`) impose `max-h-[45dvh]` depuis J.1 — double plafond possible sur Safari.

```tsx
'use client';

import { useLayoutEffect, useRef } from 'react';
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';

const getUsernameColor = (username: string) => {
  const colors = [
    'text-red-400',
    'text-orange-400',
    'text-amber-400',
    'text-yellow-400',
    'text-lime-400',
    'text-green-400',
    'text-emerald-400',
    'text-teal-400',
    'text-cyan-400',
    'text-sky-400',
    'text-blue-400',
    'text-indigo-400',
    'text-violet-400',
    'text-purple-400',
    'text-fuchsia-400',
    'text-rose-400',
  ];
  let hash = 5381;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 33) ^ username.charCodeAt(i);
  }
  return colors[(hash >>> 0) % colors.length];
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

### Classes scroll mobile (inventaire)

| Classe | Rôle |
|--------|------|
| `overflow-y-auto` | Scroll vertical du conteneur chat |
| `overscroll-contain` | Limite propagation scroll au parent (Safari) |
| `touch-pan-y` | Autorise pan vertical tactile |
| `max-h-[30vh]` | Plafond hauteur interne |
| `hide-scrollbar` | Masque barre scroll (CSS custom) |
| `pointer-events-none` | Passthrough zones vides |
| `pointer-events-auto` (bulles) | Scroll/tap sur messages uniquement |

**Suspect Safari :** `scrollIntoView({ behavior: 'smooth' })` dans `useLayoutEffect` — peut provoquer scroll du document parent ou conflit avec `-webkit-overflow-scrolling`.

---

## 2. Contrôles locaux — `components/Arena/shared/ArenaVideoSurface.tsx`

**Cible K.1 :** suppression du bloc `{onFlipCamera && (... SwitchCamera ...)}` (l.113–125).

**Import associé :** `SwitchCamera` depuis `lucide-react` (l.5).  
**Prop associée :** `onFlipCamera?: () => void` (interface l.32, destructuring l.57).

```tsx
  const localControls = tile.isLocal ? (
    <div
      className={`flex flex-wrap shrink-0 items-center gap-1 sm:gap-1.5 min-w-0 max-w-full ${tileCount === 3 && tileIndex === 2 && variant === 'nexus' ? 'pointer-events-auto' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const isLockedByTurn =
            structuredDebateEnabled &&
            speakingTurnActive &&
            effectiveHotMicSpeakerSlot !== tile.slot;
          if (micMutedByMediator || mediatorHoldingFloor || isLockedByTurn) {
            onToast('Micro verrouillé par le Ref ou les règles du débat.', 'error');
            return;
          }
          onToggleMic();
        }}
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${micEnabled && !micMutedByMediator ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCam();
        }}
        className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border backdrop-blur-[60px] transition-all duration-300 active:scale-95 ${camEnabled ? 'border-white/20 bg-white/10 text-white hover:bg-white/20 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)]' : 'border-rose-500/50 bg-rose-950/40 text-rose-400 shadow-[0_0_15px_rgba(225,29,72,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'}`}
      >
        <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
      </button>
      {onFlipCamera && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlipCamera();
          }}
          className="flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-[60px] transition-all hover:bg-white/20 active:scale-95 shadow-[0_4px_16px_rgba(255,255,255,0.1),inset_0_1px_1px_rgba(255,255,255,0.4)] md:hidden"
          title="Basculer la caméra"
        >
          <SwitchCamera className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  ) : null;
```

**Post-suppression attendue :** 2 boutons (Mic + Video) — réduit largeur chrome ~33 % sur mobile.

---

## 3. Radiographie PWA — Manifest & Metadata

### 3a. `public/manifest.json` (intégralité)

**Fichier trouvé :** `public/manifest.json` — pas de `app/manifest.ts`.

```json
{
  "name": "Beefs - L'Agora des règlements de comptes",
  "short_name": "Beefs",
  "description": "L'arène ultime pour régler tes conflits en direct avec un Ref.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#020617",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ],
  "categories": ["social", "entertainment"],
  "shortcuts": [
    {
      "name": "Beefs Live",
      "short_name": "Live",
      "description": "Voir les beefs en direct",
      "url": "/live",
      "icons": [{ "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" }]
    },
    {
      "name": "Mon Profil",
      "short_name": "Profil",
      "description": "Accéder à mon profil",
      "url": "/profile",
      "icons": [{ "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" }]
    }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

### 3b. Assets icônes présents (inventaire disque)

| Fichier | Usage actuel |
|---------|--------------|
| `public/icon-192.svg` | Manifest + shortcuts |
| `public/icon-512.svg` | Manifest |
| `public/icon-192.png` | Notifications (`Header`, `useBeefNotifications`) |
| `public/icon-512.png` | MediaSession, Stripe checkout |
| `app/icon.png` | Favicon Next.js (auto `<link rel="icon">`) |

**Écart détecté :** le manifest référence **uniquement des SVG** ; iOS/Safari et certains install prompts préfèrent **PNG** (`apple-touch-icon`, `icons` maskable PNG). Pas de `version` / cache-bust dans le manifest.

### 3c. `app/layout.tsx` — `metadata` + `viewport`

**Pas de balise `<head>` manuelle** — Next.js App Router injecte metadata automatiquement.  
**Pas de `icons:` explicite** dans metadata — Next utilise `app/icon.png`.  
**Pas de `apple-touch-icon` explicite** — seulement `appleWebApp`.

```tsx
export const metadata: Metadata = {
  title: {
    default: "Beefs - L'Agora des règlements de comptes",
    template: "%s | Beefs",
  },
  description:
    "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
  keywords: ["beefs", "débats", "live", "streaming", "conflits", "résolution", "tiktok live", "débat en direct", "vote", "challenge"],
  authors: [{ name: "Beefs Team" }],
  creator: "Beefs",
  publisher: "Beefs",
  manifest: "/manifest.json",
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Beefs",
  },
  openGraph: {
    title: "Beefs - L'Agora des règlements de comptes",
    description:
      "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
    type: "website",
    siteName: "Beefs",
    locale: "fr_FR",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Beefs - L'Agora des règlements de comptes",
    description:
      "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export const viewport: Viewport = {
  themeColor: "#08080A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};
```

### 3d. Contexte PWA complémentaire (hors extraction stricte)

- **`components/PWAManager.tsx`** — enregistre `/sw.js`, `registration.update()` toutes les heures.
- **`metadata.manifest`** pointe vers `/manifest.json` sans query string de bust cache.
- **K.1 probable :** ajouter entrées PNG dans manifest, `metadata.icons`, éventuellement `apple-touch-icon` ; bump `start_url` ou `id` manifest pour forcer réinstall.

---

*Fin du rapport — extraction Phase K.1 (zéro modification).*
