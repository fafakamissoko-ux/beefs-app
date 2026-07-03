# Rapport d'audit — SEO, métadonnées & icônes

**Date :** 31 mai 2026  
**Objectif :** extraction pour refonte titre, description et icônes Next.js  
**Statut :** extraction uniquement (aucune modification)

---

## 0. Synthèse

| Zone | Constat |
|------|---------|
| Métadonnées globales | `app/layout.tsx` — objet `export const metadata` complet |
| Métadonnées page d'accueil | **Aucune** — `app/page.tsx` est `'use client'` (splash), pas d'`export const metadata` |
| OG dynamique Next.js | `app/opengraph-image.tsx` — image générée à la volée (1200×630) |
| Favicon | **Pas de fichier** — SVG inline en `data:` URI dans `<head>` de `layout.tsx` |
| Icônes `public/` | 2 SVG (`icon-192`, `icon-512`) + PNG OAuth Google — **pas de `.ico` ni `.png` logo** |
| Écarts détectés | `metadata.openGraph.images` pointe `/og-image.png` (absent) ; `manifest.json` et `<head>` référencent `/icon-192.png` et `/icon-512.png` (absents — seuls les `.svg` existent) |

---

## 1. `app/layout.tsx` — variable `siteUrl`

```typescript
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://beefs-app.vercel.app");
```

---

## 2. `app/layout.tsx` — bloc `export const metadata`

```typescript
export const metadata: Metadata = {
  title: {
    default: "Beefs - Débats en live",
    template: "%s | Beefs",
  },
  description: "La plateforme de débats en direct. Crée un beef, invite des challengers, et laisse le public voter. Diffuse, débats et fais-toi entendre.",
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
    title: "Beefs - Débats en live",
    description: "Crée un beef, invite des challengers et laisse le public voter en direct.",
    type: "website",
    siteName: "Beefs",
    locale: "fr_FR",
    url: siteUrl,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Beefs - Débats en live",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Beefs - Débats en live",
    description: "Crée un beef, invite des challengers et laisse le public voter en direct.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};
```

---

## 3. `app/layout.tsx` — `viewport` (adjacent SEO / PWA)

```typescript
export const viewport: Viewport = {
  themeColor: "#08080A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};
```

---

## 4. `app/layout.tsx` — balises `<head>` manuelles (icônes / PWA)

Hors objet `metadata`, le layout injecte directement :

```tsx
<head>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>…</svg>" />
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#08080A" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Beefs" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
</head>
```

**Favicon :** SVG flamme inline (gradient orange/rouge + jaune), **pas de fichier `favicon.ico`**.

---

## 5. `app/page.tsx` — métadonnées page d'accueil

**Résultat :** aucun objet `export const metadata`.

Fichier entièrement client :

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// … SplashScreen → redirect /feed ou /onboarding
```

La page d'accueil **n'écrase pas** le metadata global du layout. Les moteurs de recherche héritent de `app/layout.tsx`.

**Texte affiché à l'écran (non SEO meta) :**

- Titre visuel : `Beefs`
- Sous-titre : `L'Agora du règlement de comptes`

---

## 6. Fichier OG Next.js App Router — `app/opengraph-image.tsx`

Présent à la racine `app/` (convention Next.js 13+). Génère dynamiquement `/opengraph-image` :

```typescript
export const runtime = 'edge';
export const alt = 'Beefs - Débats en live';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
```

Contenu visuel généré : fond sombre, accent dégradé orange, emoji 🔥, titre **Beefs**, tagline **Débats en live**, sous-texte *« Crée un beef, invite des challengers et laisse le public voter »*, pied de page (Débats / Votes / Gifts / Live).

**Note :** coexiste avec `metadata.openGraph.images: ["/og-image.png"]` — double source potentielle ; le fichier statique `/og-image.png` **n'existe pas** dans le repo.

---

## 7. Inventaire strict — fichiers icônes & images liées au branding

### 7a. Racine `app/` (conventions Next.js metadata files)

| Fichier attendu (convention) | Présent ? |
|------------------------------|-----------|
| `favicon.ico` | ❌ Non |
| `icon.png` / `icon.svg` | ❌ Non |
| `apple-icon.png` | ❌ Non |
| `opengraph-image.png` | ❌ Non (mais `opengraph-image.tsx` ✅) |
| `twitter-image.png` | ❌ Non |
| `opengraph-image.tsx` | ✅ Oui |

### 7b. Dossier `public/` — inventaire complet

| Fichier | Type | Rôle / usage |
|---------|------|--------------|
| `public/icon-192.svg` | SVG | Icône PWA (fichier présent) |
| `public/icon-512.svg` | SVG | Icône PWA (fichier présent) |
| `public/manifest.json` | JSON | Web App Manifest — référence **`/icon-192.png`** et **`/icon-512.png`** (fichiers absents) |
| `public/beefs-header-wordmark-oauth.svg` | SVG | Wordmark OAuth (header) |
| `public/google-oauth-logo-120.png` | PNG | Logo Google OAuth (120px) |
| `public/google-oauth-logo-512.png` | PNG | Logo Google OAuth (512px) |
| `public/sw.js` | JS | Service Worker PWA |

### 7c. Fichiers référencés mais absents du repo

| Chemin référencé | Référencé par |
|------------------|---------------|
| `/og-image.png` | `metadata.openGraph.images`, `metadata.twitter.images` |
| `/icon-192.png` | `manifest.json`, `<link rel="apple-touch-icon">` |
| `/icon-512.png` | `manifest.json` |

### 7d. Fichiers explicitement recherchés — absent

- `favicon.ico` — ❌
- `icon.png` — ❌
- `apple-icon.png` — ❌
- `opengraph-image.png` — ❌ (remplacé par génération TSX)
- `twitter-image.png` — ❌

---

## 8. `public/manifest.json` — métadonnées PWA (extrait icônes)

```json
{
  "name": "Beefs - Règle tes conflits en live",
  "short_name": "Beefs",
  "description": "La plateforme pour résoudre tes beefs en direct avec un médiateur professionnel",
  "theme_color": "#E83A14",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Écart sémantique :** titre manifest *« Règle tes conflits en live »* vs metadata layout *« Débats en live »*.

---

## 9. Points d'attention pour la refonte (lecture seule)

1. **Unifier les titres/descriptions** entre `metadata`, `manifest.json`, splash (`page.tsx`) et `opengraph-image.tsx`.
2. **Résoudre les 404 icônes** : aligner extensions (PNG vs SVG) ou ajouter les PNG manquants.
3. **Choisir une stratégie OG** : fichier statique `/og-image.png`, ou exclusivement `app/opengraph-image.tsx` (retirer la ref statique du metadata).
4. **Migrer le favicon inline** vers `app/icon.tsx` ou `public/favicon.ico` (convention Next.js).
5. **`app/page.tsx` client** : pour des meta spécifiques à `/`, il faudrait un `layout.tsx` parent server ou refactor splash.

---

*Fin du rapport — extraction brute, zéro modification de code.*
