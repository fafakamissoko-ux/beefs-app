# Rapport de validation — Correctif RBAC Phase 1

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_roles_global.md` (F1, F2, F4, F9)  
**Principe appliqué :** *Le serveur dicte le rôle WebRTC, le client obéit.*

**Statut :** ✅ 4 alignements appliqués

---

## Synthèse

| Finding | Description | Correctif | Fichier |
|---------|-------------|-----------|---------|
| **F1** | Créateur manifesto sans Ref → jeton `spectator` au lieu de `mediator` | `effectiveHostId` dans l’API billet | `app/api/beef/access/route.ts` |
| **F2** | `userRole` client ignore `ticket.role` | Sync post-fetch du ticket | `app/arena/[roomId]/page.tsx` |
| **F4** | Challenger client sans filtre `is_main` | `.eq('is_main', true)` sur la requête participant | `app/arena/[roomId]/page.tsx` |
| **F9** | CTA « Préparer la Régie » réservé à `mediator_id` | `effectiveHostId` dans `onPrepareAudience` | `app/feed/page.tsx` |

---

## Étape 1 — Jeton serveur (F1)

**Avant :** seul `beef.mediator_id` déclenchait `tokenRole = 'mediator'`.

**Après :**

```typescript
const effectiveHostId = beef.mediator_id ?? beef.created_by ?? '';

if (userIdsEqual(effectiveHostId, user.id)) {
  tokenRole = 'mediator';
  isCreator = true;
}
```

- Select beef enrichi : `created_by` inclus.
- Un manifesto **pending** sans Ref assigné : le **créateur** reçoit un jeton Daily `mediator` (`is_owner: true`) et peut créer la room via `ensureDailyRoomExistsForBeef`.

**Validation attendue :** créateur manifesto connecté → `GET /api/beef/access` → `{ role: 'mediator', ok: true }`.

---

## Étape 2 — Client soumis au serveur (F2 & F4)

### F4 — Filtre `is_main`

Requête participant locale :

```typescript
.eq('user_id', uidTrim)
.eq('is_main', true)
```

Les spectateurs en file d’attente (`is_main: false`, raise-hand) ou témoins ne sont plus pré-classés `challenger` côté client avant le ticket.

### F2 — Autorité du ticket

Après `fetchBeefVideoTicket` réussi :

```typescript
if (ticket.role === 'spectator') {
  setUserRole('viewer');
} else if (ticket.role === 'participant') {
  setUserRole('challenger');
} else if (ticket.role === 'mediator') {
  setUserRole('mediator');
}
```

**Chaîne de confiance :**

1. Assignation locale (optimiste) → `effectiveHostId` / participation `is_main + accepted`
2. Billet serveur → **écrase** `userRole`
3. `TikTokStyleArena` consomme `userRole` → PreJoin, staging, `viewerMode`

**Validation attendue :**

| Profil | Token API | `userRole` final | Caméra PreJoin |
|--------|-----------|------------------|----------------|
| Créateur sans Ref | `mediator` | `mediator` | Oui (staging) |
| Combattant main accepté | `participant` | `challenger` | Oui |
| Spectateur | `spectator` | `viewer` | Non |
| Raise-hand pending | `spectator` | `viewer` | Non |

---

## Étape 3 — CTA Régie créateur (F9)

**Avant :** `onPrepareAudience` si `user?.id === beef.mediator_id`.

**Après :**

```typescript
onPrepareAudience={
  (beef.status === 'scheduled' || beef.status === 'pending') &&
  (user?.id === beef.mediator_id || (!beef.mediator_id && user?.id === beef.created_by))
    ? () => router.push(`/arena/${beef.id}`)
    : undefined
}
```

**Validation attendue :** beef manifesto `pending` sans `mediator_id` → le créateur voit « 🎛️ Préparer la Régie » et est routé vers `/arena/[id]`.

---

## Cohérence Serveur / Client / UI

```
Feed (F9)          API access (F1)         Arena page (F2/F4)        TikTokStyleArena
─────────          ───────────────         ──────────────────        ────────────────
effectiveHostId ──► effectiveHostId ──► ticket.role sync ──► userRole ──► isViewer / PreJoin
CTA Régie          token mediator          is_main gate              staging Ref/Challenger
```

Les trois couches partagent désormais la même notion d’**hôte effectif** (`mediator_id ?? created_by`).

---

## Hors périmètre Phase 1 (non modifié)

| Item | Raison |
|------|--------|
| `/live/[id]/page.tsx` | Bug `.toLowerCase()` et absence de sync ticket — phase ultérieure |
| Filtre `is_main` sur l’API `access` (participant token) | Non demandé ; raise-hand accepté par le Ref conserve `participant` côté serveur |
| RLS `beef_participants` SELECT public (F5) | Schéma / migration |
| `setIsHost` post-ticket | `isHost` reste dérivé de `effectiveHostId` en amont ; aligné si F1 + F2 cohérents |

---

## Plan de test manuel

1. **Manifesto sans Ref** — créateur : CTA Régie visible → arène → jeton mediator → Check Matériel → join owner Daily.
2. **Spectateur anon puis connecté** — pas de caméra ; `userRole === 'viewer'` après ticket.
3. **Challenger convoqué (`is_main: true`, accepted)** — ticket `participant`, staging combattant.
4. **Raise-hand (`is_main: false`)** — ticket `spectator`, pas de staging caméra.

---

**Phase 1 RBAC validée en code. En attente GO pour phase 2 (route `/live`, RLS, etc.).**
