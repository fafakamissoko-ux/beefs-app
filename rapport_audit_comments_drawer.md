# Audit source — CommentsDrawer (tiroir commentaires)

> **Mission :** extraction à zéro modification pour préparer la migration vers **vaul**.  
> **Date :** 2026-05-31  
> **Fichier source :** `components/CommentsDrawer.tsx` (405 lignes)

---

## 1. Synthèse architecturale

| Élément | Détail |
|---------|--------|
| **Fichier** | `components/CommentsDrawer.tsx` — composant client `'use client'` |
| **Props publiques** | `beefId`, `onClose` — **pas de prop `isOpen`** |
| **Contrôle visibilité** | Parent (`app/feed/page.tsx`) — montage conditionnel + `AnimatePresence` |
| **Rendu DOM** | `createPortal(..., document.body)` |
| **Animation UI** | `framer-motion` — 2× `motion.div` (overlay + panneau) |
| **AnimatePresence** | **Absent du drawer** — présent chez le parent feed |
| **Scroll lock** | `useEffect` manuel `document.body.style.overflow = 'hidden'` |
| **Responsive** | `isMobile` via `matchMedia('(max-width: 767px)')` — slide Y mobile / X desktop |
| **Dépendance cible** | `vaul` `^1.1.2` — installé, non branché |

---

## 2. Interface props — analyse

### 2.1 Type exporté (interne)

```typescript
interface CommentsDrawerProps {
  beefId: string;
  onClose: () => void;
}
```

| Prop | Type | Rôle |
|------|------|------|
| `beefId` | `string` | ID du beef — fetch + insert commentaires |
| `onClose` | `() => void` | Callback fermeture (overlay click, bouton X) |

**Absence notable :** pas de `isOpen: boolean`. Le drawer est **toujours monté ouvert** quand le composant est rendu. La fermeture = unmount parent.

### 2.2 Consommateur parent — `app/feed/page.tsx` (L1265–1272)

```tsx
<AnimatePresence>
  {activeCommentsBeefId && (
    <CommentsDrawer
      beefId={activeCommentsBeefId}
      onClose={() => setActiveCommentsBeefId(null)}
    />
  )}
</AnimatePresence>
```

**Pattern actuel :**
- État parent : `activeCommentsBeefId: string | null`
- Ouverture : `setActiveCommentsBeefId(beefId)`
- Fermeture : `setActiveCommentsBeefId(null)` via `onClose`
- `AnimatePresence` externe permet aux props `exit` des `motion.div` internes de s'exécuter

**Migration vaul — options Architecte :**
1. Garder le montage conditionnel parent + `<Drawer open={true} onOpenChange={...}>` interne
2. Ou déplacer `open`/`onOpenChange` dans les props du drawer (`isOpen` + `onClose`) — breaking change feed

---

## 3. Couche UI à remplacer (framer-motion / portal)

### 3.1 Structure actuelle

```
createPortal(
  <>
    motion.div  ← overlay backdrop (opacity fade, onClick=onClose)
    motion.div  ← panneau drawer (slide Y mobile / X desktop)
      StarField
      header (titre + X)
      liste commentaires
      footer input + send
  </>,
  document.body
)
```

### 3.2 Overlay (L291–298)

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
  onClick={onClose}
  aria-hidden
/>
```

### 3.3 Panneau (L299–401)

```tsx
<motion.div
  initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
  animate={{ opacity: 1, y: 0, x: 0 }}
  exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
  className="fixed z-[10000] flex flex-col … max-md:bottom-0 max-md:h-[80dvh] max-md:rounded-t-3xl md:top-0 md:right-0 md:h-full md:w-[450px]"
  onClick={(e) => e.stopPropagation()}
  role="dialog"
  aria-modal="true"
  aria-label="Commentaires"
>
```

| Breakpoint | Position | Animation | Dimensions |
|------------|----------|-----------|------------|
| Mobile (`max-md`) | Bottom sheet | `y: 100% → 0` | `80dvh`, `rounded-t-3xl`, full width |
| Desktop (`md+`) | Slide-over droite | `x: 100% → 0` | `h-full`, `w-[450px]`, `border-l` |

### 3.4 Scroll lock manuel (L109–115)

```typescript
useEffect(() => {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = 'unset';
  };
}, []);
```

**vaul** gère le scroll lock nativement — ce `useEffect` sera supprimable.

### 3.5 Hydratation SSR (L52–56, L287)

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return null;
```

Requis pour `createPortal` + `document.body`. vaul Portal peut simplifier ce pattern.

### 3.6 AnimatePresence — clarification

| Emplacement | Présent ? |
|-------------|-----------|
| `CommentsDrawer.tsx` | ❌ Non |
| `app/feed/page.tsx` | ✅ Oui — wrapper autour du montage conditionnel |

Les props `exit` sur les `motion.div` **dépendent** du `AnimatePresence` parent. Migration vaul : retirer aussi le wrapper `AnimatePresence` du feed si vaul gère les transitions.

---

## 4. Logique métier à préserver (hors scope UI)

### 4.1 État interne

| State | Type | Rôle |
|-------|------|------|
| `comments` | `BeefComment[]` | Liste chargée Supabase |
| `loading` | `boolean` | Spinner fetch |
| `draft` | `string` | Texte input commentaire |
| `sending` | `boolean` | Envoi en cours |
| `likedCommentIds` | `Set<string>` | Likes Aura utilisateur |
| `auraLoadingId` | `string \| null` | Verrou toggle like |
| `replyingTo` | `{ commentId, username } \| null` | Bandeau réponse |
| `isMobile` | `boolean` | Breakpoint animation (remplaçable par CSS/vaul direction) |

### 4.2 Types métier

```typescript
interface CommentUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface BeefComment {
  id: string;
  beef_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  users: CommentUser | CommentUser[] | null;
}
```

### 4.3 Fonctions métier

| Fonction | Lignes | Tables Supabase |
|----------|--------|-----------------|
| `fetchComments` | L58–94 | `beef_comments`, `beef_comment_likes` |
| `toggleCommentAura` | L117–169 | `beef_comment_likes` + event `aura-refresh` |
| `handleSend` | L171–197 | `beef_comments` INSERT |
| `renderComment` | L209–285 | UI commentaire + réponses imbriquées |
| `resolveCommentUser` | L34–37 | Normalise join PostgREST |

### 4.4 Requête fetch (extrait)

```typescript
supabase
  .from('beef_comments')
  .select('*, users:users!beef_comments_user_id_fkey(username, display_name, avatar_url)')
  .eq('beef_id', beefId)
  .order('created_at', { ascending: true });
```

### 4.5 Insert commentaire (extrait)

```typescript
supabase.from('beef_comments').insert({
  beef_id: beefId,
  user_id: user.id,
  content: text,
  parent_id: replyingTo?.commentId ?? null,
});
```

### 4.6 Composants enfants métier

| Composant | Rôle |
|-----------|------|
| `InlineAuraGivers` | Affichage donneurs Aura par commentaire |
| `StarField` | Fond étoilé overlay (`isOverlay={true}`) |
| `useToast` | Erreurs / infos utilisateur |
| `useAuth` | Session + user.id |

---

## 5. Design Premium Glass — classes à conserver

| Zone | Classes clés |
|------|--------------|
| Overlay | `bg-black/40 backdrop-blur-sm` |
| Panneau | `bg-black/40 backdrop-blur-sm border-white/10 shadow-2xl` |
| Header | `border-b border-white/10`, titre uppercase tracking-widest |
| Footer input | `bg-black/60 backdrop-blur-md`, `safe-area-inset-bottom` |
| Input | `rounded-full border-white/10 bg-white/5` |
| Send button | `bg-brand-500 hover:bg-brand-400` |

---

## 6. Esquisse migration vaul

```tsx
import { Drawer } from 'vaul';

// Option A — drawer toujours open si monté (compat parent actuel)
<Drawer.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm" />
    <Drawer.Content className="… max-md:bottom-0 max-md:h-[80dvh] md:fixed md:right-0 md:top-0 md:h-full md:w-[450px]">
      {/* StarField + header + liste + footer — inchangés */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**Points d'attention :**
- vaul est **bottom sheet natif** — slide-over desktop peut nécessiter `direction="right"` (vaul 0.9+) ou CSS custom
- Retirer `createPortal`, `motion.div`, scroll lock manuel, `mounted` gate si Portal vaul suffit
- Retirer `AnimatePresence` du feed si transitions vaul remplacent framer-motion
- Préserver `onClose` pour compat parent sans modifier `feed/page.tsx` initialement

---

## 7. Dépendances

```json
"vaul": "^1.1.2",
"framer-motion": "(existant — utilisé ici pour overlay + panneau)"
```

---

## 8. Checklist Ordre de Frappe (vaul)

- [ ] Remplacer `createPortal` + `motion.div` par `Drawer.Root/Portal/Overlay/Content`
- [ ] Supprimer `useEffect` scroll lock body
- [ ] Supprimer state `mounted` si plus nécessaire
- [ ] Conserver `fetchComments`, `handleSend`, `toggleCommentAura`, `renderComment`
- [ ] Conserver props `beefId` + `onClose` (compat feed)
- [ ] Évaluer retrait `AnimatePresence` dans `app/feed/page.tsx`
- [ ] Mobile : `80dvh`, `rounded-t-3xl` — desktop : `450px` slide droite
- [ ] Test : fetch, envoi, réponse, Aura like, fermeture overlay/Escape/gesture

---

## 9. Code source brut — `components/CommentsDrawer.tsx`

```tsx
'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Send, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import { StarField } from '@/components/Arena/shared/StarField';

interface CommentUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface BeefComment {
  id: string;
  beef_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  users: CommentUser | CommentUser[] | null;
}

interface CommentsDrawerProps {
  beefId: string;
  onClose: () => void;
}

function resolveCommentUser(users: BeefComment['users']): CommentUser | null {
  if (!users) return null;
  return Array.isArray(users) ? users[0] ?? null : users;
}

export function CommentsDrawer({ beefId, onClose }: CommentsDrawerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const [comments, setComments] = useState<BeefComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [auraLoadingId, setAuraLoadingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchComments = useCallback(async () => {
    if (!beefId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('beef_comments')
        .select('*, users:users!beef_comments_user_id_fkey(username, display_name, avatar_url)')
        .eq('beef_id', beefId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data as BeefComment[] | null) ?? [];
      setComments(rows);

      if (user?.id && rows.length > 0) {
        const commentIds = rows.map((c) => c.id);
        const { data: likes } = await supabase
          .from('beef_comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        setLikedCommentIds(
          new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id)),
        );
      } else {
        setLikedCommentIds(new Set());
      }
    } catch (err) {
      console.error('[CommentsDrawer] fetchComments', err);
      toast('Impossible de charger les commentaires.', 'error');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [beefId, user?.id, toast]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const toggleCommentAura = async (commentId: string, authorId: string) => {
    if (!user) {
      toast('Connecte-toi pour donner de l\'Aura.', 'info');
      return;
    }
    if (user.id === authorId) {
      toast('Tu ne peux pas liker ton propre commentaire.', 'info');
      return;
    }
    if (auraLoadingId) return;

    const wasLiked = likedCommentIds.has(commentId);
    setAuraLoadingId(commentId);
    setLikedCommentIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('beef_comment_likes')
          .delete()
          .match({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('beef_comment_likes').insert({
          comment_id: commentId,
          user_id: user.id,
        });
        if (error) throw error;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aura-refresh', { detail: { targetId: commentId } }),
        );
      }
    } catch (err) {
      console.error('[CommentsDrawer] toggleCommentAura', err);
      toast('Impossible de mettre à jour l\'Aura.', 'error');
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } finally {
      setAuraLoadingId(null);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!user) {
      toast('Connecte-toi pour commenter.', 'info');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('beef_comments').insert({
        beef_id: beefId,
        user_id: user.id,
        content: text,
        parent_id: replyingTo?.commentId ?? null,
      });
      if (error) throw error;
      setDraft('');
      setReplyingTo(null);
      await fetchComments();
    } catch (err) {
      console.error('[CommentsDrawer] handleSend', err);
      toast('Impossible d\'envoyer le commentaire.', 'error');
    } finally {
      setSending(false);
    }
  };

  const rootComments = comments.filter((c) => c.parent_id == null);
  const repliesByParent = comments.reduce<Map<string, BeefComment[]>>((acc, c) => {
    if (c.parent_id) {
      const list = acc.get(c.parent_id) ?? [];
      list.push(c);
      acc.set(c.parent_id, list);
    }
    return acc;
  }, new Map());

  const renderComment = (comment: BeefComment, isReply: boolean) => {
    const author = resolveCommentUser(comment.users);
    const displayName = author?.display_name || author?.username || 'Anonyme';
    const username = author?.username || 'user';
    const liked = likedCommentIds.has(comment.id);
    const isOwn = user?.id === comment.user_id;
    const replyTargetId = comment.parent_id ?? comment.id;

    return (
      <li
        key={comment.id}
        className={`relative py-3 group ${isReply ? 'ml-11' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-1">
            {author?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatar_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-slate-800 text-xs font-bold uppercase text-cyan-300">
                {displayName[0] || '?'}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col items-start">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold text-gray-300 truncate">{displayName}</span>
            </div>

            <p className="text-[14px] leading-snug text-white whitespace-pre-wrap break-words mb-1">
              {comment.content}
            </p>

            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-gray-500 font-medium">
                {new Date(comment.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo({ commentId: replyTargetId, username })}
                className="text-[12px] font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Répondre
              </button>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-center justify-start ml-2">
            <button
              type="button"
              onClick={() => void toggleCommentAura(comment.id, comment.user_id)}
              disabled={auraLoadingId === comment.id || isOwn}
              aria-label={liked ? "Retirer l'Aura" : "Donner de l'Aura"}
              className="p-1.5 transition-colors disabled:opacity-45"
            >
              <Sparkles
                className={`h-4 w-4 ${liked && !isOwn ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'text-gray-400 hover:text-white'}`}
              />
            </button>
            <InlineAuraGivers
              targetId={comment.id}
              type="comment"
              ownerId={comment.user_id}
            />
          </div>
        </div>
      </li>
    );
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={
          isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }
        }
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={
          isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }
        }
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed z-[10000] flex flex-col overflow-hidden border-white/10 bg-black/40 backdrop-blur-sm shadow-2xl max-md:bottom-0 max-md:left-0 max-md:h-[80dvh] max-md:w-full max-md:rounded-t-3xl max-md:border-t md:top-0 md:right-0 md:h-full md:w-[450px] md:border-l"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Commentaires"
      >
        <StarField isOverlay={true} />

        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/10 bg-transparent px-4 py-3">
          <h2 className="font-sans text-sm font-black uppercase tracking-widest text-white">
            Commentaires
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Aucun commentaire pour le moment. Sois le premier.
            </p>
          ) : (
            <ul className="space-y-0">
              {rootComments.map((comment) => (
                <Fragment key={comment.id}>
                  {renderComment(comment, false)}
                  {(repliesByParent.get(comment.id) ?? []).map((reply) =>
                    renderComment(reply, true),
                  )}
                </Fragment>
              ))}
            </ul>
          )}
        </div>

        <div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-md p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-gray-300">
              <span>
                En réponse à <span className="font-semibold text-white">@{replyingTo.username}</span>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Annuler la réponse"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                user
                  ? replyingTo
                    ? `Répondre à @${replyingTo.username}…`
                    : 'Écrire un commentaire…'
                  : 'Connecte-toi pour commenter'
              }
              disabled={!user || sending}
              className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] text-white placeholder:text-gray-500 focus:border-white/20 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!user || sending || !draft.trim()}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-400 disabled:opacity-45"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </>,
    document.body,
  );
}
```

---

*Extraction terminée — aucune modification du code source applicatif.*
