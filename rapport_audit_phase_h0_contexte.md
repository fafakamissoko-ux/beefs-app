# CONTEXTE — Audit Technique « Pulse & Glow — Badges Notification & Navigation » (Phase H)

Tu reçois les fichiers `rapport_audit_phase_h0.md` et `rapport_audit_phase_h3.md`.

C'est un audit en deux volets du système de badges de notification (Pulse & Glow) couvrant les surfaces arène in-live, navigation globale, et menu mobile — évalué contre les standards de cohérence UX, accessibilité et absence de bugs visuels.

---

## Volet H.0 — Préparation « Pulse & Glow » (835 lignes)

Audit structurel identifiant les **points d'accroche et lacunes** pour l'injection des badges animés sur 3 surfaces :

### Surfaces analysées

| Surface | Composant | Badge existant ? |
|---------|-----------|-----------------|
| **Arène in-live (Régie)** | `MediatorOrb.tsx` + `MediatorSidebar.tsx` | Compteur interne `pendingInvites.length` en régie, mais **aucun badge Pulse** sur le bouton Command Deck |
| **Navigation globale** | `Header.tsx` via `AppShell.tsx` | `PremiumNotificationBadge` sur Cloche, Convocations, Messages |
| **Arène (menu mobile)** | Drawer `showArenaMenu` dans `TikTokStyleArena.tsx` | Icône Messages **sans badge** (`unreadDMsCount` calculé mais non branché) |

### Anomalies identifiées

- 🟠 **`refInvites` est un état mort** — rempli par `fetchPendingInvites` mais jamais consommé dans le JSX. Seul `handsRaised` est passé à `MediatorSidebar`.
- 🟠 **`unreadDMsCount` non branché** — calculé via Supabase Realtime dans l'arène mais jamais affiché sur l'icône Messages du menu mobile.
- 🟡 **Pas de badge Pulse sur le bouton Command Deck** — le médiateur ne sait pas qu'il y a des demandes en attente sans ouvrir le panneau.
- 🟡 **Route `/arena/*` masque le Header** (`AppShell` retourne `<>{children}</>`) — les badges globaux sont invisibles pendant un live.

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `components/TikTokStyleArena.tsx` | Arène — menu mobile, dock spectateur, états pending |
| `components/Arena/shared/MediatorOrb.tsx` | Bouton Command Deck (Ref uniquement) |
| `components/MediatorSidebar.tsx` | Panneau régie — affiche `pendingInvites.length` |
| `components/Header.tsx` | Nav principale + badges (845 lignes) |
| `components/AppShell.tsx` | Layout shell — masque Header sur `/arena/*` |
| `components/shared/PremiumNotificationBadge.tsx` | Composant badge animé réutilisable |

---

## Volet H.3 — Collisions visuelles badges (322 lignes)

Audit ciblé des **régressions visuelles** dans le système de badges existant :

### Problèmes identifiés

- 🟠 **Double compteur dans le drawer mobile hamburger** — `PremiumNotificationBadge` (pastille numérique) + pilule cyan `{item.badge} nouvelle(s)` affichés simultanément sur les mêmes items de navigation.
- 🟡 **Pilule `brand-gradient` décalée** sur la page `/notifications` — risque d'artefact / décalage vertical à côté du `h1`.
- 🟡 **`h-4.5` n'est pas une classe Tailwind standard** dans `PremiumNotificationBadge.tsx` — peut provoquer un sizing incohérent en desktop.

### Fichiers concernés

| Fichier | Lignes | Problème |
|---------|--------|----------|
| `components/Header.tsx` | L.699–754 | Double badge dans le drawer mobile |
| `app/notifications/page.tsx` | L.362–374 | Pilule gradient décalée |
| `components/shared/PremiumNotificationBadge.tsx` | L.30–40 | Classe `h-4.5` non-standard |

---

## Ce qui est attendu de toi (Architecte)

1. **Décider de la stratégie Pulse & Glow** pour le bouton Command Deck : badge numérique (`handsRaised.length + refInvites.length`) ou simple indicateur lumineux (point pulsant) ?
2. **Décider si `refInvites` doit être consommé** dans le JSX (affichage distinct des convocations Ref vs raise-hand) ou fusionné avec `handsRaised`.
3. **Décider du branchement `unreadDMsCount`** sur l'icône Messages du menu mobile arène.
4. **Trancher sur les collisions visuelles** : supprimer la pilule `{item.badge} nouvelle(s)` en faveur du `PremiumNotificationBadge` seul, ou l'inverse ?
5. **Corriger la classe `h-4.5`** : remplacer par `h-[18px]` ou une valeur Tailwind standard.
6. **Générer les ordres de frappe** avec les fichiers cibles et les modifications précises.
