# Rapport de validation — Résolution bugs visuels (Production)

**Date :** 31 mai 2026  
**Fichiers modifiés :** `components/BeefCard.tsx`, `components/CreateBeefForm.tsx`

---

## Étape 1 — Starry Glass (modale teaser `BeefCard.tsx`)

### Cible
Overlay portal `isTeaserOpen` — conteneur `fixed inset-0 z-[9999]`.

### Modification

| Propriété | Avant | Après |
|-----------|-------|-------|
| Fond | `bg-black/80` | `bg-black/20` |
| Flou | `backdrop-blur-sm` | `backdrop-blur-[2px]` |

**Classe finale :**
```
fixed inset-0 z-[9999] flex flex-col bg-black/20 backdrop-blur-[2px] md:flex-row md:items-center md:justify-center md:p-8
```

### Validation
- Le fond étoilé (`AppShell` / body) transparaît à travers l'overlay modale.
- Le panneau interne conserve le Verre Lourd (`bg-slate-950/75 backdrop-blur-md`) — non modifié.
- Aucun autre élément de `BeefCard.tsx` touché dans cette passe.

---

## Étape 2 — Alignement conteneur date (`CreateBeefForm.tsx`)

### Cible
Bloc `{beefData.is_scheduled && ( ... )}` — wrapper des boutons rapides + input date.

### Modification

| Avant | Après |
|-------|-------|
| `flex flex-col gap-2 pl-8` | `flex flex-col gap-3 pt-2` |

### Validation
- Suppression de l'indentation asymétrique `pl-8` qui décalait le bloc vers la droite.
- Le sélecteur date s'aligne désormais sur la largeur du conteneur parent « Démarrage du beef », cohérent avec les radios au-dessus.

---

## Étape 3 — Centrage champ date (`CreateBeefForm.tsx`)

### Cible
`<input type="datetime-local" />` dans le bloc programmation.

### Modification

| Propriété | Avant | Après |
|-----------|-------|-------|
| Alignement texte | (défaut gauche) | `text-center` |
| Radius | `rounded-xl` | `rounded-[2rem]` |
| Bordure | `border-white/20` | `border-white/[0.06]` |
| Fond | `bg-black/60` | `bg-white/[0.04]` |
| Padding vertical | `py-2.5` | `py-3` |

**Aligné sur le Design System du formulaire** (même tokens que les champs `EditBeefModal` / inputs principaux).

### Validation
- Centrage textuel appliqué via `text-center`.
- Harmonisation visuelle avec le reste du formulaire de création.
- `style={{ colorScheme: 'dark' }}` conservé pour le picker natif.

---

## Synthèse

| Bug audit | Correctif | Statut |
|-----------|-----------|--------|
| Overlay modale opaque (masque étoiles) | Starry Glass `bg-black/20 backdrop-blur-[2px]` | ✅ |
| Bloc date décalé (`pl-8`) | Conteneur `gap-3 pt-2` sans indent | ✅ |
| Input datetime mal centré / style incohérent | `text-center` + tokens formulaire | ✅ |

---

## Hors périmètre (non modifié)

- Message d'erreur `fieldErrors.scheduled_at` conserve `pl-8` — alignement optionnel Phase ultérieure.
- Handlers Aura / placeholder Ref (correctifs logiques Phase précédente) — inchangés.

**Prêt pour validation visuelle en production.**
