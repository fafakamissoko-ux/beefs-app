# Rapport d'audit — Hotfix UX Commentaires (Zero-Blind)

**Date :** 31 mai 2026  
**Mission :** extraction pour refonte chirurgicale — **aucun code modifié**  
**Symptômes signalés :** pseudos « Anonyme @user », feed tronqué Android, drawer mal superposé

---

## Synthèse exécutive

| Faille | Cause probable (extrait code) |
|--------|-------------------------------|
| **Data — Anonyme @user** | Lecture `comment.users` alors que PostgREST peut exposer la clé `users!beef_comments_user_id_fkey` ; fallbacks `'Anonyme'` / `'user'` |
| **Mobile — troncature bas** | Chaîne `100dvh` + `80vh` drawer + `pb-28` feed **sans** `env(safe-area-inset-bottom)` ; BeefCard `max-h-[70dvh]` |
| **Superposition UX** | Drawer `z-[100]`/`z-[101]` **= Header feed `z-[100]`** ; monté **dans** le DOM feed (`overflow-hidden`), pas en portal body ; input sans safe area |

---

## 1. Fiasco des pseudos (Data)

### 1.1 Interfaces TypeScript

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

### 1.2 Requête fetch (jointure explicite FK)

```typescript
const { data, error } = await supabase
  .from('beef_comments')
  .select('*, users!beef_comments_user_id_fkey(username, display_name, avatar_url)')
  .eq('beef_id', beefId)
  .order('created_at', { ascending: true });

const rows = (data as BeefComment[] | null) ?? [];
setComments(rows);
```

### 1.3 Helper de résolution

```typescript
function resolveCommentUser(users: BeefComment['users']): CommentUser | null {
  if (!users) return null;
  return Array.isArray(users) ? users[0] ?? null : users;
}
```

### 1.4 JSX — affichage avatar / pseudo (renderComment)

```typescript
const renderComment = (comment: BeefComment, isReply: boolean) => {
  const author = resolveCommentUser(comment.users);
  const displayName = author?.display_name || author?.username || 'Anonyme';
  const username = author?.username || 'user';
  // ...
  return (
    <li key={comment.id} className="...">
      <div className="mb-2 flex items-start gap-2.5">
        {author?.avatar_url ? (
          <img src={author.avatar_url} alt="" className="h-9 w-9 ..." />
        ) : (
          <span className="...">{displayName[0] || '?'}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          <p className="text-xs text-gray-500">@{username}</p>
        </div>
      </div>
      {/* content, aura, répondre */}
    </li>
  );
};
```

### 1.5 Diagnostic Architecte (mapping JSON)

| Hypothèse | Détail |
|-----------|--------|
| **Clé JSON PostgREST** | Avec hint `users!beef_comments_user_id_fkey`, la réponse embed peut arriver sous cette clé — **pas** sous `users`. `comment.users` → `undefined` → `'Anonyme'` + `'user'`. |
| **RLS `users`** | Si la jointure est autorisée mais renvoie `null` (politique SELECT), mêmes fallbacks. |
| **Cast aveugle** | `(data as BeefComment[])` masque l'écart de forme au compile-time. |

**Action hotfix attendue :** lire la clé embed réelle (alias normalisé ou spread) + fallback fetch profil par `user_id`.

---

## 2. Amputation mobile (Viewport)

### 2.1 AppShell — conteneur racine app

**Fichier :** `components/AppShell.tsx`

```tsx
return (
  <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-transparent backdrop-blur-none lg:flex-row">
    <Header shell="phone" />

    <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col transition-all overflow-hidden lg:mx-0 lg:max-w-none lg:pt-0">
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all ${
          pathname === '/feed' || pathname === '/'
            ? 'h-full min-h-0 max-md:overflow-hidden max-md:p-0 overflow-x-hidden p-4 lg:p-10'
            : 'overflow-x-hidden p-4 lg:p-10'
        }`}
      >
        {children}
      </div>
    </main>
  </div>
);
```

**Points d'attention :** `h-[100dvh]` (OK moderne) mais **pas** de `safe-area-inset` ; feed wrapper `max-md:overflow-hidden`.

### 2.2 Feed page — racine et scroll

**Fichier :** `app/feed/page.tsx`

**Racine return :**

```tsx
return (
  <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
```

**Bandeau onglets (mobile) — z-index élevé dans le flux :**

```tsx
<div className="z-[100] flex w-full shrink-0 flex-col bg-black/30 px-4 pb-3 pt-3 backdrop-blur-sm ...">
```

**Zone scroll cartes (list + grid) :**

```tsx
<div
  id="feed-scroll-container"
  className={`flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar pb-28 md:pb-32 md:p-6 md:pt-4 ${
    mobileViewMode === 'grid'
      ? 'grid grid-cols-2 gap-3 ...'
      : 'flex flex-col snap-y snap-mandatory gap-4 ...'
  }`}
>
```

**Observations :**
- `pb-28` (~7rem) pour la barre nav Header — **fixe**, pas `calc(... + env(safe-area-inset-bottom))`
- Pas de `100vh` sur feed ; hérite `h-full` / `100dvh` du shell
- Mode list `snap-y snap-mandatory` — dernière carte peut être rognée si padding insuffisant sur Android (barre gestuelle)

### 2.3 BeefCard — conteneur principal carte

**Fichier :** `components/BeefCard.tsx`

```tsx
<motion.div
  ...
  className="group relative aspect-[3/4] max-h-[70dvh] w-full shrink-0 cursor-pointer overflow-hidden bg-transparent"
>
  <div
    ref={mediaBlockRef}
    className="absolute inset-0 z-0 h-full w-full overflow-hidden rounded-[1.2rem] ..."
  >
```

**Overlay actions (vues / commentaires / aura) :**

```tsx
<div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
  ...
  <div className="flex items-center gap-1.5">
    {/* Eye, MessageCircle pill, Sparkles pill */}
  </div>
</div>
```

**Teaser plein écran :**

```tsx
className="fixed inset-0 z-[9999] flex flex-col bg-black/20 backdrop-blur-[2px] ..."
```

**Observations :** carte limitée à `70dvh` ; contrôles bas overlay dans carte — peuvent entrer en conflit avec barre nav + safe area si le scroll feed ne laisse pas assez de marge.

---

## 3. Conflit de superposition (Z-index & layout)

### 3.1 CommentsDrawer — overlay + panneau

**Fichier :** `components/CommentsDrawer.tsx`

```tsx
return (
  <>
    <motion.div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    />
    <motion.div
      initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed z-[101] flex flex-col overflow-hidden border-white/10 bg-slate-950 shadow-2xl max-md:bottom-0 max-md:left-0 max-md:h-[80vh] max-md:w-full max-md:rounded-t-3xl max-md:border-t md:top-0 md:right-0 md:h-full md:w-[450px] md:border-l"
      role="dialog"
    >
      {/* header sticky top-0 z-10 */}
      {/* liste flex-1 overflow-y-auto */}
      {/* input sticky bottom-0 z-10 p-4 — SANS safe-area */}
    </motion.div>
  </>
);
```

**Zone input (bas panneau) :**

```tsx
<div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-slate-950 p-4">
```

### 3.2 Montage dans le Feed (pas portal document.body)

**Fichier :** `app/feed/page.tsx`

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

Le drawer est **enfant** de :

```
AppShell (overflow-hidden, h-[100dvh])
  └─ main (overflow-hidden)
      └─ div feed wrapper (max-md:overflow-hidden)
          └─ feed page div (overflow-hidden)
              └─ CommentsDrawer (fixed)
```

### 3.3 Cartographie z-index concurrents

| Élément | z-index | Fichier |
|---------|---------|---------|
| Header mobile fixe | `z-[100]` | `Header.tsx` |
| Feed bandeau onglets | `z-[100]` | `feed/page.tsx` |
| **CommentsDrawer overlay** | **`z-[100]`** | `CommentsDrawer.tsx` |
| **CommentsDrawer panneau** | **`z-[101]`** | `CommentsDrawer.tsx` |
| Active beef chip | `z-[500]` | `feed/page.tsx` |
| Modales feed delete/forfeit | `z-[9999]` | `feed/page.tsx` |
| Teaser BeefCard | `z-[9999]` | `BeefCard.tsx` |
| GlobalMessagesDrawer | `z-[999998]` / `999999` | `GlobalMessagesDrawer.tsx` |

### 3.4 Diagnostic superposition UX

| Problème | Evidence |
|----------|----------|
| Drawer **sous** ou **au même plan** que Header | Overlay drawer `z-[100]` = Header `z-[100]` |
| Drawer **sous** teaser / modales feed | Drawer `101` << `9999` |
| Input masqué barre nav / home indicator | Input `p-4` sans `pb-[max(1rem,env(safe-area-inset-bottom))]` |
| Hauteur mobile `80vh` | Utilise `vh` pas `dvh` — barre URL Android réduit la zone utile |
| Pas de portal | `overflow-hidden` ancêtres + stacking contexts locaux → comportement non Tier-1 |
| body scroll lock | `document.body.style.overflow = 'hidden'` OK, mais barre nav Header reste visible **par-dessus** si z-index gagne |

**Référence Tier-1 ailleurs dans le repo :** `MessagesUI`, `EditBeefModal`, `TikTokStyleArena` utilisent `env(safe-area-inset-bottom)` — **absent** du CommentsDrawer.

---

## 4. Fichiers inspectés

- `components/CommentsDrawer.tsx` (intégralité)
- `app/feed/page.tsx` (racine, scroll, montage drawer)
- `components/BeefCard.tsx` (carte, teaser, actions)
- `components/AppShell.tsx` (viewport shell)
- `components/Header.tsx` (z-index nav)
- `app/layout.tsx` (viewport meta)

---

## 5. Pistes de refonte chirurgicale (pour Architecte)

1. **Data :** normaliser embed (`users` vs clé FK) ; typage runtime ; fallback `fetchUserPublicByIds` sur `user_id`.
2. **Portal :** `createPortal(..., document.body)` pour CommentsDrawer (comme modales `z-[9999]`).
3. **Z-index :** calque dédié `z-[200]` ou alignement `GlobalMessagesDrawer` (999998+) selon hiérarchie produit.
4. **Safe area :** `pb-[max(1rem,env(safe-area-inset-bottom))]` sur input drawer ; `max-md:h-[80dvh]` ou `calc(80dvh - inset)`.
5. **Feed mobile :** `pb-28` → `pb-[calc(7rem+env(safe-area-inset-bottom))]` sur `#feed-scroll-container`.

**Aucune modification de code effectuée lors de cet audit.**
