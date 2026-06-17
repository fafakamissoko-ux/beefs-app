# Rapport d'audit — Architecture Onboarding (extraction)

**Date :** 31 mai 2026  
**Objectif :** radiographie avant destruction/reconstruction du flux + design Premium Glass  
**Statut :** extraction uniquement (aucune modification)

---

## 0. Cartographie des fichiers

| Fichier | Rôle |
|---------|------|
| **`app/onboarding/page.tsx`** | **Page principale** — sas pseudo arène + avatar optionnel (composant monolithique, pas de dossier `components/onboarding/`) |
| `app/welcome/page.tsx` | Carrousel marketing 3 slides (ancien onboarding produit) — **distinct** de `/onboarding` |
| `lib/arena-onboarding.ts` | Règles validation/sanitization username |
| `lib/client-arena-onboarding-guard.ts` | Hook client — redirect `/onboarding` si `needs_arena_username` |
| `middleware.ts` | Gate Edge — `/onboarding` + routes feed/live/arena |
| `app/auth/callback/page.tsx` | Post-OAuth → `/onboarding` ou `next` |
| `app/page.tsx` | Splash → `/onboarding` si flag actif |
| `components/OnboardingReminder.tsx` | Toast rappel → `/welcome` (localStorage) |
| `components/AppShell.tsx` | Masque chrome header sur `/onboarding` et `/welcome` |
| `supabase_migrations/45_users_needs_arena_username.sql` | Colonne gate DB |
| RPC `check_username_available` | Disponibilité pseudo (migration 36) |

**Constat critique :** aucune assignation `needs_arena_username: true` dans le repo TS/SQL — le sas `/onboarding` est câblé mais le flag n'est jamais activé à la création compte.

---

## 1. Identification du flux — étapes actuelles

### 1a. Flux principal — `/onboarding` (`ArenaOnboardingPage`)

**Architecture : une seule page, un seul formulaire** (pas de wizard multi-étapes avec reducer).

| # | Étape UX | Obligatoire | Champs / actions |
|---|----------|-------------|------------------|
| **1** | Choix photo de profil | Non | `<input type="file" accept="image/*">` → preview blob ou URL existante |
| **2** | Choix nom d'arène (username) | Oui | Input texte, validation temps réel + RPC dispo |
| **3** | Soumission | — | Bouton « Rejoindre l'Arène » → upload Storage + UPDATE `users` |

**Pas d'étape Bio**, display_name, bannière, ni onboarding Ref/médiateur sur cette page.

### 1b. Flux parallèle — `/welcome` (carrousel)

| Slide | Titre | Icône |
|-------|-------|-------|
| 1 | Règle tes beefs en live | Flame |
| 2 | Médiateur certifié | Shield |
| 3 | Gagne des points | Trophy |

Navigation : Suivant / Retour / Passer → `localStorage` + redirect `/signup` (ou `/feed` si user déjà connecté sans flag).

### 1c. Graphe de redirection (simplifié)

```mermaid
flowchart TD
  A[Splash /] -->|session + needs_arena_username| B[/onboarding]
  A -->|sinon| C[/feed]
  D[OAuth callback] -->|needs_arena_username| B
  D -->|sinon| C
  E[middleware feed/live/arena] -->|needs_arena_username| B
  F[OnboardingReminder] --> G[/welcome]
  B -->|handleSubmit OK| C
  B -->|déjà complété| C
  H[/welcome user connecté] -->|needs_arena_username| B
  H -->|sinon| C
```

---

## 2. États (State) — `app/onboarding/page.tsx`

**Pas de `useReducer`** — uniquement `useState` + `useMemo` + `useRef`.

```typescript
type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

// Auth (contexte externe)
const { user, loading: authLoading } = useAuth();

// Saisie username
const [rawInput, setRawInput] = useState('');
const username = useMemo(() => sanitizeArenaUsernameInput(rawInput), [rawInput]);

// Disponibilité pseudo (async RPC)
const [availability, setAvailability] = useState<Availability>('idle');

// Soumission
const [submitting, setSubmitting] = useState(false);
const [submitError, setSubmitError] = useState<string | null>(null);

// Profil existant (pré-remplissage)
const [initialUsername, setInitialUsername] = useState<string | null>(null);

// Avatar
const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
const [avatarFile, setAvatarFile] = useState<File | null>(null);

// Refs
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const avatarInputRef = useRef<HTMLInputElement>(null);
```

**Données collectées finales (payload Supabase) :**

```typescript
{
  username: string;              // sanitized, validé
  needs_arena_username: false;   // clôture du sas
  avatar_url?: string;           // si upload réussi
}
```

---

## 3. Logique de validation

### 3a. Règles — `lib/arena-onboarding.ts` (extrait intégral)

```typescript
export const ARENA_USERNAME_MIN = 3;
export const ARENA_USERNAME_MAX = 28;

const ARENA_USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export function sanitizeArenaUsernameInput(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, ARENA_USERNAME_MAX)
    .toLowerCase();
}

export function isValidArenaUsername(username: string): boolean {
  const n = username.length;
  if (n < ARENA_USERNAME_MIN || n > ARENA_USERNAME_MAX) return false;
  return ARENA_USERNAME_RE.test(username);
}
```

### 3b. Vérification disponibilité (debounce 320 ms)

```typescript
const checkAvailability = useCallback(async (candidate: string) => {
  if (!isValidArenaUsername(candidate)) {
    setAvailability('invalid');
    return;
  }
  if (
    initialUsername &&
    candidate.toLowerCase() === String(initialUsername).toLowerCase()
  ) {
    setAvailability('free');
    return;
  }
  setAvailability('checking');
  const { data: available, error } = await supabase.rpc('check_username_available', {
    p_username: candidate,
  });
  if (error) {
    setAvailability('idle');
    return;
  }
  setAvailability(available === true ? 'free' : 'taken');
}, [initialUsername]);
```

### 3c. Condition de soumission

```typescript
const canSubmit =
  Boolean(user) &&
  isValidArenaUsername(username) &&
  availability === 'free' &&
  !submitting;
```

---

## 4. Logique de sauvegarde & redirection

### 4a. Upload avatar (Storage)

```typescript
const uploadAvatarIfNeeded = async (userId: string): Promise<string | null> => {
  if (!avatarFile) return null;
  const ts = Date.now();
  const path = `${userId}/${userId}_${ts}.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, {
    upsert: true,
    contentType: avatarFile.type || 'image/jpeg',
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
};
```

### 4b. Fonction finale — `handleSubmit` (extrait intégral)

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user?.id) return;
  if (!isValidArenaUsername(username)) {
    setSubmitError(`Entre ${ARENA_USERNAME_MIN} et ${ARENA_USERNAME_MAX} caractères (lettres, chiffres, _).`);
    return;
  }
  if (availability !== 'free') {
    setSubmitError('Ce nom est indisponible ou encore en vérification.');
    return;
  }
  setSubmitting(true);
  setSubmitError(null);
  try {
    let avatarUrl: string | null = null;
    if (avatarFile) {
      avatarUrl = await uploadAvatarIfNeeded(user.id);
    }

    const payload: { username: string; needs_arena_username: boolean; avatar_url?: string } = {
      username,
      needs_arena_username: false,
    };
    if (avatarUrl) payload.avatar_url = avatarUrl;

    const { error } = await supabase.from('users').update(payload).eq('id', user.id);
    if (error) {
      if (error.code === '23505' || error.message?.toLowerCase().includes('unique')) {
        setSubmitError('Ce nom vient d’être pris. Choisis-en un autre.');
        setAvailability('taken');
      } else {
        setSubmitError(error.message || 'Enregistrement impossible.');
      }
      return;
    }
    router.replace('/feed');
  } catch (err) {
    setSubmitError(err instanceof Error ? err.message : 'Upload avatar impossible.');
  } finally {
    setSubmitting(false);
  }
};
```

**Tables / services touchés :**
- `public.users` — UPDATE (`username`, `needs_arena_username`, `avatar_url?`)
- Storage bucket `avatars`
- RPC `check_username_available` (lecture seule, avant submit)

**Redirection succès :** `router.replace('/feed')`

### 4c. Guards & redirects (hors page)

**Non connecté → login :**

```typescript
useEffect(() => {
  if (authLoading) return;
  if (!user) {
    router.replace('/login?next=/onboarding');
  }
}, [authLoading, user, router]);
```

**Déjà onboardé → feed :**

```typescript
useEffect(() => {
  if (!user?.id) return;
  // ...
  if (data.needs_arena_username === false) {
    router.replace('/feed');
  }
}, [user?.id, router]);
```

**Middleware (`pathname === '/onboarding'`) :** même logique — si `needs_arena_username === false` → redirect `/feed`.

**Hook client (`useClientArenaOnboardingGuard`) — utilisé sur `feed/page.tsx`, `live/[id]/page.tsx` :**

```typescript
if (data?.needs_arena_username === true) {
  router.replace('/onboarding');
}
```

**OAuth callback :**

```typescript
if (!profileErr && profile?.needs_arena_username === true) {
  router.replace('/onboarding');
  return;
}
const next = searchParams.get('next') || '/feed';
router.replace(next.startsWith('/') ? next : '/feed');
```

---

## 5. Imports — `app/onboarding/page.tsx`

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { BeefLogo } from '@/components/BeefLogo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import {
  ARENA_USERNAME_MAX,
  ARENA_USERNAME_MIN,
  isValidArenaUsername,
  sanitizeArenaUsernameInput,
} from '@/lib/arena-onboarding';
```

| Dépendance | Usage |
|------------|-------|
| `framer-motion` | Animation entrée carte (`motion.div`) |
| `lucide-react` | Icône `Camera` placeholder avatar |
| `BeefLogo` | Logo header carte |
| `useAuth` | Session utilisateur |
| `supabase` client | SELECT users, RPC, UPDATE, Storage |
| `lib/arena-onboarding` | Sanitize + validation username |

**UI actuelle :** carte `rounded-3xl border border-white/10 bg-black/40 backdrop-blur-md` — amorce Glass, **pas** le design system Premium Glass unifié.

---

## 6. Structure JSX (résumé)

```
ArenaOnboardingPage
└── motion.div (max-w-md)
    └── div.rounded-3xl (carte glass légère)
        ├── BeefLogo 64px
        ├── h1 « Choisis ton nom d'arène »
        ├── form
        │   ├── avatar picker (button + hidden file input)
        │   ├── username input + availability label
        │   ├── submitError
        │   └── submit button « Rejoindre l'Arène »
```

---

## 7. Points d'attention pour la refonte

1. **Deux onboarding coexistants** : `/onboarding` (data) vs `/welcome` (marketing) vs `OnboardingReminder` — à fusionner ou séquencer explicitement.
2. **Gate mort** : sans `needs_arena_username = true` à l'inscription, le sas est contournable.
3. **Monolithe** : toute la logique dans une page ~300 lignes — candidat extraction hooks/services + steps Premium Glass.
4. **Pas de bio / display_name** dans le flux actuel — à définir si requis PO.
5. **Settings** : pseudo en lecture seule ailleurs (hors scope page onboarding) — trigger SQL peut figer `username` après création.

---

*Fin du rapport — extraction brute, zéro modification de code.*
