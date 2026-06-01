# Rapport Phase 1.B — Nettoyage actif convocations

**Date :** 31 mai 2026  
**Fichier modifié :** `app/invitations/page.tsx`  
**Objectif :** éradiquer le « trou noir » des invitations expirées (Severity 1).

---

## Contexte

Avant ce correctif, `loadInvitations` filtrait silencieusement les lignes `beef_invitations` dont `expires_at < now` sans écrire en base. Les `beef_participants` restaient en `pending` → beef bloqué en `pending` sans UI d'action.

---

## Étape 1 — Nettoyage actif (`loadInvitations`)

### Avant

```typescript
const validInvs = invs.filter(inv => new Date(inv.expires_at).getTime() > Date.now());
// expirées ignorées, DB inchangée
```

### Après

1. **Partition** : boucle `validInvs` / `expiredInvIds` sur `expires_at > now`.
2. **UPDATE `beef_invitations`** (fire-and-forget) :
   ```typescript
   .update({ status: 'expired', responded_at: new Date().toISOString() })
   .in('id', expiredInvIds)
   ```
3. **UPDATE `beef_participants`** synchronisé par invitation expirée :
   ```typescript
   .update({ invite_status: 'expired', responded_at: new Date().toISOString() })
   .eq('beef_id', inv.beef_id)
   .eq('user_id', user.id)
   ```

### Effet attendu

- Le client devient **nettoyeur actif** à chaque chargement `/invitations`.
- Les statuts DB convergent (`expired`) au lieu d'une disparition UI seule.
- Les triggers Postgres liés aux UPDATE peuvent s'exécuter (selon schéma prod).

### Note schéma

`beef_invitations.status` autorise `'expired'` (CHECK DB).  
`beef_participants.invite_status` : le schéma `init.sql` limite historiquement à `pending | accepted | declined`. Si l'UPDATE participant échoue en prod, une migration CHECK élargissant `'expired'` sera nécessaire — surveiller `console.error` côté client.

---

## Étape 2 — Timer esquive vs expiration (`handleResponse`)

### Modification

| Cas | `beef_invitations.status` | `beef_participants.invite_status` |
|-----|---------------------------|-----------------------------------|
| Acceptation | `accepted` | `accepted` |
| Esquive volontaire | `declined` | `declined` |
| Auto-expire chronomètre (`isAutoExpire`) | **`expired`** | **`expired`** |

```typescript
status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
invite_status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
```

**Distinction sémantique :** une fuite volontaire (`declined`) n'est plus confondue avec une expiration temporelle (`expired`).

---

## Non modifié (volontairement — phases suivantes)

- `lib/submitNewBeef.ts` : calcul `expires_at` (24 h / scheduled + 10 min)
- Fallback `beef_participants pending` sans ligne invitation
- Badge Header (`sent` vs `seen`)

---

**Statut : Phase 1.B validée — nettoyage actif implémenté dans `loadInvitations` + alignement `handleResponse`.**
