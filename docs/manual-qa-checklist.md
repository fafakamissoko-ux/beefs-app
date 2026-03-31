# Parcours manuel QA (Beefs)

À exécuter après un déploiement ou une release sensible. Cocher au fur et à mesure.

## Auth & navigation

- [ ] Connexion / déconnexion
- [ ] **Créer** (header) → URL `/create`, formulaire s’affiche
- [ ] Annuler création → retour feed
- [ ] **Accueil** → `/feed`
- [ ] **Live** → `/live` (liste des directs)

## Création de beef

- [ ] Créer un beef (brouillon → sujet → description → envoi)
- [ ] Redirection vers `/arena/[id]`
- [ ] Beef programmé : statut « À venir » si applicable

## Points & paiement

- [ ] Page **Acheter des points** → redirection Stripe (test mode OK)
- [ ] Après achat (webhook) : solde utilisateur augmenté + **Paramètres → Historique des points** : ligne « Achat » / `purchase`
- [ ] Spectateur : après prévisualisation, paywall **suite** → débit + ligne `beef_access` (ou équivalent) dans l’historique
- [ ] **Live** : beef avec prix → modal → paiement → débit cohérent + entrée arène

## Arène (live)

- [ ] Médiateur : pas de bouton « Suivre » sur soi-même
- [ ] Clic sur nom challenger → modale profil, suivre sans quitter
- [ ] Cadeau : solde insuffisant → toast avec **Recharger**
- [ ] Cadeau envoyé → solde mis à jour + lignes historique (envoi / réception selon règles)

## Feed & cartes

- [ ] Beef **TERMINÉ** : pas de badge **Suite · X pts** en haut à droite
- [ ] Beef **LIVE** avec prix : badge **Suite · X pts** visible

## Retraits (si activé)

- [ ] Demande de retrait → solde diminué, ligne `withdrawal` dans l’historique
- [ ] Refus admin → recrédit + ligne `refund` si applicable

## Régression API

- [ ] `GET /api/beef/access?beefId=…` avec JWT (spectateur)
- [ ] `POST /api/gifts/send` avec JWT

---

## Phase suivante (hors scope immédiat)

- Replay / résumé post-**Terminé**
- Notifications push / email cohérentes
- Pagination feed + audit RLS Supabase
