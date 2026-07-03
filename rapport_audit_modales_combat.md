# Audit source — Modales combat (CreateBeefForm & EditBeefModal)

> **Mission :** extraction à zéro modification pour préparer la migration vers `@radix-ui/react-dialog`.  
> **Date :** 2026-05-31  
> **Fichiers :** `components/CreateBeefForm.tsx` (878 lignes), `components/EditBeefModal.tsx` (958 lignes)

---

## 1. Synthèse comparative

| Élément | CreateBeefForm | EditBeefModal |
|---------|----------------|---------------|
| **Props** | `onSubmit`, `onCancel` | `beefId`, `onClose`, `onSaved` |
| **Prop `isOpen`** | ❌ Absente — montage conditionnel parent | ❌ Absente — `{editBeefId && …}` |
| **Portal** | ❌ Pas de `createPortal` | ❌ Pas de `createPortal` |
| **AnimatePresence** | ❌ Absent (interne et parent feed) | ❌ Absent |
| **UI shell** | `fixed inset-0` overlay + `motion.div` | `fixed inset-0` overlay + `motion.div` |
| **Fermeture backdrop** | ❌ Overlay sans handler (X seulement) | ✅ `onMouseDown` sur overlay root |
| **Machine à étapes** | ✅ `intent` null → manifesto/mediation | ❌ Intent chargé depuis DB |
| **Fetch initial** | ❌ (formulaire vierge) | ✅ `loadData()` via `beefId` |
| **framer-motion** | `motion.div` carte + chips tags | `motion.div` carte + chips tags |

---

## 2. CreateBeefForm — Props & fermeture

### 2.1 Interface

```typescript
interface CreateBeefFormProps {
  onSubmit: (data: SubmitBeefPayload) => Promise<void>;
  onCancel: () => void;
}
```

### 2.2 Consommateurs

| Fichier | Montage | `onCancel` |
|---------|---------|------------|
| `app/feed/page.tsx` | `{showCreateModal && <CreateBeefForm … />}` | `setShowCreateModal(false)` |
| `app/live/page.tsx` | conditionnel modal | fermeture locale |
| `app/create/page.tsx` | page dédiée full-screen | `navigateSmartBack(router, '/feed')` |

**Pas de prop `isOpen`** — le parent contrôle la visibilité par montage/démontage.

### 2.3 Mécanismes de fermeture actuels

| Mécanisme | Implémentation |
|-----------|----------------|
| Bouton X (L376–383) | `onClick={onCancel}` |
| Overlay backdrop | **Pas de click-to-dismiss** — div fixe sans handler |
| Retour étape 0 | `handleBackToChoice()` — reset `intent`, pas `onCancel` |
| Submit réussi | Parent `onSubmit` gère redirect/unmount |

---

## 3. CreateBeefForm — Machine à étapes (`intent`)

```typescript
const [intent, setIntent] = useState<BeefCreationIntent | null>(null);
```

| Étape | Condition UI | Action |
|-------|--------------|--------|
| **0 — Choix** | `intent === null` | 2 cartes : manifesto / mediation |
| **1 — Formulaire** | `intent !== null` | Champs unifiés + validation selon intent |
| **Retour** | `handleBackToChoice()` | `setIntent(null)` + reset `beefData`, teaser, errors |

**Validation différenciée (`validateForm`) :**
- Commun : titre (4+ chars), tags (≥1), description (50+ chars)
- `mediation` : 2–4 participants principaux + schedule optionnel
- `manifesto` : schedule optionnel si `is_scheduled`

**Submit (`handleSubmit`)** → construit `SubmitBeefPayload` → `onSubmit(payload)`

---

## 4. CreateBeefForm — État local & logique métier

| State | Rôle |
|-------|------|
| `beefData` | titre, description, tags, schedule, participants, event_type |
| `intent` | manifesto / mediation / null |
| `teaserFile` / `teaserPreview` | upload média local |
| `searchQuery` / `searchResults` | recherche participants Supabase |
| `tagInput` / `suggestedTags` | autocomplete tags (`POPULAR_TAGS`) |
| `fieldErrors` | validation inline |
| `loading` | submit en cours |

**Tables Supabase :** `user_public_profile` (search), payload via `onSubmit` → `submitNewBeef`

---

## 5. CreateBeefForm — Couche UI (cible Radix)

```tsx
<div className="fixed inset-0 z-modal …" role="dialog" aria-modal="true">
  <div className="flex min-h-[100dvh] …">
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className="max-h-[min(92dvh,…)] rounded-[2rem] bg-slate-950/60 backdrop-blur-3xl …">
      {/* contenu */}
    </motion.div>
  </div>
</div>
```

**Classes Premium Glass à préserver :** `bg-slate-950/60`, `backdrop-blur-3xl`, `border-white/10`, `shadow-modal`, `glass-prestige`, `brand-gradient`, `rounded-[2rem]`

**z-index :** `z-modal` (theme Tailwind = 100)

---

## 6. EditBeefModal — Props & `beefId`

### 6.1 Interface

```typescript
interface EditBeefModalProps {
  beefId: string;
  onClose: () => void;
  onSaved: () => void;
}
```

### 6.2 Consommateur — `app/feed/page.tsx`

```tsx
{editBeefId && (
  <EditBeefModal
    beefId={editBeefId}
    onClose={() => setEditBeefId(null)}
    onSaved={() => {
      setEditBeefId(null);
      void loadBeefs();
      toast('Affaire mise à jour', 'success');
    }}
  />
)}
```

---

## 7. EditBeefModal — Pré-remplissage (`loadData`)

**Déclenchement :** `useEffect(() => { void loadData(); }, [loadData]);` — dépend de `beefId`, `user?.id`

### 7.1 Fetch principal — table `beefs`

```typescript
supabase.from('beefs')
  .select('id, title, description, tags, scheduled_at, intent, created_by, status, video_url, thumbnail')
  .eq('id', beefId).single();
```

**Guards :**
- `created_by !== user.id` → toast + `onClose()`
- `status` ∉ `pending|scheduled|ready` → toast + `onClose()`

### 7.2 Champs pré-remplis

| Champ state | Source DB |
|-------------|-----------|
| `intent` | `beef.intent` → manifesto / mediation |
| `title`, `description`, `tags` | colonnes directes |
| `scheduledAt` | `beef.scheduled_at` → datetime-local (offset TZ) |
| `teaserPreview` | `video_url` ou `thumbnail` |
| `participants` | `beef_participants` + `fetchUserPublicByIds` |
| `mediator` | `beef_invitations` (`invite_type: ref_request`, status sent) si manifesto |

### 7.3 Snapshot diff — `handleSave`

- `initialParticipantSnapshot` vs participants actuels → added/removed
- Privacy RPC `get_users_privacy` avant nouvelles invitations
- Update `beefs`, delete/insert `beef_participants`, `beef_invitations`
- Upload teaser optionnel → bucket `teasers`
- Succès → `onSaved()`

---

## 8. EditBeefModal — Fermeture

| Mécanisme | Ligne | Détail |
|-----------|-------|--------|
| Bouton X | L622 | `onClick={onClose}` |
| Backdrop | L596–598 | `onMouseDown` si `e.target === e.currentTarget` |
| Erreur load | L239 | `onClose()` après toast |
| Bouton Annuler | L929 | `onClick={onClose}` |

---

## 9. Migration Radix — esquisse commune

```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm" />
    <Dialog.Content className="… glass …">
      <Dialog.Title>…</Dialog.Title>
      {/* logique métier inchangée */}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

**Points d'attention :**
- Conserver props existantes pour compat parents feed/create/live
- Remplacer `motion.div` shell par `Dialog.Content` + classes `data-[state=open]:animate-in` (tailwindcss-animate)
- Create : ajouter dismiss overlay via Radix (actuellement absent)
- Edit : remplacer `onMouseDown` backdrop custom par `Dialog.Overlay`
- Tags chips : `motion.div` interne peut rester ou migrer en CSS
- `z-modal` vs `z-[9999]` — harmoniser (Edit utilise 9999, Create z-modal=100)

---

## 10. Dépendances

```json
"@radix-ui/react-dialog": "^1.1.17"
```

Installé, non utilisé dans ces fichiers au moment de l'audit.

---

## 11. Checklist Ordre de Frappe

- [ ] CreateBeefForm → `Dialog.Root/Portal/Overlay/Content`
- [ ] EditBeefModal → idem
- [ ] Préserver machine à étapes `intent` (Create)
- [ ] Préserver `loadData` / `handleSave` diff (Edit)
- [ ] Props inchangées (compat feed)
- [ ] Premium Glass classes sur `Dialog.Content`
- [ ] Accessibilité : `Dialog.Title`, `Dialog.Description`, focus trap
- [ ] `npx tsc --noEmit`

---
## 12. Code source brut — `components/CreateBeefForm.tsx`

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  AlertTriangle,
  FileText,
  X,
  Check,
  Search,
  UserPlus,
  ImagePlus,
  Film,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import {
  minDateTimeLocalValue,
  scheduledLocalInputToIso,
  isScheduledTimeValid,
} from '@/lib/beef-schedule';
import type { BeefCreationIntent, BeefEventType, SubmitBeefPayload } from '@/lib/submitNewBeef';

interface BeefParticipant {
  user_id: string;
  username: string;
  display_name: string;
  is_main: boolean;
  role: 'participant' | 'witness';
}

interface BeefData {
  title: string;
  description: string;
  tags: string[];
  scheduled_at: string;
  is_scheduled: boolean;
  participants: BeefParticipant[];
  event_type: BeefEventType;
}

interface CreateBeefFormProps {
  onSubmit: (data: SubmitBeefPayload) => Promise<void>;
  onCancel: () => void;
}

const initialBeefData = (): BeefData => ({
  title: '',
  description: '',
  tags: [],
  scheduled_at: '',
  is_scheduled: false,
  participants: [],
  event_type: 'standard',
});

const getQuickDate = (hoursToAdd: number) => {
  const d = new Date();
  d.setHours(d.getHours() + hoursToAdd);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const getTonight = () => {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const getTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function CreateBeefForm({ onSubmit, onCancel }: CreateBeefFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [intent, setIntent] = useState<BeefCreationIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  const [beefData, setBeefData] = useState<BeefData>(initialBeefData);
  const [teaserFile, setTeaserFile] = useState<File | null>(null);
  const [teaserPreview, setTeaserPreview] = useState<string | null>(null);
  const teaserPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setTeaserFile(null);
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
      setTeaserPreview(null);
      return;
    }
    setTeaserFile(file);
    if (teaserPreviewUrlRef.current) {
      URL.revokeObjectURL(teaserPreviewUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    teaserPreviewUrlRef.current = url;
    setTeaserPreview(url);
  };

  const updateData = (field: keyof BeefData, value: unknown) => {
    setBeefData((prev) => ({ ...prev, [field]: value }));
  };

  const POPULAR_TAGS = [
    'tech', 'startup', 'argent', 'respect', 'business', 'crypto',
    'politique', 'sport', 'gaming', 'culture', 'justice', 'amitié',
    'famille', 'travail', 'collab', 'contrat', 'idée', 'crédit',
  ];

  const addTag = (tag: string) => {
    const cleanTag = tag.replace(/^[#$]/, '').trim().toLowerCase();
    if (!cleanTag) return;
    if (beefData.tags.length >= 10) {
      toast('Maximum 10 tags par beef', 'info');
      return;
    }
    if (beefData.tags.includes(cleanTag)) return;
    setBeefData((prev) => ({
      ...prev,
      tags: [...prev.tags, cleanTag],
    }));
    setTagInput('');
    setSuggestedTags([]);
  };

  const removeTag = (tag: string) => {
    setBeefData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleTagInput = (value: string) => {
    setTagInput(value);
    const searchTerm = value.replace(/^[#$]/, '').toLowerCase();
    const available = POPULAR_TAGS.filter((t) => !beefData.tags.includes(t));
    if (searchTerm.length > 0) {
      const matched = available.filter((t) => t.includes(searchTerm));
      setSuggestedTags(matched.slice(0, 6));
    } else {
      setSuggestedTags(available.slice(0, 6));
    }
  };

  const handleTagFocus = () => {
    if (!tagInput) {
      setSuggestedTags(POPULAR_TAGS.filter((t) => !beefData.tags.includes(t)).slice(0, 6));
    }
  };

  const handleTagBlur = () => {
    setTimeout(() => setSuggestedTags([]), 150);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && beefData.tags.length > 0) {
      removeTag(beefData.tags[beefData.tags.length - 1]);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id)
        .limit(5);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = (userData: Record<string, unknown>, isMain: boolean) => {
    const id = String(userData.id);
    if (beefData.participants.some((p) => p.user_id === id)) return;
    const newParticipant: BeefParticipant = {
      user_id: id,
      username: String(userData.username ?? ''),
      display_name: String(userData.display_name || userData.username || ''),
      is_main: isMain,
      role: 'participant',
    };
    setBeefData((prev) => ({
      ...prev,
      participants: [...prev.participants, newParticipant],
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeParticipant = (userId: string) => {
    setBeefData((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.user_id !== userId),
    }));
  };

  const toggleMainParticipant = (userId: string) => {
    setBeefData((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.user_id === userId ? { ...p, is_main: !p.is_main } : p
      ),
    }));
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mainParticipants = beefData.participants.filter((p) => p.is_main);

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!beefData.title.trim()) errors.title = 'Le titre est obligatoire.';
    else if (beefData.title.trim().length <= 3) errors.title = 'Le titre doit faire au moins 4 caractères.';
    if (beefData.tags.length === 0) errors.tags = 'Ajoute au moins 1 tag (#motclé).';
    if (!beefData.description.trim()) errors.description = 'La description est obligatoire.';
    else if (beefData.description.trim().length < 50)
      errors.description = `Description trop courte (${beefData.description.trim().length}/50 caractères minimum).`;

    if (intent === 'mediation') {
      if (mainParticipants.length < 2 || mainParticipants.length > 4) {
        errors.participants = 'Médiation : entre 2 et 4 participants principaux requis.';
      }
      if (beefData.is_scheduled) {
        if (!beefData.scheduled_at?.trim()) {
          errors.scheduled_at = 'Sélectionne une date et heure de programmation.';
        } else {
          const iso = scheduledLocalInputToIso(beefData.scheduled_at);
          if (!iso || !isScheduledTimeValid(iso)) {
            errors.scheduled_at =
              'Choisis une date et heure au moins ~2 minutes dans le futur (fuseau horaire de l’appareil).';
          }
        }
      }
    }

    if (intent === 'manifesto' && beefData.is_scheduled) {
      if (!beefData.scheduled_at?.trim()) {
        errors.scheduled_at = 'Sélectionne une date et heure ou désactive la programmation.';
      } else {
        const iso = scheduledLocalInputToIso(beefData.scheduled_at);
        if (!iso || !isScheduledTimeValid(iso)) {
          errors.scheduled_at =
            'Choisis une date et heure au moins ~2 minutes dans le futur (fuseau horaire de l’appareil).';
        }
      }
    }

    return errors;
  };

  const handleBackToChoice = () => {
    setIntent(null);
    setBeefData(initialBeefData());
    setTeaserFile(null);
    if (teaserPreviewUrlRef.current) {
      URL.revokeObjectURL(teaserPreviewUrlRef.current);
      teaserPreviewUrlRef.current = null;
    }
    setTeaserPreview(null);
    setFieldErrors({});
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    if (!intent) return;
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const payload: SubmitBeefPayload = {
        intent,
        event_type: beefData.event_type,
        title: beefData.title.trim(),
        description: beefData.description.trim(),
        tags: beefData.tags,
        scheduled_at: beefData.is_scheduled ? beefData.scheduled_at : '',
        participants: [
          ...beefData.participants.map((p) => ({
            user_id: p.user_id,
            role: p.role,
            is_main: p.is_main,
          })),
          ...(intent === 'manifesto' &&
          !beefData.participants.some((p) => p.user_id === user?.id) &&
          user?.id
            ? [{ user_id: user.id, role: 'participant' as const, is_main: true }]
            : []),
        ],
        teaser_file: teaserFile,
      };
      await onSubmit(payload);
    } catch (error: unknown) {
      console.error('Error creating beef:', error);
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : 'Erreur inconnue. Réessaie.';
      setFieldErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  };

  const splitCardClass =
    'glass-prestige flex flex-col gap-3 rounded-[1.25rem] border border-white/10 p-6 text-left transition-all hover:border-brand-500 cursor-pointer min-h-[160px] flex-1';

  return (
    <div
      className="fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm [scrollbar-gutter:stable]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-beef-dialog-title"
    >
      {/* Centrage si la modale est courte ; scroll sur l’overlay si elle est plus haute que le viewport */}
      <div className="flex min-h-[100dvh] w-full items-start justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:py-8">
        <div className="my-auto w-full max-w-2xl">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 shadow-modal backdrop-blur-3xl sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full brand-gradient text-xl" aria-hidden>
                🎭
              </div>
              <div>
                <h2 id="create-beef-dialog-title" className="text-xl font-black text-white">
                  {intent === null ? 'Nouvelle affaire' : intent === 'manifesto' ? 'Manifeste' : 'Médiation'}
                </h2>
                <p className="text-xs text-gray-400" id="create-beef-step-status">
                  {intent === null
                    ? 'Choisis ton intention'
                    : intent === 'manifesto'
                      ? 'Partie impliquée — expose ton dossier'
                      : 'Haute juridiction — convoque et arbitre'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label="Fermer la fenêtre Organiser un beef"
            >
              <X className="h-5 w-5 text-gray-400" aria-hidden />
            </button>
          </div>

          {/* Étape 0 — choix d’intention */}
          {intent === null && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <button type="button" className={splitCardClass} onClick={() => setIntent('manifesto')}>
                <span className="text-2xl" aria-hidden>
                  ⚔️
                </span>
                <span className="text-lg font-black text-white">PARTIE IMPLIQUÉE</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Publier un Manifeste</span>
                <p className="text-sm text-gray-400">
                  Exposez vos griefs et attendez qu&apos;un médiateur s&apos;empare du dossier.
                </p>
              </button>
              <button type="button" className={splitCardClass} onClick={() => setIntent('mediation')}>
                <span className="text-2xl" aria-hidden>
                  ⚖️
                </span>
                <span className="text-lg font-black text-white">HAUTE JURIDICTION</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Organiser une Médiation</span>
                <p className="text-sm text-gray-400">
                  Convoquez deux parties et arbitrez leur conflit.
                </p>
              </button>
            </div>
          )}

          {/* Formulaire unifié — tout défile dans la carte (plus de 75vh + footer hors écran) */}
          {intent !== null && (
            <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03]">
              <div className="shrink-0 border-b border-white/[0.06] px-4 py-2">
                <button
                  type="button"
                  onClick={handleBackToChoice}
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  ← Retour
                </button>
              </div>
              <div className="hide-scrollbar space-y-5 px-4 py-4">
                <div>
                  <label htmlFor="create-beef-title" className="mb-2 block text-sm font-semibold text-white">
                    Motif du litige
                  </label>
                  <input
                    id="create-beef-title"
                    type="text"
                    value={beefData.title}
                    onChange={(e) => {
                      updateData('title', e.target.value);
                      setFieldErrors((p) => {
                        const n = { ...p };
                        delete n.title;
                        return n;
                      });
                    }}
                    placeholder="Ex : Idée volée, conflit d’associés, créance…"
                    className={`w-full rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                      fieldErrors.title ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                    }`}
                    maxLength={100}
                  />
                  {fieldErrors.title ? (
                    <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.title}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Titre clair du litige</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <Film className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
                    Teaser (Vidéo ou Image)
                  </label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => document.getElementById('teaser-upload')?.click()}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        document.getElementById('teaser-upload')?.click();
                      }
                    }}
                    className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.5rem] border-2 border-dashed border-white/10 bg-white/5 transition-all hover:border-brand-500/50 hover:bg-white/10"
                  >
                    {teaserPreview ? (
                      teaserFile?.type.startsWith('video/') ? (
                        <div className="relative h-full w-full">
                          <video
                            src={teaserPreview}
                            className="h-full w-full object-contain bg-black"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                          <div className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                            <Film className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                          </div>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob)
                        <img src={teaserPreview} className="h-full w-full object-contain bg-black" alt="Aperçu teaser" />
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-white/40">
                        <div className="flex items-center gap-5">
                          <ImagePlus className="h-6 w-6" aria-hidden />
                          <Film className="h-6 w-6 text-brand-400" aria-hidden />
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-tighter">Photo ou vidéo</span>
                      </div>
                    )}
                    <input
                      id="teaser-upload"
                      type="file"
                      accept="video/*,image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="create-beef-description" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <FileText className="h-4 w-4 text-cyan-400" aria-hidden />
                    Description
                  </label>
                  <textarea
                    id="create-beef-description"
                    value={beefData.description}
                    onChange={(e) => {
                      updateData('description', e.target.value);
                      setFieldErrors((p) => {
                        const n = { ...p };
                        delete n.description;
                        return n;
                      });
                    }}
                    placeholder={
                      intent === 'manifesto'
                        ? 'Expose les faits, les enjeux, ce que tu attends…'
                        : 'Contexte pour les parties et le déroulé souhaité…'
                    }
                    rows={5}
                    className={`w-full resize-y rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                      fieldErrors.description ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                    }`}
                    maxLength={1000}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p
                      className={`text-xs font-semibold ${
                        beefData.description.length < 50
                          ? 'text-red-400'
                          : beefData.description.length < 100
                            ? 'text-yellow-400'
                            : 'text-green-400'
                      }`}
                    >
                      {beefData.description.length < 50
                        ? `⚠️ Minimum 50 caractères (${50 - beefData.description.length} restants)`
                        : `✓ ${beefData.description.length} caractères`}
                    </p>
                    <p className="text-xs text-gray-500">{beefData.description.length}/1000</p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="text-lg text-brand-400">#</span>
                    Tags (max 10)
                  </label>
                  <p className="mb-2 text-xs text-gray-400">Mots-clés pour le fil et la découverte</p>
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="flex min-h-[44px] flex-1 flex-wrap gap-2 rounded-[2rem] border border-white/[0.06] bg-white/[0.04] p-2">
                        {beefData.tags.map((tag) => (
                          <motion.div
                            key={tag}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1 rounded-full brand-gradient px-2 py-1 text-xs font-bold text-black"
                          >
                            <span>#{tag}</span>
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="rounded-full p-0.5 transition-colors hover:bg-black/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.div>
                        ))}
                        {beefData.tags.length < 10 && (
                          <div className="relative min-w-[120px] flex-1">
                            {suggestedTags[0] && tagInput && (
                              <span className="pointer-events-none absolute inset-0 flex select-none items-center text-sm">
                                <span className="invisible">{tagInput.replace(/^[#$]/, '')}</span>
                                <span className="text-gray-600">
                                  {suggestedTags[0].slice(tagInput.replace(/^[#$]/, '').length)}
                                </span>
                              </span>
                            )}
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => handleTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestedTags[0] && tagInput) {
                                  e.preventDefault();
                                  addTag(suggestedTags[0]);
                                  return;
                                }
                                handleTagKeyDown(e);
                              }}
                              onFocus={handleTagFocus}
                              onBlur={handleTagBlur}
                              placeholder={beefData.tags.length === 0 ? 'Tape un mot…' : 'Ajouter…'}
                              className="relative z-10 w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {suggestedTags.length > 0 && beefData.tags.length < 10 && (
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                        {suggestedTags.map((tag, i) => (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={() => addTag(tag)}
                            className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                              i === 0 && tagInput
                                ? 'border border-brand-500/50 bg-brand-500/25 text-brand-300'
                                : 'border border-white/20 bg-white/10 text-white/80 hover:border-cyan-500/40 hover:text-cyan-300'
                            }`}
                          >
                            <span className="text-brand-400/70">#</span>
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {beefData.tags.length}/10 · Entrée ou Espace pour valider
                      {suggestedTags[0] && tagInput ? ' · Tab pour l’auto-complétion' : ''}
                    </p>
                    {fieldErrors.tags && <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.tags}</p>}
                  </div>
                </div>

                {/* Participants — recherche conservée */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-white">
                    {intent === 'manifesto' ? 'Adversaires ou cibles (optionnel)' : 'Convoquer les parties'}
                  </label>
                  <p className="mb-3 text-xs text-gray-400">
                    {intent === 'manifesto'
                      ? 'Tu peux publier sans inviter, ou taguer des comptes.'
                      : 'Entre 2 et 4 participants principaux requis.'}
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        void searchUsers(e.target.value);
                      }}
                      placeholder="Rechercher un utilisateur…"
                      className="w-full rounded-[2rem] border border-white/[0.06] bg-white/[0.04] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none"
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                      </div>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto overflow-hidden rounded-[2rem] border border-gray-700 bg-black/60">
                      {searchResults.map((result) => (
                        <button
                          key={String(result.id)}
                          type="button"
                          onClick={() => addParticipant(result, beefData.participants.length < 4)}
                          className="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-white/5"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                            {String(result.display_name || result.username || '?')[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {String(result.display_name || result.username)}
                            </p>
                            <p className="truncate text-xs text-gray-400">@{String(result.username)}</p>
                          </div>
                          <UserPlus className="h-4 w-4 flex-shrink-0 text-brand-400" />
                        </button>
                      ))}
                    </div>
                  )}
                  {beefData.participants.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {beefData.participants.map((participant) => (
                        <div
                          key={participant.user_id}
                          className="flex items-center gap-2 rounded-[2rem] border border-gray-700 bg-black/40 p-2"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                            {participant.display_name[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{participant.display_name}</p>
                            <p className="truncate text-xs text-gray-400">@{participant.username}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleMainParticipant(participant.user_id)}
                            className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-bold transition-all ${
                              participant.is_main ? 'bg-brand-500 text-black' : 'border border-white/20 bg-white/10 text-white/70 hover:bg-white/15'
                            }`}
                          >
                            {participant.is_main ? '🔥 Principal' : 'Témoin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeParticipant(participant.user_id)}
                            className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-red-500/20"
                          >
                            <X className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      ))}
                      {intent === 'mediation' && (mainParticipants.length < 2 || mainParticipants.length > 4) && (
                        <p className="flex items-center gap-1 text-xs text-yellow-400">
                          <AlertTriangle className="h-3 w-3" />
                          Entre 2 et 4 participants principaux requis.
                        </p>
                      )}
                      {fieldErrors.participants && (
                        <p className="text-xs text-red-400">⚠️ {fieldErrors.participants}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-[2rem] border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Calendar className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
                    Démarrage du beef
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      <input
                        type="radio"
                        name="beef-schedule-mode"
                        checked={!beefData.is_scheduled}
                        onChange={() => {
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.scheduled_at;
                            return n;
                          });
                          setBeefData((prev) => ({ ...prev, is_scheduled: false, scheduled_at: '' }));
                        }}
                        className="mt-1 h-4 w-4 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Dès que c’est prêt</span>
                        <span className="block text-xs text-gray-400">Pas de date fixée.</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      <input
                        type="radio"
                        name="beef-schedule-mode"
                        checked={beefData.is_scheduled}
                        onChange={() => {
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.scheduled_at;
                            return n;
                          });
                          setBeefData((prev) => ({ ...prev, is_scheduled: true, scheduled_at: getQuickDate(2) }));
                        }}
                        className="mt-1 h-4 w-4 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="block text-sm font-semibold text-white">Programmer</span>
                    </label>
                  </div>
                  {beefData.is_scheduled && (
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getQuickDate(2))}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Dans 2h
                        </button>
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getTonight())}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Ce soir 21h
                        </button>
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getTomorrow())}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Demain 20h
                        </button>
                      </div>
                      <div className="relative mt-2">
                        <input
                          type="datetime-local"
                          value={beefData.scheduled_at}
                          min={minDateTimeLocalValue()}
                          onChange={(e) => {
                            updateData('scheduled_at', e.target.value);
                            setFieldErrors((p) => {
                              const n = { ...p };
                              delete n.scheduled_at;
                              return n;
                            });
                          }}
                          style={{ colorScheme: 'dark' }}
                          className="w-full cursor-pointer text-center rounded-[2rem] border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-white transition-colors focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {fieldErrors.scheduled_at && (
                    <p className="pl-8 text-xs text-red-400">⚠️ {fieldErrors.scheduled_at}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {Object.values(fieldErrors).some(Boolean) && (
            <div className="mt-4 space-y-1 rounded-[2rem] border border-red-500/40 bg-red-500/10 p-3">
              {Object.values(fieldErrors)
                .filter(Boolean)
                .map((err, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-red-400">
                    <span className="mt-0.5">⚠️</span>
                    <span>{err}</span>
                  </p>
                ))}
            </div>
          )}

          {intent !== null && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-[2rem] bg-white py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all hover:bg-gray-200 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    <span>Création…</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{intent === 'manifesto' ? 'Publier le Manifeste' : 'Convoquer le Tribunal'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="mt-3 rounded-[2rem] border border-cyan-500/20 bg-cyan-500/10 p-2">
            <p className="text-xs text-cyan-400">
              <strong>Obligatoire :</strong> titre, tags, description (50+ caractères).{' '}
              {intent === 'mediation' && 'Médiation : entre 2 et 4 participants principaux.'}
            </p>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}

```

## 13. Code source brut — `components/EditBeefModal.tsx`

```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Search,
  UserPlus,
  FileText,
  AlertTriangle,
  Check,
  ImagePlus,
  Film,
  CalendarDays,
  Scale,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

interface EditBeefModalProps {
  beefId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EditableParticipant {
  user_id: string;
  username: string;
  display_name: string;
  is_main: boolean;
  role: 'participant' | 'witness';
}

interface EditableMediator {
  user_id: string;
  username: string;
  display_name: string;
}

interface PublicProfileSearchRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
}

const POPULAR_TAGS = [
  'tech',
  'startup',
  'argent',
  'respect',
  'business',
  'crypto',
  'politique',
  'sport',
  'gaming',
  'culture',
  'justice',
  'amitié',
  'famille',
  'travail',
  'collab',
  'contrat',
  'idée',
  'crédit',
];

/** Aligné avec `submitNewBeef` : péremption invitations combattants / arbitre. */
function invitationExpiresIso(scheduledAtIso: string | null): string {
  let expiresAt = new Date();
  if (scheduledAtIso) {
    const when = new Date(scheduledAtIso);
    if (!Number.isNaN(when.getTime())) {
      expiresAt = new Date(when);
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      return expiresAt.toISOString();
    }
  }
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt.toISOString();
}

export function EditBeefModal({ beefId, onClose, onSaved }: EditBeefModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intent, setIntent] = useState<'manifesto' | 'mediation'>('mediation');
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');

  const [participants, setParticipants] = useState<EditableParticipant[]>([]);
  const [mediator, setMediator] = useState<EditableMediator | null>(null);
  /** Invité convoqué au chargement (ref_request envoyée). */
  const [initialRefInviteeId, setInitialRefInviteeId] = useState<string | null>(null);

  const [initialParticipantSnapshot, setInitialParticipantSnapshot] = useState<Map<string, { is_main: boolean; role: string }>>(
    () => new Map(),
  );

  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfileSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [teaserFile, setTeaserFile] = useState<File | null>(null);
  const [teaserPreview, setTeaserPreview] = useState<string | null>(null);
  const [remotePreviewIsVideo, setRemotePreviewIsVideo] = useState(false);
  const teaserPreviewUrlRef = useRef<string | null>(null);
  const baselineMediaRef = useRef<{ video: string | null; thumb: string | null }>({ video: null, thumb: null });

  useEffect(() => {
    return () => {
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.id || !beefId) return;
    setLoading(true);
    try {
      const { data: beef, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, description, tags, scheduled_at, intent, created_by, status, video_url, thumbnail')
        .eq('id', beefId)
        .single();

      if (beefErr) throw beefErr;
      if (!beef) throw new Error('Affaire introuvable');
      if (beef.created_by !== user.id) {
        toast('Tu ne peux pas modifier cette affaire.', 'error');
        onClose();
        return;
      }
      if (!['pending', 'scheduled', 'ready'].includes(beef.status as string)) {
        toast('Modification impossible une fois le combat commencé ou terminé.', 'error');
        onClose();
        return;
      }

      const rawIntent = beef.intent as string | null;
      setIntent(rawIntent === 'manifesto' ? 'manifesto' : 'mediation');
      setCreatedBy(beef.created_by ?? null);
      setTitle(beef.title || '');
      setDescription(beef.description || '');
      setTags(Array.isArray(beef.tags) ? [...beef.tags] : []);

      if (beef.scheduled_at) {
        const date = new Date(beef.scheduled_at as string);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        setScheduledAt(date.toISOString().slice(0, 16));
      } else {
        setScheduledAt('');
      }

      setInitialRefInviteeId(null);
      setMediator(null);

      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
      setTeaserFile(null);
      const vUrl = beef.video_url as string | null | undefined;
      const tUrl = beef.thumbnail as string | null | undefined;
      setRemotePreviewIsVideo(Boolean(vUrl));
      setTeaserPreview(vUrl || tUrl || null);
      baselineMediaRef.current = { video: vUrl ?? null, thumb: tUrl ?? null };

      const { data: partRows, error: partErr } = await supabase
        .from('beef_participants')
        .select('user_id, role, is_main, invite_status')
        .eq('beef_id', beefId);

      if (partErr) throw partErr;

      const ids = (partRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);

      let pendingRefInviteeId: string | null = null;
      if (rawIntent === 'manifesto') {
        const { data: refInvRow, error: refErr } = await supabase
          .from('beef_invitations')
          .select('invitee_id, status')
          .eq('beef_id', beefId)
          .eq('invite_type', 'ref_request')
          .eq('status', 'sent')
          .maybeSingle();

        if (refErr) throw refErr;
        if (refInvRow?.invitee_id && typeof refInvRow.invitee_id === 'string') {
          pendingRefInviteeId = refInvRow.invitee_id;
          if (!ids.includes(pendingRefInviteeId)) ids.push(pendingRefInviteeId);
        }
        setInitialRefInviteeId(pendingRefInviteeId);
      }

      const pmap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name, avatar_url');

      const snap = new Map<string, { is_main: boolean; role: string }>();
      const loaded: EditableParticipant[] = (partRows ?? []).map((r: { user_id: string; role: string | null; is_main: boolean | null }) => {
        const pr = pmap.get(r.user_id);
        snap.set(r.user_id, { is_main: !!r.is_main, role: r.role || 'participant' });
        return {
          user_id: r.user_id,
          username: pr?.username ?? '',
          display_name: displayNameFromPublicRow(pr, r.user_id.slice(0, 8)),
          is_main: !!r.is_main,
          role: (r.role === 'witness' ? 'witness' : 'participant') as 'participant' | 'witness',
        };
      });

      if (pendingRefInviteeId) {
        const pr = pmap.get(pendingRefInviteeId);
        setMediator({
          user_id: pendingRefInviteeId,
          username: pr?.username ?? '',
          display_name: displayNameFromPublicRow(pr, 'Arbitre'),
        });
      }

      setInitialParticipantSnapshot(snap);
      setParticipants(loaded);
    } catch (e: unknown) {
      console.error(e);
      toast(e instanceof Error ? e.message : 'Impossible de charger l’affaire', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [beefId, user?.id, onClose, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setTeaserFile(null);
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
      const { video, thumb } = baselineMediaRef.current;
      setRemotePreviewIsVideo(Boolean(video));
      setTeaserPreview(video || thumb || null);
      return;
    }
    setTeaserFile(file);
    setRemotePreviewIsVideo(file.type.startsWith('video/'));
    if (teaserPreviewUrlRef.current) {
      URL.revokeObjectURL(teaserPreviewUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    teaserPreviewUrlRef.current = url;
    setTeaserPreview(url);
  };

  const addTag = (tag: string) => {
    const cleanTag = tag.replace(/^[#$]/, '').trim().toLowerCase();
    if (!cleanTag) return;
    if (tags.length >= 10) {
      toast('Maximum 10 tags par beef', 'info');
      return;
    }
    if (tags.includes(cleanTag)) return;
    setTags((prev) => [...prev, cleanTag]);
    setTagInput('');
    setSuggestedTags([]);
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTagInput = (value: string) => {
    setTagInput(value);
    const searchTerm = value.replace(/^[#$]/, '').toLowerCase();
    const available = POPULAR_TAGS.filter((t) => !tags.includes(t));
    if (searchTerm.length > 0) {
      const matched = available.filter((t) => t.includes(searchTerm));
      setSuggestedTags(matched.slice(0, 6));
    } else {
      setSuggestedTags(available.slice(0, 6));
    }
  };

  const handleTagFocus = () => {
    if (!tagInput) {
      setSuggestedTags(POPULAR_TAGS.filter((t) => !tags.includes(t)).slice(0, 6));
    }
  };

  const handleTagBlur = () => {
    setTimeout(() => setSuggestedTags([]), 150);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id ?? '')
        .limit(5);
      if (error) throw error;
      setSearchResults((data ?? []) as PublicProfileSearchRow[]);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = (row: PublicProfileSearchRow, isMainDefault: boolean) => {
    const id = String(row.id);
    if (participants.some((p) => p.user_id === id) || mediator?.user_id === id) return;
    const newParticipant: EditableParticipant = {
      user_id: id,
      username: String(row.username ?? ''),
      display_name: String(row.display_name || row.username || ''),
      is_main: isMainDefault,
      role: 'participant',
    };
    setParticipants((prev) => [...prev, newParticipant]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const addMediator = (row: PublicProfileSearchRow) => {
    const id = String(row.id);
    if (participants.some((p) => p.user_id === id)) return;
    setMediator({
      user_id: id,
      username: String(row.username ?? ''),
      display_name: String(row.display_name || row.username || ''),
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeParticipant = (userId: string) => {
    if (intent === 'manifesto' && userId === user?.id) {
      toast('Tu ne peux pas te retirer en tant que partie du manifeste.', 'info');
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
  };

  const toggleMainParticipant = (userId: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.user_id === userId ? { ...p, is_main: !p.is_main } : p)),
    );
  };

  const mainParticipants = participants.filter((p) => p.is_main);

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Le titre est obligatoire.';
    else if (title.trim().length <= 3) errors.title = 'Le titre doit faire au moins 4 caractères.';
    if (tags.length === 0) errors.tags = 'Ajoute au moins 1 tag.';
    if (!description.trim()) errors.description = 'La description est obligatoire.';
    else if (description.trim().length < 50) {
      errors.description = `Description trop courte (${description.trim().length}/50 minimum).`;
    }
    if (intent === 'mediation' && (mainParticipants.length < 2 || mainParticipants.length > 4)) {
      errors.participants = 'Médiation : entre 2 et 4 participants principaux requis.';
    }
    return errors;
  };

  const assertInvitationPrivacyAllows = async (inviteeIds: string[]) => {
    const uniqueInviteeIds = [...new Set(inviteeIds)];
    if (uniqueInviteeIds.length === 0 || !user?.id) return;

    const { data: targetUsers, error: targetErr } = await supabase.rpc('get_users_privacy', {
      target_ids: uniqueInviteeIds,
    });

    if (targetErr) throw new Error('Erreur serveur lors de la vérification de la confidentialité.');
    if (!targetUsers || targetUsers.length !== uniqueInviteeIds.length) {
      throw new Error('Impossible de vérifier les paramètres de tous les utilisateurs ciblés.');
    }

    for (const target of targetUsers) {
      const privacy = (target.invitation_privacy as string | null) || 'everyone';
      const targetName =
        typeof target.display_name === 'string' && target.display_name.trim()
          ? target.display_name
          : typeof target.username === 'string' && target.username.trim()
            ? target.username
            : 'Cet utilisateur';

      if (privacy === 'nobody') {
        throw new Error(`${targetName} n’accepte aucune invitation pour le moment.`);
      }

      if (privacy === 'following') {
        const { data: follows, error: followErr } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', target.id as string)
          .eq('following_id', user.id)
          .maybeSingle();

        if (followErr) throw new Error(`Erreur vérification accès pour ${targetName}.`);
        if (!follows) throw new Error(`${targetName} n’accepte les défis que de ses abonnements.`);
      }
    }
  };

  const handleSave = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!user?.id) return;

    const scheduledAtIso =
      scheduledAt.trim().length > 0 ? new Date(scheduledAt).toISOString() : null;

    const initialNorm = initialRefInviteeId ?? null;
    const finalRefId = mediator?.user_id ?? null;
    const refInviteChanged = intent === 'manifesto' && initialNorm !== finalRefId;

    setSaving(true);
    try {
      const initialIds = new Set(initialParticipantSnapshot.keys());
      const currentIds = new Set(participants.map((p) => p.user_id));
      let removed = [...initialIds].filter((id) => !currentIds.has(id));
      removed = removed.filter((id) => !(intent === 'manifesto' && id === user.id));
      const added = participants.filter((p) => !initialIds.has(p.user_id));

      const invitesNeedingPrivacyCheck: string[] = added.map((p) => p.user_id);
      if (refInviteChanged && finalRefId) invitesNeedingPrivacyCheck.push(finalRefId);

      await assertInvitationPrivacyAllows(invitesNeedingPrivacyCheck);

      const expiresAtIso = invitationExpiresIso(scheduledAtIso);

      let videoUrlPayload: string | null | undefined;
      let thumbnailPayload: string | null | undefined;

      if (teaserFile) {
        const fileExt = teaserFile.name.split('.').pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('teasers').upload(fileName, teaserFile);
        if (uploadError) throw uploadError;
        if (!uploadData) throw new Error('Upload teaser échoué');
        const { data: publicUrlData } = supabase.storage.from('teasers').getPublicUrl(fileName);
        const isVideo = teaserFile.type.startsWith('video/');
        if (isVideo) {
          videoUrlPayload = publicUrlData.publicUrl;
          thumbnailPayload = null;
        } else {
          thumbnailPayload = publicUrlData.publicUrl;
          videoUrlPayload = null;
        }
      }

      const { error: upBeefErr } = await supabase
        .from('beefs')
        .update({
          title: title.trim(),
          subject: title.trim(),
          description: description.trim(),
          tags,
          scheduled_at: scheduledAtIso,
          ...(teaserFile ? { video_url: videoUrlPayload, thumbnail: thumbnailPayload } : {}),
        })
        .eq('id', beefId)
        .eq('created_by', user.id);

      if (upBeefErr) throw upBeefErr;

      if (removed.length > 0) {
        const { error: invDelErr } = await supabase
          .from('beef_invitations')
          .delete()
          .eq('beef_id', beefId)
          .in('invitee_id', removed);
        if (invDelErr) throw invDelErr;

        const { error: bpDelErr } = await supabase
          .from('beef_participants')
          .delete()
          .eq('beef_id', beefId)
          .in('user_id', removed);
        if (bpDelErr) throw bpDelErr;
      }

      for (const p of added) {
        const { error: insP } = await supabase.from('beef_participants').insert({
          beef_id: beefId,
          user_id: p.user_id,
          role: p.role,
          is_main: p.is_main,
          invite_status: 'pending',
        });
        if (insP) throw insP;

        const { error: insI } = await supabase.from('beef_invitations').insert({
          beef_id: beefId,
          inviter_id: user.id,
          invitee_id: p.user_id,
          status: 'sent',
          expires_at: expiresAtIso,
        });
        if (insI) throw insI;
      }

      if (refInviteChanged) {
        const { error: refDelErr } = await supabase
          .from('beef_invitations')
          .delete()
          .eq('beef_id', beefId)
          .eq('invite_type', 'ref_request');
        if (refDelErr) throw refDelErr;

        if (finalRefId) {
          const { error: insRefErr } = await supabase.from('beef_invitations').insert({
            beef_id: beefId,
            inviter_id: user.id,
            invitee_id: finalRefId,
            invite_type: 'ref_request',
            status: 'sent',
            expires_at: expiresAtIso,
          });
          if (insRefErr) throw insRefErr;
        }
      }

      for (const p of participants) {
        const init = initialParticipantSnapshot.get(p.user_id);
        if (!init) continue;
        if (init.is_main === p.is_main && init.role === p.role) continue;
        const { error: upP } = await supabase
          .from('beef_participants')
          .update({ is_main: p.is_main, role: p.role })
          .eq('beef_id', beefId)
          .eq('user_id', p.user_id);
        if (upP) throw upP;
      }

      onSaved();
    } catch (e: unknown) {
      console.error(e);
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : 'Erreur lors de l’enregistrement.';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const canRemoveParticipant = (userId: string) => {
    if (intent === 'manifesto' && userId === createdBy) return false;
    return true;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm [scrollbar-gutter:stable]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-beef-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-[100dvh] w-full items-start justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:py-8">
        <div className="my-auto w-full max-w-2xl">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full overflow-y-auto overscroll-contain rounded-[2rem] border border-white/10 bg-slate-950/60 p-5 shadow-modal backdrop-blur-3xl sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full brand-gradient text-xl" aria-hidden>
                  ⚖️
                </div>
                <div>
                  <h2 id="edit-beef-title" className="text-xl font-black text-white">
                    Modifier l&apos;affaire
                  </h2>
                  <p className="text-xs text-gray-400">
                    {intent === 'manifesto' ? 'Manifeste · brouillon Agora' : 'Médiation · ajustements'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-white/10" aria-label="Fermer">
                <X className="h-5 w-5 text-gray-400" aria-hidden />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                <span className="text-sm font-medium">Chargement…</span>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03]">
                <div className="hide-scrollbar space-y-5 px-4 py-4">
                  <div>
                    <label htmlFor="edit-beef-title-input" className="mb-2 block text-sm font-semibold text-white">
                      Motif du litige
                    </label>
                    <input
                      id="edit-beef-title-input"
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.title;
                          return n;
                        });
                      }}
                      placeholder="Ex : Idée volée, conflit d’associés…"
                      maxLength={100}
                      className={`w-full rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                        fieldErrors.title ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                      }`}
                    />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.title}</p>}
                  </div>

                  <div>
                    <label htmlFor="edit-beef-date" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <CalendarDays className="h-4 w-4 text-cyan-400" aria-hidden />
                      Date et heure de l&apos;affrontement
                    </label>
                    <input
                      id="edit-beef-date"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-[2rem] border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none"
                    />
                    <p className="mt-1 pl-2 text-xs text-gray-500">
                      Laisse vide si le combat doit commencer dès que tout le monde est prêt.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                      <Film className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
                      Teaser (Vidéo ou Image)
                    </label>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') document.getElementById('edit-beef-teaser-upload')?.click();
                      }}
                      onClick={() => document.getElementById('edit-beef-teaser-upload')?.click()}
                      className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.5rem] border-2 border-dashed border-white/10 bg-white/5 transition-all hover:border-brand-500/50 hover:bg-white/10"
                    >
                      {teaserPreview ? (
                        teaserFile?.type.startsWith('video/') || (!teaserFile && remotePreviewIsVideo) ? (
                          <div className="relative h-full w-full">
                            <video src={teaserPreview} className="h-full w-full bg-black object-contain" muted loop autoPlay playsInline />
                            <div className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                              <Film className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                            </div>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={teaserPreview} className="h-full w-full bg-black object-contain" alt="Aperçu teaser" />
                        )
                      ) : (
                        <div className="flex flex-col items-center gap-3 text-white/40">
                          <div className="flex items-center gap-5">
                            <ImagePlus className="h-6 w-6" aria-hidden />
                            <Film className="h-6 w-6 text-brand-400" aria-hidden />
                          </div>
                          <span className="text-[10px] font-medium uppercase tracking-tighter">Photo ou vidéo</span>
                        </div>
                      )}
                      <input id="edit-beef-teaser-upload" type="file" accept="video/*,image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-beef-description" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <FileText className="h-4 w-4 text-cyan-400" aria-hidden />
                      Description
                    </label>
                    <textarea
                      id="edit-beef-description"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.description;
                          return n;
                        });
                      }}
                      rows={5}
                      maxLength={1000}
                      className={`w-full resize-y rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                        fieldErrors.description ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                      }`}
                    />
                    <div className="mt-2 flex justify-between text-xs">
                      <span className={description.trim().length < 50 ? 'font-semibold text-red-400' : 'font-semibold text-green-400'}>
                        {description.trim().length < 50
                          ? `⚠️ Minimum 50 caractères (${50 - description.trim().length} restants)`
                          : `✓ ${description.length} caractères`}
                      </span>
                      <span className="text-gray-500">{description.length}/1000</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="text-lg text-brand-400">#</span> Tags (max 10)
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="flex min-h-[44px] flex-1 flex-wrap gap-2 rounded-[2rem] border border-white/[0.06] bg-white/[0.04] p-2">
                          {tags.map((tag) => (
                            <motion.div
                              key={tag}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="flex items-center gap-1 rounded-full brand-gradient px-2 py-1 text-xs font-bold text-black"
                            >
                              <span>#{tag}</span>
                              <button type="button" onClick={() => removeTag(tag)} className="rounded-full p-0.5 transition-colors hover:bg-black/20">
                                <X className="h-3 w-3" />
                              </button>
                            </motion.div>
                          ))}
                          {tags.length < 10 && (
                            <div className="relative min-w-[120px] flex-1">
                              <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => handleTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                onFocus={handleTagFocus}
                                onBlur={handleTagBlur}
                                placeholder={tags.length === 0 ? 'Tape un mot…' : 'Ajouter…'}
                                className="relative z-10 w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {suggestedTags.length > 0 && tags.length < 10 && (
                        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                          {suggestedTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onMouseDown={() => addTag(tag)}
                              className={`flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80 transition-all hover:border-cyan-500/40 hover:text-cyan-300`}
                            >
                              <span className="text-brand-400/70">#</span>
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-white">
                      {intent === 'manifesto' ? 'Convoquer des Combattants ou un Arbitre' : 'Convoquer / ajuster les parties'}
                    </label>
                    <p className="mb-3 text-xs text-gray-400">
                      {intent === 'mediation'
                        ? 'Entre 2 et 4 participants avec le badge Principal.'
                        : 'Tu peux convoquer tes adversaires ou réclamer un Arbitre.'}
                    </p>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          void searchUsers(e.target.value);
                        }}
                        placeholder="Rechercher un utilisateur…"
                        className="w-full rounded-[2rem] border border-white/[0.06] bg-white/[0.04] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none"
                      />
                      {searching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                        </div>
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto overflow-hidden rounded-[2rem] border border-gray-700 bg-black/60 p-1">
                        {searchResults.map((result) => (
                          <div key={result.id} className="flex items-center justify-between rounded-xl p-2 transition-colors hover:bg-white/5">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                                {(result.display_name || result.username || '?')[0]?.toUpperCase() ?? '?'}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">{String(result.display_name || result.username)}</p>
                                <p className="truncate text-xs text-gray-400">@{String(result.username)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => addParticipant(result, participants.length < 2)}
                                className="rounded-lg bg-brand-500/20 p-2 text-xs font-bold text-brand-400 transition-colors hover:bg-brand-500 hover:text-black"
                                title="Ajouter comme combattant"
                              >
                                <UserPlus className="h-4 w-4" />
                              </button>
                              {intent === 'manifesto' && !mediator && (
                                <button
                                  type="button"
                                  onClick={() => addMediator(result)}
                                  className="rounded-lg bg-yellow-500/20 p-2 text-xs font-bold text-yellow-500 transition-colors hover:bg-yellow-500 hover:text-black"
                                  title="Demander comme Arbitre"
                                >
                                  <Scale className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {mediator && (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-500">Arbitre convoqué</p>
                        <div className="flex items-center gap-2 rounded-[2rem] border border-yellow-500/30 bg-yellow-500/10 p-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-black">
                            {(mediator.display_name || mediator.username || '?')[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{mediator.display_name}</p>
                            <p className="truncate text-xs text-yellow-500/70">@{mediator.username || '…'}</p>
                          </div>
                          <button type="button" onClick={() => setMediator(null)} className="shrink-0 rounded-lg p-1 transition-colors hover:bg-red-500/20">
                            <X className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    )}

                    {participants.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Combattants / Témoins</p>
                        {participants.map((participant) => (
                          <div key={participant.user_id} className="flex items-center gap-2 rounded-[2rem] border border-gray-700 bg-black/40 p-2">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                              {(participant.display_name || participant.username || '?')[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{participant.display_name}</p>
                              <p className="truncate text-xs text-gray-400">@{participant.username || '…'}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleMainParticipant(participant.user_id)}
                              className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold transition-all ${participant.is_main ? 'bg-brand-500 text-black' : 'border border-white/20 bg-white/10 text-white/70 hover:bg-white/15'}`}
                            >
                              {participant.is_main ? '🔥 Principal' : 'Témoin'}
                            </button>
                            {canRemoveParticipant(participant.user_id) ? (
                              <button type="button" onClick={() => removeParticipant(participant.user_id)} className="shrink-0 rounded-lg p-1 transition-colors hover:bg-red-500/20">
                                <X className="h-4 w-4 text-red-400" />
                              </button>
                            ) : (
                              <span className="shrink-0 px-2 text-[10px] font-bold uppercase text-white/35">Créateur</span>
                            )}
                          </div>
                        ))}
                        {intent === 'mediation' && (mainParticipants.length < 2 || mainParticipants.length > 4) && (
                          <p className="flex items-center gap-1 text-xs text-yellow-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            Entre 2 et 4 participants principaux requis.
                          </p>
                        )}
                        {fieldErrors.participants && <p className="text-xs text-red-400">⚠️ {fieldErrors.participants}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!loading && (
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 rounded-[2rem] border border-white/10 bg-white/[0.06] py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[2rem] bg-white py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-all hover:bg-gray-200 disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

```

---

*Extraction terminée — aucune modification du code source applicatif.*
