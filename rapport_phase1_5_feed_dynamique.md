# Rapport Phase 1.5 — Feed Dynamique (Snap + object-contain)

**Date :** 2026-05-31  
**Statut :** Calage snap mobile corrigé, médias non rognés, fond flouté

---

## 1. Calage scroll mobile — `app/feed/page.tsx`

Enveloppe `beefs.map` :

```tsx
className="relative flex-none flex justify-center h-full w-full snap-center snap-always md:flex-auto md:h-auto md:block md:snap-align-none"
```

| Classe | Effet |
|--------|-------|
| `flex-none` | Empêche l'écrasement vertical en flex |
| `h-full` | Carte = hauteur exacte du conteneur scroll |
| `snap-center snap-always` | Centrage snap — la carte suivante n'apparaît plus en bas |
| `md:flex-auto md:h-auto md:block` | Restaure le comportement grille desktop |

---

## 2. Anti-rognage + fond flouté — `BeefCard` (carte feed)

**`mediaBlockRef` :** `bg-black` (remplace `bg-transparent`)

**Structure média (overlays/badges inchangés en dessous) :**

1. Couche floue : `thumbnail` → `Image` `object-cover blur-2xl opacity-40 scale-110`
2. Média principal : `object-contain` (vidéo ou image), `z-10`
3. Fallback : dégradé obsidian → black

Les divs overlay (`gradient-to-t`, badges LIVE, boutons mute/Aura) **non modifiées**.

---

## 3. Modale teaser — même système

Conteneur média modal :

```tsx
className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black overflow-hidden"
```

- Fond flouté : `<img>` thumbnail `blur-2xl opacity-30`
- Vidéo / image principale : `object-contain`, `z-10`
- Boutons Aura/mute (absolute bottom-right) **conservés**

---

## 4. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit 0

---

## Fichiers modifiés

- `app/feed/page.tsx`
- `components/BeefCard.tsx`
- `rapport_phase1_5_feed_dynamique.md` (ce fichier)

**Aucune librairie externe ajoutée.**
