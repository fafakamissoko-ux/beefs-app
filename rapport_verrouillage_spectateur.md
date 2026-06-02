# Rapport Phase 6 — Verrouillage spectateur CTA Arène

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_spectateur_cta.md`  
**Fichier modifié :** `components/BeefCard.tsx`  
**Statut :** ✅ verrouillage appliqué

---

## Synthèse

| Changement | Effet |
|------------|--------|
| Statut `ready` dans la branche CTA parente | Les boutons modale s'affichent quand l'Arène est sur le point d'ouvrir (plus de trou `: null`) |
| Suppression du bouton générique | « Rejoindre la salle d'attente » retiré |
| CTAs par rôle | Challenger `accepted`, spectateur `ready`, spectateur `pending`/`scheduled` verrouillé |

---

## Étape 1 — Couverture `ready`

**Avant :**

```tsx
) : status === 'scheduled' || status === 'pending' ? (
```

**Après :**

```tsx
) : status === 'scheduled' || status === 'pending' || status === 'ready' ? (
```

Un beef `ready` entre désormais dans le même arbre CTA que `scheduled` / `pending`. Le direct reste géré par la branche `status === 'live'` (l. ~722).

---

## Étape 2 — Matrice d'accès (nouveau rendu)

| Condition | Rendu | Cliquable |
|-----------|--------|-----------|
| `userInviteStatus === 'pending'` | ⚠️ Convocation en attente | Non |
| `userInviteStatus === 'declined'` | ❌ Convocation refusée | Non |
| `userInviteStatus === 'accepted'` | **Salle d'attente Combattant** | Oui → `onClick()` |
| Spectateur (`!userInviteStatus`) + `status === 'ready'` | **Rejoindre le sas public** | Oui → `onClick()` |
| Spectateur + `pending` ou `scheduled` | **Ouverture prochaine...** | Non (`disabled`, grisé) |

**Ordre d'évaluation :** `pending` → `declined` → `accepted` → `ready` (spectateur) → fallback verrouillé.

---

## Vérification des objectifs Architecte

| Objectif | Statut |
|----------|--------|
| Bouton générique supprimé | ✅ |
| Spectateur ne peut pas entrer si `pending` / `scheduled` | ✅ bouton `disabled` |
| Spectateur peut entrer si `ready` | ✅ « Rejoindre le sas public » |
| Challenger `accepted` toujours actif | ✅ « Salle d'attente Combattant » |
| Live géré en amont | ✅ branche `status === 'live'` inchangée |
| Trou `ready` comblé | ✅ condition parente étendue |

---

## Comportement attendu en prod

1. **Spectateur, beef `pending` ou `scheduled`** — modale : bouton gris « Ouverture prochaine... », pas de navigation Arène via ce CTA.
2. **Spectateur, beef `ready`** — modale : « Rejoindre le sas public », clic → `/arena/{id}` via `onClick` parent.
3. **Challenger convoqué et accepté** — « Salle d'attente Combattant » actif quel que soit le statut (hors live, géré au-dessus).
4. **Ref / créateur** — inchangé : `onPrepareAudience` → « 🎛️ Préparer la Régie » (prioritaire sur ce bloc).

---

## Hors scope (non modifié)

- `app/feed/page.tsx` — `onPrepareAudience` reste limité à `scheduled` / `pending` (pas `ready`).
- Clic carte hors modale (`setIsTeaserOpen(true)`) — ouvre toujours la modale, ne contourne pas le verrou CTA.
- `handleBeefClick` feed — navigation directe si autre point d'entrée ; verrou UI limité au bouton modale Phase 6.

---

**Fin du rapport Phase 6.**
