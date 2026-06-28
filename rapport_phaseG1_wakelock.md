# Rapport Phase G.1 — Wake Lock (Anti-veille)

**Date :** 2026-06-28  
**Branche :** `main`  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Contexte

Empêcher la mise en veille des appareils (mobile et desktop) pendant les sessions live Agora — participant **et** spectateur — via l'API native `navigator.wakeLock`.

---

## Architecture G.1

```
TikTokStyleArena (mount)
  → useWakeLock(true)
  → navigator.wakeLock.request('screen')
  → visibilitychange → visible → re-request (auto-réparation OS)
  → unmount → release()
```

---

## Fichiers

| Fichier | Action |
|---------|--------|
| `hooks/useWakeLock.ts` | **Créé** — moteur auto-réparateur |
| `components/TikTokStyleArena.tsx` | Import + `useWakeLock(true)` Tier-1 |

---

## Détail — `hooks/useWakeLock.ts`

**API exportée :**
```typescript
useWakeLock(enabled?: boolean) → { requestWakeLock, releaseWakeLock }
```

**Comportement :**
1. `enabled === true` → `request('screen')` au mount
2. Listener `release` sur le sentinel (log système)
3. `visibilitychange` → si `visible` et ref non nulle → `requestWakeLock()` (ré-armement post-background)
4. Cleanup → `releaseWakeLock()` + retrait listener
5. Fallback gracieux si `wakeLock` absent ou refusé (warn console)

**Typage :** `WakeLockSentinel` natif + alias `WakeLockNavigator` (pas de `any`).

---

## Détail — injection `TikTokStyleArena.tsx`

```typescript
import { useWakeLock } from '@/hooks/useWakeLock';

// --- BACKGROUND AUDIO (Tier-1) ---
const { startSystemAudio } = useMediaSession(debateTitle || 'Live Agora', host?.name || 'Ref');

// --- ANTI-VEILLE ÉCRAN (Tier-1) ---
useWakeLock(true);
```

**Portée :** tous les rôles dès le montage de l'arène (PreJoin + live).

---

## QA recommandée

1. Mobile : session live > timeout veille habituel → écran reste actif
2. Passage background → foreground → console `[Wake Lock] Verrouillage relâché` puis ré-acquisition silencieuse
3. Quitter l'arène → pas de lock résiduel
4. Desktop Chrome/Edge : `about://flags` ou support natif OK
5. Safari iOS : support partiel — vérifier fallback (warn sans crash)

---

*Fin du rapport Phase G.1.*
