# Rapport d'Audit — Phase D : Profil & Paramètres

**Date d'extraction :** 23 juillet 2026  
**Commit de référence :** `cad2b6c docs: update PROJECT_STATE with Phase C audit completion`  
**Auditeur :** Agent IA — Protocole Architecte  
**Benchmark :** TikTok, Instagram, X (Twitter), Twitch

---

## Synthèse

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique | 5 |
| 🟠 Majeur | 16 |
| 🟡 Important | 18 |
| 🔵 Mineur | 12 |
| **Total** | **51** |

---

## Fichiers audités

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `app/profile/[username]/page.tsx` | 1019 | Page profil publique |
| `app/profile/ProfileContent.tsx` | 773 | Page profil propriétaire (owner) |
| `app/profile/page.tsx` | 35 | Guard auth + rendu ProfileContent |
| `app/settings/page.tsx` | 905 | Page paramètres (5 onglets) |
| `components/profile/ProfileHeader.tsx` | 189 | En-tête profil partagé (owner/public/preview) |
| `components/profile/ProfileTabs.tsx` | 48 | Onglets profil |
| `components/profile/ProfileBeefGrid.tsx` | 78 | Grille de beefs sur le profil |
| `components/settings/ProfileSettingsForm.tsx` | 134 | Formulaire édition display_name + bio |
| `components/settings/WithdrawalWizard.tsx` | 587 | Wizard de retrait (IBAN, PayPal, Mobile Money) |
| `components/settings/PasswordSettingsForm.tsx` | 398 | Formulaire changement de mot de passe |
| `components/settings/EmailSettingsForm.tsx` | 141 | Formulaire changement d'e-mail |
| `components/FollowButton.tsx` | 194 | Bouton Suivre / Ne plus suivre |
| `components/AuraGiversModal.tsx` | 210 | Modale donateurs d'Aura |
| `lib/schemas/index.ts` | 38 | Schémas Zod (profil, email, password) |
| `lib/fetch-user-public-profile.ts` | 54 | Utilitaire fetch profils publics par IDs |
| `lib/stores/walletStore.ts` | 74 | Store Zustand portefeuille temps réel |
| `lib/profile-stats-shortcuts.ts` | 26 | Type StatsShortcuts (raccourcis profil public) |
| `lib/prestige.ts` | 9 | Rang Aura (Citoyen → Aura Suprême) |

---

## Findings

---

### D-01 — Cascade de requêtes séquentielles (waterfall) sur le profil public
- **Sévérité** : 🔴 Critique
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.206–491)
- **Problème** : La `queryFn` du profil public exécute 10+ appels Supabase en séquence stricte (`await` chaînés) : profil → followers count → following count → beefs bundle → participants → mediator names → follow status → media likes. Chaque requête attend la précédente.
- **Impact** : Temps de chargement cumulé de 2-5 secondes sur 3G/4G. TikTok et Instagram chargent les données de profil en parallèle en < 500ms grâce au prefetching et au batching server-side.
- **Recommandation** : Regrouper les requêtes indépendantes via `Promise.all()` (followers + following + beefs + follow status + media likes peuvent s'exécuter en parallèle une fois le profil résolu). Idéalement, créer une RPC Supabase unique `get_full_public_profile(p_username, p_viewer_id)` côté PG qui renvoie un seul JSON.

---

### D-02 — Comptage des followers par `.length` au lieu du `count` Supabase
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.294–303), `app/profile/ProfileContent.tsx` (L.167–175)
- **Problème** : Le code fait `select('id', { count: 'exact' })` puis utilise `followersData?.length` au lieu de lire le header `count`. Supabase retourne l'option `count` dans les headers, mais toutes les lignes sont quand même rapatriées côté client.
- **Impact** : Pour un profil avec 10 000 abonnés, 10 000 lignes sont transférées juste pour obtenir un nombre. Gaspillage de bande passante et de mémoire.
- **Recommandation** : Utiliser `select('id', { count: 'exact', head: true })` pour ne récupérer que le compteur sans les lignes, ou une RPC `count(*)`.

---

### D-03 — Aucune pagination sur les listes de beefs
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.339, 405–418), `components/profile/ProfileBeefGrid.tsx` (L.49)
- **Problème** : Les beefs participants sont récupérés sans `limit` côté DB (seulement un `.slice(0, 12)` client-side à L.339 et L.443). Le `ProfileBeefGrid` rend tous les items sans virtualisation ni pagination.
- **Impact** : Un utilisateur actif avec 200+ participations charge toutes les données pour n'en afficher que 12. Aucun mécanisme « Voir plus » n'existe. Instagram et TikTok utilisent un scroll infini avec chargement par lots de 12-20.
- **Recommandation** : Ajouter `limit(12)` côté requête Supabase et implémenter un bouton « Charger plus » ou un intersection observer pour le scroll infini.

---

### D-04 — Bouton « Suivre » dans la modale Aura non fonctionnel
- **Sévérité** : 🔴 Critique
- **Fichier(s)** : `components/AuraGiversModal.tsx` (L.189–194)
- **Problème** : Le bouton « Suivre » dans la liste des donateurs d'Aura est un `<button>` sans `onClick` handler. Il ne déclenche aucune action.
- **Impact** : L'utilisateur clique sur « Suivre » et rien ne se passe. Casse la confiance UX. Instagram et X rendent tous les boutons de follow fonctionnels dans les modales similaires.
- **Recommandation** : Intégrer le composant `FollowButton` existant ou implémenter le handler de suivi directement.

---

### D-05 — Validation faible des coordonnées de retrait (IBAN, PayPal, téléphone)
- **Sévérité** : 🔴 Critique
- **Fichier(s)** : `components/settings/WithdrawalWizard.tsx` (L.418–439)
- **Problème** : L'IBAN est validé par `length < 15` uniquement (pas de checksum mod 97). Le PayPal vérifie seulement `includes('@')`. Le numéro mobile vérifie `length < 8`. Aucune regex ou validation de format stricte.
- **Impact** : Un utilisateur peut soumettre un IBAN invalide, un email mal formé ou un numéro incomplet. Le retrait échouera côté bancaire, créant frustration et charge support. Risque de fraude si l'API serveur ne revalide pas.
- **Recommandation** : Implémenter une validation IBAN avec checksum (librairie `ibantools`), utiliser le schéma Zod `z.string().email()` pour PayPal, et valider le format E.164 pour les numéros mobiles.

---

### D-06 — Montant de retrait non validé côté client contre les valeurs négatives
- **Sévérité** : 🔴 Critique
- **Fichier(s)** : `components/settings/WithdrawalWizard.tsx` (L.196–208)
- **Problème** : L'input `type="number"` accepte des valeurs négatives ou zéro via saisie directe au clavier. Le `min={20}` est un attribut HTML5 non contraignant. L'état `withdrawalAmountEuros` peut devenir `NaN` si l'utilisateur efface le champ.
- **Impact** : Potentielle soumission d'un montant <= 0 ou NaN à l'API de retrait. Impact financier si le serveur ne revalide pas.
- **Recommandation** : Ajouter une validation `Math.max(20, Math.min(val, maxAmount))` dans le onChange, et un guard `if (withdrawalAmountEuros < 20 || isNaN(withdrawalAmountEuros)) return` avant la soumission.

---

### D-07 — Interfaces TypeScript dupliquées sur 4 fichiers
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.32–85), `app/profile/ProfileContent.tsx` (L.21–69), `components/profile/ProfileBeefGrid.tsx` (L.6–19)
- **Problème** : `UserProfile`, `UserStats`, et `Beef` sont définis localement dans chaque fichier avec des variantes subtiles (ex. `resolution_status` optionnel dans un fichier, requis dans un autre ; `total_views` présent uniquement dans ProfileContent).
- **Impact** : Divergences silencieuses entre les types. Un changement de schéma DB nécessite de mettre à jour 4 fichiers au lieu d'un. Risque de régressions TypeScript masquées.
- **Recommandation** : Centraliser dans `lib/types/profile.ts` et `lib/types/beef.ts`. Exporter et importer depuis un seul point de vérité.

---

### D-08 — Stat « Vues Totales » hardcodée à zéro
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/ProfileContent.tsx` (L.249, 635)
- **Problème** : `total_views: 0` est hardcodé dans les stats du profil owner. La carte « Vues Totales » affiche toujours 0 avec un design proéminent (icône + titre + nombre 3XL).
- **Impact** : Fonctionnalité mort-née visible par l'utilisateur. Donne une impression d'application inachevée. Twitch et YouTube n'affichent jamais de métriques à zéro sans raison.
- **Recommandation** : Soit implémenter le compteur de vues réel via une agrégation `SUM(viewer_count)` sur les beefs, soit supprimer la carte jusqu'à implémentation.

---

### D-09 — Absence de skeleton loading sur le profil public
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.641–650)
- **Problème** : Le profil public affiche un simple spinner centré pendant le chargement. Le profil owner (`ProfileContent.tsx` L.464–498) utilise un skeleton layout complet. Incohérence.
- **Impact** : Perception de lenteur accrue sur le profil public. TikTok et Instagram affichent systématiquement des skeletons qui reflètent la structure finale de la page.
- **Recommandation** : Réutiliser un skeleton layout identique à celui du profil owner, adapté au layout public (sans boutons d'upload).

---

### D-10 — Manipulation directe de `document.body.style.overflow`
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.174–181), `app/profile/ProfileContent.tsx` (L.350–357)
- **Problème** : Plusieurs composants manipulent directement `document.body.style.overflow` pour bloquer le scroll derrière les modales. Si deux modales se chevauchent ou se ferment dans un ordre inattendu, le scroll peut rester bloqué.
- **Impact** : Scroll de la page potentiellement verrouillé de manière permanente si une erreur JS interrompt le cleanup.
- **Recommandation** : Utiliser un hook centralisé `useScrollLock()` avec un compteur de verrous, ou la librairie `body-scroll-lock`.

---

### D-11 — Préférences de notification stockées uniquement en localStorage
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/settings/page.tsx` (L.124–132, 173–179)
- **Problème** : Les préférences de notification (messages, follows, invites, beefs_live, aura, gifts, browser) sont stockées exclusivement dans `localStorage`. Elles ne sont pas synchronisées côté serveur.
- **Impact** : Un utilisateur qui change d'appareil perd toutes ses préférences. Le serveur ne connaît pas les préférences et ne peut pas respecter le consentement de l'utilisateur pour les notifications push. Instagram et X synchronisent toutes les préférences serveur-side.
- **Recommandation** : Stocker dans une colonne JSONB `notification_preferences` sur la table `users` et synchroniser bidirectionnellement.

---

### D-12 — Double état de loading sur la page Settings
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/settings/page.tsx` (L.220–239)
- **Problème** : Deux spinners identiques se succèdent : `authLoading` (L.220) puis `loading` (L.231). L'utilisateur voit un premier spinner, un flash, puis potentiellement un second spinner.
- **Impact** : Expérience de chargement saccadée. Les apps de référence affichent un seul état de chargement avec un skeleton.
- **Recommandation** : Fusionner les deux conditions en un seul guard `if (authLoading || loading)` avec un skeleton layout unique.

---

### D-13 — Historique des transactions non géré par React Query
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/settings/page.tsx` (L.135–149)
- **Problème** : L'historique `pointTx` est chargé via un `useEffect` + `.then()` brut, en dehors du système React Query utilisé partout ailleurs. Pas de cache, pas d'invalidation, pas de gestion d'erreur visible.
- **Impact** : Incohérence architecturale. Pas de retry automatique en cas d'erreur réseau. Pas de rafraîchissement après un retrait.
- **Recommandation** : Migrer vers un `useQuery({ queryKey: ['point-transactions', user.id], ... })` et invalider après un retrait.

---

### D-14 — Mise à jour de la couleur d'accent sans debounce
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/settings/page.tsx` (L.618–624, 640–643)
- **Problème** : Chaque clic sur une pastille de couleur ou mouvement dans le color picker envoie immédiatement un `UPDATE` à Supabase. Le color picker `onChange` se déclenche à chaque pixel de mouvement.
- **Impact** : Des dizaines de requêtes DB par seconde pendant le glissement du color picker. Surcharge inutile de la base de données.
- **Recommandation** : Debouncer la mise à jour DB (300-500ms) et ne persister qu'au relâchement du color picker (`onChangeComplete` ou `onBlur`).

---

### D-15 — `deleteAccount` utilise `confirm()` natif du navigateur
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/settings/page.tsx` (L.181–218)
- **Problème** : La suppression de compte utilise deux `confirm()` natifs en cascade. Ces dialogues sont non-stylisés, peuvent être supprimés par les navigateurs mobiles, et sont bloquants (synchrones).
- **Impact** : Sur certains navigateurs mobiles ou PWA, les `confirm()` ne s'affichent pas ou sont auto-acceptés. Risque de suppression accidentelle. Instagram utilise une modale custom avec saisie du mot de passe.
- **Recommandation** : Remplacer par une modale custom avec confirmation par saisie (ex. taper « SUPPRIMER ») et demande de mot de passe.

---

### D-16 — Upload d'image sans validation de taille/type avant le crop
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/ProfileContent.tsx` (L.368–386)
- **Problème** : Les handlers `handleBannerUpload` et `handleAvatarUpload` ne vérifient ni la taille du fichier ni son type MIME réel. L'attribut `accept="image/*"` est contournable.
- **Impact** : Un utilisateur peut sélectionner un fichier de 100 MB, ce qui gèlera le navigateur lors du `createObjectURL` et du chargement dans le crop modal. Risque de crash mémoire sur mobile.
- **Recommandation** : Valider `file.size <= 10 * 1024 * 1024` (10 MB max) et vérifier le type MIME (`file.type.startsWith('image/')`) avant de procéder.

---

### D-17 — Onglets profil : sémantique ARIA incorrecte
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/profile/ProfileTabs.tsx` (L.21–46)
- **Problème** : Le composant utilise `aria-current="page"` pour l'onglet actif, mais ce sont des onglets in-page, pas de la navigation entre pages. Il manque `role="tablist"` sur le conteneur et `role="tab"` + `aria-selected` sur les boutons.
- **Impact** : Les lecteurs d'écran n'identifient pas le pattern comme des onglets. Non conforme WCAG 2.1 AA. TikTok et Instagram utilisent correctement le pattern ARIA tabs.
- **Recommandation** : Ajouter `role="tablist"` sur le `<nav>`, `role="tab"` + `aria-selected={isActive}` sur chaque bouton, et `role="tabpanel"` sur le contenu correspondant.

---

### D-18 — Profil public : `params.username` casté sans validation
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.146)
- **Problème** : `const username = params.username as string` force le cast TypeScript sans vérifier que `params.username` est bien une chaîne. Si Next.js fournit un tableau (cas de catch-all route), le code plante silencieusement.
- **Impact** : Crash potentiel pour des URLs malformées. Le `decodeURIComponent` à L.187 pourrait lever une `URIError` sur des encodages invalides (ex. `%E0%A4%A`).
- **Recommandation** : Valider `const username = Array.isArray(params.username) ? params.username[0] : params.username ?? ''` et envelopper `decodeURIComponent` dans un try/catch.

---

### D-19 — Labels Follow masqués sur mobile
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/FollowButton.tsx` (L.184, 189)
- **Problème** : Les labels « Suivre » et « Ne plus suivre » utilisent `className="hidden sm:inline"`, les rendant invisibles sur mobile. Seule l'icône est visible.
- **Impact** : Sur mobile (cible principale), l'utilisateur ne voit qu'une petite icône `UserPlus`/`UserMinus` sans texte. Faible affordance comparé à Instagram qui affiche toujours le texte "Follow" sur son bouton.
- **Recommandation** : Afficher au minimum le label sur le bouton follow (pas seulement l'icône) ou ajouter un `aria-label` dynamique (présent dans la logique mais non visible).

---

### D-20 — Redirection anonyme vers `/signup` inexistant
- **Sévérité** : 🔴 Critique
- **Fichier(s)** : `components/AuraGiversModal.tsx` (L.155)
- **Problème** : Le bouton « Rejoindre l'Agora » redirige vers `/signup`, mais la route correspondante n'existe pas dans l'arborescence `app/`. La page d'inscription est probablement à `/login`.
- **Impact** : L'utilisateur anonyme qui clique sur le CTA atterrit sur une page 404. Perte de conversion critique.
- **Recommandation** : Corriger vers `/login` ou la route d'inscription réelle de l'application.

---

### D-21 — Modale aperçu public sans focus trap
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/profile/ProfileContent.tsx` (L.677–752)
- **Problème** : La modale d'aperçu public a `role="dialog"` et `aria-modal="true"` mais n'implémente pas de focus trap. Le focus peut s'échapper vers les éléments derrière la modale via Tab.
- **Impact** : Non conforme WCAG 2.1 AA pour les modales. Les utilisateurs de clavier peuvent naviguer vers des éléments cachés derrière l'overlay.
- **Recommandation** : Ajouter un focus trap (ex. via `useFocusTrap` ou `<FocusScope>` de Radix).

---

### D-22 — Incohérence des labels d'onglets owner vs public
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/profile/ProfileContent.tsx` (L.612–615), `app/profile/[username]/page.tsx` (L.823–826)
- **Problème** : Le profil owner utilise « Statistiques » / « Mes Affaires » tandis que le profil public utilise « Ref » / « Affaires ». La terminologie diverge pour les mêmes concepts.
- **Impact** : Confusion utilisateur. L'onglet « Ref » sur le profil public n'a pas d'équivalent clair sur le profil owner. Le terme « Ref » (Referee/Médiateur) n'est pas explicite pour un nouvel utilisateur.
- **Recommandation** : Harmoniser les labels. Utiliser « Médiations » / « Participations » partout pour la clarté.

---

### D-23 — Mélange vouvoiement / tutoiement dans l'interface
- **Sévérité** : 🟡 Important
- **Fichier(s)** : Multiples fichiers
- **Problème** : Le tutoiement et le vouvoiement sont mélangés. Exemples : « Parlez-nous de vous... » (vouvoiement, `ProfileSettingsForm.tsx` L.105), « Tu ne peux pas liker ton propre média » (tutoiement, `[username]/page.tsx` L.518), « Êtes-vous sûr de vouloir supprimer » (vouvoiement, `settings/page.tsx` L.184).
- **Impact** : Incohérence de ton qui nuit à l'identité de marque. TikTok et Instagram maintiennent un ton uniforme.
- **Recommandation** : Choisir le tutoiement (cohérent avec le ton social/jeune de l'app) et l'appliquer partout.

---

### D-24 — `queryKey` du profil public inclut `user?.id` (re-fetch inutile)
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.184)
- **Problème** : La `queryKey` est `['public-profile', username, user?.id]`. Quand l'état auth change (connexion/déconnexion), toute la requête profil est relancée même si le profil affiché ne change pas.
- **Impact** : Double-fetch inutile lors de la connexion/déconnexion. Ajoute de la latence perçue.
- **Recommandation** : Séparer les données publiques (profil, beefs) des données authentifiées (isFollowing, mediaLikes) en deux requêtes distinctes avec des queryKeys indépendantes.

---

### D-25 — Schéma `profileSchema` : pas de sanitization XSS
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `lib/schemas/index.ts` (L.6–11)
- **Problème** : Le schéma Zod `profileSchema` valide `display_name` (2–30 chars) et `bio` (max 160 chars) sans filtrer les caractères HTML ou les balises `<script>`. Les données sont potentiellement rendues avec `dangerouslySetInnerHTML` ou via `{profile.bio}` dans JSX.
- **Impact** : Bien que React échappe par défaut le JSX, le `bio` et `display_name` sont aussi utilisés dans les `title` de `navigator.share` et les meta tags OG potentiels, où l'échappement n'est pas garanti.
- **Recommandation** : Ajouter un `.transform(val => val.replace(/<[^>]*>/g, ''))` ou utiliser DOMPurify côté serveur. Filtrer aussi les caractères de contrôle Unicode.

---

### D-26 — Hauteur de bannière fixe non responsive
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/profile/ProfileHeader.tsx` (L.64)
- **Problème** : La bannière a une hauteur fixe `h-48` (192px) identique sur mobile et desktop. Sur un écran de 375px de large, 192px représentent plus de 50% de la hauteur visible.
- **Impact** : Sur mobile, la bannière prend trop de place et pousse le contenu important (nom, bio, stats) en dessous du fold. Instagram utilise une bannière proportionnelle (ratio 3:1) qui s'adapte.
- **Recommandation** : Utiliser `h-32 sm:h-40 md:h-48` ou un aspect ratio responsive.

---

### D-27 — Aura click zone avec `role="generic"` incorrect
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/profile/ProfileHeader.tsx` (L.126–127)
- **Problème** : Quand `onAuraClick` est défini, `role="button"` est appliqué. Quand il ne l'est pas, `role="generic"` est utilisé. `"generic"` n'est pas un rôle WAI-ARIA valide pour la plupart des assistive technologies.
- **Impact** : Avertissement d'accessibilité. Devrait être `role={undefined}` ou `role="presentation"`.
- **Recommandation** : Utiliser `role={onAuraClick ? 'button' : undefined}`.

---

### D-28 — Boutons de stats sans `aria-label` descriptif
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/profile/ProfileHeader.tsx` (L.159–175)
- **Problème** : Les boutons « X Affaires », « X Ref », « X Abonnés », « X Abonnements » n'ont pas d'`aria-label`. Le lecteur d'écran lira « button 42 Affaires » sans contexte.
- **Impact** : Accessibilité dégradée pour les lecteurs d'écran.
- **Recommandation** : Ajouter `aria-label={`Voir les ${stats.beefs_participated} affaires`}`.

---

### D-29 — Aspect ratio des cartes beef excessif sur mobile
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/profile/ProfileBeefGrid.tsx` (L.52)
- **Problème** : `aspect-[3/4] max-h-[70dvh]` crée des cartes en mode portrait (ratio 3:4) qui prennent jusqu'à 70% de la hauteur du viewport. Une seule carte occupe la quasi-totalité de l'écran.
- **Impact** : L'utilisateur ne voit qu'un seul beef à la fois et doit scroller massivement. TikTok utilise un ratio 9:16 mais avec un swipe vertical entre les items. Instagram utilise un ratio 1:1 en grille.
- **Recommandation** : Passer à un aspect ratio plus horizontal (16:9 ou 4:3) ou implémenter une grille 2 colonnes sur mobile avec des cartes plus compactes.

---

### D-30 — Page Settings : composant monolithique de 905 lignes
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/settings/page.tsx` (1–905)
- **Problème** : La page Settings concentre 5 onglets, 15+ states, et toute la logique UI dans un seul fichier de 905 lignes. Les onglets profil, sécurité, wallet, préférences et danger sont tous rendus conditionnellement dans le même composant.
- **Impact** : Fichier difficile à maintenir et à tester. Tout le code des 5 onglets est chargé même si l'utilisateur n'en visite qu'un. Re-render global à chaque changement d'état.
- **Recommandation** : Extraire chaque onglet dans un composant séparé (`ProfileTab.tsx`, `SecurityTab.tsx`, `WalletTab.tsx`, `PreferencesTab.tsx`, `DangerTab.tsx`) et utiliser `React.lazy()` pour le lazy-loading.

---

### D-31 — Changement d'e-mail via `signInWithPassword` crée une nouvelle session
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `components/settings/EmailSettingsForm.tsx` (L.41–46)
- **Problème** : Pour vérifier le mot de passe, le code appelle `supabase.auth.signInWithPassword()` qui crée une nouvelle session. Selon la configuration Supabase (single session mode), cela peut invalider la session courante et déconnecter l'utilisateur.
- **Impact** : Risque de déconnexion involontaire lors du changement d'email. L'utilisateur doit se reconnecter.
- **Recommandation** : Utiliser `supabase.auth.reauthenticate()` (méthode prévue pour la re-authentification sans créer de nouvelle session) ou vérifier côté serveur.

---

### D-32 — Images de drapeaux depuis un CDN externe sans fallback
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/settings/WithdrawalWizard.tsx` (L.344, 367)
- **Problème** : Les drapeaux des pays sont chargés depuis `flagcdn.com`. Si ce CDN est indisponible, les images ne s'affichent pas et il n'y a pas de fallback.
- **Impact** : Dégradation visuelle si le CDN externe est lent ou bloqué (certains bloqueurs de pub bloquent les CDN tiers).
- **Recommandation** : Ajouter un `onError` pour afficher le code ISO à la place, ou bundler les flags localement.

---

### D-33 — `walletStore` : subscription Realtime potentiellement silencieuse
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `lib/stores/walletStore.ts` (L.32–44)
- **Problème** : La subscription `postgres_changes` sur la table `users` nécessite que le Realtime soit activé et configuré côté Supabase (publication activée). Si ce n'est pas le cas, la souscription échoue silencieusement sans fallback.
- **Impact** : Le solde du portefeuille ne se met pas à jour en temps réel sans que l'utilisateur ou le développeur le sache. Le `balance` reste figé jusqu'au prochain refresh.
- **Recommandation** : Ajouter un handler `on('error')` et un fallback polling (ex. re-fetch toutes les 30 secondes) si le Realtime échoue.

---

### D-34 — `StatsShortcuts` défini mais non utilisé dans l'UI Settings
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `lib/profile-stats-shortcuts.ts` (L.1–26), `components/profile/ProfileHeader.tsx`
- **Problème** : Le type `StatsShortcuts` et le merge helper sont définis mais jamais référencés dans `ProfileHeader` ni dans les Settings. Les 4 compteurs (participations, médiations, followers, following) sont toujours affichés, sans possibilité de les masquer.
- **Impact** : Code mort. La fonctionnalité de personnalisation des raccourcis statistiques du profil public n'est pas exposée à l'utilisateur.
- **Recommandation** : Soit implémenter l'UI dans les Settings (toggle par métrique), soit supprimer le code inutilisé.

---

### D-35 — Pas de meta tags / OG pour le profil public (SEO)
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/profile/[username]/page.tsx`
- **Problème** : La page profil publique est un composant `'use client'` sans `generateMetadata()`. Aucun meta tag Open Graph (titre, description, image) n'est généré côté serveur pour le partage social.
- **Impact** : Quand un utilisateur partage son profil sur WhatsApp, Discord ou X, le lien apparaît sans aperçu (pas de titre, pas d'image, pas de description). Twitter et Instagram génèrent des cartes OG riches.
- **Recommandation** : Créer un `layout.tsx` ou `page.tsx` server-side pour `app/profile/[username]/` qui exporte `generateMetadata()` avec fetch du profil côté serveur, puis rend le client component.

---

### D-36 — FollowButton : pas d'update optimiste immédiat de l'état visuel
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/FollowButton.tsx` (L.105–163)
- **Problème** : Le bouton passe en `busy=true` pendant la requête mais l'état visuel (couleur, label) ne change qu'après la réponse du serveur (via `emitOptimistic` à L.163). Le style du bouton reste dans son état précédent pendant 200-500ms.
- **Impact** : Latence perceptible. Instagram change immédiatement l'apparence du bouton (optimistic update), puis revient en arrière en cas d'erreur.
- **Recommandation** : Appliquer `setFollowing(!following)` immédiatement au clic, puis revenir en arrière en cas d'erreur dans le catch.

---

### D-37 — Lightbox profil : pas de navigation clavier entre images
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.903–1015)
- **Problème** : La lightbox image supporte `Escape` pour fermer (via l'overlay click) mais ne gère pas les flèches gauche/droite pour naviguer entre avatar et bannière.
- **Impact** : L'utilisateur doit fermer et rouvrir pour voir l'autre image. Interaction sous-optimale comparée aux lightboxes d'Instagram.
- **Recommandation** : Ajouter un handler `onKeyDown` pour les flèches et un indicateur de pagination (1/2).

---

### D-38 — Bio : aucun compteur de caractères pour `display_name`
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/settings/ProfileSettingsForm.tsx` (L.81–95)
- **Problème** : Le champ `display_name` a une limite de 30 caractères (schéma Zod) mais aucun compteur visuel n'est affiché. Le champ `bio` a un compteur « X/160 caractères ».
- **Impact** : L'utilisateur ne sait pas qu'il y a une limite jusqu'à ce qu'il soumette et reçoive une erreur de validation.
- **Recommandation** : Ajouter `{displayNameValue.length}/30 caractères` sous l'input, similaire au compteur bio.

---

### D-39 — Historique des retraits non visible pendant le formulaire
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/settings/WithdrawalWizard.tsx` (L.545)
- **Problème** : L'historique des retraits n'est visible que sur l'étape `summary` (`withdrawalStep === 'summary'`). Pendant les étapes `form`, `confirm` et `success`, l'historique disparaît.
- **Impact** : L'utilisateur ne peut pas vérifier ses retraits précédents pendant qu'il remplit un nouveau formulaire.
- **Recommandation** : Toujours afficher l'historique en bas, indépendamment de l'étape.

---

### D-40 — Navigation Settings mobile : pas d'indicateur de scroll horizontal
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/settings/page.tsx` (L.291–328)
- **Problème** : Sur mobile, les onglets Settings sont en scroll horizontal avec `overflow-x-auto hide-scrollbar`. Aucun gradient de fondu ou indicateur visuel ne signale qu'il y a plus d'onglets à droite.
- **Impact** : L'onglet « Zone de danger » (dernier) peut être invisible et non découvert par l'utilisateur mobile.
- **Recommandation** : Ajouter un gradient de fondu à droite quand le scroll n'est pas au bout, ou utiliser un layout vertical sur mobile.

---

### D-41 — Flash de contenu blanc sur le guard auth du profil
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/profile/page.tsx` (L.30–32)
- **Problème** : Quand l'utilisateur n'est pas connecté, le composant retourne `null` après avoir lancé la redirection. Pendant le temps de redirection, un flash de page blanche est visible.
- **Impact** : Expérience visuelle dégradée pendant la fraction de seconde de redirection.
- **Recommandation** : Retourner le spinner de chargement au lieu de `null` pendant la redirection.

---

### D-42 — Profil public : `beefFromPublicRpcRow` cast avec `as`
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.88–109)
- **Problème** : La fonction `beefFromPublicRpcRow` reçoit un `Record<string, unknown>` et accède aux propriétés via des casts `as`. Aucune validation runtime des données RPC.
- **Impact** : Si la RPC change de schéma (ajout/suppression de colonnes), les casts masquent les erreurs. Le code continue avec des valeurs `undefined` converties silencieusement.
- **Recommandation** : Utiliser un schéma Zod pour parser et valider la réponse RPC.

---

### D-43 — Wallet : pas de synchronisation entre `walletPoints` et `walletStore`
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `app/settings/page.tsx` (L.71), `lib/stores/walletStore.ts`
- **Problème** : La page Settings maintient son propre `walletPoints` local (L.71) chargé depuis la DB. Le `walletStore` Zustand est un store global séparé avec sa propre subscription Realtime. Les deux sources de vérité ne sont pas synchronisées.
- **Impact** : Le solde affiché dans les Settings peut diverger du solde réel si un achat/cadeau arrive via le Realtime. Après un retrait, seul `walletPoints` est mis à jour localement, pas le store global.
- **Recommandation** : Utiliser `useWalletStore` comme source unique de vérité et supprimer l'état local `walletPoints`.

---

### D-44 — Profil public : pas de gestion du cas `username` avec caractères spéciaux
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.187, 628)
- **Problème** : Le `decodeURIComponent` à L.187 peut lever une `URIError` sur des séquences invalides. Le `handleShare` à L.628 construit l'URL avec le `username` brut sans `encodeURIComponent`.
- **Impact** : Crash potentiel pour des URLs avec des séquences d'échappement malformées. Lien de partage cassé pour des usernames contenant des caractères spéciaux.
- **Recommandation** : Envelopper `decodeURIComponent` dans un try/catch et utiliser `encodeURIComponent(username)` dans `handleShare`.

---

### D-45 — Pas de protection anti-double-clic sur le retrait
- **Sévérité** : 🟠 Majeur
- **Fichier(s)** : `components/settings/WithdrawalWizard.tsx` (L.505–518)
- **Problème** : Le bouton de confirmation du retrait est désactivé via `disabled={withdrawalLoading}`, mais le `withdrawalLoading` est mis à `true` de manière asynchrone (première instruction dans `handleWithdrawalSubmit`). Un double-clic rapide peut déclencher deux requêtes.
- **Impact** : Risque de double déduction de points et de double demande de retrait. Impact financier.
- **Recommandation** : Utiliser un ref `isSubmitting` mis à `true` de manière synchrone avant l'`await`, ou un mutex.

---

### D-46 — AuraGiversModal : `<img>` au lieu de `<Image>` Next.js
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `components/AuraGiversModal.tsx` (L.173)
- **Problème** : Les avatars des donateurs utilisent la balise `<img>` native au lieu du composant `<Image>` de Next.js.
- **Impact** : Pas d'optimisation automatique (WebP, lazy loading, sizing). Sur une liste de 50+ donateurs, toutes les images sont chargées immédiatement sans optimisation.
- **Recommandation** : Utiliser `<Image>` avec `width={40} height={40}` et `loading="lazy"`.

---

### D-47 — Terminologie incohérente : « pts » / « Lingots » / « Aura » / « points »
- **Sévérité** : 🟡 Important
- **Fichier(s)** : Multiples
- **Problème** : La monnaie interne est appelée « Lingots » dans le wallet, « points » dans le code/DB, « Aura » pour le prestige. L'historique affiche « Lingots » mais le calcul utilise `points`. Le `walletStore` parle de `balance` et `points`.
- **Impact** : Confusion utilisateur sur ce que représente chaque unité. Le ratio 100 Lingots = 1€ n'est explicité qu'au niveau du wallet, jamais ailleurs.
- **Recommandation** : Définir un glossaire clair : « Lingots » = monnaie échangeable, « Aura » = prestige non-échangeable (lifetime_points). Utiliser ces termes de manière exclusive et cohérente partout.

---

### D-48 — Profil owner : pas de re-fetch après upload d'image
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/profile/ProfileContent.tsx` (L.436, 444)
- **Problème** : Après un upload d'avatar/bannière, le code appelle `queryClient.invalidateQueries({ queryKey: ['owner-profile', user.id] })`, ce qui relance toute la queryFn (10+ requêtes). Il n'y a pas de mise à jour ciblée du cache.
- **Impact** : Refresh complet de toutes les données profil juste pour un changement d'image. Latence visible.
- **Recommandation** : Utiliser `queryClient.setQueryData` pour mettre à jour uniquement l'URL de l'image dans le cache, puis invalider en arrière-plan.

---

### D-49 — `useEffect` avec `window.location.search` au lieu de Next.js hooks
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/profile/[username]/page.tsx` (L.580–595), `app/profile/ProfileContent.tsx` (L.279–285)
- **Problème** : Les query params et hash sont lus via `window.location.search` et `window.location.hash` directement, contournant les hooks Next.js (`useSearchParams`, `useHash`).
- **Impact** : Pas de réactivité Next.js aux changements de searchParams. Incompatibilité potentielle avec le router App.
- **Recommandation** : Utiliser `useSearchParams()` de `next/navigation`.

---

### D-50 — Avatar : crash si `username` est vide
- **Sévérité** : 🟡 Important
- **Fichier(s)** : `components/profile/ProfileHeader.tsx` (L.102)
- **Problème** : Si `profile.username` est une chaîne vide, `profile.username[0].toUpperCase()` accède à `undefined[0]` et lève une TypeError.
- **Impact** : Crash de l'en-tête profil pour un utilisateur dont le username serait vide (edge case base de données).
- **Recommandation** : Utiliser `(profile.username?.[0] || '?').toUpperCase()`.

---

### D-51 — Formulaire profil : key instable provoquant des remounts
- **Sévérité** : 🔵 Mineur
- **Fichier(s)** : `app/settings/page.tsx` (L.398)
- **Problème** : Le `ProfileSettingsForm` utilise `key={\`${profileFormData.display_name}-${profileFormData.bio}\`}`. À chaque mise à jour de `profileFormData`, le composant est détruit et recréé.
- **Impact** : Le formulaire perd son état interne (focus, valeurs en cours de saisie) à chaque sauvegarde. L'utilisateur voit un flash de re-render.
- **Recommandation** : Supprimer la `key` dynamique et utiliser un `useEffect` interne au formulaire pour synchroniser les `defaultValues` avec `reset()` de react-hook-form.

---

## Plan d'action priorisé

### 🔴 Priorité 1 — Critiques (à corriger immédiatement)

| ID | Fichier | Action |
|----|---------|--------|
| D-01 | `[username]/page.tsx` | Paralléliser les requêtes Supabase avec `Promise.all()` ou créer une RPC unifiée |
| D-04 | `AuraGiversModal.tsx` | Rendre le bouton « Suivre » fonctionnel (utiliser `FollowButton`) |
| D-05 | `WithdrawalWizard.tsx` | Implémenter une validation stricte IBAN (checksum mod 97), email (Zod), téléphone (E.164) |
| D-06 | `WithdrawalWizard.tsx` | Valider le montant de retrait côté JS (`>= 20`, `<= solde`, pas `NaN`) |
| D-20 | `AuraGiversModal.tsx` | Corriger la redirection `/signup` → `/login` |

### 🟠 Priorité 2 — Majeurs (sprint courant)

| ID | Fichier | Action |
|----|---------|--------|
| D-02 | `[username]/page.tsx`, `ProfileContent.tsx` | Utiliser `{ count: 'exact', head: true }` pour les compteurs followers |
| D-03 | `[username]/page.tsx`, `ProfileBeefGrid.tsx` | Ajouter `limit()` côté DB + scroll infini ou « Voir plus » |
| D-07 | Multiples | Centraliser les interfaces dans `lib/types/profile.ts` |
| D-08 | `ProfileContent.tsx` | Supprimer ou implémenter la stat « Vues Totales » |
| D-09 | `[username]/page.tsx` | Ajouter un skeleton loading identique au profil owner |
| D-11 | `settings/page.tsx` | Migrer les préférences de notification vers la DB (colonne JSONB) |
| D-16 | `ProfileContent.tsx` | Valider taille/type du fichier avant le crop modal (max 10 MB) |
| D-18 | `[username]/page.tsx` | Valider `params.username` (string check + try/catch `decodeURIComponent`) |
| D-25 | `lib/schemas/index.ts` | Ajouter une sanitization HTML sur `display_name` et `bio` |
| D-30 | `settings/page.tsx` | Extraire chaque onglet dans un sous-composant + lazy loading |
| D-31 | `EmailSettingsForm.tsx` | Remplacer `signInWithPassword` par `reauthenticate()` |
| D-35 | `[username]/page.tsx` | Ajouter meta tags OG via `generateMetadata()` server-side |
| D-43 | `settings/page.tsx`, `walletStore.ts` | Unifier la source de vérité du solde via `useWalletStore` |
| D-45 | `WithdrawalWizard.tsx` | Ajouter un guard anti-double-clic synchrone (ref `isSubmitting`) |

### 🟡 Priorité 3 — Importants (prochain sprint)

| ID | Fichier | Action |
|----|---------|--------|
| D-10 | `[username]/page.tsx`, `ProfileContent.tsx` | Centraliser le scroll lock via un hook dédié |
| D-12 | `settings/page.tsx` | Fusionner les deux états loading en un seul skeleton |
| D-13 | `settings/page.tsx` | Migrer l'historique transactions vers React Query |
| D-14 | `settings/page.tsx` | Debouncer la mise à jour de couleur d'accent (300ms) |
| D-15 | `settings/page.tsx` | Remplacer `confirm()` par une modale custom avec saisie de confirmation |
| D-17 | `ProfileTabs.tsx` | Corriger la sémantique ARIA → `role="tablist"` / `role="tab"` |
| D-19 | `FollowButton.tsx` | Afficher le label « Suivre » sur mobile (supprimer `hidden sm:inline`) |
| D-21 | `ProfileContent.tsx` | Ajouter un focus trap à la modale d'aperçu public |
| D-22 | Multiples | Harmoniser les labels d'onglets (Médiations / Participations) |
| D-23 | Multiples | Normaliser le tutoiement dans toute l'interface |
| D-24 | `[username]/page.tsx` | Séparer queryKey données publiques / données authentifiées |
| D-26 | `ProfileHeader.tsx` | Rendre la hauteur de bannière responsive (`h-32 sm:h-40 md:h-48`) |
| D-29 | `ProfileBeefGrid.tsx` | Réduire le ratio des cartes (`aspect-[16/9]` ou grille 2 colonnes mobile) |
| D-33 | `walletStore.ts` | Ajouter un fallback polling si Realtime échoue |
| D-34 | `profile-stats-shortcuts.ts` | Implémenter l'UI ou supprimer le code mort |
| D-36 | `FollowButton.tsx` | Appliquer l'optimistic update immédiatement au clic |
| D-44 | `[username]/page.tsx` | Protéger `decodeURIComponent` + `encodeURIComponent` dans share |
| D-47 | Multiples | Définir et appliquer un glossaire Lingots/Aura/points |
| D-50 | `ProfileHeader.tsx` | Guard `username?.[0]` contre les chaînes vides |

### 🔵 Priorité 4 — Mineurs (backlog)

| ID | Fichier | Action |
|----|---------|--------|
| D-27 | `ProfileHeader.tsx` | Corriger `role="generic"` → `role={undefined}` |
| D-28 | `ProfileHeader.tsx` | Ajouter des `aria-label` descriptifs sur les boutons stats |
| D-32 | `WithdrawalWizard.tsx` | Ajouter un fallback pour les images de drapeaux |
| D-37 | `[username]/page.tsx` | Ajouter la navigation clavier gauche/droite dans la lightbox |
| D-38 | `ProfileSettingsForm.tsx` | Ajouter un compteur X/30 pour le display_name |
| D-39 | `WithdrawalWizard.tsx` | Afficher l'historique de retraits indépendamment de l'étape |
| D-40 | `settings/page.tsx` | Ajouter un gradient de fondu sur le scroll horizontal mobile |
| D-41 | `page.tsx` | Retourner le spinner au lieu de `null` pendant la redirection |
| D-42 | `[username]/page.tsx` | Valider les réponses RPC avec un schéma Zod |
| D-46 | `AuraGiversModal.tsx` | Remplacer `<img>` par `<Image>` Next.js |
| D-48 | `ProfileContent.tsx` | Utiliser `setQueryData` ciblé au lieu d'invalidation complète post-upload |
| D-49 | Multiples | Remplacer `window.location.search` par `useSearchParams()` |
| D-51 | `settings/page.tsx` | Supprimer la `key` dynamique du `ProfileSettingsForm` |

---

*Fin du rapport — Phase D0*
