# Rapport Phase 1 — Logique v2

**Date :** 31 mai 2026  
**Fichiers modifiés :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Périmètre :** alignement des verrous temporels + accès Arène (scheduled). **Aucune modification CSS** (contraste / positions).

---

## Étape 1 — Verrous réseau (`app/feed/page.tsx`)

### `handleAuraClick` (~l. 737)

```typescript
setTimeout(() => {
  isLikingCard.current = false;
}, 1500);
```

**Avant :** 1000 ms  
**Après :** **1500 ms** — aligné sur le debounce Realtime `beefs_changes`.

### `handleTeaserAuraClick` (~l. 783)

```typescript
setTimeout(() => {
  isLikingTeaser.current = false;
}, 1500);
```

**Avant :** 1000 ms  
**Après :** **1500 ms** — aligné sur le debounce Realtime `beefs_changes`.

---

## Étape 2 — Verrous locaux UI (`components/BeefCard.tsx`)

### Aura carte — `localAuraLock` (~l. 473)

```typescript
setTimeout(() => {
  setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
  localAuraLock.current = false;
}, 1500);
```

**Avant :** 1000 ms  
**Après :** **1500 ms**

### Aura teaser modale — `localTeaserAuraLock` (~l. 624)

```typescript
setTimeout(() => {
  setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
  localTeaserAuraLock.current = false;
}, 1500);
```

**Avant :** 1000 ms  
**Après :** **1500 ms**

---

## Synthèse timers — 4/4 à 1500 ms

| Emplacement | Verrou / effet | Délai |
|-------------|----------------|-------|
| `page.tsx` — `handleAuraClick` | `isLikingCard.current` | **1500 ms** ✅ |
| `page.tsx` — `handleTeaserAuraClick` | `isLikingTeaser.current` | **1500 ms** ✅ |
| `BeefCard.tsx` — onClick Aura carte | `localAuraLock` + cleanup particules | **1500 ms** ✅ |
| `BeefCard.tsx` — onClick Aura teaser | `localTeaserAuraLock` + cleanup particules | **1500 ms** ✅ |

**Référence debounce Realtime** (`page.tsx`, ~l. 631) : `setTimeout(..., 1500)` → cohérence parent / enfant.

---

## Étape 3 — Accès Arène scheduled (`components/BeefCard.tsx`)

### Avant

`<div>` passive « En attente du direct » — aucune navigation.

### Après

`<button>` interactif « Rejoindre la salle d'attente » :

```typescript
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClick();
    setIsTeaserOpen(false);
  }}
  className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
>
  Rejoindre la salle d'attente
</button>
```

### Comportement

- Utilisateurs **non-médiateurs** (`onPrepareAudience` absent) : CTA actif dans la modale Teaser.
- `onClick()` délègue au parent (`handleBeefClick` → `router.push(/arena/[id])` pour un beef `scheduled`).
- Fermeture modale via `setIsTeaserOpen(false)`.
- Ref / médiateur : inchangé — bouton « 🎛️ Préparer la Régie » via `onPrepareAudience` → `/live/[id]`.

---

## Non modifié (volontairement — Phase 2)

- Classes hashtags (`text-white/40`, etc.)
- Positions Mute / Aura (`bottom-4`, `bottom-20`, `z-[9999]`, `z-[60]`)

---

**Statut : Phase 1 Logique v2 validée — prête pour Phase 2 (UI & CSS).**
