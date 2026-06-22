# Phase A.4 — Migration modales combat → Radix Dialog

> **Date :** 2026-05-31  
> **Statut :** ✅ Validée (`npx tsc --noEmit` exit 0)  
> **Fichiers modifiés :** `components/CreateBeefForm.tsx`, `components/EditBeefModal.tsx`

---

## 1. Objectif

Remplacer les shells modaux maison (`fixed inset-0` + `motion.div`) par `@radix-ui/react-dialog`, en conservant intégralement la logique métier (états, validation, submit/save) et le design Premium Glass.

---

## 2. Changements appliqués

| Fichier | Shell avant | Shell après |
|---------|-------------|-------------|
| `CreateBeefForm.tsx` | overlay flex + `motion.div` scale | `Dialog.Root/Portal/Overlay/Content` |
| `EditBeefModal.tsx` | overlay + `onMouseDown` dismiss + `motion.div` | idem Radix |

**Import ajouté (les deux fichiers) :**

```typescript
import * as Dialog from '@radix-ui/react-dialog';
```

---

## 3. Architecture Radix commune

```tsx
<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in …" />
    <Dialog.Content
      className="fixed left-[50%] top-[50%] z-[10000] … translate-x-[-50%] translate-y-[-50%] … data-[state=open]:zoom-in-95 …"
    >
      {/* contenu métier inchangé */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Positionnement

| Propriété | Valeur | Rôle |
|-----------|--------|------|
| `left-[50%] top-[50%]` | centre viewport | standard Radix |
| `translate-x-[-50%] translate-y-[-50%]` | centrage absolu | remplace flex wrapper |
| `max-h-[92dvh]` | hauteur max | scroll interne |
| `w-[calc(100vw-1.5rem)] max-w-2xl` | responsive | marges latérales mobile |

### Animations (tailwindcss-animate)

| Composant | Classes data-state |
|-----------|-------------------|
| `Dialog.Overlay` | `fade-in-0` / `fade-out-0` |
| `Dialog.Content` | `fade-in-0`, `zoom-in-95` / `zoom-out-95` |

---

## 4. CreateBeefForm — détails

### Conservé intact

- Machine à étapes `intent` (null → manifesto / mediation)
- `handleBackToChoice`, `validateForm`, `handleSubmit`
- Tags, participants, teaser, schedule
- `motion.div` sur **chips tags uniquement** (micro-animation locale)

### Fermeture

| Mécanisme | Implémentation |
|-----------|----------------|
| `onCancel` parent | `onOpenChange` → `!open` |
| Bouton X | `Dialog.Close asChild` |
| Overlay clic | Radix natif (nouveau vs avant) |
| Escape | Radix natif |

### Header amélioré

- Emoji dynamique selon `intent` (🎭 / ⚔️ / ⚖️)
- `Dialog.Title` + `Dialog.Description` (accessibilité)

---

## 5. EditBeefModal — détails

### Conservé intact

- `loadData()` — fetch `beefs`, participants, invitations, média
- `handleSave()` — diff participants, privacy RPC, upload teaser
- `validate()`, tags, mediator, recherche users
- Bouton « Annuler » appelle toujours `onClose()` directement

### Supprimé

- `onMouseDown` backdrop custom sur overlay root
- `onMouseDown stopPropagation` sur panneau
- Shell `motion.div` (carte principale)

### Fermeture

| Mécanisme | Implémentation |
|-----------|----------------|
| `onClose` parent | `onOpenChange` |
| X header | `Dialog.Close` |
| Annuler footer | `onClick={onClose}` (inchangé) |

---

## 6. Logique métier — non modifiée

| Fonction | CreateBeefForm | EditBeefModal |
|----------|------------------|---------------|
| Validation | `validateForm()` | `validate()` |
| Soumission | `handleSubmit()` → `onSubmit` | `handleSave()` → `onSaved` |
| Fetch | — | `loadData()` |
| Tags | `addTag`, `POPULAR_TAGS` | idem |
| Participants | `searchUsers`, `addParticipant` | + `addMediator`, diff save |

---

## 7. Props — inchangées (compat parents)

**CreateBeefForm :**

```typescript
{ onSubmit, onCancel }
```

**EditBeefModal :**

```typescript
{ beefId, onClose, onSaved }
```

Montage parent feed/create/live **non modifié**.

---

## 8. Validation TypeScript

```bash
npx tsc --noEmit
# exit code: 0
```

---

## 9. Checklist de test manuel

### CreateBeefForm
- [ ] Ouverture depuis feed (`showCreateModal`)
- [ ] Étape 0 : choix manifesto / mediation
- [ ] Retour ← reset intent sans fermer
- [ ] Validation champs + submit
- [ ] Fermeture X / overlay / Escape → `onCancel`
- [ ] Animation fade + zoom à l'ouverture

### EditBeefModal
- [ ] Ouverture depuis feed (`editBeefId`)
- [ ] Spinner load + pré-remplissage
- [ ] Modification + Enregistrer → `onSaved`
- [ ] Annuler / X / overlay → `onClose`
- [ ] Guard statut / propriétaire

---

## 10. Dépendances

```json
"@radix-ui/react-dialog": "^1.1.17",
"tailwindcss-animate": "^1.0.7"
```

Plugin animate activé dans `tailwind.config.ts`.

---

*Phase A.4 terminée — modales combat migrées vers Radix Dialog.*
