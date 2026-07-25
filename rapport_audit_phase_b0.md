# Rapport d'audit — Phase B.0 (Feed & Découverte) — Chirurgical

- **Date :** 2026-07-22
- **Commit ref :** `7426a78`
- **Contrainte :** zéro modification — analyse et recommandations uniquement
- **Benchmark :** TikTok, Instagram Reels, X (Twitter), Twitch Browse

---

## Périmètre audité

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `app/page.tsx` | 73 | Écran splash / routage initial |
| `app/feed/page.tsx` | 1279 | Feed principal (boucle d'engagement) |
| `app/live/page.tsx` | 362 | Liste des beefs live |
| `components/BeefCard.tsx` | 1023 | Carte beef (unité de contenu) |
| `components/Header.tsx` | 801 | Navigation + sidebar |
| `components/GlobalSearchBar.tsx` | 302 | Recherche globale |
| `components/CommentsDrawer.tsx` | 389 | Tiroir commentaires |
| `app/notifications/page.tsx` | 472 | Centre de notifications |
| `components/PWAInstallPrompt.tsx` | 216 | Invite installation PWA |
| `components/AppShell.tsx` | 60 | Layout global (mobile / desktop) |

---

## Synthèse exécutive

L'app a une identité forte (Premium Glass, vocabulaire « Agora ») et des fondations solides (realtime Supabase, Swiper mobile, IntersectionObserver pour vidéo). Mais plusieurs frictions structurelles empêchent de rivaliser avec les plateformes de référence. Voici les **33 problèmes** classés par impact.

---

## 🔴 CRITIQUES (Bloquants UX / conversion)

### B-01 — Splash screen bloquant (1.5s de noir avant contenu)

**Fichier :** `app/page.tsx` L.12 — `setTimeout(…, 1500)`

**Problème :** chaque visite sur `/` impose 1.5s de logo + ping auth avant redirection. TikTok, Instagram, X affichent du contenu en < 300ms. Ce délai augmente le taux de rebond, surtout en retour d'un lien externe.

**Recommandation :** supprimer le splash en tant que page séparée. Utiliser un middleware Next.js pour rediriger `/` → `/feed` ou `/onboarding` côté serveur (zéro JS client). Si un effet visuel est voulu au premier lancement, l'intégrer comme skeleton animé *dans* le feed.

---

### B-02 — Pas de scroll infini (pagination manuelle « Charger plus »)

**Fichier :** `app/feed/page.tsx` L.1153–1163

**Problème :** le bouton « Charger plus » est un anti-pattern de 2015. TikTok, Instagram, X utilisent tous du scroll infini avec IntersectionObserver. L'utilisateur ne doit jamais s'arrêter pour cliquer.

**Recommandation :** remplacer le bouton par un sentinel `<div>` observé par IntersectionObserver qui trigger `loadMore()` automatiquement. Ajouter un spinner discret au bas de la liste pendant le chargement.

---

### B-03 — Le feed mobile (Swiper) ne supporte pas le pull-to-refresh

**Fichier :** `app/feed/page.tsx` L.1131–1151

**Problème :** sur TikTok/Instagram, tirer vers le bas recharge le feed. Ici, Swiper.js en mode vertical n'a pas de pull-to-refresh natif. L'utilisateur n'a aucun moyen manuel de rafraîchir sans quitter la page.

**Recommandation :** ajouter un composant `PullToRefresh` au-dessus du Swiper (ou utiliser l'événement `touchstart`/`touchmove` + seuil de déplacement) qui appelle `loadBeefs()`.

---

### B-04 — Pas de contenu pour les visiteurs non connectés (feed vide)

**Fichier :** `app/feed/page.tsx` — le feed charge les beefs via Supabase, mais un visiteur anonyme ne voit que le Hero (« Un compte à régler ? ») + les cartes, sans personnalisation ni CTA d'engagement clair.

**Problème :** Instagram et TikTok montrent du contenu viral aux visiteurs pour les accrocher *avant* l'inscription. Un visiteur sur Beefs voit un feed générique sans aucune preuve sociale (pas de compteur global d'utilisateurs, pas de highlights).

**Recommandation :**
- Afficher les beefs les plus populaires (triés par `engagement_score`) pour les non-connectés
- Ajouter un bandeau sticky « 🔥 X beefs en cours — Rejoins l'Agora » avec CTA inscription
- Bloquer les interactions (like, comment) avec un prompt login plutôt que de les cacher

---

### B-05 — Page `/live` duplique le feed et redirige les non-connectés

**Fichier :** `app/live/page.tsx` L.112–115 — `if (!user) { router.replace('/login'); }`

**Problème :** cette page est un doublon du feed filtré `status=live`, avec un design radicalement différent (cards grille classique vs cartes TikTok). Un visiteur non connecté est immédiatement éjecté vers `/login` — il ne peut même pas voir qu'il y a du live. Sur Twitch, le browse est accessible sans compte.

**Recommandation :**
- **Option A (fusionner) :** supprimer `/live` comme page séparée et utiliser le filtre « Live » du feed principal (déjà existant via `STATUS_FILTERS`)
- **Option B (différencier) :** transformer `/live` en une vraie page « Explore Live » type Twitch Browse, avec thumbnails live, nombre de spectateurs, et *accessible sans login*

---

### B-06 — Onglet « Abonnements » vide sans message actionnable

**Fichier :** `app/feed/page.tsx` L.556–560 — filtre `followingSet.has(beef.mediator_id)`

**Problème :** un nouvel utilisateur qui clique sur « Abonnements » voit un feed vide sans explication. Instagram affiche « Suis des comptes pour voir leur contenu ici » + suggestions. Beefs n'a rien.

**Recommandation :** quand `followingIds.length === 0` ou `beefsWithData.length === 0` dans l'onglet Abonnements, afficher un état vide dédié avec :
- Un message clair (« Tu ne suis personne pour l'instant »)
- Des suggestions de profils populaires (réutiliser `topUsers` du Header)
- Un CTA « Explorer les médiateurs »

---

## 🟠 MAJEURS (Expérience dégradée)

### B-07 — Requêtes en cascade (waterfall) dans `loadBeefs`

**Fichier :** `app/feed/page.tsx` L.296–580

**Problème :** le chargement du feed enchaîne 4 requêtes séquentielles (beefs → invitations → participants → profils publics). Chaque étape attend la précédente. Sur un réseau 3G, c'est 2-4s de chargement.

**Recommandation :**
- Créer une vue SQL ou RPC Supabase `feed_beefs_enriched` qui retourne les beefs avec les noms de challengers en une seule requête
- Ou à minima paralléliser les requêtes d'enrichissement avec `Promise.all`

---

### B-08 — Pas de cache / stale-while-revalidate sur le feed

**Fichier :** `app/feed/page.tsx` — chaque navigation vers `/feed` refait un fetch complet.

**Problème :** Instagram et TikTok montrent le contenu mis en cache immédiatement, puis rafraîchissent en arrière-plan. Beefs repart de zéro à chaque visite (skeleton → fetch → render). `react-query` est installé (`QueryProvider`) mais n'est pas utilisé pour le feed.

**Recommandation :** migrer `loadBeefs` vers `useQuery` (TanStack) avec `staleTime: 30_000` et `refetchOnWindowFocus: true`. Le contenu s'affiche instantanément au retour sur la page.

---

### B-09 — Skeletons du feed mal dimensionnés par rapport aux vraies cartes

**Fichier :** `app/feed/page.tsx` L.1066–1091

**Problème :** les skeletons ont des dimensions (`h-48`, `rounded-[2rem]`) qui ne correspondent pas aux cartes réelles (qui font plein écran en mobile). Le shift de layout entre skeleton et contenu final est brutal.

**Recommandation :** créer un composant `BeefCardSkeleton` qui reprend exactement les dimensions et proportions de `BeefCard` (plein écran mobile, `aspect-[3/4]` desktop).

---

### B-10 — Recherche globale : pas de debounce visible, pas de résultats récents, pas de raccourci mobile

**Fichier :** `components/GlobalSearchBar.tsx`

**Problèmes identifiés :**
1. Pas d'historique de recherche récente (Instagram, TikTok l'ont)
2. Le debounce est à 300ms mais aucun indicateur de chargement pendant la frappe
3. Pas de raccourci d'ouverture sur mobile (le bouton existe mais pas de geste)
4. Résultats limités à 5 sans pagination ni « Voir tous les résultats »
5. La recherche ne cherche pas dans les tags directement (juste titre/description pour beefs)
6. Injection SQL potentielle : `query` est injecté directement dans `.ilike.%${query}%` sans échapper les caractères spéciaux `%` et `_`

**Recommandations :**
- Afficher les 3 dernières recherches à l'ouverture (localStorage)
- Ajouter la recherche par tags (`tags.cs.{${query}}`)
- Utiliser `ilike_exact` (déjà présent dans `lib/ilike-exact.ts`) pour échapper la query
- Augmenter la limite à 10-15 résultats

---

### B-11 — Header : navigation horizontale masquée sur tablette, pas de bottom bar mobile

**Fichier :** `components/Header.tsx`

**Problème :** sur mobile (< lg), la navigation est cachée derrière un menu hamburger. TikTok, Instagram et X ont tous une **bottom tab bar** persistante (Home, Search, Create, Notifications, Profile). L'utilisateur de Beefs doit ouvrir le menu pour chaque navigation.

**Recommandation :** ajouter une bottom tab bar fixe sur mobile avec les 5 entrées principales (Feed, Search, Call Out, Notifications, Profil). Le menu hamburger reste pour les options secondaires (Settings, Points, Admin).

---

### B-12 — Notifications : pas de groupage, liste plate qui noie l'information

**Fichier :** `app/notifications/page.tsx`

**Problème :** les notifications sont affichées en liste plate chronologique. Si 15 personnes envoient de l'Aura, c'est 15 lignes identiques. Instagram groupe (« @user1, @user2 et 13 autres ont aimé ta publication »). TikTok groupe par type.

**Recommandation :**
- Grouper les notifications de même type sur le même objet (même beef, même profil) dans la dernière heure
- Afficher « @X et Y autres t'ont transmis de l'Aura » au lieu de Y lignes séparées
- L'onglet « Mentions » ne filtre rien de pertinent actuellement (il exclut juste « aura ») — clarifier son rôle ou le renommer

---

### B-13 — Notifications : fetch limit à 4000 sans pagination

**Fichier :** `app/notifications/page.tsx` L.119, L.125 — `.limit(4000)`

**Problème :** charger 4000 notifications d'un coup est un anti-pattern de performance. Au-delà de 100 notifications, le render React devient lent et la requête Supabase coûteuse.

**Recommandation :** pagination par 50 avec scroll infini (même pattern que B-02). Charger les 50 plus récentes, puis charger au scroll.

---

### B-14 — BeefCard : composant monolithique de 1000+ lignes

**Fichier :** `components/BeefCard.tsx` — 1023 lignes, 40+ props

**Problème :** ce composant est le cœur du feed mais il est devenu ingérable. Il gère : l'affichage carte, le modal teaser plein écran, l'aura (2 systèmes : beef + teaser), les actions (delete/edit/forfeit), les CTAs dynamiques selon le statut, les rôles (spectateur/participant/médiateur/créateur), les manifestes... Le tout dans un seul fichier.

**Recommandation :** extraire en sous-composants :
- `BeefCardMedia` (thumbnail, vidéo, overlay)
- `BeefCardOverlay` (infos TikTok : titre, challengers, tags)
- `BeefCardActions` (aura, commentaires, views)
- `BeefTeaserModal` (la modale plein écran)
- `BeefCardCTA` (boutons dynamiques par statut)

---

### B-15 — BeefCard : variable globale mutable `globalIsMuted`

**Fichier :** `components/BeefCard.tsx` L.17 — `let globalIsMuted = true;`

**Problème :** une variable globale mutable hors du cycle React pour synchroniser le mute entre les cartes. C'est fragile (race conditions possibles) et ne survit pas au HMR en développement. TikTok utilise un contexte ou un store global.

**Recommandation :** migrer vers `arenaVolatileStore` (Zustand, déjà disponible) ou un contexte `FeedMuteContext`.

---

## 🟡 IMPORTANTS (Qualité perçue)

### B-16 — Pas de transition entre les slides mobile (Swiper)

**Fichier :** `app/feed/page.tsx` L.1132 — `<Swiper direction="vertical" slidesPerView={1}`

**Problème :** le Swiper n'a aucune configuration de transition ou d'effet. TikTok a un snap fluide avec un léger rebond. Beefs utilise le snap par défaut qui est fonctionnel mais sans polish.

**Recommandation :** ajouter `speed={400}`, `freeMode={false}`, `resistanceRatio={0.65}` pour un snap plus satisfaisant.

---

### B-17 — Tags trending hardcodés en fallback

**Fichier :** `app/feed/page.tsx` L.290-291

**Problème :** quand il n'y a pas de beefs, les tags trending tombent sur des valeurs hardcodées (`'tech', 'startup', 'argent'...`). C'est un placeholder oublié.

**Recommandation :** soit afficher rien (pas de section trending si pas de données), soit alimenter depuis une table `trending_tags` en base.

---

### B-18 — Le bouton « Lingots » du feed n'est visible qu'en tablette (entre md et lg)

**Fichier :** `app/feed/page.tsx` L.1001–1009

**Problème :** le lien « Lingots » dans la barre de filtres a les classes `max-md:hidden` et `lg:hidden`, ce qui le rend visible *uniquement* entre 768px et 1024px. C'est un comportement bizarre — un élément de navigation ne devrait pas apparaître/disparaître selon des breakpoints arbitraires.

**Recommandation :** retirer ce lien redondant (les Lingots sont déjà dans la nav principale). Ou le rendre systématiquement visible si c'est un CTA important.

---

### B-19 — Pas de feedback haptique / animation sur les actions (like, comment)

**Fichiers :** `BeefCard.tsx`, `CommentsDrawer.tsx`

**Problème :** quand l'utilisateur like un beef (Aura), il n'y a pas de vibration (API Haptics), pas de son, et l'animation `+1` est discrète. Sur TikTok, le cœur explose en animation avec un feedback tactile. Sur Instagram, le double-tap fait un cœur géant.

**Recommandation :**
- Ajouter `navigator.vibrate?.(10)` sur le like
- Agrandir l'animation `+1` (actuellement `scale: 0.5 → 1.1`, passer à `0.5 → 1.8` avec rotation)
- Ajouter un double-tap sur la carte pour liker (pattern Instagram)

---

### B-20 — CommentsDrawer : pas de likes count visible sur les commentaires

**Fichier :** `components/CommentsDrawer.tsx` L.255–272

**Problème :** chaque commentaire a un bouton Aura (like) mais aucun compteur visible. L'utilisateur ne sait pas si un commentaire a 0 ou 500 likes. Le composant `InlineAuraGivers` affiche des avatars mais pas de nombre.

**Recommandation :** ajouter un compteur numérique à côté de l'icône Sparkles (même pattern que l'aura sur la BeefCard).

---

### B-21 — CommentsDrawer : pas de tri / pas de mise en avant des commentaires populaires

**Fichier :** `components/CommentsDrawer.tsx` L.64 — `order('created_at', { ascending: true })`

**Problème :** les commentaires sont triés chronologiquement uniquement. Instagram propose « Pertinence » (les plus likés en premier) et « Récents ». YouTube a le même pattern.

**Recommandation :** ajouter un toggle « Récents / Populaires ». En mode populaire, trier par nombre de likes (à ajouter en vue SQL ou en comptant côté client).

---

### B-22 — État vide du feed : le CTA « Initier un Beef » est le seul recours

**Fichier :** `app/feed/page.tsx` L.1092–1109

**Problème :** quand le feed est vide (tous les filtres actifs, ou vraiment aucun beef), le seul CTA est « Initier un Beef ». Mais un nouvel utilisateur ne veut pas forcément créer — il veut explorer. Il n'y a pas de suggestion de profils à suivre, de beefs passés à revoir, ou de recommandation personnalisée.

**Recommandation :** dans l'état vide, proposer :
1. « Explore les beefs passés » (lien vers le filtre "Terminés")
2. « Découvre les médiateurs populaires » (top users)
3. « Crée ton premier beef » (en troisième position, pas en premier)

---

### B-23 — Page `/live` : design incohérent avec le feed

**Fichier :** `app/live/page.tsx`

**Problème :** cette page utilise un design « web app classique » (grille de cartes `bg-gradient-to-br from-gray-800 to-gray-900`) alors que le feed utilise le design system Premium Glass. L'incohérence visuelle donne l'impression de deux apps différentes. Les cards live n'ont pas de thumbnail, pas de vidéo preview, pas d'aura — c'est très pauvre comparé aux cards du feed.

**Recommandation :** si la page est conservée (cf. B-05), aligner visuellement sur le design system : utiliser `SECTION_SHELL` ou les classes glass, ajouter des thumbnails, réutiliser `BeefCard` en mode compact.

---

### B-24 — Pas d'animations de transition entre les pages

**Fichier :** `components/AppShell.tsx`

**Problème :** la navigation entre les pages est un hard cut (blanc → contenu). Instagram, TikTok, et X utilisent des transitions fluides (slide, fade). Beefs n'a aucune animation de transition de route.

**Recommandation :** utiliser `framer-motion` + `AnimatePresence` au niveau du layout (ou `next/navigation` events) pour ajouter un fade-in/out entre les pages. Priorité basse mais impact élevé sur la perception de qualité.

---

## 🔵 MINEURS (Polish / détails)

### B-25 — Splash screen redirige les non-connectés vers `/feed` (pas vers `/login`)

**Fichier :** `app/page.tsx` L.26 — `else { router.push('/feed'); }`

**Problème :** un visiteur non connecté voit le splash puis atterrit sur le feed. C'est correct fonctionnellement, mais la question stratégique est : faut-il les envoyer vers un feed qu'ils ne peuvent pas utiliser pleinement, ou vers une landing page dédiée qui vend l'app ? (TikTok montre le feed, Instagram montre un mur de login sur desktop.)

**Recommandation :** conserver le redirect vers `/feed` (approche TikTok — montrer du contenu), mais s'assurer que le feed non-connecté est engageant (cf. B-04).

---

### B-26 — Le Hero « Un compte à régler ? » redirige vers `/signup` (pas vers `/login`)

**Fichier :** `app/feed/page.tsx` L.850 — `router.push('/signup?next=/feed')`

**Problème :** le CTA principal du Hero non-connecté envoie vers `/signup`, mais `/signup` redirige elle-même vers `/login`. C'est un redirect inutile.

**Recommandation :** changer directement en `/login?next=/feed` ou `/login?mode=signup&next=/feed`.

---

### B-27 — PWA Install Prompt : délai de 12-26 secondes avant affichage

**Fichier :** `components/PWAInstallPrompt.tsx` L.77

**Problème :** le prompt d'installation PWA attend entre 12 et 26 secondes avant de s'afficher. C'est bien pour éviter l'intrusion, mais sur un réseau lent, l'utilisateur peut avoir quitté la page. TikTok et Instagram n'ont pas de prompt — ils comptent sur les « Add to Home Screen » natifs du browser.

**Recommandation :** réduire le délai à 8s (post-onboarding) et 15s (sinon). Ou adopter une approche moins intrusive : un bandeau discret en bas plutôt qu'un overlay.

---

### B-28 — Notifications : le dot bleu « non lu » est trop petit et peu contrasté

**Fichier :** `app/notifications/page.tsx` L.461 — `w-2 h-2 rounded-full bg-blue-500`

**Problème :** le point bleu fait 8px sur un fond sombre. C'est quasi invisible. Instagram utilise un point bleu plus gros + un fond subtil sur la ligne.

**Recommandation :** augmenter à `w-2.5 h-2.5` et ajouter un `shadow-[0_0_6px_rgba(59,130,246,0.6)]` pour le glow.

---

### B-29 — Header « L'Élite de l'Agora » : requête non filtrée sur les profils

**Fichier :** `components/Header.tsx` L.130–138

**Problème :** la requête `topUsers` charge les 4 profils avec le plus de `lifetime_points` sans filtrer les comptes bannis ou les comptes de test. Un admin banni pourrait apparaître dans l'élite.

**Recommandation :** ajouter un filtre `.eq('is_banned', false)` ou `.not('banned_at', 'is', null)` (selon le schéma).

---

### B-30 — Pas de lazy-loading des images dans le feed

**Fichier :** `components/BeefCard.tsx` L.267–273 — `<Image>` sans `loading="lazy"` explicite

**Problème :** Next.js `Image` est lazy par défaut, mais les images de fond floué (ambient letterboxing) sont chargées en double (une pour le fond, une pour le contenu). Sur un feed de 20 beefs, ça fait 40 images au minimum.

**Recommandation :** n'utiliser le fond flouté que pour les 3 premiers beefs visibles. Pour les autres, utiliser un dégradé statique jusqu'au scroll.

---

### B-31 — Le menu contextuel (3 dots) de BeefCard ne se ferme pas au click extérieur

**Fichier :** `components/BeefCard.tsx` L.330–396

**Problème :** le menu contextuel (Modifier, Forfait, Supprimer) n'a pas de click-outside handler. L'utilisateur doit re-cliquer sur le bouton `...` pour le fermer.

**Recommandation :** ajouter un overlay transparent qui ferme le menu au click, ou utiliser un composant `Popover` de Radix (déjà installé via `@radix-ui/react-dropdown-menu`).

---

### B-32 — Feed : les filtres de statut ne montrent pas le nombre de résultats

**Fichier :** `app/feed/page.tsx` L.1013–1025

**Problème :** les boutons « Live », « À venir », « Terminés » n'affichent pas le nombre de beefs dans chaque catégorie. L'utilisateur clique à l'aveugle. Instagram et TikTok montrent des compteurs sur les onglets.

**Recommandation :** ajouter un badge count à côté de chaque filtre (au minimum pour « Live » — c'est le plus critique pour montrer l'activité de la plateforme).

---

### B-33 — Le feed « Abonnements » ne filtre que par `mediator_id`, pas par challengers

**Fichier :** `app/feed/page.tsx` L.557–559

**Problème :** le filtre « Abonnements » ne montre que les beefs où le médiateur est quelqu'un que l'utilisateur suit. Si l'utilisateur suit un challenger (qui n'est pas médiateur), il ne verra pas ses beefs dans cet onglet.

**Recommandation :** élargir le filtre pour inclure aussi les beefs où un challenger suivi participe (`challengerANameByBeef` → `userId` → `followingSet.has(...)`).

---

## Matrice de priorisation

| Impact | Effort | IDs |
|--------|--------|-----|
| 🔴 Critique / Facile | B-02, B-04, B-06 |
| 🔴 Critique / Moyen | B-01, B-03, B-05 |
| 🟠 Majeur / Facile | B-08, B-09, B-15, B-17, B-18 |
| 🟠 Majeur / Moyen | B-07, B-10, B-11, B-14 |
| 🟠 Majeur / Lourd | B-12, B-13 |
| 🟡 Important / Facile | B-16, B-19, B-20, B-22, B-28, B-29, B-32 |
| 🟡 Important / Moyen | B-21, B-23, B-24, B-33 |
| 🔵 Mineur / Facile | B-25, B-26, B-27, B-30, B-31 |

---

## Plan d'action recommandé (top 10 par priorité)

1. **B-02** — Scroll infini (remplacer « Charger plus » par IntersectionObserver)
2. **B-11** — Bottom tab bar mobile (Home, Search, Create, Notifs, Profile)
3. **B-01** — Supprimer le splash screen (redirect serveur)
4. **B-04** — Feed engageant pour les non-connectés (contenu viral + CTA)
5. **B-08** — React Query sur le feed (stale-while-revalidate)
6. **B-06** — État vide « Abonnements » avec suggestions de profils
7. **B-07** — Réduire le waterfall de requêtes (vue SQL enrichie)
8. **B-14** — Extraire BeefCard en sous-composants
9. **B-05** — Fusionner ou différencier `/live` vs feed + filtre Live
10. **B-03** — Pull-to-refresh sur le Swiper mobile

---

## Annexe — Patterns de référence (benchmarks)

| Pattern | TikTok | Instagram | X | Beefs actuel |
|---------|--------|-----------|---|--------------|
| Scroll infini | ✅ | ✅ | ✅ | ❌ (bouton) |
| Pull-to-refresh | ✅ | ✅ | ✅ | ❌ |
| Bottom tab bar | ✅ | ✅ | ✅ | ❌ (hamburger) |
| Skeleton matching | ✅ | ✅ | ✅ | ❌ (mismatch) |
| Cache / SWR | ✅ | ✅ | ✅ | ❌ |
| Transition de page | ✅ | ✅ | Partiel | ❌ |
| Recherche récente | ✅ | ✅ | ✅ | ❌ |
| Groupage notifications | ✅ | ✅ | ✅ | ❌ |
| Double-tap to like | ✅ | ✅ | ❌ | ❌ |
| Feed non-connecté | ✅ | Partiel | ✅ | ❌ (pauvre) |
| Compteur sur onglets | ✅ | ✅ | ✅ | ❌ |

---

*Fin du rapport — Phase B.0 — Feed & Découverte — aucune modification appliquée au dépôt.*
