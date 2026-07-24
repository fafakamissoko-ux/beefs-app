# État du Projet (Cerveau Partagé)
## Contexte Architectural & Stack
- [À Remplir par l'utilisateur : ex. React, Node, Tailwind...]
## Objectif Global Actuel
- Audit global de l'application — exécution séquentielle des correctifs validés par l'Architecte.

## Tâches Terminées
- Phase C.3 économie Lingots + migration 106 gift_types (à appliquer Supabase)
- Phase Z.2 pipeline `type: 'gift'` + Premium Glass chat
- **Phase A (partiel)** : `VisibleMessage` giftSender/Recipient/Template, parseur chat, word-wrap, animation recipient cyan
- **Audit Phase B** : Feed & Découverte — correctifs B-07, B-10, B-13, B-14, B-15, B-29, B-33
- **Audit Phase C** : Pipeline Économique & Sécurité — 11 ordres de frappe exécutés :
  - C-01/C-05 : Suppression fuite erreur DB + status HTTP correct (gifts/send)
  - C-03 : Geo-pricing SSR via headers Vercel/Cloudflare (plus de fetch client dans Node)
  - C-04 : Échappement HTML dans les emails de retrait (XSS)
  - C-14 : Suppression headers internes de l'API Geo
  - C-12 : Recalcul serveur du bonus Stripe (ignore metadata total_points)
  - C-02 : Masquage IBAN/PayPal/Mobile dans l'API withdrawals/list
  - C-15 : Log détaillé des échecs de rollback retrait
  - C-07/C-11 : Purge GiftType legacy + priceId mort
  - C-16 : Remplacement de tous les `any` par `unknown` dans le pipeline financier
  - C-09 : Texte « aucuns frais déduits » déjà supprimé
  - C-08 : Suffixe « pts » déjà remplacé par « Lingots »

- **Audit Phase D** : Profil & Paramètres — 9 ordres de frappe exécutés :
  - D-05/D-06 : Validation Zod stricte IBAN/PayPal/Mobile + clampage montant (Math.max(20))
  - D-45 : Anti-double-clic retrait (useRef isSubmitting)
  - D-25 : Sanitization XSS display_name/bio via .transform(stripHtml) dans profileSchema
  - D-31 : Client Supabase jetable pour vérification mot de passe (session préservée)
  - D-20/D-04 : Correction route /signup→/login + FollowButton fonctionnel dans AuraGiversModal
  - D-18 : Décodage sécurisé du paramètre username (array + try/catch decodeURIComponent)
  - D-43 : Remplacement useState walletPoints par lecture Zustand walletStore
  - D-01/D-02 : Parallélisation 7 requêtes SQL profil via Promise.all + count head:true
  - D-03 : Limite .limit(12) côté DB + bouton "Charger plus" dans ProfileBeefGrid

- **Audit Phase E** : Messagerie & Social — 6 ordres de frappe exécutés :
  - E-01 : Suppression de la chaîne .replace() qui inversait la sanitisation XSS à l'affichage
  - E-02 : Échappement des wildcards SQL (%, _, \\) dans la recherche utilisateurs DM
  - E-05 : Ajout .eq('sender_id', user.id) sur toutes les suppressions de messages (anti-IDOR)
  - E-03/E-22 : Sanitisation des commentaires (CommentsDrawer) et du chat arène (Zustand store)
  - E-18/E-25 : Anti-double-envoi sendMessage (isSending state + try/finally) + filtre is_deleted sur INSERT Realtime
  - E-14 : Confirmation window.confirm() avant purge complète de conversation

- **Audit Phase F — Phase 1** : Arène & Live — Sécurité, Logique, Moteur — 22 correctifs exécutés :
  - F-04/F-05 : Sanitisation inputs API manage (mediationSummary, endReason) + fix shadowing variable beef
  - F-10 : Restriction select('*') → colonnes explicites sur la requête beefs
  - F-13 : Suppression requête beef_participants redondante (rôle écrasé par ticket.role)
  - F-15 : Initialisation host à null + guard JSX (plus de flash de données fictives)
  - F-26 : Validation JWT cryptographique (getUser()) avant fetchBeefVideoTicket
  - F-02 : Suppression du useEffect test_health_check debug en production
  - F-01 : Suppression des métriques fabriquées (Math.random likes) dans CommentsStyleMessage
  - F-17 : Déduplication Realtime INSERT (prev.some(m => m.id))
  - F-07 : Cache user data au montage (useRef) — suppression requête N+1 dans sendMessage
  - F-12 : Race condition lock (isSendingRef) dans sendMessage
  - F-09/F-16 : onKeyDown remplace onKeyPress deprecated + maxLength={500} sur input chat
  - F-14 : Suppression du bouton "Répondre" inactif (code mort)
  - F-19 : Pagination par IntersectionObserver (chargement des anciens messages)
  - F-08/F-22 : Anti-double-clic join (isJoining state + disabled buttons)
  - F-11 : Remplacement window.location.href par router.push (navigation SPA)
  - F-28 : aria-label sur boutons caméra/micro
  - F-29 : React keys stables avec fallback (device selects)
  - F-03 : Sanitisation XSS broadcast annonces médiateur
  - F-27 : maxLength={200} sur textarea bannière
  - F-23 : Suppression prop fantôme onAdjustTime
  - F-24 : Focus trap (Tab/Escape) sur la modale Command Deck

- **Correctifs post-validation F1** :
  - Sanitisation Realtime côté récepteur (annonces broadcast)
  - Bannière marquee plein écran (mobile + desktop) — min-w-[200vw] + fixed
  - Thème Agora appliqué : verdicts Command Deck, overlays, messages de fin

- **Audit Phase F — Phase 2 (F2.1)** : Démantèlement du monolithe TikTokStyleArena.tsx (4316 → 3060 lignes) :
  - F2.1.0 : Purge de 5 dead states, 3 dead refs, types/effets/fonctions orphelins (68 lignes)
  - F2.1.1 : Extraction de 4 hooks utilitaires purs (useNetworkStatus, useUnreadDMs, useAuthGate, useBeefManage)
  - F2.1.2 : Extraction de 4 hooks sociaux (useArenaChat, useArenaProfile, usePendingInvites, useDebaterInvites)
  - F2.1.3 : Extraction de useParticipantRoles (noyau identitaire)
  - F2.2.0 : Migration CSS globale (keyframes marquee-continuous → tailwind.config.ts, hide-scrollbar → globals.css)
  - F2.2.1 : Extraction de 3 modales Verre Lourd (ArenaProfileModal, ArenaInviteAlerts, ArenaAuthHookModal)
  - F2.2.2 : Extraction IngotIcon en composant shared
  - Export type ToastType depuis Toast.tsx

## Tâches en Cours (Next Steps)
- [ ] Phase F2.2 suite : Extraction HUD/menus (Verre Léger), Dock tactique, réassemblage ArenaView.tsx
- [ ] Phase F2 noyau dur (reporté) : useBeefTimer, useSpeakingTurn, useAuraEngine, useBeefLifecycle — nécessite refactoring du dispatcher arenaRealtimeCallbacks
- [ ] Phase E.2 : Rate limiting serveur (E-04), RPC N+1 (E-06/E-07), indicateurs frappe (E-08), refonte UI (E-15), animations (E-27)
- [ ] Propagation réseau des métadonnées gift (broadcast/onMessageReceived)
- [ ] Exécuter `106_update_gift_prices.sql` sur Supabase si pas fait
