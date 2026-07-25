# Rapport d'audit — Phase R.0 (Moteur animations cadeaux Premium)

**Date d'extraction :** 2026-07-04  
**Commit de référence :** `34a88fd`  
**Contrainte :** Zéro modification du code source.

---

## Synthèse Architecte

### Moteur actuel — `components/Arena/FullscreenGiftAnimation.tsx` (248 lignes)

| Aspect | Implémentation actuelle | Gap Tier-1 (Phase R) |
|--------|-------------------------|----------------------|
| **Technologie** | Framer Motion (`motion`, `AnimatePresence`) + emoji Unicode | Pas de Lottie/WebM/GPU layers dédiés |
| **Seuil déclenchement** | `BIG_GIFT_MIN = 500` Lingots | Aligné arène (`gift.cost >= 500` dans `TikTokStyleArena`) |
| **Durée animation** | `ANIM_MS = 4500` ms (`setTimeout` → `setActive(null)`) | Pas de file d'attente — **écrase** l'anim en cours |
| **État interne** | `useState<ActiveAnim>` — **1 seul** cadeau actif | Pas de queue FIFO / virtualisation |
| **Entrée données** | Prop `localBigGift` (portal depuis arène) | Broadcast réseau → `onArenaBigGift` → même prop |
| **Thèmes visuels** | `themeForGiftId()` : meteor, goat, wolf, volcano, champion, burst (fallback) | Mapping partiel — 7/12 cadeaux arène en thème dédié |
| **Particules** | Composant `Particles` — jusqu'à **64** `<motion.span>` DOM | Coût layout/paint élevé, pas de Canvas/WebGL |
| **Z-index** | `z-[21000]` fixed fullscreen | OK overlay |
| **Accessibilité** | `role="dialog"`, `sr-only` titre | `pointer-events-none` — pas de dismiss |

### Intégration arène (`TikTokStyleArena.tsx`)

```tsx
// Seuil émission locale (l.3771+)
if (gift.cost >= 500) {
  setLocalArenaBigGift(bigPayload);
  arenaOutboundRef.current.broadcastArenaBigGift?.(bigPayload);
}

// Reset local 6s (l.965–968) — indépendant du moteur (4.5s)
useEffect(() => {
  if (!localArenaBigGift) return;
  const t = window.setTimeout(() => setLocalArenaBigGift(null), 6000);
  return () => window.clearTimeout(t);
}, [localArenaBigGift]);

// Rendu portal (l.4196)
<FullscreenGiftAnimation roomId={roomId} localBigGift={localArenaBigGift} />
```

**Flux réseau :** `useArenaRealtime` → event `arena_big_gift` → `onArenaBigGift` → `setLocalArenaBigGift`.

**Risque R.0 :** double timer (4500 ms moteur vs 6000 ms parent) + pas de queue si rafale de gros cadeaux.

---

## 2. Assets médias associés

### Dossier `public/` (inventaire complet)

| Fichier | Type | Lié cadeaux ? |
|---------|------|---------------|
| `public/manifest.json` | PWA | Non |
| `public/sw.js` | Service worker | Non |
| `public/icon-192.png` / `.svg` | Icône | Non |
| `public/icon-512.png` / `.svg` | Icône | Non |
| `public/google-oauth-logo-*.png` | OAuth | Non |
| `public/beefs-header-wordmark-oauth.svg` | Branding | Non |
| `public/sounds/silence.mp3` | Audio | Non (placeholder) |

### Dossier `assets/`

**N'existe pas** dans le repo.

### Fichiers cadeaux Premium recherchés

**Aucun fichier trouvé** pour :

- `wolf.webm`, `meteor.mp4`, `champion.gif`, `goat.webm`, `volcano.mp4`, `banger.*`, etc.
- Aucun Lottie JSON (`*.json` animation)
- Aucun sous-dossier `public/gifts/` ou `public/animations/`

### Schéma DB (référence future)

Table `gift_types` prévoit `animation_url TEXT` (migration 05) — **colonne non peuplée** dans les seeds actuels (emoji-only).

### SFX arène (hors scope cadeaux, absent du disque)

`TikTokStyleArena` référence `/sounds/horn.mp3`, `laugh.mp3`, etc. — **fichiers non présents** dans `public/sounds/` (seul `silence.mp3`).

---

## 3. Code source intégral — `components/Arena/FullscreenGiftAnimation.tsx`

```tsx
'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const BIG_GIFT_MIN = 500;
const ANIM_MS = 4500;

export type ArenaBigGiftPayload = {
  cost: number;
  label: string;
  emoji: string;
  giftTypeId: string;
  senderName: string;
};

type ActiveAnim = (ArenaBigGiftPayload & { key: string }) | null;

function themeForGiftId(id: string): 'meteor' | 'goat' | 'wolf' | 'volcano' | 'champion' | 'burst' {
  if (id === 'meteor') return 'meteor';
  if (id === 'goat') return 'goat';
  if (id === 'wolf') return 'wolf';
  if (id === 'volcano') return 'volcano';
  if (id === 'champion') return 'champion';
  return 'burst';
}

function Particles({ count, color }: { count: number; color: string }) {
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        i,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        s: 4 + Math.random() * 10,
        delay: Math.random() * 0.4,
      })),
    [count]
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {seeds.map((p) => (
        <motion.span
          key={p.i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.s,
            height: p.s,
            background: color,
            boxShadow: `0 0 ${p.s * 1.2}px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{
            x: p.x * 2.2,
            y: p.y * 2.2,
            opacity: 0,
            scale: 1.2,
          }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function GiftVisual({ theme, emoji, label, senderName, cost }: ArenaBigGiftPayload & { theme: ReturnType<typeof themeForGiftId> }) {
  if (theme === 'goat') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(18vh,8rem)] leading-none"
          initial={{ scale: 0.2, rotate: -12, opacity: 0 }}
          animate={{ scale: [0.2, 1.15, 1], rotate: [-12, 4, 0], opacity: 1 }}
          transition={{ duration: 0.7, times: [0, 0.6, 1], type: 'spring', stiffness: 200, damping: 14 }}
        >
          {emoji}
        </motion.div>
        <motion.p
          className="font-mono text-2xl font-black uppercase tracking-widest text-amber-200"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          G.O.A.T
        </motion.p>
        <p className="max-w-[min(90vw,24rem)] text-sm text-white/85">
          <span className="font-bold text-amber-100">{senderName}</span> — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'meteor') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          className="relative text-[min(20vh,9rem)]"
          initial={{ y: '-120vh', x: 40, scale: 0.5, opacity: 0.9 }}
          animate={{ y: 0, x: 0, scale: 1, opacity: 1, rotate: [18, 0] }}
          transition={{ duration: 0.6, type: 'spring', bounce: 0.35 }}
        >
          {emoji}
          <Particles count={64} color="rgba(251,191,36,0.85)" />
        </motion.div>
        <p className="text-lg font-bold text-amber-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'wolf') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          initial={{ x: '120%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 80, damping: 12, duration: 0.6 }}
        >
          {emoji}
        </motion.div>
        <p className="text-base font-semibold text-slate-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'volcano') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          initial={{ y: 40, scale: 0.5, opacity: 0 }}
          animate={{ y: [40, 0, -3, 0], scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {emoji}
        </motion.div>
        <Particles count={40} color="rgba(248,113,113,0.8)" />
        <p className="text-base font-semibold text-red-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'champion') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          animate={{ rotate: [0, -6, 6, 0], y: [0, -6, 0] }}
          transition={{ duration: 1.2, repeat: 2, ease: 'easeInOut' }}
        >
          {emoji}
        </motion.div>
        <p className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-xl font-black text-transparent">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <motion.div
        className="text-[min(18vh,8rem)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {emoji}
      </motion.div>
      <Particles count={48} color="rgba(250,204,21,0.7)" />
      <p className="text-base font-bold text-amber-50">
        {senderName} — {label} · {cost} pts
      </p>
    </div>
  );
}

type Props = {
  /** Conservé pour l’API parente ; le flux réseau est géré par `useArenaRealtime` + `localBigGift`. */
  roomId: string;
  /** Cadeau « gros budget » à animer (émetteur inclus : `self: false` côté hook). */
  localBigGift: ArenaBigGiftPayload | null;
};

export function FullscreenGiftAnimation({ roomId, localBigGift }: Props) {
  void roomId;
  const labelId = useId();
  const [active, setActive] = useState<ActiveAnim>(null);

  const play = useCallback((payload: ArenaBigGiftPayload, key: string) => {
    if (payload.cost < BIG_GIFT_MIN) return;
    setActive({ ...payload, key });
    window.setTimeout(() => setActive(null), ANIM_MS);
  }, []);

  useEffect(() => {
    if (!localBigGift || localBigGift.cost < BIG_GIFT_MIN) return;
    play(localBigGift, `local_${Date.now()}`);
  }, [localBigGift, play]);

  const theme = active ? themeForGiftId(active.giftTypeId) : 'burst';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.key}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="pointer-events-none fixed inset-0 z-[21000] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-amber-950/40 to-black/80" />
          <motion.div
            className="relative z-10 max-w-[min(96vw,32rem)] px-4"
            initial={{ scale: 0.88, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18, duration: 0.5 }}
          >
            <h2 id={labelId} className="sr-only">
              Cadeau {active.label} par {active.senderName}
            </h2>
            <GiftVisual
              theme={theme}
              cost={active.cost}
              label={active.label}
              emoji={active.emoji}
              giftTypeId={active.giftTypeId}
              senderName={active.senderName}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

## Recommandations Phase R (observations, hors scope)

1. **File d'attente stricte** — remplacer `setActive` direct par queue + `useReducer` / Zustand slice.
2. **GPU** — migrer particules vers CSS `@keyframes` + `transform`/`opacity` ou Canvas single-layer.
3. **Assets** — créer `public/gifts/{id}.webm` + peupler `gift_types.animation_url`.
4. **Unifier timers** — aligner 4500 ms / 6000 ms parent.
5. **Préchargement** — `link rel=preload` pour médias tier 3 (≥ 500 Lingots).

---

*Fin du rapport — extraction Phase R.0 (zéro modification).*
