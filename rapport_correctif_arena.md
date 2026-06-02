# Rapport de validation — Correctifs mécaniques Arène

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_mecaniques_arena.md`  
**Statut :** ✅ 3 correctifs appliqués

---

## Résumé

| Bug | Correctif | Fichier |
|-----|-----------|---------|
| Ref → loader infini `/live/[id]` | Redirection vers `/arena/[id]` (sas Check Matériel) | `app/feed/page.tsx` |
| CTAs superposés sur la carte | Arbre `onPrepareAudience ? … : …` exclusif | `components/BeefCard.tsx` |
| Spectateurs avec caméra forcée | Lookup `beef_participants` sans `.toLowerCase()` | `app/arena/[roomId]/page.tsx` |

---

## Étape 1 — Routage du Médiateur (Le Sas)

**Avant :** `onPrepareAudience` envoyait le Ref vers `/live/${beef.id}` — route sans sas « Check Matériel », susceptible de rester bloquée sur `FETCH_TICKET` ou l'écran VS.

**Après :** le Ref est redirigé vers `/arena/${beef.id}`, même parcours que les challengers et spectateurs, avec l'écran staging (`needsStaging && !isStagingPassed`) pour `userRole === 'mediator'`.

```typescript
onPrepareAudience={
  (beef.status === 'scheduled' || beef.status === 'pending') && user?.id === beef.mediator_id
    ? () => router.push(`/arena/${beef.id}`)
    : undefined
}
```

**Validation attendue :** depuis le Feed, un médiateur sur beef `scheduled` ou `pending` clique « 🎛️ Préparer la Régie » → URL `/arena/[id]` → écran « Check Matériel » (caméra / micro) avant l'arène.

---

## Étape 2 — Exclusivité des boutons (BeefCard)

**Avant :** blocs `&&` indépendants dans le conteneur `flex flex-col gap-2` — le Ref pouvait voir « Préparer la Régie » **et** `pendingRefText` / convocation en parallèle.

**Après :** structure binaire stricte :

1. **`onPrepareAudience` défini** → seul le bouton « Préparer la Régie » (+ éventuel « Se désister » si `scheduled`)
2. **Sinon** → branche non-Ref :
   - CTAs manifesto / Devenir le Ref / Valider-Refuser (selon props)
   - Bloc convocation / refus / « Rejoindre la salle d'attente » + `pendingRefText` **uniquement** si `(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef))`

**Validation attendue :**

| Persona | CTAs visibles |
|---------|---------------|
| Médiateur (Ref) | 🎛️ Préparer la Régie uniquement |
| Challenger convoqué (`pending`) | ⚠️ Convocation **ou** Rejoindre (pas les deux + texte Ref) |
| Créateur manifesto (validation Ref) | Valider / Refuser **ou** Devenir le Ref — pas empilés avec convocation |
| Spectateur | Rejoindre la salle d'attente (+ `pendingRefText` informatif si applicable) |

---

## Étape 3 — Verrouillage rôles WebRTC

**Avant :** requête Supabase avec `user_id` normalisé en `.toLowerCase()` — risque de non-correspondance avec les UUID stockés en casse canonique → `participation` null → fallback erroné pouvant laisser un spectateur hors rôle `viewer`.

**Après :** jointure directe sur `uidTrim` (UUID tel que renvoyé par Supabase Auth) :

```typescript
.eq('user_id', uidTrim)
```

Logique inchangée :

- `effectiveHostId === uidTrim` → `mediator`
- `invite_status === 'accepted'` → `challenger`
- sinon → `viewer` → `isViewer` dans `TikTokStyleArena` → pas de `getUserMedia`, join Daily en `viewerMode`

**Validation attendue :** un utilisateur non participant ouvert `/arena/[id]` → pas d'activation caméra PreJoin, pas de pistes locales Daily.

---

## Vérification TypeScript

Compilation `tsc --noEmit` exécutée après modifications — aucune erreur de typage signalée sur les trois fichiers.

---

## Plan de test manuel recommandé

1. **Ref** — beef `pending`, connecté en tant que `mediator_id` : CTA unique → `/arena/[id]` → sas Check Matériel → arène.
2. **Spectateur** — compte sans ligne `beef_participants.accepted` : `/arena/[id]` → pas de demande caméra navigateur.
3. **Challenger pending** — `user_invite_status === 'pending'` : modale Teaser affiche uniquement « ⚠️ Convocation en attente », sans « Préparer la Régie » ni double CTA.
4. **Créateur manifesto** — validation Ref en cours : panneau Valider/Refuser seul, sans « Rejoindre » superposé.

---

## Déploiement

Lors de la mise en production, fusionner la branche de travail dans `main` puis `git push origin main` pour aligner Vercel / prod.
