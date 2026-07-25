# Rapport d'Audit — Phase E0 : Messagerie & Social

**Date** : 23 juillet 2026
**Périmètre** : DMs, système de follow, notifications, commentaires, chat arena
**Benchmark** : TikTok DMs, Instagram DMs, X DMs, Discord/Twitch chat
**Fichiers audités** :
- `components/MessagesUI.tsx` (~1 220 lignes)
- `components/GlobalMessagesDrawer.tsx`
- `contexts/MessagesDrawerContext.tsx`
- `components/FollowListModal.tsx`
- `components/FollowButton.tsx`
- `app/notifications/page.tsx`
- `components/CommentsDrawer.tsx`
- `components/ChatPanel.tsx`
- `components/ArenaChatMessages.tsx`
- `components/Header.tsx` (badges & souscriptions temps réel)
- `lib/security.ts`
- `lib/notification-unread.ts`
- `lib/fetch-user-public-profile.ts`
- `lib/messages-deeplink.ts`
- `app/messages/page.tsx`

---

## Résumé exécutif

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique | 5 |
| 🟠 Majeur | 10 |
| 🟡 Important | 12 |
| ⚪ Mineur | 8 |
| **Total** | **35** |

La messagerie directe est fonctionnelle mais souffre de **vulnérabilités XSS critiques** (réversion de la sanitisation à l'affichage), d'une **injection SQL potentielle via la recherche d'utilisateurs**, et de **problèmes de performance N+1** qui deviendront bloquants à l'échelle. Le système social (follow, commentaires) manque de pagination et de sanitisation côté commentaires. L'écart avec les benchmarks TikTok/Instagram est principalement lié à l'absence de typing indicators, d'indicateurs de présence et de recherche dans les conversations.

---

## 🔴 Critiques (bloquant UX / sécurité)

### E-01 — XSS via réversion de la sanitisation à l'affichage
**Fichier** : `components/MessagesUI.tsx` — ligne ~921
**Catégorie** : Sécurité

Le code applique correctement `sanitizeMessage()` à l'envoi (ligne 342), qui encode `<` → `&lt;`, `>` → `&gt;`, etc. **Mais à l'affichage**, la ligne 921 effectue l'opération inverse :

```typescript
const decodedText = isDeleted
  ? '🚫 Ce message a été supprimé'
  : msg.content.replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/');
```

Cela **annule intégralement la protection XSS**. Un attaquant peut injecter du HTML/JS qui sera encodé à l'insertion mais décodé à l'affichage. Bien que React échappe le rendu JSX par défaut, cela crée une fausse confiance et rend le code vulnérable si `dangerouslySetInnerHTML` est utilisé plus tard ou si le contenu est injecté dans un attribut.

De plus, la même réversion est répétée 3 fois (lignes 921, 1048, 1141) dans le même fichier — violant le principe DRY et multipliant les surfaces d'attaque.

**Correction** : Supprimer toutes les réversions `.replace()`. Soit ne pas encoder côté client (la BDD stocke le texte brut et React échappe automatiquement), soit encoder uniquement côté serveur et ne jamais décoder côté client.

---

### E-02 — Injection SQL via la recherche d'utilisateurs (PostgREST ilike)
**Fichier** : `components/MessagesUI.tsx` — ligne ~480
**Catégorie** : Sécurité

```typescript
const { data } = await supabase
  .from('user_public_profile')
  .select('id, username, display_name, avatar_url')
  .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
  .neq('id', user?.id || '')
  .limit(10);
```

La variable `query` est interpolée directement dans le filtre PostgREST **sans échappement** des caractères spéciaux SQL (`%`, `_`, `\`, `,`, `.`, `(`). Un utilisateur peut :
- Injecter des patterns SQL sauvages (`%_%_%` = recherche tous les users)
- Casser la syntaxe du filtre PostgREST avec des virgules ou parenthèses
- Potentiellement modifier la logique du filtre `.or()`

**Correction** : Échapper les caractères spéciaux du query avant interpolation, ou utiliser une RPC côté serveur avec paramètres typés.

---

### E-03 — Absence de sanitisation dans les commentaires
**Fichier** : `components/CommentsDrawer.tsx` — ligne ~172
**Catégorie** : Sécurité

```typescript
const { error } = await supabase.from('beef_comments').insert({
  beef_id: beefId,
  user_id: user.id,
  content: text,           // ← texte brut, aucune sanitisation
  parent_id: replyingTo?.commentId ?? null,
});
```

Contrairement aux DMs et au chat d'arène qui utilisent `sanitizeMessage()`, les commentaires envoient le texte brut directement à Supabase. Si le contenu est ensuite affiché dans un contexte non-React (email, notification push, SSR), il y a un risque XSS.

**Correction** : Appliquer `sanitizeMessage()` (ou une version adaptée) avant l'insert.

---

### E-04 — Rate limiting client-side uniquement (contournable)
**Fichier** : `lib/security.ts` — lignes 36-51
**Catégorie** : Sécurité

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  // ...in-memory, per-session
}
```

Ce rate limiter est **exclusivement côté client** et en mémoire. Il est contournable en :
- Rafraîchissant la page
- Utilisant les DevTools pour supprimer la Map
- Appelant directement l'API Supabase

De plus, `checkRateLimit` n'est **pas utilisé** dans `MessagesUI.tsx` — un utilisateur peut spammer des messages sans aucune limite.

**Correction** : Implémenter le rate limiting côté serveur (trigger Postgres ou Edge Function). Le rate limiting client-side est utile en complément UX mais ne remplace pas la protection serveur.

---

### E-05 — Absence de vérification d'autorisation sur la suppression de messages
**Fichier** : `components/MessagesUI.tsx` — lignes 405-409
**Catégorie** : Sécurité

```typescript
const deleteMessage = async (msgId: string) => {
  setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m)));
  await supabase.from('direct_messages').update({ is_deleted: true }).eq('id', msgId);
  // ← Pas de .eq('sender_id', user.id) !
};
```

La requête de suppression ne filtre pas par `sender_id`. Si les RLS Postgres ne sont pas correctement configurées pour cette table, **n'importe quel participant à la conversation pourrait supprimer les messages de l'autre**. La même logique s'applique à `deleteSelectedMessages` (ligne 425) et `clearEntireConversation` (ligne 452).

**Correction** : Ajouter `.eq('sender_id', user.id)` aux requêtes de suppression, ou vérifier que les RLS bloquent bien cette opération côté serveur.

---

## 🟠 Majeurs (expérience dégradée)

### E-06 — Requêtes N+1 pour le comptage des non-lus par conversation
**Fichier** : `components/MessagesUI.tsx` — lignes 170-183
**Catégorie** : Performance

```typescript
const enriched: Conversation[] = await Promise.all(convs.map(async c => {
  // ...
  const { count } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', c.id)
    .neq('sender_id', user.id)
    .eq('is_read', false);

  return { ...c, other_user: otherUser, unread_count: count || 0 };
}));
```

Pour 20 conversations = 20 requêtes SQL distinctes. Avec la croissance de la base utilisateur, cela générera des temps de chargement de 2-5s+.

**Benchmark** : TikTok/Instagram chargent la liste de conversations en une seule requête avec le compteur de non-lus pré-calculé.

**Correction** : Créer une RPC Postgres `get_conversations_with_unread(p_user_id uuid)` qui retourne les conversations enrichies en une seule requête avec un `LEFT JOIN` et un `COUNT`.

---

### E-07 — Pas de pagination sur les conversations ni les messages
**Fichier** : `components/MessagesUI.tsx` — lignes 152-156, 297-302
**Catégorie** : Performance / UX

Les conversations sont chargées **toutes en une fois** sans `.range()`, et les messages ont un `.limit(100)` sans mécanisme « charger plus d'anciens messages ».

Un utilisateur avec 200+ conversations verra un temps de chargement prohibitif. Et une conversation de 500+ messages tronquera l'historique sans prévenir l'utilisateur.

**Benchmark** : Instagram/TikTok chargent ~20 conversations + scroll infini. Les messages sont paginés avec un bouton « charger plus » en haut du fil.

**Correction** : Ajouter `.range(0, 29)` aux conversations avec un scroll infini, et un mécanisme de pagination inversée (chargement vers le haut) pour les messages.

---

### E-08 — Aucun indicateur de frappe (typing indicator)
**Fichier** : `components/MessagesUI.tsx`
**Catégorie** : UX

Absent de l'implémentation actuelle. C'est une fonctionnalité standard sur **tous** les benchmarks : TikTok DMs, Instagram DMs, X DMs, Discord, WhatsApp.

L'absence crée une expérience « morte » où l'utilisateur ne sait pas si son interlocuteur est actif.

**Correction** : Implémenter via Supabase Realtime Presence (`.track()`) avec un état `{ typing: true }` émis lors de la saisie, avec un debounce de 2-3 secondes.

---

### E-09 — Pas de pagination dans FollowListModal
**Fichier** : `components/FollowListModal.tsx` — lignes 54-103
**Catégorie** : Performance

La modale charge **tous** les followers/following en une seule requête sans `.range()`. Un utilisateur avec 5 000+ followers :
- Requête lente (>2s)
- Animation individuelle `delay: index * 0.04` → 200s de délai cumulé pour le dernier item
- Mémoire : rendu de 5 000 divs Framer Motion avec animations

**Benchmark** : Instagram pagine sa liste followers par paquets de ~30, avec scroll infini.

**Correction** : Paginer avec `.range(0, 49)`, ajouter un scroll infini, supprimer le `delay` d'animation pour les items au-delà du fold.

---

### E-10 — Requête de profil utilisateur à chaque envoi de message arena
**Fichier** : `components/ChatPanel.tsx` — lignes 107-109
**Catégorie** : Performance

```typescript
const { data: userData } = await supabase
  .from('users')
  .select('username, display_name, avatar_url')
  .eq('id', userId)
  .single();
```

Chaque appel à `sendMessage` fait une requête pour récupérer le profil de l'utilisateur **qui est déjà connecté** et dont les données sont disponibles dans le contexte Auth. Dans un chat live actif, cela peut générer 1-2 requêtes/seconde.

**Correction** : Récupérer `username`, `display_name` et `avatar_url` depuis `useAuth()` ou les passer en props. Mettre en cache localement si nécessaire.

---

### E-11 — Faux compteur de likes dans CommentsStyleMessage
**Fichier** : `components/ChatPanel.tsx` — lignes 263-264
**Catégorie** : Logique métier

```typescript
const [liked, setLiked] = useState(false);
const [likes, setLikes] = useState(Math.floor(Math.random() * 50));
```

Le compteur de likes est **généré aléatoirement** à chaque rendu. Ce n'est clairement pas lié à des données réelles. Le bouton « Répondre » (ligne 324) est aussi non fonctionnel. Ces faux indicateurs sociaux pourraient tromper les utilisateurs et entamer la confiance dans la plateforme.

**Correction** : Connecter les likes à la table `beef_comment_likes` ou supprimer le composant `CommentsStyleMessage` s'il est un prototype.

---

### E-12 — Absence de debounce sur la recherche d'utilisateurs
**Fichier** : `components/MessagesUI.tsx` — lignes 472-488
**Catégorie** : Performance

```typescript
const searchUsers = async (query: string) => {
  setSearchQuery(query);
  if (query.length < 2) { setSearchResults([]); return; }
  setSearching(true);
  // requête Supabase à chaque frappe
```

La recherche se déclenche **à chaque caractère tapé** sans debounce. Taper « jean-marc » = 7 requêtes PostgREST. Avec 10 000 utilisateurs simultanés, la charge serveur sera significative.

**Benchmark** : Instagram/X utilisent un debounce de 300-500ms sur la recherche.

**Correction** : Ajouter un debounce de 300ms (ex. `useDeferredValue`, `setTimeout`, ou bibliothèque `use-debounce`).

---

### E-13 — Le contenu des notifications est affiché sans sanitisation
**Fichier** : `app/notifications/page.tsx` — lignes 488-493
**Catégorie** : Sécurité

```tsx
<p className="text-sm font-bold text-white">{n.title}</p>
{n.body ? (
  <p className="text-sm text-gray-400 line-clamp-2">
    {n.body}
  </p>
) : null}
```

`n.title` et `n.body` proviennent de la base de données. Si un attaquant peut injecter du contenu dans la table `notifications` (via un follow, un message ou un nom d'utilisateur malveillant), le contenu sera rendu tel quel. React échappe le texte par défaut, mais si `n.body` contient du contenu généré par un trigger PG à partir d'un nom d'utilisateur non sanitisé, cela pourrait poser problème dans des contextes SSR.

**Correction** : Sanitiser `title` et `body` à l'affichage, ou s'assurer que les triggers PG qui génèrent les notifications sanitisent le contenu.

---

### E-14 — Pas de confirmation avant la purge complète d'une conversation
**Fichier** : `components/MessagesUI.tsx` — lignes 445-470
**Catégorie** : UX

```typescript
const clearEntireConversation = async () => {
  if (!selectedConv) return;
  const convId = selectedConv.id;
  setMessages([]);  // ← Suppression immédiate sans confirmation
  // ...
```

Un clic accidentel sur « Vider la discussion » supprime **immédiatement et irréversiblement** tout l'historique. Pas de modale de confirmation.

**Benchmark** : Instagram et X demandent une double confirmation avant la suppression d'une conversation.

**Correction** : Ajouter une modale de confirmation : « Es-tu sûr de vouloir supprimer tout l'historique de cette conversation ? Cette action est irréversible. »

---

### E-15 — Le drawer des messages montre le contenu même quand fermé (z-index)
**Fichier** : `components/GlobalMessagesDrawer.tsx` — ligne 41
**Catégorie** : UX

```typescript
className="fixed right-0 top-0 bottom-0 z-[999999] flex w-full flex-col overflow-hidden ..."
```

Le `z-index: 999999` est excessivement élevé et peut causer des conflits avec d'autres overlays (modales, toasts). Le backdrop est à `z-[999998]`. Cela indique un empilement fragile.

De plus, le `bg-black/20 backdrop-blur-[2px]` ne respecte pas la classe de verre HUD prescrite dans `.cursorrules` (`bg-slate-900/40 backdrop-blur-sm`).

**Correction** : Utiliser les z-index du système (ex. `z-modal`, `z-modal-backdrop` comme dans `FollowListModal`) et appliquer les classes de verre autorisées.

---

## 🟡 Importants (amélioration nécessaire)

### E-16 — Absence d'indicateur de présence en ligne
**Fichier** : `components/MessagesUI.tsx`
**Catégorie** : UX

Aucun indicateur de statut en ligne (pastille verte, « Actif il y a 5min »). C'est une fonctionnalité standard sur TikTok, Instagram, WhatsApp, Discord.

**Correction** : Utiliser Supabase Realtime Presence pour tracker le statut en ligne des utilisateurs.

---

### E-17 — Pas de recherche dans les conversations
**Fichier** : `components/MessagesUI.tsx`
**Catégorie** : UX

Aucune fonctionnalité de recherche dans les messages ou les conversations existantes. Instagram, X et Discord offrent tous cette fonctionnalité.

**Correction** : Ajouter une barre de recherche en haut de la liste des conversations, filtrant par nom d'utilisateur et contenu des messages.

---

### E-18 — Pas de protection contre le double envoi de message
**Fichier** : `components/MessagesUI.tsx` — lignes 340-388
**Catégorie** : Logique métier

La fonction `sendMessage` n'a pas de flag `busy`/`sending`. Un utilisateur qui double-tape rapidement sur « Entrée » peut envoyer le même message deux fois. Le message temporaire est ajouté immédiatement mais la vérification `!newMessage.trim()` est contournée par la rapidité du clic.

**Correction** : Ajouter un `useState(false)` pour `isSending`, le passer à `true` en début de fonction et à `false` dans un `finally`.

---

### E-19 — setTimeout fragile dans la fermeture du drawer
**Fichier** : `contexts/MessagesDrawerContext.tsx` — ligne 19
**Catégorie** : Logique métier

```typescript
closeDrawer: () => {
  set({ isDrawerOpen: false });
  setTimeout(() => set({ targetUserId: undefined }), 300);
},
```

Le `setTimeout(300)` est synchronisé manuellement avec la durée de l'animation de fermeture. Si l'animation change ou si le device est lent, le `targetUserId` sera nettoyé trop tôt ou trop tard, causant des glitches.

**Correction** : Utiliser un callback `onAnimationComplete` de Framer Motion plutôt qu'un `setTimeout`.

---

### E-20 — Gestion d'erreur silencieuse dans le chargement des conversations
**Fichier** : `components/MessagesUI.tsx` — lignes 187-189
**Catégorie** : UX

```typescript
} catch (err) {
  console.error('Error loading conversations:', err);
  return [];
}
```

L'erreur est loguée en console mais l'utilisateur ne voit **aucun feedback**. L'écran affiche « Aucune conversation » comme si tout était normal.

**Correction** : Ajouter un state `error` et afficher un message d'erreur avec un bouton « Réessayer ».

---

### E-21 — Modale FollowListModal sans gestion du clavier (Escape)
**Fichier** : `components/FollowListModal.tsx`
**Catégorie** : Accessibilité

La modale n'intercepte pas la touche Escape pour se fermer. C'est un standard WCAG (WAI-ARIA Dialog Pattern). De plus, le focus n'est pas piégé (trap) dans la modale — un utilisateur au clavier peut tabuler « derrière » la modale.

**Correction** : Ajouter un `useEffect` pour écouter `keydown` avec `Escape` → `onClose()`, et implémenter un focus trap.

---

### E-22 — Contenu du chat d'arène rendu sans sanitisation
**Fichier** : `components/ArenaChatMessages.tsx` — ligne ~104
**Catégorie** : Sécurité

```tsx
<span className="... text-white/90 ...">
  {msg.content}
</span>
```

Le contenu des messages de chat d'arène est rendu directement. Même si React échappe le JSX, le contenu arrive via Zustand store (`arenaVolatileStore`) qui est alimenté par Supabase Realtime — un vecteur potentiel si la source n'est pas sanitisée côté serveur.

**Correction** : Appliquer `sanitize()` à l'entrée dans le store ou s'assurer que les RLS/triggers côté serveur sanitisent le contenu.

---

### E-23 — Pas de scroll infini dans les notifications
**Fichier** : `app/notifications/page.tsx` — ligne 92
**Catégorie** : UX

Le bouton « Charger plus » est un pattern correct mais le `PAGE_SIZE = 50` est trop grand pour le chargement initial sur mobile. Instagram charge ~15 notifications et utilise un scroll infini automatique avec IntersectionObserver.

**Correction** : Réduire à `PAGE_SIZE = 20` et remplacer le bouton par un `IntersectionObserver` qui déclenche le chargement automatique au scroll.

---

### E-24 — Logique `hasMore` incorrecte pour les notifications
**Fichier** : `app/notifications/page.tsx` — ligne 137
**Catégorie** : Logique métier

```typescript
setHasMore(notifs.length >= PAGE_SIZE || auras.length >= PAGE_SIZE);
```

L'opérateur `||` fait que le bouton « Charger plus » s'affiche si **l'une ou l'autre** source a encore des résultats. Si les notifications classiques sont épuisées mais pas les auras, on rechargera inutilement les notifications. Et inversement.

**Correction** : Tracker `hasMoreNotifs` et `hasMoreAuras` séparément, et afficher le bouton si l'un ou l'autre est vrai mais ne charger que la source pertinente.

---

### E-25 — Messages supprimés toujours reçus via le canal temps réel
**Fichier** : `components/MessagesUI.tsx` — lignes 262-266
**Catégorie** : Logique métier

```typescript
if (payload.eventType === 'INSERT') {
  const msg = payload.new as Message;
  if (msg.sender_id !== user?.id) {
    setMessages(prev => [...prev, msg]);
    // Pas de vérification msg.is_deleted
```

Un message inséré puis immédiatement soft-deleted (race condition serveur) sera reçu et affiché par le destinataire via le canal temps réel. Le flag `is_deleted` n'est pas vérifié à l'insertion.

**Correction** : Ajouter `if (msg.is_deleted) return;` avant d'ajouter le message au state.

---

### E-26 — L'onglet « Mentions » ne filtre pas les vraies mentions
**Fichier** : `app/notifications/page.tsx` — lignes 382-383
**Catégorie** : Logique métier

```typescript
if (activeTab === 'aura') return displayNotifications.filter((n) => n.type === 'aura');
return displayNotifications.filter((n) => n.type !== 'aura');
```

L'onglet « Mentions » affiche simplement toutes les notifications non-aura. Il n'y a pas de type `mention` dans le `NotificationType`. L'utilisateur s'attend à voir des @mentions comme sur X/Instagram, mais voit en réalité les follows, invitations, messages, etc.

**Correction** : Renommer l'onglet en « Autres » ou « Activité », ou implémenter un vrai système de mentions (@username) avec un type dédié.

---

### E-27 — Animations Framer Motion excessives sur les listes
**Fichier** : `components/FollowListModal.tsx` — ligne 246, `app/notifications/page.tsx` — ligne 476
**Catégorie** : Performance

```typescript
transition={{ delay: index * 0.04, ... }}  // FollowListModal
transition={{ delay: i * 0.04, ... }}       // NotificationsPage
```

Avec 200+ items, le délai cumulé atteint 8+ secondes. Chaque item crée un timer Framer Motion. Sur mobile bas de gamme, cela cause des jank/freeze.

**Correction** : Limiter l'animation séquentielle aux 10-15 premiers items visibles, ou utiliser `useInView` pour n'animer qu'au scroll.

---

## ⚪ Mineurs (polish)

### E-28 — `onKeyPress` déprécié dans ChatPanel
**Fichier** : `components/ChatPanel.tsx` — ligne 204
**Catégorie** : TypeScript / Standards

```typescript
onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
```

`onKeyPress` est déprécié au profit de `onKeyDown`. Déjà corrigé dans `MessagesUI.tsx` mais pas dans `ChatPanel.tsx`.

**Correction** : Remplacer par `onKeyDown`.

---

### E-29 — Faute d'orthographe dans l'état vide des conversations
**Fichier** : `components/MessagesUI.tsx` — ligne 748
**Catégorie** : UX

```tsx
<p className="text-gray-600 text-sm">Cherche un utilisateur pour demarrer</p>
```

« demarrer » → « démarrer » (accent manquant).

**Correction** : Corriger en « démarrer ».

---

### E-30 — `eslint-disable-next-line` pour les avatars dans CommentsDrawer
**Fichier** : `components/CommentsDrawer.tsx` — ligne 217
**Catégorie** : Standards

```tsx
// eslint-disable-next-line @next/next/no-img-element
<img src={author.avatar_url} alt="" ... />
```

Utilise `<img>` native au lieu de `next/image`. Même situation dans `Header.tsx` (ligne 511). Cela bypass l'optimisation d'images de Next.js.

**Correction** : Utiliser `<Image>` de Next.js avec un `sizes` adapté, comme dans `FollowListModal.tsx`.

---

### E-31 — Variable `users` masque le paramètre React Query
**Fichier** : `components/MessagesUI.tsx` — ligne 1071
**Catégorie** : TypeScript

```typescript
{Object.entries(msg.reactions).map(([emoji, users]) => {
```

La variable `users` dans le `.map()` masque la variable `users` de plus haut scope (liste des résultats de recherche, etc.). Confusion potentielle.

**Correction** : Renommer en `reactedUserIds` ou `userIds`.

---

### E-32 — Classe de verre non conforme dans le drawer de messages
**Fichier** : `components/GlobalMessagesDrawer.tsx` — ligne 41
**Catégorie** : Design System

La classe `bg-black/20 backdrop-blur-[2px]` ne correspond pas aux classes de verre autorisées par le design system :
- Modales/Tiroirs : `bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl`

**Correction** : Appliquer `bg-slate-950/75 backdrop-blur-md`.

---

### E-33 — Bouton d'envoi de média factice
**Fichier** : `components/MessagesUI.tsx` — ligne 1164
**Catégorie** : UX

```typescript
onClick={() => toast('Envoi de médias bientôt disponible !', 'info')}
```

Le bouton « + » affiche un toast « bientôt disponible ». C'est un placeholder visible par les utilisateurs finaux.

**Benchmark** : Instagram/TikTok permettent l'envoi de photos, vidéos, GIFs, stickers, audio.

**Correction** : Si la fonctionnalité n'est pas prévue à court terme, masquer le bouton. Sinon, l'implémenter.

---

### E-34 — Absence de feedback haptique/sonore sur les réactions
**Fichier** : `components/MessagesUI.tsx` — lignes 390-403
**Catégorie** : UX

Les réactions emoji sont appliquées visuellement mais sans aucun feedback sensoriel. TikTok et Instagram jouent une micro-animation et un retour haptique (vibration) sur mobile.

**Correction** : Ajouter `navigator.vibrate?.(10)` et une animation de scale bounce sur le bouton de réaction.

---

### E-35 — Le chat panel `textarea` a un aria-label implicite
**Fichier** : `components/MessagesUI.tsx` — lignes 1170-1191
**Catégorie** : Accessibilité

Le `<textarea>` de saisie a un `placeholder="Message..."` mais pas d'`aria-label` explicite. Les lecteurs d'écran utiliseront le placeholder comme label, ce qui est déconseillé par les standards WCAG.

**Correction** : Ajouter `aria-label="Saisir un message"`.

---

## Matrice de priorisation

| Priorité | ID | Effort | Impact |
|----------|-----|--------|--------|
| P0 (immédiat) | E-01, E-02, E-03 | Moyen | Sécurité critique |
| P0 (immédiat) | E-04, E-05 | Fort | Sécurité critique |
| P1 (sprint) | E-06, E-07 | Moyen | Scalabilité |
| P1 (sprint) | E-14, E-18 | Faible | UX destructive |
| P2 (backlog) | E-08, E-09, E-16, E-17 | Fort | Parité concurrence |
| P2 (backlog) | E-10, E-11, E-12 | Faible-Moyen | Performance |
| P3 (nice-to-have) | E-28 à E-35 | Faible | Polish |

---

## Recommandations transverses

1. **Sanitisation unifiée** : Créer un pipeline de sanitisation serveur (trigger PG ou Edge Function) qui sanitise tout contenu UGC à l'insertion. Supprimer la sanitisation client-side qui est contournable.

2. **RPC de listing** : Remplacer les patterns N+1 (conversations + unread, followers + isFollowing) par des RPC Postgres dédiées qui retournent les données enrichies en une requête.

3. **Virtualisation** : Pour les listes longues (messages, followers, notifications, chat arena), utiliser `react-window` ou `@tanstack/react-virtual` au lieu de rendre tous les éléments.

4. **Presence Realtime** : Implémenter un système de présence unifié via Supabase Realtime pour le typing indicator, le statut en ligne, et l'indicateur « vu ».

5. **Design System cohérent** : Aligner tous les composants de messagerie sur les classes de verre du design system (`.cursorrules` section 3).
