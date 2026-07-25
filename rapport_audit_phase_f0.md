# Rapport d'Audit — Phase F0 : Arène & Live

**Date** : 24 juillet 2026
**Périmètre** : Expérience live en direct — arène, pré-join, chat, médiateur, API access/manage
**Benchmark** : Twitch, TikTok Live, X Spaces, Discord Stage
**Fichiers audités** :
- `components/TikTokStyleArena.tsx` (~4 000 lignes)
- `components/PreJoinScreen.tsx` (~418 lignes)
- `components/MediatorSidebar.tsx` (~748 lignes)
- `components/ChatPanel.tsx` (~332 lignes)
- `components/ArenaChatMessages.tsx` (~105 lignes)
- `app/arena/[roomId]/page.tsx` (~520 lignes)
- `app/api/beef/access/route.ts` (~257 lignes)
- `app/api/beef/manage/route.ts` (~358 lignes)
- `hooks/useArenaRealtime.ts` (~771 lignes)
- `hooks/useDailyMeetingEngine.ts` (~471 lignes)
- `hooks/useDailyCall.ts` (~117 lignes)
- `lib/participant-identity.ts` (~271 lignes)
- `lib/stores/arenaVolatileStore.ts` (~85 lignes)

---

## Résumé exécutif

| Sévérité | Nombre |
|----------|--------|
| 🔴 Critique | 5 |
| 🟠 Majeur | 12 |
| 🟡 Important | 10 |
| ⚪ Mineur | 8 |
| **Total** | **35** |

L'arène est le cœur de l'app et son principal différenciateur. Le monolithe `TikTokStyleArena.tsx` (4 000+ lignes) concentre la majorité de la logique, ce qui rend la maintenance et les tests très difficiles. Des problèmes de sécurité (injection XSS dans les annonces, absence de validation d'input sur l'API manage), de fiabilité (métriques d'engagement fabriquées, logs de debug en production) et d'UX (absence de protection double-clic, UX morte) nécessitent une intervention prioritaire.

---

## 🔴 Critiques (5)

### F-01 — Métriques d'engagement fabriquées (CommentsStyleMessage)
**Fichier** : `components/ChatPanel.tsx` — ligne 263
**Constat** : Le composant `CommentsStyleMessage` initialise un compteur de likes avec `Math.floor(Math.random() * 50)`. Chaque message affiché en mode "comments" reçoit un nombre aléatoire de likes fictifs. C'est une tromperie délibérée envers l'utilisateur et un risque juridique (pratiques trompeuses).
**Impact** : Confiance utilisateur détruite si découvert, risque légal.
**Correction** : Supprimer le compteur random. Brancher les likes réels depuis la base de données ou afficher zéro.

### F-02 — Logs de debug en production (health check Supabase)
**Fichier** : `components/TikTokStyleArena.tsx` — lignes 287–293
**Constat** : Un `useEffect` permanent crée un canal Supabase de test (`test_health_check`) et fait un `console.log("=== 🩺 HEALTH CHECK SUPABASE REALTIME ===")` à chaque montage de l'arène. Ce canal n'est jamais exploité et pollue les logs.
**Impact** : Fuite d'information en prod, canal Supabase inutile consommant des ressources, bruit dans la console.
**Correction** : Supprimer intégralement ce `useEffect`.

### F-03 — Absence de sanitisation des annonces médiateur
**Fichier** : `components/MediatorSidebar.tsx` — lignes 478–480
**Constat** : Le texte de la bannière publique (`announceDraft`) est transmis tel quel à `onPublishAnnouncement()` sans aucune sanitisation. Ce texte est ensuite broadcasté et rendu chez tous les spectateurs. Un médiateur malveillant pourrait injecter du contenu dangereux.
**Impact** : XSS potentiel si le texte est rendu dans un contexte non-JSX (emails, notifications push, etc.).
**Correction** : Appliquer `sanitizeMessage()` sur `announceDraft.trim()` avant publication.

### F-04 — Absence de validation d'input sur l'API manage (mediationSummary, endReason)
**Fichier** : `app/api/beef/manage/route.ts` — lignes 312–313, 327–329
**Constat** : Les champs `mediationSummary` et `endReason` sont des chaînes fournies par le client, stockées directement en base de données sans aucune validation de longueur, format ou sanitisation. Un médiateur pourrait injecter des chaînes arbitrairement longues ou du contenu malveillant.
**Impact** : Stockage de données non validées, risque XSS en aval lors de l'affichage du résumé/résultat.
**Correction** : Valider la longueur (max 500 caractères), appliquer `sanitize()` avant stockage.

### F-05 — Variable shadowing dans APPROVE_MANIFESTO
**Fichier** : `app/api/beef/manage/route.ts` — ligne 112
**Constat** : La variable `beef` est redéclarée à l'intérieur du bloc `APPROVE_MANIFESTO` avec un `const { data: beef }`, alors qu'une variable `beef` existe déjà dans le scope parent (ligne 89). En TypeScript strict, cela peut masquer la variable parent et créer des bugs subtils.
**Impact** : Risque de confusion de données entre les deux variables `beef`.
**Correction** : Renommer la variable interne (ex. `manifestoBeef`).

---

## 🟠 Majeurs (12)

### F-06 — Monolithe ingouvernable (TikTokStyleArena)
**Fichier** : `components/TikTokStyleArena.tsx` — 4 000+ lignes
**Constat** : Ce fichier concentre la logique WebRTC, chat, gifts, aura, timer, verdict, layout, navigation, mediator sidebar orchestration, VS screen, end-of-beef, grace period, etc. Aucun test unitaire possible.
**Impact** : Maintenabilité catastrophique, risque de régression à chaque modification.
**Correction** : Découpage progressif en sous-composants et hooks dédiés (Phase 2).

### F-07 — Requête N+1 à chaque envoi de message (ChatPanel)
**Fichier** : `components/ChatPanel.tsx` — lignes 107–110
**Constat** : À chaque `sendMessage()`, le composant fait un `supabase.from('users').select(...)` pour récupérer le profil de l'expéditeur. Ce profil ne change pas pendant la session.
**Impact** : Requête DB inutile à chaque message envoyé, latence accrue.
**Correction** : Passer `username`, `display_name`, `avatar_url` en props ou les mettre en cache avec `useRef`.

### F-08 — Pas d'anti-double-clic sur le join (PreJoinScreen)
**Fichier** : `components/PreJoinScreen.tsx` — lignes 403–413
**Constat** : Le bouton "Rejoindre l'Agora" n'a aucune protection contre les clics multiples. `handleJoin()` est async mais le bouton reste cliquable pendant l'exécution. Un double-clic peut déclencher deux `onJoin()` et créer un état incohérent dans Daily.
**Impact** : Double-join potentiel, état corrompu.
**Correction** : Ajouter un state `isJoining` + disabled sur le bouton.

### F-09 — `onKeyPress` déprécié (ChatPanel)
**Fichier** : `components/ChatPanel.tsx` — ligne 204
**Constat** : L'événement `onKeyPress` est déprécié depuis React 17. Doit être remplacé par `onKeyDown`.
**Impact** : Peut cesser de fonctionner dans une future version de React.
**Correction** : Remplacer `onKeyPress` par `onKeyDown`.

### F-10 — `select('*')` sur la table beefs côté client
**Fichier** : `app/arena/[roomId]/page.tsx` — ligne 121
**Constat** : `supabase.from('beefs').select('*')` récupère toutes les colonnes de la table beefs, incluant potentiellement des données sensibles ou volumineuses (video_url, live_summary JSON, etc.).
**Impact** : Sur-récupération de données, fuite potentielle d'informations, bande passante gaspillée.
**Correction** : Sélectionner uniquement les colonnes nécessaires : `id, title, status, mediator_id, created_by, video_url, started_at, ended_at, viewer_count`.

### F-11 — Navigation par `window.location.href` (rupture SPA)
**Fichiers** : `app/arena/[roomId]/page.tsx` L.125, `components/PreJoinScreen.tsx` L.200, L.244
**Constat** : Plusieurs endroits utilisent `window.location.href = '/feed'` pour naviguer, ce qui force un rechargement complet de l'app (perte du state React, re-fetch de toutes les données, flash blanc).
**Impact** : Expérience de navigation dégradée, perte de contexte.
**Correction** : Utiliser `router.push('/feed')` partout.

### F-12 — Pas d'anti-double-envoi sur le chat arène (ChatPanel)
**Fichier** : `components/ChatPanel.tsx` — lignes 101–137
**Constat** : Le state `loading` empêche l'envoi pendant le traitement, mais le bouton reste cliquable entre le clic et le `setLoading(true)`. Pas de protection `useRef` comme pour les DMs.
**Impact** : Messages dupliqués possibles en cas de double-clic rapide.
**Correction** : Ajouter un `useRef(false)` synchrone comme `isSending`.

### F-13 — Rôle déterminé deux fois (client + serveur)
**Fichier** : `app/arena/[roomId]/page.tsx` — lignes 182–198 puis 213–219
**Constat** : Le rôle de l'utilisateur (mediator/challenger/viewer) est d'abord déterminé côté client (requêtes Supabase directes), puis écrasé par la réponse de l'API `/api/beef/access`. La première détermination est inutile.
**Impact** : Requêtes DB redondantes, latence accrue, source de vérité ambiguë.
**Correction** : Supprimer la détermination client et se fier uniquement à l'API serveur.

### F-14 — Bouton "Répondre" mort (CommentsStyleMessage)
**Fichier** : `components/ChatPanel.tsx` — ligne 324
**Constat** : Le bouton "Répondre" n'a aucun `onClick` handler. C'est un élément d'UI mort qui crée une fausse attente chez l'utilisateur.
**Impact** : Expérience trompeuse.
**Correction** : Soit implémenter la fonctionnalité, soit supprimer le bouton.

### F-15 — Host state avec valeurs factices
**Fichier** : `app/arena/[roomId]/page.tsx` — lignes 40–47
**Constat** : L'état `host` est initialisé avec `id: 'host_1'`, `name: 'Host Principal'`, `badges: []`. Ces valeurs par défaut sont ensuite écrasées, mais pendant un bref instant, elles sont passées à `TikTokStyleArena` et peuvent provoquer un flash de contenu incorrect.
**Impact** : Flash de données factices visible lors du chargement.
**Correction** : Initialiser à `null` et ne monter l'arène que quand les données sont prêtes.

### F-16 — Pas de validation de longueur sur le chat input
**Fichier** : `components/ChatPanel.tsx` — ligne 201
**Constat** : L'input du chat n'a pas d'attribut `maxLength`. Bien que `sanitizeMessage()` tronque à 500 caractères, l'utilisateur peut taper un message plus long sans feedback visuel.
**Impact** : UX confuse — le message sera tronqué silencieusement.
**Correction** : Ajouter `maxLength={500}` sur l'input et afficher un compteur de caractères.

### F-17 — Absence de deduplication Realtime dans ChatPanel
**Fichier** : `components/ChatPanel.tsx` — lignes 69–72
**Constat** : Le handler Realtime INSERT ajoute aveuglément le nouveau message au state. Si l'envoyeur est aussi abonné au canal, il reçoit son propre message en INSERT et l'ajoute en doublon (le message a déjà été ajouté localement via `setInput('')` + rechargement).
**Impact** : Messages dupliqués possibles dans certaines conditions réseau.
**Correction** : Ajouter une vérification `if (prev.some(m => m.id === newMsg.id)) return prev` avant l'ajout.

---

## 🟡 Importants (10)

### F-18 — Style input cassé (`rounded-[2px]`)
**Fichier** : `components/ChatPanel.tsx` — ligne 207
**Constat** : L'input et le bouton d'envoi ont `rounded-[2px]`, ce qui donne un arrondi quasi-inexistant. C'est probablement une erreur de frappe pour `rounded-2xl` ou `rounded-[2rem]`.
**Impact** : Incohérence visuelle avec le reste du design system.
**Correction** : Remplacer par `rounded-2xl` ou `rounded-[2rem]`.

### F-19 — Pagination absente sur le chat (ChatPanel)
**Fichier** : `components/ChatPanel.tsx` — ligne 47
**Constat** : Le chat charge les 100 derniers messages au montage et ne propose aucun mécanisme de pagination ou d'infinite scroll pour les messages antérieurs.
**Impact** : Pour les sessions longues, les premiers messages sont perdus.
**Correction** : Implémenter un "Charger plus" ou un IntersectionObserver en haut de la liste.

### F-20 — Props inutilisées (TikTokStyleArena)
**Fichier** : `components/TikTokStyleArena.tsx` — ligne 225+
**Constat** : Les props `challenger` et `points` sont déclarées dans l'interface mais jamais utilisées dans le composant.
**Impact** : Code mort, confusion pour les développeurs.
**Correction** : Supprimer ces props de l'interface et des appels.

### F-21 — `void` casts systématiques pour supprimer les warnings Promise
**Fichiers** : Multiples (`MediatorSidebar.tsx`, `TikTokStyleArena.tsx`, `app/arena/[roomId]/page.tsx`)
**Constat** : Le pattern `void someAsyncFunction()` est utilisé systématiquement pour ignorer les promesses rejetées. Aucun `.catch()` n'est ajouté, ce qui signifie que les erreurs réseau sont silencieusement avalées.
**Impact** : Erreurs masquées, debugging impossible.
**Correction** : Ajouter des `.catch(console.error)` ou des blocs try/catch avec feedback utilisateur.

### F-22 — Bouton spectateur "Regarder le Beef" sans anti-double-clic
**Fichier** : `components/PreJoinScreen.tsx` — lignes 217–224
**Constat** : Le bouton du mode spectateur (`id="arena-join-viewer"`) appelle un handler async sans protection contre les clics multiples.
**Impact** : Double-join spectateur possible.
**Correction** : Ajouter un state `isJoining` partagé avec le bouton participant.

### F-23 — `_onAdjustTime` explicitement ignoré
**Fichier** : `components/MediatorSidebar.tsx` — ligne 121
**Constat** : La prop `onAdjustTime` est reçue puis immédiatement ignorée avec `void _onAdjustTime`. La fonctionnalité d'ajustement de temps existe en tant que prop mais aucun UI ne l'expose.
**Impact** : Fonctionnalité promue mais non accessible.
**Correction** : Soit implémenter les boutons +/-30s dans le chronomètre, soit supprimer la prop.

### F-24 — createPortal rend le sidebar invisible à certains screen readers
**Fichier** : `components/MediatorSidebar.tsx` — lignes 157–743
**Constat** : Le sidebar est rendu via `createPortal` sur `document.body`. Bien qu'il ait `role="dialog"` et `aria-label`, le focus n'est pas piégé dans le dialog.
**Impact** : Accessibilité dégradée — un utilisateur de lecteur d'écran peut naviguer hors du dialog.
**Correction** : Ajouter un focus trap (ou utiliser `<dialog>` natif).

### F-25 — Pas de feedback visuel réseau pour les spectateurs
**Fichier** : `components/MediatorSidebar.tsx` — lignes 191–203
**Constat** : L'indicateur réseau (Live sync / Hors ligne) n'est visible que dans le Command Deck du médiateur. Les spectateurs n'ont aucune indication en cas de déconnexion réseau.
**Impact** : Un spectateur déconnecté pense voir un flux en temps réel alors qu'il voit un état gelé.
**Correction** : Afficher un indicateur réseau discret pour tous les participants.

### F-26 — Supabase `getSession()` avant le ticket (sécurité)
**Fichier** : `app/arena/[roomId]/page.tsx` — lignes 200–203
**Constat** : `supabase.auth.getSession()` est utilisé pour récupérer le token d'accès, mais Supabase recommande `getUser()` pour la vérification d'authentification côté serveur. `getSession()` lit depuis le cache local sans valider le JWT.
**Impact** : Un token expiré pourrait être envoyé à l'API access.
**Correction** : Utiliser `getUser()` en amont et transmettre le token associé.

### F-27 — Pas de limite de caractères sur la bannière médiateur
**Fichier** : `components/MediatorSidebar.tsx` — lignes 448–454
**Constat** : Le textarea de la bannière n'a pas de `maxLength`. Un médiateur peut publier un texte arbitrairement long qui sera broadcasté à tous les spectateurs.
**Impact** : Overflow UI chez les spectateurs, bande passante gaspillée.
**Correction** : Ajouter `maxLength={200}` et un compteur de caractères.

---

## ⚪ Mineurs (8)

### F-28 — Pas d'attributs `aria-label` sur les toggles cam/mic (PreJoinScreen)
**Fichier** : `components/PreJoinScreen.tsx` — lignes 308–346
**Constat** : Les boutons de toggle caméra et micro n'ont pas d'attribut `aria-label` explicite. Le texte visible "Caméra ON"/"OFF" est présent mais les icônes ne sont pas marquées comme décoratives.
**Correction** : Ajouter `aria-label` sur les boutons.

### F-29 — Absence de `key` React optimale dans les listes de devices
**Fichier** : `components/PreJoinScreen.tsx` — lignes 359, 373
**Constat** : Les options `<option>` dans les selects utilisent `key={d.deviceId}`, ce qui est correct. Pas de bug, mais les labels de devices peuvent être `''` si le navigateur n'a pas encore obtenu la permission.
**Correction** : Ajouter un fallback label avec l'index.

### F-30 — Commentaire déprécié "Nettoyage immédiat des modales internes"
**Fichier** : `components/TikTokStyleArena.tsx`
**Constat** : Plusieurs commentaires techniques datent de phases antérieures et ne reflètent plus l'état actuel du code. Ex : "Phase 3", "Phase Freemium".
**Correction** : Supprimer les commentaires obsolètes.

### F-31 — Pas de truncation sur les noms de participants (MediatorSidebar)
**Fichier** : `components/MediatorSidebar.tsx` — ligne 534
**Constat** : Les noms de participants sont affichés avec `truncate`, mais le conteneur parent n'a pas de `min-w-0`, ce qui peut empêcher le truncate de fonctionner sur certains flexbox.
**Correction** : Vérifier et ajouter `min-w-0` si nécessaire.

### F-32 — `SECTION_SHELL` devrait être un composant
**Fichier** : `components/MediatorSidebar.tsx` — ligne 74
**Constat** : La constante `SECTION_SHELL` est une chaîne de classes Tailwind réutilisée comme className. C'est fonctionnel mais fragile — un composant `<Section>` serait plus maintenable.
**Correction** : Optionnel — créer un composant wrapper si le fichier est refactorisé.

### F-33 — Timer de grâce médiateur sans feedback visuel spectateur
**Fichier** : `components/TikTokStyleArena.tsx`
**Constat** : Quand le médiateur se déconnecte, un timer de grâce est lancé. Les spectateurs voient potentiellement un freeze sans explication.
**Correction** : Afficher un message "Le Ref est momentanément déconnecté" aux spectateurs.

### F-34 — Pas de test unitaire sur `participant-identity.ts`
**Fichier** : `lib/participant-identity.ts` — 271 lignes
**Constat** : La logique de réconciliation des identités Daily ↔ Supabase est complexe (UUID, slots, matching) mais n'a aucun test unitaire.
**Correction** : Ajouter des tests (Phase 2).

### F-35 — `usePiP` et `useTensionMeter` importés mais non branchés
**Fichiers** : `hooks/usePiP.ts`, `hooks/useTensionMeter.ts`
**Constat** : Ces hooks existent dans le codebase mais ne sont importés nulle part. Code mort.
**Correction** : Soit les brancher dans l'arène, soit les supprimer.

---

## Tableau récapitulatif par priorité d'exécution

| ID | Sévérité | Fichier principal | Description courte |
|----|----------|-------------------|--------------------|
| F-01 | 🔴 | ChatPanel.tsx | Likes aléatoires fabriqués |
| F-02 | 🔴 | TikTokStyleArena.tsx | Console.log debug en prod |
| F-03 | 🔴 | MediatorSidebar.tsx | Annonce non sanitisée |
| F-04 | 🔴 | api/beef/manage | Input non validé (summary/reason) |
| F-05 | 🔴 | api/beef/manage | Variable shadowing `beef` |
| F-06 | 🟠 | TikTokStyleArena.tsx | Monolithe 4 000 lignes |
| F-07 | 🟠 | ChatPanel.tsx | Requête N+1 par message |
| F-08 | 🟠 | PreJoinScreen.tsx | Pas d'anti-double-clic join |
| F-09 | 🟠 | ChatPanel.tsx | `onKeyPress` déprécié |
| F-10 | 🟠 | arena/[roomId]/page.tsx | `select('*')` sur beefs |
| F-11 | 🟠 | PreJoinScreen.tsx / page.tsx | `window.location.href` |
| F-12 | 🟠 | ChatPanel.tsx | Anti-double-envoi chat |
| F-13 | 🟠 | arena/[roomId]/page.tsx | Rôle déterminé 2 fois |
| F-14 | 🟠 | ChatPanel.tsx | Bouton "Répondre" mort |
| F-15 | 🟠 | arena/[roomId]/page.tsx | Host init avec faux données |
| F-16 | 🟠 | ChatPanel.tsx | Pas de maxLength chat |
| F-17 | 🟠 | ChatPanel.tsx | Dedup Realtime absente |
| F-18 | 🟡 | ChatPanel.tsx | `rounded-[2px]` cassé |
| F-19 | 🟡 | ChatPanel.tsx | Pas de pagination chat |
| F-20 | 🟡 | TikTokStyleArena.tsx | Props mortes |
| F-21 | 🟡 | Multiples | `void` sans error handling |
| F-22 | 🟡 | PreJoinScreen.tsx | Double-clic spectateur |
| F-23 | 🟡 | MediatorSidebar.tsx | `onAdjustTime` ignoré |
| F-24 | 🟡 | MediatorSidebar.tsx | Focus trap absent |
| F-25 | 🟡 | MediatorSidebar.tsx | Indicateur réseau spectateurs |
| F-26 | 🟡 | arena/[roomId]/page.tsx | `getSession()` vs `getUser()` |
| F-27 | 🟡 | MediatorSidebar.tsx | Pas de maxLength bannière |
| F-28 | ⚪ | PreJoinScreen.tsx | `aria-label` manquants |
| F-29 | ⚪ | PreJoinScreen.tsx | Fallback labels devices |
| F-30 | ⚪ | TikTokStyleArena.tsx | Commentaires obsolètes |
| F-31 | ⚪ | MediatorSidebar.tsx | truncate sans min-w-0 |
| F-32 | ⚪ | MediatorSidebar.tsx | SECTION_SHELL → composant |
| F-33 | ⚪ | TikTokStyleArena.tsx | Grace period sans feedback |
| F-34 | ⚪ | participant-identity.ts | Tests unitaires absents |
| F-35 | ⚪ | hooks/ | Code mort (usePiP, useTensionMeter) |

---

*Fin du rapport — Phase F.0 — Arène & Live — aucune modification appliquée au dépôt.*
