# Rapport Phase B1 — QueryProvider (@tanstack/react-query)

**Date :** 31 mai 2026  
**Phase :** Frappe B — Moteur de Données (infrastructure)  
**Statut :** ✅ Terminé

---

## Objectif

Installer l'infrastructure `@tanstack/react-query` à la racine de l'application avec un **Provider client strict**, afin d'éviter les fuites de cache entre requêtes SSR (une instance `QueryClient` par session navigateur, pas par requête serveur).

---

## Fichiers modifiés / créés

| Fichier | Action |
|---------|--------|
| `components/QueryProvider.tsx` | **Créé** — composant `'use client'` |
| `app/layout.tsx` | **Modifié** — import + enveloppe `RootLayoutClient` |

---

## Étape 1 — `components/QueryProvider.tsx`

Composant client qui instancie le `QueryClient` via `useState(() => new QueryClient(...))` :

- **`staleTime: 60_000`** — données considérées fraîches 1 minute
- **`refetchOnWindowFocus: false`** — pas de re-fetch au retour sur l'onglet
- **`retry: 1`** — une seule tentative en cas d'échec réseau

Ce pattern garantit qu'une seule instance de cache existe pour toute la durée de vie de la session React côté client.

---

## Étape 2 — Injection dans `app/layout.tsx`

Import ajouté :

```typescript
import { QueryProvider } from "@/components/QueryProvider";
```

Arbre des providers (`RootLayoutClient`) :

```
QueryProvider          ← nouveau (racine client data)
  └ AuthProvider
      └ ThemeProvider
          └ ToastProvider
              └ GlobalSearchProvider
                  ├ ClientMonitoring
                  └ MessagesDrawerProvider
                      └ BetaGate
                          ├ PWAManager
                          ├ ScrollRestoration
                          ├ StarField
                          ├ AppShell → {children}
                          ├ OnboardingReminder
                          ├ PWAInstallPrompt
                          ├ GlobalMessagesDrawer
                          └ GlobalDuelAmbush
```

**Choix d'ordre :** `QueryProvider` enveloppe `AuthProvider` pour que les futures queries puissent accéder au cache dès le premier render client, y compris dans les composants descendants de l'auth (profil, settings, etc.).

---

## Étape 3 — Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** exit code **0** — aucune erreur de typage.

---

## Dépendances (installées en amont)

| Package | Version |
|---------|---------|
| `@tanstack/react-query` | ^5.101.0 |
| `zod` | ^3.25.76 |
| `react-hook-form` | ^7.80.0 |
| `@hookform/resolvers` | ^5.4.0 |

---

## Prochaines étapes (Phase B2+)

1. Créer `lib/queries/` — hooks `useQuery` / `useMutation` (profil, followers, transactions)
2. Créer `lib/schemas/` — schémas zod à partir de `lib/password-policy`, `lib/email-signup-policy`
3. Migrer les fetchers manuels identifiés dans `rapport_audit_moteur_donnees.md`
4. *(Optionnel dev)* `@tanstack/react-query-devtools` monté sous `QueryProvider`

---

## Risques / notes

| Sujet | Note |
|-------|------|
| SSR | Aucune query serveur pour l'instant — le Provider client isole le cache ; pas de risque de partage inter-requêtes |
| Realtime | Subscriptions Supabase live restent hors react-query (push vs pull) |
| Breaking change | Aucun — infrastructure additive, aucun composant migré encore |

---

*Phase B1 validée — prête pour migration des fetchers (B2).*
