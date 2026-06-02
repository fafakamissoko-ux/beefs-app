# Rapport de validation — Correctif RBAC Phase 2

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_roles_global.md` (F3, F6, F7)  
**Prérequis :** Phase 1 (`rapport_correctif_rbac_phase1.md`) — arène principale + API billet

**Statut :** ✅ 3 verrous périphériques déployés

---

## Synthèse

| Finding | Description | Correctif | Fichier |
|---------|-------------|-----------|---------|
| **F6** | Invités peuvent charger `/arena` et `/live` avant mur client | `/arena` et `/live` dans `protectedPrefixes` | `middleware.ts` |
| **F3** | Régie `/live/[id]` : UUID lowercase, pas de `is_main`, pas de sync ticket | Alignement sur `/arena/[id]` | `app/live/[id]/page.tsx` |
| **F7** | Acceptation convocation : update invitation sans `beef_id` | Double verrou `id` + `beef_id` | `app/invitations/page.tsx` |

---

## Étape 1 — Bouclier middleware (F6)

**Avant :** seuls `/invitations`, `/create`, etc. redirigent les invités vers `/login`. `/arena/*` et `/live/*` passaient le middleware → chargement client (spinners, fetch beef) puis mur auth.

**Après :**

```typescript
const protectedPrefixes = [
  '/create', '/settings', '/invitations', '/messages',
  '/admin', '/notifications', '/arena', '/live',
];
```

**Comportement :** invité sur `/arena/[id]` ou `/live/[id]` → redirect immédiat :

`/login?redirect=/arena/…&next=/arena/…`

**Validation attendue :** pas de montage des pages arène/régie sans session ; deep link préservé via `next`.

---

## Étape 2 — Régie aux normes arène (F3)

### Jointure UUID

- Suppression de `userId.trim().toLowerCase()`
- Requête participant : `.eq('user_id', uidTrim)` (casse canonique Supabase Auth)

### Filtre combattant principal

```typescript
.eq('is_main', true)
```

Raise-hand / témoins ne sont plus pré-classés `challenger` avant le billet.

### Autorité serveur post-ticket

```typescript
if (ticket.role === 'spectator') setUserRole('viewer');
else if (ticket.role === 'participant') setUserRole('challenger');
else if (ticket.role === 'mediator') setUserRole('mediator');
```

**Parité `/live` ↔ `/arena` :** même chaîne optimiste locale → écrasement par `ticket.role` (Phase 1 API `effectiveHostId` déjà en place).

**Hors scope Phase 2 (inchangé) :** pas de sas « Check Matériel » sur `/live` ; redirect auth client historique remplacé en pratique par le middleware pour les invités.

---

## Étape 3 — Acceptation convocations (F7)

**Avant :**

```typescript
.eq('id', invitationId);
```

Un client malveillant pouvait théoriquement passer un `beefId` incohérent tout en mettant à jour une invitation valide (désync invitation / participant).

**Après :**

```typescript
.eq('id', invitationId)
.eq('beef_id', beefId);
```

**Effet :** l’update invitation échoue (0 ligne) si `beefId` ne correspond pas à l’invitation — RLS `bi_update_invitee` + cohérence métier.

La mise à jour `beef_participants` reste verrouillée par `.eq('beef_id', beefId).eq('user_id', user?.id)`.

---

## Architecture post Phase 1 + 2

```
Invité
  └─► /arena|/live  ──► middleware ──► /login?next=…     [F6]

Connecté
  └─► /arena|/live  ──► rôle local (is_main) ──► ticket API ──► sync userRole [F3 + Phase 1]
  └─► /invitations  ──► handleResponse(id + beef_id)       [F7]
```

---

## Plan de test manuel

1. **F6** — Navigation privée vers `/arena/[uuid]` : redirect `/login` sans spinner arène prolongé.
2. **F3** — Ref/challenger sur `/live/[id]` : rôle UI = `ticket.role` ; spectateur sans caméra PreJoin.
3. **F7** — Accepter une convocation depuis l’UI : invitation + participant synchronisés ; manipulation DevTools `beefId` → erreur ou échec silencieux sans acceptation croisée.

---

## Déploiement

Fusionner sur `main` et `git push origin main` pour aligner Vercel / prod.

**Phase 2 RBAC validée en code.**
