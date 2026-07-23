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

## Tâches en Cours (Next Steps)
- [ ] Prochaine phase d'audit (Phase D ou suivante selon la roadmap Architecte)
- [ ] Propagation réseau des métadonnées gift (broadcast/onMessageReceived)
- [ ] Exécuter `106_update_gift_prices.sql` sur Supabase si pas fait
