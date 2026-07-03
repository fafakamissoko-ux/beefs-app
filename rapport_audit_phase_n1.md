# Rapport d'audit — Phase N.1

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (post correctif M.1 — commit `e067dda`)  
**Objectifs N.1 :** Marquee pseudos grilles contraintes ; audit couleurs manifest PWA vs Splash Android natif.  
**Contrainte :** Zéro modification du code source.

---

## 1. Configuration des animations — `tailwind.config.ts`

**Fichier :** `tailwind.config.ts` (pas de `.js` dans le repo).

**État actuel :** aucune section `keyframes` / `animation` dans `theme.extend`. Plugin : `tailwindcss-animate` uniquement.

**Point d'injection Architecte :** bloc `theme.extend` (après `zIndex` ou avant fermeture `extend`), ex. :

```ts
keyframes: { 'pseudo-marquee': { ... } },
animation: { 'pseudo-marquee': 'pseudo-marquee 8s linear infinite' },
```

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      colors: {
        obsidian: {
          DEFAULT: "#030305",
          950: "#010102",
          900: "#07070A",
        },
        cyan: {
          DEFAULT: "#00F0FF",
          200: "#B9FFFF",
          300: "#7DFFFF",
          400: "#4DFFFF",
          500: "#00F0FF",
          600: "#00B3CC",
        },
        blood: {
          DEFAULT: "#FF003C",
          400: "#FF3363",
          500: "#FF003C",
          600: "#CC0030",
        },
        volt: {
          DEFAULT: "#DFFF00",
          400: "#E6FF4D",
          500: "#DFFF00",
        },
        prestige: {
          gold: "#E5C07B",
        },
        /** Brand Spatial Monolith — Cyan premium */
        brand: {
          400: "#00F0FF",
          500: "#00B3CC",
          600: "#008B99",
        },
      },
      boxShadow: {
        "glow-brand": "0 0 20px rgba(0, 240, 255, 0.4)",
        "glow-mediator": "0 0 20px rgba(212, 175, 55, 0.6)",
        "glow-cyan": "0 0 20px rgba(0, 240, 255, 0.4)",
        "glow-blood": "0 0 20px rgba(255, 0, 60, 0.6)",
        card: "0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #00F0FF 0%, #00B3CC 100%)",
      },
      zIndex: {
        base: "10",
        overlay: "50",
        modal: "100",
        "arena-hud": "200",
        toast: "300",
        critical: "999",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

### Annexe — Marquee existant (hors Tailwind config)

**Ticker arène** (`TikTokStyleArena.tsx`, style inline l.4204–4213) :

```css
@keyframes marquee-continuous {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.animate-marquee-continuous {
  animation: marquee-continuous 20s linear infinite;
}
.animate-marquee-continuous-fast {
  animation: marquee-continuous 8s linear infinite;
}
```

**Classes utilisées :** `animate-marquee-continuous`, `animate-marquee-continuous-fast` sur le bandeau annonces — **pas** sur les pseudos tuiles.

**`app/globals.css` :** keyframes `verdict-glitch`, `float-up`, `shimmer` — pas de marquee pseudo.

---

## 2. Surface vidéo — Badge pseudo (`ArenaVideoSurface.tsx`)

**Variable :** `const pseudoBadge = (` (l.115–147)

**État actuel :** `truncate` sur le bouton `@tile.name` — pas de marquee. Conteneur verre : `overflow-hidden` + `max-w-[100px] sm:max-w-[150px]`.

```tsx
  const pseudoBadge = (
    <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
      <div className="flex min-w-0 max-w-full overflow-hidden items-center gap-2 rounded-full border border-white/[0.08] bg-slate-900/40 px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[40px] sm:px-4 sm:py-2">
        {tile.isLocal && webrtcNetworkQuality && webrtcNetworkQuality !== 'good' && (
          <div className="shrink-0 flex items-center justify-center" title="Réseau instable">
            <div
              className={`h-1.5 w-1.5 rounded-full animate-pulse ${webrtcNetworkQuality === 'low' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}
            />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onOpenProfile(tile.name, tile.arenaUserId);
          }}
          className="min-w-0 max-w-[100px] sm:max-w-[150px] truncate inline-block text-[10px] font-black tracking-wide text-white hover:text-cyan-400 drop-shadow-md sm:text-[11px]"
        >
          @{tile.name}
        </button>
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
      </div>
      {isSpeaking && (
        <div className="w-fit animate-pulse rounded bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_0_10px_rgba(225,29,72,0.6)]">
          DIRECT
        </div>
      )}
    </div>
  );
```

**Cible N.1 marquee :** remplacer `truncate` sur le `<button>` (l.131–133) par un wrapper scroll horizontal conditionnel (`tileCount >= 5` ?).

---

## 3. Manifeste PWA — Couleurs (`public/manifest.json`)

```json
  "background_color": "#000000",
  "theme_color": "#020617",
```

### Audit couleurs Splash Android natif

| Source | Couleur | Tailwind / hex |
|--------|---------|----------------|
| **Manifest** `background_color` | `#000000` | Noir pur |
| **Manifest** `theme_color` | `#020617` | slate-950 |
| **`app/layout.tsx`** `viewport.themeColor` | `#08080A` | obsidian-900 proche — **≠ manifest** |
| **Splash web** (`app/page.tsx`) | `bg-slate-950/90` | ~`#020617` à 90 % opacité |

**Écart N.1 :** le splash natif Android (PWA install) utilise `background_color` / `theme_color` du manifest — pas le rendu React Premium Glass. Flash noir `#000000` possible au cold start si non aligné sur `slate-950` / splash web.

**Palette design system (réf.) :** `obsidian.DEFAULT` `#030305`, `obsidian-950` `#010102` dans `tailwind.config.ts`.

---

*Fin du rapport — extraction Phase N.1 (zéro modification).*
