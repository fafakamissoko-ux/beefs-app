# Rapport Phase H.1 — Refonte identité & branding

**Date :** 2026-06-29  
**Branche :** `main`  
**Validation :** `npx tsc --noEmit` — exit 0

---

## Objectifs

1. Tagline SEO : **« L'Agora des règlements de comptes »** (pluriel)
2. Nouvelle iconographie : **éclair néon** sur fond slate-950
3. PWA manifest aligné design system sombre
4. Correction artwork lock screen MediaSession

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `app/layout.tsx` | `title.default`, `openGraph.title`, `twitter.title` |
| `public/manifest.json` | `name`, `theme_color` → `#020617` |
| `app/page.tsx` | Tagline pluriel + `<BeefLogo size={100} />` sans drop-shadow |
| `components/BeefLogo.tsx` | Remplacement flamme → éclair néon vectoriel |
| `hooks/useMediaSession.ts` | Artwork `/icon-512.png` (route corrigée) |

---

## Détail — tagline SEO

**Avant :** `L'Agora du règlement de comptes`  
**Après :** `L'Agora des règlements de comptes`

Zones mises à jour :
- `metadata.title.default`
- `metadata.openGraph.title`
- `metadata.twitter.title`
- `manifest.json` → `name`
- `app/page.tsx` → splash tagline

---

## Détail — `BeefLogo.tsx`

Nouveau vecteur 512×512 :
- Fond `#020617` (slate-950)
- Halos cyan ambient
- Étoiles « starry glass »
- Filtre `neon-glow` triple passe
- Path éclair blanc luminescent

Consommé par : `Header`, splash, `BetaGate`, `login`, etc. — mise à jour centralisée.

---

## Détail — PWA manifest

```json
"name": "Beefs - L'Agora des règlements de comptes",
"theme_color": "#020617"
```

**Note :** les fichiers `public/icon-192.svg` / `icon-512.svg` n'ont pas été remplacés dans cette phase — le composant `BeefLogo` reflète le nouveau design en UI ; synchronisation PNG/SVG PWA possible en H.2.

---

## Détail — lock screen artwork

**Avant :** `/icons/icon-512x512.png` (404)  
**Après :** `/icon-512.png` (existant dans `public/`)

---

## QA recommandée

1. Onglet navigateur : titre SEO pluriel
2. Splash `/` : éclair néon + tagline
3. Header : logo 32px cohérent
4. PWA install prompt : theme slate-950
5. iOS lock screen arène : artwork visible

---

*Fin du rapport Phase H.1.*
