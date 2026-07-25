# Rapport d'audit — Phase C.0 (Économie : Wallet, Stripe, Cadeaux, Retraits)

**Date d'analyse :** 2026-07-23  
**Phases source :** C.1 (Wallet & Stripe), C.2 (Cadeaux & Portefeuille UI)  
**Périmètre :** Pipeline acquisition Stripe, envoi de cadeaux, retraits, portefeuille UI, cohérence sémantique double-devise (Lingots / Aura).

---

## 🔴 CRITIQUES (Sécurité / Intégrité financière)

### C-01 — Fuite d'erreurs DB vers le client (API cadeaux)

**Fichier :** `app/api/gifts/send/route.ts` L.119–121

**Problème :** L'erreur Supabase/Postgres est retournée verbatim dans la réponse JSON :
```ts
{ error: mapped.body + ' | Détail DB : ' + (error.message || 'inconnu') }
```
Un attaquant peut déclencher des erreurs intentionnelles pour cartographier le schéma DB (noms de tables, colonnes, contraintes).

**Recommandation :** Ne jamais exposer `error.message` au client. Logger côté serveur (`console.error`) et retourner uniquement le message mappé. Utiliser le status HTTP mappé (400) au lieu de 500 systématique.

---

### C-02 — Coordonnées bancaires stockées en clair

**Fichier :** `app/api/withdrawals/request/route.ts`

**Problème :** IBAN, email PayPal et numéros de téléphone Mobile Money sont insérés en clair dans la table `withdrawal_requests`. En cas de compromission de la DB, toutes les coordonnées bancaires sont exposées.

**Recommandation (court terme) :** Ce n'est pas bloquant immédiatement (faible volume), mais doit être documenté comme risque accepté. À terme : chiffrement at-rest via `pgcrypto` ou vault externe.

**Recommandation (immédiat) :** Masquer les coordonnées dans les réponses API (afficher `••••1234` pour l'IBAN, etc.).

---

### C-03 — Geo-pricing cassé côté serveur (Stripe checkout)

**Fichier :** `app/api/stripe/checkout/route.ts` L.62 → `lib/geo.ts`

**Problème :** Le checkout serveur appelle `detectUserCountry()` qui utilise `fetch('/api/geo')` et `navigator.language` — code conçu pour le **navigateur**, pas pour Node.js. En SSR/API Route, `navigator` est `undefined` et `fetch('/api/geo')` pointe vers lui-même ou échoue. Le fallback est toujours `FR`.

**Conséquence :** Tous les utilisateurs paient le prix FR quel que soit leur pays, rendant la tarification géographique inopérante.

**Recommandation :** Créer une fonction `detectUserCountryFromRequest(request: NextRequest)` qui lit directement les headers (`cf-ipcountry`, `x-vercel-ip-country`) comme le fait déjà `app/api/geo/route.ts`, et l'utiliser dans le checkout.

---

### C-04 — Injection HTML dans les emails de retrait

**Fichier :** `app/api/withdrawals/process/route.ts`

**Problème :** Le champ `admin_note` est injecté tel quel dans le corps de l'email envoyé à l'utilisateur. Un admin (ou un attaquant ayant accès admin) pourrait injecter du HTML/JS malveillant.

**Recommandation :** Échapper `admin_note` avec un utilitaire HTML-escape avant insertion dans le template email.

---

### C-05 — Status HTTP incorrect sur erreurs métier cadeaux

**Fichier :** `app/api/gifts/send/route.ts` L.119

**Problème :** `mapRpcError()` retourne des status 400 pour les erreurs métier (solde insuffisant, destinataire invalide), mais la ligne 119 utilise systématiquement `{ status: 500 }`. Le status mappé est ignoré.

**Recommandation :** Utiliser `mapped.status` :
```ts
return NextResponse.json({ error: mapped.body }, { status: mapped.status });
```

---

## 🟠 MAJEURS (Robustesse / Cohérence)

### C-06 — Pas de rollback sur échec du débit optimiste

**Fichier :** `lib/stores/walletStore.ts` — `optimisticDebit()`

**Problème :** Le wallet store fait un débit optimiste avant l'appel RPC. Si le RPC échoue, le solde UI reste débité. Le Realtime finira par corriger, mais avec un délai potentiel.

**Recommandation :** Ajouter une méthode `rollbackDebit(amount)` que les composants appellent dans le `catch` de l'envoi de cadeau. Ou mieux : le Realtime corrige déjà — documenter ce comportement et s'assurer que `sync()` est appelé en cas d'erreur.

---

### C-07 — Type `GiftType` legacy désaligné

**Fichier :** `types/index.ts` — `GiftType = 'flame' | 'crown' | 'lightning' | 'diamond'`

**Problème :** Ce type ne correspond plus à la table `gift_types` ni au catalogue `lib/constants/gifts.ts` (13 cadeaux : rose, fire, star, crown, money, etc.). Tout code utilisant ce type est potentiellement cassé.

**Recommandation :** Supprimer `GiftType` de `types/index.ts` ou le régénérer depuis `GIFT_CATALOG`. Vérifier qu'aucun consommateur n'utilise encore l'ancien type.

---

### C-08 — Incohérence sémantique `pts` vs `Lingots`

**Fichier :** `app/settings/page.tsx` L.1590 — `{tx.amount} pts`

**Problème :** L'historique dans les paramètres affiche `+500 pts` alors que le dashboard `/points` affiche les montants sans suffixe avec le label "Lingots" dans l'en-tête. La marque de l'app est "Lingots", pas "pts".

**Recommandation :** Remplacer `pts` par `Lingots` dans `settings/page.tsx` L.1590, et s'assurer que la terminologie est cohérente partout.

---

### C-09 — Texte trompeur « aucuns frais déduits » dans WithdrawalWizard

**Fichier :** `components/settings/WithdrawalWizard.tsx` L.599–603

**Problème :** Le bandeau vert affiche `✅ Vous recevez exactement le montant demandé — aucuns frais déduits`. Ce texte est juridiquement engageant et ne doit pas être affiché tant que la politique de frais n'est pas définitivement fixée. L'architecte a explicitement demandé sa suppression.

**Recommandation :** Supprimer le bloc `<div className="mt-4 p-3 rounded-2xl border border-green-500/20 bg-green-500/10">` et son contenu.

---

### C-10 — Validation IBAN minimale côté serveur

**Fichier :** `app/api/withdrawals/request/route.ts`

**Problème :** Aucune validation structurelle de l'IBAN côté serveur. Le wizard UI vérifie `length >= 15` mais le serveur ne valide rien. Un utilisateur pourrait soumettre un IBAN invalide qui serait traité par l'admin sans détection.

**Recommandation :** Ajouter une validation IBAN basique côté serveur (longueur par pays, check digit ISO 7064 mod 97).

---

### C-11 — `priceId` des packs Stripe inutilisé

**Fichier :** `lib/stripe/client.ts` (POINT_PACKS) + `app/api/stripe/checkout/route.ts`

**Problème :** Chaque pack a un `priceId` (ex. `STRIPE_PRICE_STARTER`), mais le checkout crée une session avec `price_data` dynamique au lieu d'utiliser les `priceId` pré-configurés dans Stripe. Les variables d'env `STRIPE_PRICE_*` ne servent à rien.

**Recommandation :** Soit utiliser les `priceId` pré-configurés (meilleure traçabilité Stripe), soit supprimer le champ `priceId` des packs pour éviter la confusion.

---

### C-12 — `total_points` (bonus) non revalidé au webhook

**Fichier :** `app/api/stripe/webhook/route.ts` L.526–532

**Problème :** Le webhook lit `total_points` depuis les metadata Stripe et l'utilise pour créditer. Si les metadata étaient altérées (peu probable mais possible via l'API Stripe avec la clé secrète), le bonus pourrait être gonflé. La validation `validatePointPackFromMetadata` vérifie `points_amount` mais pas `total_points`.

**Recommandation :** Recalculer `total_points` côté webhook : `basePoints + floor(basePoints * pack.bonus / 100)` au lieu de faire confiance aux metadata.

---

## 🟡 IMPORTANTS (Qualité / UX)

### C-13 — Pas de gestion d'erreur sur le fetch initial du wallet

**Fichier :** `lib/stores/walletStore.ts` L.75

**Problème :** `supabase.from('users').select('points')` peut échouer (réseau, auth expirée). L'erreur n'est pas gérée, le solde reste à 0 sans feedback.

**Recommandation :** Ajouter un état `error` au store et gérer le cas d'échec avec possibilité de retry.

---

### C-14 — `detectUserCountry()` expose les headers internes

**Fichier :** `app/api/geo/route.ts` L.43–46

**Problème :** La réponse JSON de l'API geo inclut un objet `headers` avec les en-têtes de requête internes (potentiellement IPs, tokens).

**Recommandation :** Ne retourner que les champs nécessaires (`country`, `currency`, `exchangeRate`, `ppp`).

---

### C-15 — `catch {}` vide sur rollback retrait

**Fichier :** `app/api/withdrawals/request/route.ts` L.115

**Problème :** Si le rollback (re-crédit des points après échec d'insertion) échoue, l'erreur est avalée silencieusement. L'utilisateur perd ses points sans trace.

**Recommandation :** Logger l'erreur de rollback et déclencher une alerte (email admin ou log Sentry).

---

### C-16 — Usages de `any` dans le pipeline financier

**Fichiers multiples :**
- `app/buy-points/page.tsx` — `catch (err: any)`
- `app/api/stripe/checkout/route.ts` — `catch (error: any)`
- `app/api/stripe/webhook/route.ts` — `subscriptionData: any`, `(subscription as any)`
- `app/api/withdrawals/process/route.ts` — `const user = request.users as any`
- `app/admin/retraits/page.tsx` — `catch (err: any)`

**Recommandation :** Remplacer tous les `any` par `unknown` avec narrowing explicite, conformément à la règle TypeScript du projet.

---

### C-17 — `pointsWithBonus` calculé mais non utilisé

**Fichier :** `app/buy-points/page.tsx` ~L.169

**Problème :** Variable calculée mais jamais affichée ni envoyée. Code mort.

**Recommandation :** Soit afficher le bonus (ex. "1200 + 240 bonus = 1440") pour inciter l'achat, soit supprimer la variable.

---

### C-18 — Blocs `if` vides dans le checkout (test mode)

**Fichier :** `app/api/stripe/checkout/route.ts` L.305–306

**Problème :** `if (isTestMode) { }` — bloc vide, probablement un console.log supprimé.

**Recommandation :** Supprimer le bloc vide ou ajouter le log prévu.

---

## 🔵 MINEURS (Nettoyage)

### C-19 — Schéma legacy `lib/supabase/schema.sql`

**Problème :** Référence encore `gifts.gift_type IN ('flame','crown','lightning','diamond')` — ne correspond plus à la prod.

**Recommandation :** Mettre à jour ou supprimer ce fichier de référence.

---

### C-20 — Migration `withdrawal_requests` autorise `mtn` mais pas dans l'UI

**Fichier :** `supabase_migrations/12_withdrawal_requests.sql`

**Problème :** La contrainte check autorise `'mtn'` comme méthode, mais le wizard ne propose que `orange_money`, `wave`, `paypal`, `iban`.

**Recommandation :** Aligner la contrainte DB avec les méthodes proposées, ou ajouter MTN Mobile Money dans le wizard.

---

## Matrice priorité / effort

| Priorité | Items |
|----------|-------|
| 🔴 Critique / Facile | C-01, C-05, C-09 |
| 🔴 Critique / Moyen | C-03, C-04 |
| 🔴 Critique / Lourd | C-02 |
| 🟠 Majeur / Facile | C-07, C-08, C-11, C-18 |
| 🟠 Majeur / Moyen | C-06, C-10, C-12, C-16 |
| 🟡 Important / Facile | C-13, C-14, C-15, C-17 |
| 🔵 Mineur / Facile | C-19, C-20 |

---

## Plan d'action recommandé (top 10)

1. **C-01** — Supprimer la fuite d'erreurs DB dans l'API cadeaux
2. **C-05** — Corriger le status HTTP (400 vs 500)
3. **C-09** — Supprimer le texte « aucuns frais déduits »
4. **C-03** — Fixer le geo-pricing serveur (lire les headers request)
5. **C-08** — Harmoniser `pts` → `Lingots`
6. **C-04** — Échapper `admin_note` dans les emails
7. **C-07** — Supprimer/aligner le type `GiftType` legacy
8. **C-12** — Recalculer `total_points` au webhook
9. **C-14** — Ne plus exposer les headers dans l'API geo
10. **C-16** — Purger les `any` du pipeline financier

---

## Note pour l'Architecte

Ce rapport couvre le pipeline financier complet. Les points C-01 et C-05 sont des quick wins sécurité à exécuter immédiatement. Le point C-03 (geo-pricing) est structurel : la tarification géographique est actuellement **inopérante** en production — tous les utilisateurs paient le prix France. Le point C-02 (chiffrement données bancaires) est un risque accepté pour le MVP mais à planifier.

Merci de valider les priorités et de confirmer les items à exécuter.
