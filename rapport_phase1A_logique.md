# Rapport Phase 1.A — Logique invitation feed / BeefCard

**Date :** 31 mai 2026  
**Fichiers modifiés :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Objectif :** propager `user_invite_status` et conditionner le CTA « Rejoindre la salle d'attente ».

---

## Étape 1 — Extraction état invitation (`app/feed/page.tsx`)

### Interface `Beef`

```typescript
user_is_live_ring?: boolean;
user_invite_status?: string | null;
```

### Map `userInviteStatusByBeef`

Déclarée aux côtés de `userOnLiveRingByBeef`, remplie depuis `beef_participants` :

```typescript
let userInviteStatusByBeef = new Map<string, string | null>();

for (const row of partRows as PartRow[]) {
  if (row.user_id !== ringUid) continue;
  userInviteStatusByBeef.set(row.beef_id, row.invite_status);
  if (row.invite_status !== 'accepted') continue;
  // ... userOnLiveRingByBeef inchangé
}
```

### Mapping `beefsWithData`

```typescript
user_invite_status: userInviteStatusByBeef.get(bid) || null,
```

### Props `<BeefCard />`

```typescript
onPrepareAudience={
  (beef.status === 'scheduled' || beef.status === 'pending') && user?.id === beef.mediator_id
    ? () => router.push(`/live/${beef.id}`)
    : undefined
}
userInviteStatus={beef.user_invite_status}
```

**Extension :** le Ref peut « Préparer la Régie » dès le statut `pending` (pas seulement `scheduled`).

---

## Étape 2 — Verrouillage CTA (`components/BeefCard.tsx`)

### Nouvelle prop

```typescript
userInviteStatus?: string | null;
```

### Bloc CTA unifié `scheduled | pending`

| Condition | Rendu |
|-----------|--------|
| `onPrepareAudience` | 🎛️ Préparer la Régie |
| Manifesto + `onApply` | + Rôle au ring |
| Pending + Devenir Ref / Valider Ref / `pendingRefText` | Inchangé |
| `userInviteStatus === 'pending'` | ⚠️ Convocation en attente |
| `userInviteStatus === 'declined'` | ❌ Convocation refusée |
| Spectateur / `accepted` / `null` + pas d'autres CTAs | Rejoindre la salle d'attente |
| `scheduled` + `onSeDesister` | Se désister (secondaire) |

### Matrice d'accès Arène (modale Teaser)

| Profil | `userInviteStatus` | Bouton salle d'attente |
|--------|-------------------|------------------------|
| Spectateur neutre | `null` | ✅ Oui |
| Challenger accepté | `'accepted'` | ✅ Oui |
| Challenger en attente | `'pending'` | ❌ Avertissement |
| Challenger refusé | `'declined'` | ❌ Message refus |
| Ref / médiateur | N/A (`onPrepareAudience`) | Régie (pas salle d'attente) |

---

## Non modifié (volontairement)

- Page `/invitations` (fallback convocations — Phase 1.B)
- `expires_at` / requêtes Supabase convocations
- Statut `ready` : pas de CTA dans ce bloc (comportement `null`)

---

**Statut : Phase 1.A validée — prête pour Phase 1.B (convocations).**
