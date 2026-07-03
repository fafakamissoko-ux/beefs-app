# Audit source — Système de notifications Toast (maison)

> **Mission :** extraction à zéro modification pour préparer la migration vers **sonner**.  
> **Date :** 2026-05-31  
> **Fichiers sources identifiés :** `components/Toast.tsx` (Provider + Hook + UI), `app/layout.tsx` (point d'injection racine).

---

## 1. Synthèse architecturale

| Élément | Détail |
|---------|--------|
| **Fichier unique** | Tout le système (Context, Hook, Provider, rendu UI) est centralisé dans `components/Toast.tsx`. Aucun fichier dans `contexts/`. |
| **Hook public** | `useToast()` → retourne `{ toast }` |
| **Provider public** | `ToastProvider` |
| **Type exporté** | `ToastOptions` |
| **Point d'injection** | `app/layout.tsx` → `RootLayoutClient`, lignes 93–109, entre `ThemeProvider` et `GlobalSearchProvider` |
| **Dépendances UI** | `framer-motion` (`AnimatePresence`, `motion.div`), `lucide-react` (`Check`, `X`, `AlertCircle`, `Info`) |
| **Consommateurs `useToast()`** | ~25 fichiers (voir §5) |
| **Système parallèle (hors scope migration)** | `components/BeefNotificationToasts.tsx` monté dans `Header.tsx` — notifications beef live, **indépendant** de `ToastProvider` |

---

## 2. Signature API et typage TypeScript

### 2.1 Fonction d'appel

```typescript
toast(message: string, type?: ToastType, options?: ToastOptions) => void

type ToastType = 'success' | 'error' | 'info';  // défaut implicite : 'info'
```

### 2.2 Type exporté `ToastOptions`

```typescript
export type ToastOptions = {
  /** Bouton secondaire (ex. aller acheter des points). */
  action?: { label: string; onClick: () => void };
  /** Durée avant fermeture auto (défaut 4 s, 10 s si `action`). */
  durationMs?: number;
  /** Accent visuel (ex. notifications tour de parole). */
  tone?: 'default' | 'ember';
};
```

### 2.3 Type interne `Toast` (non exporté)

```typescript
interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastOptions['action'];
  durationMs: number;
  tone?: 'default' | 'ember';
}
```

### 2.4 Contexte

```typescript
interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

// Fallback no-op si appel hors Provider :
const ToastContext = createContext<ToastContextType>({ toast: () => {} });
```

---

## 3. Comportement du Provider (résumé pour migration)

| Comportement | Implémentation actuelle |
|--------------|-------------------------|
| **ID toast** | `Date.now().toString()` |
| **Durée auto** | `options.durationMs ?? (options.action ? 10_000 : 4_000)` |
| **Fermeture auto** | `setTimeout` → filtre le toast par `id` |
| **Fermeture manuelle** | Bouton `X` → `removeToast(id)` |
| **Action CTA** | Bouton secondaire ; au clic : `action.onClick()` puis `removeToast(id)` |
| **Empilement** | Tableau `Toast[]` — plusieurs toasts simultanés possibles |
| **Position** | `fixed top-16 right-4 z-[99999]`, colonne verticale `gap-2`, `max-w-sm` |
| **Animation entrée/sortie** | `framer-motion` spring (`stiffness: 400`, `damping: 32`) |
| **Variants visuels** | Par `type` (success/error/info) + override `tone: 'ember'` |
| **Icônes** | success → `Check`, error → `AlertCircle`, info → `Info` |

---

## 4. Options avancées — usage réel dans le codebase

| Option | Fichiers consommateurs |
|--------|------------------------|
| `durationMs` | `components/FollowButton.tsx` (6500 ms, erreur prestige P0001) |
| `action` | `components/TikTokStyleArena.tsx` (×2 — label `'Recharger'`, redirect `goBuyPoints()`) |
| `tone: 'ember'` | **Défini dans le Provider, aucun call site actuel** |

---

## 5. Inventaire des consommateurs `useToast()`

| Fichier | Import |
|---------|--------|
| `app/layout.tsx` | `ToastProvider` (injection, pas le hook) |
| `app/admin/page.tsx` | `useToast` |
| `app/admin/beefs/page.tsx` | `useToast` |
| `app/admin/reports/page.tsx` | `useToast` |
| `app/admin/retraits/page.tsx` | `useToast` |
| `app/admin/users/page.tsx` | `useToast` |
| `app/beef/[id]/summary/page.tsx` | `useToast` |
| `app/buy-points/page.tsx` | `useToast` |
| `app/feed/page.tsx` | `useToast` |
| `app/invitations/page.tsx` | `useToast` |
| `app/live/page.tsx` | `useToast` |
| `app/notifications/page.tsx` | `useToast` |
| `app/profile/ProfileContent.tsx` | `useToast` |
| `app/profile/[username]/page.tsx` | `useToast` |
| `components/BeefCard.tsx` | `useToast` |
| `components/ChatPanel.tsx` | `useToast` |
| `components/CommentsDrawer.tsx` | `useToast` |
| `components/CreateBeefForm.tsx` | `useToast` |
| `components/EditBeefModal.tsx` | `useToast` |
| `components/FollowButton.tsx` | `useToast` |
| `components/FollowListModal.tsx` | `useToast` |
| `components/GlobalDuelAmbush.tsx` | `useToast` |
| `components/Header.tsx` | `useToast` |
| `components/MediationBeefEditorPanel.tsx` | `useToast` |
| `components/MessagesUI.tsx` | `useToast` |
| `components/ReportBlockModal.tsx` | `useToast` |
| `components/TikTokStyleArena.tsx` | `useToast` |

**Stratégie de migration recommandée :** conserver `useToast()` comme wrapper fin au-dessus de `sonner` pour éviter de toucher les ~25 call sites.

---

## 6. Point d'injection — extrait ciblé

Dans `app/layout.tsx`, le remplacement chirurgical concerne :

```tsx
// L24 — import actuel
import { ToastProvider } from "@/components/Toast";

// L93–109 — bloc à remplacer par <Toaster /> sonner (+ éventuel wrapper)
<ToastProvider>
  <GlobalSearchProvider>
    ...
  </GlobalSearchProvider>
</ToastProvider>
```

---

## 7. Code source brut — `components/Toast.tsx`

```tsx
'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

export type ToastOptions = {
  /** Bouton secondaire (ex. aller acheter des points). */
  action?: { label: string; onClick: () => void };
  /** Durée avant fermeture auto (défaut 4 s, 10 s si `action`). */
  durationMs?: number;
  /** Accent visuel (ex. notifications tour de parole). */
  tone?: 'default' | 'ember';
};

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastOptions['action'];
  durationMs: number;
  tone?: 'default' | 'ember';
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const toastVariants: Record<ToastType, string> = {
  success:
    'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.35),0_0_56px_-8px_rgba(16,185,129,0.22),inset_0_0_0_1px_rgba(16,185,129,0.12)]',
  error:
    'border border-ember-500/40 bg-red-950/25 text-red-100 shadow-[0_0_32px_rgba(255,77,0,0.4),0_0_48px_-6px_rgba(239,68,68,0.28),inset_0_0_0_1px_rgba(255,77,0,0.12)]',
  info: 'border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.2)]',
};
const emberVariant =
  'border border-ember-500/40 bg-ember-500/12 text-amber-100 shadow-[0_0_32px_rgba(255,77,0,0.45),0_0_52px_-8px_rgba(255,100,50,0.2),inset_0_0_0_1px_rgba(255,77,0,0.12)]';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = Date.now().toString();
    const durationMs =
      options?.durationMs ??
      (options?.action ? 10_000 : 4000);
    setToasts(prev => [
      ...prev,
      {
        id,
        type,
        message,
        action: options?.action,
        durationMs,
        tone: options?.tone === 'ember' ? 'ember' : 'default',
      },
    ]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = {
    success: <Check className="w-4 h-4" strokeWidth={1} />,
    error: <AlertCircle className="w-4 h-4" strokeWidth={1} />,
    info: <Info className="w-4 h-4" strokeWidth={1} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-16 right-4 z-[99999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(t => {
            const variant = t.tone === 'ember' ? emberVariant : toastVariants[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className={`pointer-events-auto flex items-center gap-3 rounded-[2.5rem] px-5 py-4 backdrop-blur-3xl ${variant}`}
              >
                <span>{icons[t.type]}</span>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <p
                    className={`text-sm font-medium ${t.tone === 'ember' ? 'text-amber-50/95' : 'text-white'}`}
                  >
                    {t.message}
                  </p>
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        removeToast(t.id);
                      }}
                      className="self-start px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => removeToast(t.id)} className="text-gray-500 hover:text-white transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" strokeWidth={1} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
```

---

## 8. Code source brut — `app/layout.tsx`

```tsx
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { StarField } from "@/components/Arena/shared/StarField";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["400", "500"],
});
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingReminder } from "@/components/OnboardingReminder";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { PWAManager } from "@/components/PWAManager";
import { ToastProvider } from "@/components/Toast";
import { GlobalSearchProvider } from "@/contexts/GlobalSearchContext";
import { BetaGate } from "@/components/BetaGate";
import { GlobalMessagesDrawer } from "@/components/GlobalMessagesDrawer";
import { GlobalDuelAmbush } from "@/components/GlobalDuelAmbush";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ScrollRestoration } from "@/components/ScrollRestoration";
import { ClientMonitoring } from "@/components/ClientMonitoring";
import { MessagesDrawerProvider } from "@/contexts/MessagesDrawerContext";
const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://beefs-app.vercel.app");

export const metadata: Metadata = {
  title: {
    default: "Beefs - L'Agora du règlement de comptes",
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
    title: "Beefs - L'Agora du règlement de comptes",
    description:
      "L'arène ultime pour régler tes conflits en direct. Lance un beef, affronte tes adversaires sous l'arbitrage d'un Ref et laisse la communauté trancher.",
    type: "website",
    siteName: "Beefs",
    locale: "fr_FR",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Beefs - L'Agora du règlement de comptes",
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

function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <GlobalSearchProvider>
            <ClientMonitoring />
            <MessagesDrawerProvider>
              <BetaGate>
                <PWAManager />
                <ScrollRestoration />
                <StarField />
                <AppShell>{children}</AppShell>
                <OnboardingReminder />
                <PWAInstallPrompt />
                <GlobalMessagesDrawer />
                <GlobalDuelAmbush />
              </BetaGate>
            </MessagesDrawerProvider>
          </GlobalSearchProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`overflow-x-hidden ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans overflow-x-hidden bg-[#050505] text-white antialiased">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
```

---

## 9. Notes pour l'Ordre de Frappe (sonner)

1. **`sonner` est déjà installé** (`^2.0.7` dans `package.json`) mais **non branché** — `Toast.tsx` maison reste actif.
2. **Conserver la signature `useToast()`** : wrapper interne mappant `(message, type, options)` → API sonner (`toast.success/error/info`, `action`, `duration`).
3. **Remplacer `ToastProvider`** par un composant client minimal exportant `<Toaster />` + éventuellement un Context no-op ou réimplémenté via refs sonner.
4. **Position sonner** : reproduire `top-16 right-4` (`offset` / `position="top-right"` + CSS custom).
5. **Variant `tone: 'ember'`** : prévoir mapping CSS custom sonner même si aucun call site ne l'utilise encore.
6. **Ne pas confondre** avec `BeefNotificationToasts` (Header) — système séparé, hors migration toast générique.
7. **Post-migration** : retirer la dépendance runtime à `framer-motion` dans `Toast.tsx` si plus utilisée ailleurs pour les toasts.

---

*Extraction terminée — aucune modification du code source applicatif.*
