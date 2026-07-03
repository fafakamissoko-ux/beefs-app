# Rapport d'audit UI — Commentaires (extraction brute)

**Date :** 31 mai 2026  
**Mission :** extraire le code exact pour refonte visuelle (suppression des « boîtes », injection fond étoilé)  
**Aucun fichier modifié.**

---

## Synthèse architecture

| Zone | Fichier | Rôle |
|------|---------|------|
| Fond étoilé global | `app/layout.tsx` | Import + montage `<StarField />` |
| Implémentation étoiles | `components/Arena/shared/StarField.tsx` | Composant `StarField` (fixed, `-z-10`) |
| Coquille feed | `components/AppShell.tsx` | `bg-transparent` — laisse voir StarField |
| Feed page | `app/feed/page.tsx` | **Aucune** instanciation StarField |
| Drawer commentaires | `components/CommentsDrawer.tsx` | Panneau `bg-slate-950` opaque — **masque** le fond étoilé derrière |

---

## 1. Traque du fond étoilé (global)

### 1.1 Import et instanciation — `app/layout.tsx`

**Import (ligne 5) :**

```typescript
import { StarField } from "@/components/Arena/shared/StarField";
```

**Instanciation dans `RootLayoutClient` (ligne 106) — avant `AppShell` :**

```tsx
<StarField />
<AppShell>{children}</AppShell>
```

**Contexte complet du bloc providers :**

```tsx
function RootLayoutClient({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <GlobalSearchProvider>
            <ClientMonitoring />
            <MessagesDrawerProvider>
              <BetaGate>
                <PWAManager />
                <ScrollRestoration />
                <StarField />
                <AppShell>{children}</AppShell>
                <OnboardingReminder />
                <PWAInstallPrompt />
                <GlobalMessagesDrawer />
                <GlobalDuelAmbush />
              </BetaGate>
            </MessagesDrawerProvider>
          </GlobalSearchProvider>
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
```

**Fallback body (ligne 140) — couleur de base si StarField absent :**

```tsx
<body className="font-sans overflow-x-hidden bg-[#050505] text-white antialiased">
```

### 1.2 Composant `StarField` — `components/Arena/shared/StarField.tsx`

**Export principal (intégralité du rendu) :**

```tsx
export function StarField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(30,27,75,0.35),transparent_70%)]" />
      <StarLayer stars={STARS.filter((s) => s.size === 'sm')} />
      <StarLayer stars={STARS.filter((s) => s.size === 'md')} />
      <StarLayer stars={STARS.filter((s) => s.size === 'lg')} />
    </div>
  );
}
```

**Couche étoile individuelle (`StarLayer`) :**

```tsx
function StarLayer({ stars }: { stars: StarSpec[] }) {
  return (
    <div className="absolute inset-0">
      {stars.map((star, i) => (
        <span
          key={`${star.left}-${star.top}-${i}`}
          className={`absolute animate-pulse rounded-full bg-white ${SIZE_CLASS[star.size]}`}
          style={{
            left: star.left,
            top: star.top,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}
```

**Classes taille étoiles :**

```typescript
const SIZE_CLASS: Record<StarSize, string> = {
  sm: 'h-[2px] w-[2px] opacity-60',
  md: 'h-[3px] w-[3px] opacity-80',
  lg: 'h-[4px] w-[4px] opacity-100 shadow-[0_0_8px_rgba(255,255,255,0.8)]',
};
```

### 1.3 AppShell — transparence (pas de fond étoilé local)

**Fichier :** `components/AppShell.tsx`

```tsx
<div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-transparent backdrop-blur-none lg:flex-row">
  <Header shell="phone" />
  <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col transition-all overflow-hidden lg:mx-0 lg:max-w-none lg:pt-0">
    {/* feed : h-full min-h-0 max-md:overflow-hidden max-md:p-0 */}
    {children}
  </main>
</div>
```

### 1.4 Feed page — absence de StarField

**Fichier :** `app/feed/page.tsx`  
Aucun import ni usage de `StarField`, `StarryBackground`, ou gradient étoilé local.

### 1.5 Drawer — surfaces opaques qui bloquent StarField

Le drawer est porté via `createPortal(..., document.body)` avec :

| Élément | Classes fond |
|---------|--------------|
| Overlay | `bg-black/60 backdrop-blur-sm` |
| Panneau | `bg-slate-950` |
| Header sticky | `bg-slate-950` |
| Bandeau input | `bg-slate-950` |

Pour « injecter » le fond étoilé dans le drawer, ces `bg-slate-950` / opacités devront être retirés ou remplacés par fond transparent + laisser `StarField` (`fixed inset-0 -z-10`) visible **derrière** le panneau (z-index drawer : `z-[10000]` > StarField `-z-10`).

---

## 2. Les « boîtes » de commentaires — `renderComment`

**Fichier :** `components/CommentsDrawer.tsx`  
**Lignes :** 208–273

### 2.1 Fonction complète (logique + JSX)

```tsx
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
      className={`rounded-2xl border border-white/10 bg-slate-900/40 p-3 backdrop-blur-sm ${
        isReply ? 'ml-8 border-l-2 border-l-white/10 pl-4' : ''
      }`}
    >
      <div className="mb-2 flex items-start gap-2.5">
        {author?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatar_url}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full border border-white/10 object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/30 to-slate-800 text-xs font-bold uppercase text-cyan-300">
            {displayName[0] || '?'}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{displayName}</p>
          <p className="text-xs text-gray-500">@{username}</p>
        </div>
      </div>
      <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
        {comment.content}
      </p>
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void toggleCommentAura(comment.id, comment.user_id)}
          disabled={auraLoadingId === comment.id || isOwn}
          aria-label={liked ? "Retirer l'Aura" : "Donner de l'Aura"}
          className={`flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 transition-colors hover:bg-white/10 disabled:opacity-45 ${
            liked && !isOwn ? 'border-amber-400/50 text-amber-400' : 'text-white'
          }`}
        >
          <Sparkles
            className={`h-3.5 w-3.5 ${liked && !isOwn ? 'fill-amber-400 text-amber-400' : ''}`}
          />
        </button>
        <InlineAuraGivers
          targetId={comment.id}
          type="comment"
          ownerId={comment.user_id}
        />
      </div>
      <button
        type="button"
        onClick={() => setReplyingTo({ commentId: replyTargetId, username })}
        className="text-xs font-semibold text-gray-400 transition-colors hover:text-gray-200"
      >
        Répondre
      </button>
    </li>
  );
};
```

### 2.2 Inventaire Tailwind — classes « boîte » à cibler

**`<li>` racine commentaire :**
- `rounded-2xl`
- `border border-white/10`
- `bg-slate-900/40`
- `p-3`
- `backdrop-blur-sm`
- Réponse : `ml-8 border-l-2 border-l-white/10 pl-4`

**Avatar fallback :**
- `rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/30 to-slate-800`

**Avatar image :**
- `rounded-full border border-white/10`

**Bouton Aura :**
- `rounded-full border border-white/10 bg-slate-900/40`

### 2.3 Boucle `.map()` parente (contexte liste)

```tsx
<ul className="space-y-4">
  {rootComments.map((comment) => (
    <Fragment key={comment.id}>
      {renderComment(comment, false)}
      {(repliesByParent.get(comment.id) ?? []).map((reply) =>
        renderComment(reply, true),
      )}
    </Fragment>
  ))}
</ul>
```

**Conteneur scroll liste :**

```tsx
<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
```

---

## 3. Champ de saisie — zone sticky bottom

**Fichier :** `components/CommentsDrawer.tsx`  
**Lignes :** 339–386

### 3.1 JSX intégral du bandeau input

```tsx
<div className="sticky bottom-0 z-10 shrink-0 border-t border-white/10 bg-slate-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
      className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-white/20 focus:outline-none disabled:opacity-50"
    />
    <button
      type="button"
      onClick={() => void handleSend()}
      disabled={!user || sending || !draft.trim()}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-400 disabled:opacity-45"
      aria-label="Envoyer"
    >
      <Send className="h-4 w-4" />
    </button>
  </div>
</div>
```

### 3.2 Inventaire Tailwind — zone input

**Conteneur sticky :**
- `sticky bottom-0 z-10 shrink-0`
- `border-t border-white/10`
- `bg-slate-950`
- `p-4 pb-[max(1rem,env(safe-area-inset-bottom))]`

**Bandeau « En réponse à » :**
- `rounded-lg bg-slate-900/60 px-3 py-2`

**`<input>` :**
- `rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5`

**Bouton envoi :**
- `rounded-xl bg-brand-500`

---

## 4. Enveloppe drawer (contexte refonte panneau)

Pour compléter le prompt chirurgical — panneau qui recouvre StarField :

```tsx
<motion.div
  className="fixed z-[10000] flex flex-col overflow-hidden border-white/10 bg-slate-950 shadow-2xl max-md:bottom-0 max-md:left-0 max-md:h-[80dvh] max-md:w-full max-md:rounded-t-3xl max-md:border-t md:top-0 md:right-0 md:h-full md:w-[450px] md:border-l"
  role="dialog"
  aria-modal="true"
  aria-label="Commentaires"
>
  <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950 px-4 py-3">
    {/* titre + bouton fermer */}
  </div>
  {/* liste scroll + input sticky */}
</motion.div>
```

**Overlay :**

```tsx
<motion.div
  className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm"
  onClick={onClose}
  aria-hidden
/>
```

---

## 5. Checklist refonte (pour l'Architecte)

- [ ] Retirer `bg-slate-900/40`, `border`, `rounded-2xl`, `backdrop-blur-sm` sur `<li>` commentaire
- [ ] Rendre panneau drawer transparent / semi-transparent pour laisser `<StarField />` visible
- [ ] Ne **pas** dupliquer StarField dans le drawer — il est déjà global via `app/layout.tsx`
- [ ] Conserver safe area input : `pb-[max(1rem,env(safe-area-inset-bottom))]`
- [ ] Conserver portal + z-index actuels (`9999` / `10000`)

**Fin du rapport — extraction brute, zéro modification de code.**
