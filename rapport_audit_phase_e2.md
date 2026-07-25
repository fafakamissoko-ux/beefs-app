# Rapport de Contexte — Phase E.2 : Messagerie & Social (Correctifs Restants)

**Date** : 26 juillet 2026
**Périmètre** : DMs, follow, notifications, présence, performance, design system
**Objectif** : Fournir à l'Architecte l'état exact du code après Phase E.1 pour qu'il émette des ORDRES DE FRAPPE E.2

---

## Bilan Phase E.1 (déjà corrigé)

| ID | Sujet | Statut |
|----|-------|--------|
| E-01 | XSS réversion sanitisation affichage | ✅ Corrigé |
| E-02 | Injection SQL wildcards PostgREST | ✅ Corrigé (`safeQuery = query.replace(/[%_\\]/g, '\\$&')`) |
| E-03 | Sanitisation commentaires | ✅ Corrigé |
| E-05 | Anti-IDOR suppression messages (`.eq('sender_id', user.id)`) | ✅ Corrigé |
| E-10 | Requête profil N+1 chat arena | ✅ Corrigé (Phase F-07, cache useRef) |
| E-11 | Faux compteur likes CommentsStyleMessage | ✅ Corrigé (Phase F-01, supprimé) |
| E-14 | Confirmation avant purge conversation | ✅ Corrigé |
| E-18 | Anti-double-envoi messages (`isSending` state) | ✅ Corrigé |
| E-22 | Sanitisation chat arène (Zustand store) | ✅ Corrigé |
| E-25 | Filtre `is_deleted` sur INSERT Realtime | ✅ Corrigé |
| E-28 | `onKeyPress` déprécié | ✅ Plus aucune occurrence dans le projet |

---

## Problèmes restants ouverts (classés par priorité)

### 🔴 P0 — Sécurité / Performance critique

#### E-04 — Rate limiting serveur absent
**Fichier** : `lib/security.ts` (64 lignes)
**État actuel** : `checkRateLimit()` existe (in-memory, client-side) mais **n'est utilisé nulle part** dans `MessagesUI.tsx`. Aucun rate limiting côté serveur.
**Impact** : Un utilisateur peut spammer les DMs sans limite. L'API Supabase est exposée directement.

#### E-06 — Requêtes N+1 pour le comptage des non-lus
**Fichier** : `components/MessagesUI.tsx` — lignes 174-186
**État actuel** :
```typescript
const enriched: Conversation[] = await Promise.all(convs.map(async c => {
  const { count } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', c.id)
    .neq('sender_id', user.id)
    .eq('is_read', false);
  return { ...c, other_user: otherUser, unread_count: count || 0 };
}));
```
**Impact** : 20 conversations = 20 requêtes SQL distinctes. Temps de chargement 2-5s+ avec la croissance.

#### E-07 — Pas de pagination conversations ni messages
**Fichier** : `components/MessagesUI.tsx`
- Conversations : `.select('*')` sans `.range()` → charge **toutes** les conversations (ligne 155-159)
- Messages : `.limit(100)` sans mécanisme "charger plus" (ligne 306)
**Impact** : Utilisateur avec 200+ conversations → chargement prohibitif. Conversation 500+ messages → historique tronqué sans prévenir.

### 🟠 P1 — UX dégradée

#### E-08 — Aucun indicateur de frappe (typing indicator)
**Fichier** : `components/MessagesUI.tsx`
**État actuel** : Aucune trace de `typing`, `isTyping`, `track()`, ou Supabase Presence dans le fichier.
**Impact** : Expérience "morte" — standard sur TikTok, Instagram, WhatsApp, Discord.

#### E-09 — Pas de pagination dans FollowListModal
**Fichier** : `components/FollowListModal.tsx` (299 lignes) — lignes 54-103
**État actuel** : Charge **tous** les followers/following en une seule requête sans `.range()`. Animation `delay: index * 0.04` (ligne 247) → 8+ secondes cumulées avec 200+ items.
**Impact** : 5 000+ followers = requête lente + mémoire saturée + animations gelées.

#### E-12 — Absence de debounce sur la recherche d'utilisateurs
**Fichier** : `components/MessagesUI.tsx` — lignes 483-500
**État actuel** : `searchUsers()` se déclenche à chaque frappe (aucun `debounce`, `useDeferredValue` ou `setTimeout`). Taper "jean-marc" = 7 requêtes PostgREST.
**Impact** : Charge serveur significative à l'échelle.

#### E-15 — GlobalMessagesDrawer : z-index et classe de verre non conformes
**Fichier** : `components/GlobalMessagesDrawer.tsx` (50 lignes)
**État actuel** :
- Backdrop : `z-[999998] bg-black/20 backdrop-blur-sm` (ligne 34)
- Tiroir : `z-[999999] bg-black/20 backdrop-blur-[2px]` (ligne 41)
**Non-conformité Design System** : Le tiroir devrait utiliser `bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl` (Verre Lourd, Modales/Tiroirs).

#### E-19 — setTimeout fragile dans MessagesDrawerContext
**Fichier** : `contexts/MessagesDrawerContext.tsx` (27 lignes) — ligne 19
**État actuel** :
```typescript
closeDrawer: () => {
  set({ isDrawerOpen: false });
  setTimeout(() => set({ targetUserId: undefined }), 300);
},
```
**Impact** : Le délai 300ms est synchronisé manuellement avec l'animation. Si le device est lent → glitch.

#### E-20 — Gestion d'erreur silencieuse loadConversations
**Fichier** : `components/MessagesUI.tsx` — lignes 190-193
**État actuel** : `catch(err) { console.error(...); return []; }` — aucun feedback utilisateur. L'écran affiche "Aucune conversation" comme si tout était normal.

#### E-21 — FollowListModal : pas de gestion Escape / focus trap
**Fichier** : `components/FollowListModal.tsx`
**État actuel** : Aucun gestionnaire `keydown` Escape. Aucun focus trap.

### 🟡 P2 — Améliorations structurelles

#### E-23 — Notifications : PAGE_SIZE=50 trop large, pas d'IntersectionObserver
**Fichier** : `app/notifications/page.tsx` — ligne 92
**État actuel** : `PAGE_SIZE = 50`, bouton "Charger plus" manuel. Pas d'IntersectionObserver.

#### E-24 — Logique `hasMore` incorrecte (notifications)
**Fichier** : `app/notifications/page.tsx` — lignes 137, 174
**État actuel** : `setHasMore(notifs.length >= PAGE_SIZE || auras.length >= PAGE_SIZE)` — opérateur `||` provoque des rechargements inutiles.

#### E-27 — Animations Framer Motion excessives sur les listes
**Fichiers** :
- `components/FollowListModal.tsx` — ligne 247 : `transition={{ delay: index * 0.04 }}`
- `app/notifications/page.tsx` — ligne 476 : `transition={{ delay: i * 0.04 }}`
**Impact** : 200+ items → 8+ secondes de délai cumulé + jank mobile.

#### E-29 — Faute d'orthographe "demarrer"
**Fichier** : `components/MessagesUI.tsx` — ligne 759
**État actuel** : `"Cherche un utilisateur pour demarrer"` → manque l'accent `"démarrer"`.

#### E-32 — Classe de verre non conforme (= E-15, même fichier)
Déjà documenté dans E-15.

### ⚪ P3 — Polish (optionnel)

| ID | Sujet | Fichier |
|----|-------|---------|
| E-13 | Sanitisation contenu notifications | `app/notifications/page.tsx` |
| E-16 | Indicateur de présence en ligne | `components/MessagesUI.tsx` |
| E-17 | Recherche dans les conversations | `components/MessagesUI.tsx` |
| E-26 | Onglet "Mentions" ne filtre pas les vraies mentions | `app/notifications/page.tsx` |
| E-30 | `<img>` natif au lieu de `<Image>` Next.js | `components/CommentsDrawer.tsx` |
| E-31 | Variable `users` masque le scope parent | `components/MessagesUI.tsx` |
| E-33 | Bouton média factice ("bientôt disponible") | `components/MessagesUI.tsx` |
| E-34 | Feedback haptique/sonore réactions | `components/MessagesUI.tsx` |
| E-35 | `aria-label` manquant sur textarea | `components/MessagesUI.tsx` |

---

## Tailles des fichiers cibles

| Fichier | Lignes |
|---------|--------|
| `components/MessagesUI.tsx` | 1 240 |
| `components/FollowListModal.tsx` | 299 |
| `app/notifications/page.tsx` | 521 |
| `lib/security.ts` | 64 |
| `components/GlobalMessagesDrawer.tsx` | 50 |
| `contexts/MessagesDrawerContext.tsx` | 27 |

---

## Attente de l'Architecte

L'exécutant attend des **ORDRES DE FRAPPE** concrets pour les correctifs E.2, classés par phase d'exécution (P0 d'abord, puis P1, puis P2/P3). Chaque ordre doit préciser :
- Le fichier cible et les lignes concernées
- Le code exact à modifier/ajouter/supprimer
- Les dépendances entre ordres (si extraction de hook, quels paramètres)
- Les éventuelles migrations SQL (RPC `get_conversations_with_unread`, etc.)

L'exécutant commitra entre chaque phase de priorité et vérifiera TypeScript (`tsc --noEmit`) à chaque étape.
