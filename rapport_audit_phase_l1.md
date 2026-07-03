# Rapport d'audit — Phase L.1

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (post K.1 — commit `b037813`)  
**Objectifs L.1 :** Recentrer chrome pseudos/badges sur grilles 5–6 challengers ; valider syntaxe manifest PWA post-patch K.1.  
**Contrainte :** Zéro modification du code source.

---

## 1. Matrice de grille — `components/Arena/nexus/nexusGridTemplates.ts`

**Fichier complet (56 lignes).**

**Cibles L.1 :** réécriture de `getNexusCellClass` et `getNexusChromeUiPos` pour `tileCount >= 5`.

### État actuel des cas 5–6 (analyse Architecte)

| Tuiles | `getNexusGridClass` | `getNexusCellClass` | `getNexusChromeUiPos` |
|--------|---------------------|---------------------|------------------------|
| **5** | `grid-cols-6 grid-rows-2` | idx 0–2 : `col-span-2` ; idx 3 : `col-span-2 col-start-2` ; idx 4 : `col-span-2 col-start-4` | idx impair : `top-2 right-2 flex-row-reverse` ; idx pair : défaut `top-2 left-2` |
| **6** | `grid-cols-3 grid-rows-2` | **aucune règle** (retourne `''`) | idx impair : `top-2 right-2 flex-row-reverse` ; idx pair : défaut `top-2 left-2` |

**Risque débordement :** chrome ancré `top-2 left-2` / `top-2 right-2` sur tuiles étroites (grille 6 cols ou 3 cols) — pas de centrage horizontal (`left-1/2 -translate-x-1/2`).

```typescript
/** Classes Tailwind du conteneur grille selon le nombre de tuiles (1–6). */
export function getNexusGridClass(tileCount: number): string {
  switch (tileCount) {
    case 1:
      return 'grid-cols-1 grid-rows-1';
    case 2:
      return 'grid-cols-2 grid-rows-1';
    case 3:
      return 'grid-cols-2 grid-rows-2';
    case 4:
      return 'grid-cols-2 grid-rows-2';
    case 5:
      return 'grid-cols-6 grid-rows-2';
    case 6:
      return 'grid-cols-3 grid-rows-2';
    default:
      return 'grid-cols-1 grid-rows-1';
  }
}

/** Placement d'une cellule dans la grille Nexus. */
export function getNexusCellClass(index: number, tileCount: number): string {
  if (tileCount === 3 && index === 2) return 'col-span-2';
  if (tileCount === 5) {
    if (index <= 2) return 'col-span-2';
    if (index === 3) return 'col-span-2 col-start-2';
    if (index === 4) return 'col-span-2 col-start-4';
  }
  return '';
}

/** Position du chrome (nom, DIRECT, contrôles) sur une tuile Nexus. */
export function getNexusChromeUiPos(index: number, tileCount: number): string {
  if (tileCount === 2 && index === 1) {
    return 'top-[3.5rem] right-2 sm:top-[4.5rem] sm:right-4 flex-row-reverse items-start';
  }
  if (tileCount === 3 && index === 0) {
    // Haut-Gauche : Pseudo Haut-Droite (self-end), Contrôles Bas-Gauche (self-start)
    return 'inset-2 sm:inset-3 flex-col justify-between !pointer-events-none [&>*:first-child]:self-end [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-start [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 1) {
    // Haut-Droite : Pseudo Haut-Gauche (self-start), Contrôles Bas-Droite (self-end). pt-12 pour éviter les icônes Live/Share.
    return 'inset-2 sm:inset-3 pt-12 sm:pt-14 flex-col justify-between !pointer-events-none [&>*:first-child]:self-start [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-end [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 2) {
    return 'left-2 right-2 sm:left-4 sm:right-4 top-2 sm:top-4 flex-row justify-between items-start pointer-events-none';
  }
  if (tileCount === 4 && index === 3) {
    return 'top-2 right-2 sm:top-4 sm:right-4 flex-col items-end';
  }
  if (tileCount >= 5 && index % 2 === 1) {
    return 'top-2 right-2 sm:top-4 sm:right-4 flex-row-reverse items-start';
  }
  return 'top-2 left-2 sm:top-4 sm:left-4 flex-row items-start';
}
```

### Schéma placement 5 tuiles (grille 6 cols)

```
Row 1: [ idx0 span2 ] [ idx1 span2 ] [ idx2 span2 ]
Row 2: [    idx3 span2 col-start-2    ] [ idx4 span2 col-start-4 ]
```

---

## 2. Intégrité PWA — `public/manifest.json`

**Fichier complet (63 lignes) — post-patch K.1.**

### Validation syntaxe JSON (lecture statique)

| Critère | Statut |
|---------|--------|
| JSON parseable (accolades, virgules, guillemets) | ✅ Valide |
| `start_url` cache-bust K.1 | `"/?v=2"` |
| Tableau `icons` (4 entrées SVG + PNG) | ✅ Présent |
| `shortcuts` / `share_target` | ✅ Présents |
| Trailing comma interdite | ✅ Aucune |
| Clé dupliquée | ✅ Aucune |

**Points d'attention L.1 (sémantique, pas syntaxe) :**
- `purpose: "any maskable"` — valeur combinée (certains validateurs préfèrent `"any"` et `"maskable"` séparés).
- Shortcuts référencent encore **SVG uniquement** (`/icon-192.svg`), pas les PNG ajoutés en K.1.
- Pas de champ `id` manifest (optionnel W3C, utile pour diff install).

```json
{
  "name": "Beefs - L'Agora des règlements de comptes",
  "short_name": "Beefs",
  "description": "L'arène ultime pour régler tes conflits en direct avec un Ref.",
  "start_url": "/?v=2",
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
    },
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
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

---

*Fin du rapport — extraction Phase L.1 (zéro modification).*
