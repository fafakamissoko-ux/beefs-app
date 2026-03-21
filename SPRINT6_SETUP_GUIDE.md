# 🚀 GUIDE DE CONFIGURATION - SPRINT 6: MONÉTISATION + GAMIFICATION

## ✅ CE QUI A ÉTÉ IMPLÉMENTÉ

### 📦 Infrastructure
- ✅ Migration SQL complète (tables: transactions, gifts, achievements, subscriptions, beef_access)
- ✅ Fonctions SQL (points, XP, niveaux, distribution revenus)
- ✅ Intégration Stripe (checkout + webhooks)
- ✅ Système de points (achat, dépense, historique)

### 🎨 UI Components
- ✅ BuyPointsModal (modal d'achat de points avec 4 packs)
- ✅ PointsDisplay (affichage solde dans Header avec real-time updates)

### 🎮 Gamification
- ✅ Tables achievements (12 achievements seedés)
- ✅ Système XP & Levels
- ✅ User stats tracking

---

## 📋 CONFIGURATION REQUISE (ÉTAPES À FAIRE MAINTENANT)

### 1. **SUPABASE - Exécuter les migrations**

```bash
# Dans l'interface Supabase SQL Editor:

# 1. Migration monétisation + gamification
Exécuter: supabase_migrations/05_monetization_gamification.sql

# 2. Ajouter stripe_customer_id
Exécuter: supabase_migrations/06_add_stripe_customer_id.sql
```

**⚠️ IMPORTANT:** Tu dois aussi ajouter `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=ton_service_role_key_ici
```
Tu le trouves dans: Supabase Dashboard → Settings → API → service_role (secret)

---

### 2. **STRIPE - Configuration complète**

#### A. Créer un compte Stripe
1. Va sur https://stripe.com
2. Créer un compte (Mode TEST pour l'instant)
3. Activer le mode TEST (switch en haut à droite)

#### B. Récupérer les clés API
1. Dashboard → Developers → API keys
2. Copier:
   - **Publishable key** (pk_test_...)
   - **Secret key** (sk_test_...)

#### C. Créer les Products (Packs de Points)

**Dans Stripe Dashboard → Products → Add Product:**

**Pack 1: Starter**
- Name: `SquareUp - Pack Starter`
- Description: `500 points + 5% bonus`
- Price: `4.99 EUR` (one-time payment)
- Copier le **Price ID** (price_...)

**Pack 2: Popular** ⭐
- Name: `SquareUp - Pack Popular`
- Description: `1200 points + 20% bonus`
- Price: `9.99 EUR` (one-time payment)
- Copier le **Price ID**

**Pack 3: Premium**
- Name: `SquareUp - Pack Premium`
- Description: `3000 points + 50% bonus`
- Price: `19.99 EUR` (one-time payment)
- Copier le **Price ID**

**Pack 4: VIP**
- Name: `SquareUp - Pack VIP`
- Description: `10000 points + 100% bonus`
- Price: `49.99 EUR` (one-time payment)
- Copier le **Price ID**

#### D. Configurer le Webhook

1. Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://ton-domaine.com/api/stripe/webhook` 
   (Pour local testing: utilise Stripe CLI ou ngrok)
3. Événements à écouter:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copier le **Webhook signing secret** (whsec_...)

#### E. Remplir .env.local

Créer/Modifier `.env.local`:

```bash
# Supabase (déjà configuré)
NEXT_PUBLIC_SUPABASE_URL=https://hffhucapmkjsgmrdgelq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # NOUVEAU - À AJOUTER

# Stripe (NOUVEAU)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (copier depuis Stripe)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_POPULAR=price_...
STRIPE_PRICE_PREMIUM=price_...
STRIPE_PRICE_VIP=price_...
```

---

### 3. **TESTER LOCALEMENT**

#### A. Redémarrer le serveur
```bash
# Tuer les processus Node
taskkill /F /IM node.exe

# Nettoyer cache
rmdir /s /q .next

# Relancer
npm run dev
```

#### B. Tester le parcours d'achat

1. Se connecter avec un compte test
2. Cliquer sur le bouton Points (🔥) dans le Header
3. Sélectionner un pack
4. Cliquer "Acheter"
5. Utiliser une carte test Stripe: `4242 4242 4242 4242`
   - Expiration: n'importe quelle date future
   - CVC: n'importe quel 3 chiffres
6. Compléter le paiement
7. Vérifier que les points apparaissent dans le Header

#### C. Tester le webhook (LOCAL)

**Option 1: Stripe CLI (Recommandé)**
```bash
# Installer Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks vers local
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Copier le webhook secret affiché (whsec_...)
# L'ajouter dans .env.local
```

**Option 2: Skip webhook pour l'instant**
- Les points ne seront pas crédités automatiquement
- On configure le webhook en production plus tard

---

## 🎮 GAMIFICATION - IMPLÉMENTÉE

### Système de Badges (12 achievements)

**Médiation:**
- 🕊️ Pacificateur (10 beefs médiés)
- ⚖️ Juge Équitable (4.5⭐ rating)
- 🤝 Réconciliateur (5 accords mutuels)

**Communauté:**
- 💝 Généreux (1000 pts de cadeaux)
- 🎭 Spectateur Fidèle (50 beefs assistés)
- ⭐ Supporter (cadeau 100+ pts)

**Création:**
- 🎬 Créateur (5 beefs organisés)
- 📈 Viral (1000+ viewers)
- 👥 Connecteur (10 amis invités)

**Premium:**
- 👑 Premium Founder (6 mois premium)
- 💰 Early Supporter (achat 1er mois)
- 🔥 VIP (10 beefs premium assistés)

### Système de Niveaux

```
Niveau 1-5: Bronze (0-2499 XP)
Niveau 6-15: Silver (2500-22499 XP)
Niveau 16-30: Gold (22500-89999 XP)
Niveau 31-50: Platinum (90000-249999 XP)
Niveau 51+: Diamond (250000+ XP)

Gain XP:
+10 XP: Assister à un beef
+50 XP: Offrir un cadeau
+100 XP: Premier achat
+200 XP: Organiser un beef résolu
```

---

## 🎁 SYSTÈME DE CADEAUX - PRÊT

### Cadeaux disponibles (seedés)

```javascript
🌹 Rose: 10 points
🔥 Fire: 25 points
💎 Diamond: 50 points
👑 Crown: 100 points
```

### Distribution Revenue (70/30)

Quand un spectateur envoie un cadeau de 100 points:
- Médiateur reçoit: **70 points**
- Plateforme garde: **30 points**

---

## 📊 CE QUI RESTE À FAIRE (PHASE 2)

### Sprint 7: Interface Cadeaux (1-2 jours)
- [ ] GiftPanel component (panneau pendant le live)
- [ ] Animations cadeaux (Lottie ou CSS)
- [ ] Leaderboard top gifters
- [ ] Historique cadeaux

### Sprint 8: Premium Beefs (1 jour)
- [ ] Checkbox "Premium" dans CreateBeefForm
- [ ] Paywall beef premium
- [ ] Access control (vérifier points ou subscription)
- [ ] Replay pricing

### Sprint 9: Gamification UI (1 jour)
- [ ] Badge display (profil + live)
- [ ] Level display avec barre XP
- [ ] Achievement notifications
- [ ] Profile achievements grid

---

## 🔧 TROUBLESHOOTING

### Problème: "Missing SUPABASE_SERVICE_ROLE_KEY"
**Solution:** Ajouter la clé dans `.env.local` (voir étape 1)

### Problème: "Stripe publishable key not found"
**Solution:** Vérifier que `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` est dans `.env.local`

### Problème: Points pas crédités après paiement
**Solution:** 
1. Vérifier que le webhook est configuré
2. Tester avec Stripe CLI (voir étape 3C)
3. Vérifier les logs dans Stripe Dashboard → Webhooks

### Problème: "Failed to create checkout session"
**Solution:**
1. Vérifier que les Price IDs sont corrects dans `.env.local`
2. Vérifier que le produit est actif dans Stripe Dashboard

---

## 📝 COMMANDES UTILES

```bash
# Redémarrer serveur
npm run dev

# Vérifier env variables
node -e "console.log(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)"

# Tester webhook local
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger webhook test
stripe trigger checkout.session.completed
```

---

## ✅ CHECKLIST DE VALIDATION

Avant de dire que Sprint 6 est terminé, vérifie que:

- [ ] Migrations SQL exécutées sans erreur
- [ ] Stripe account créé et configuré (mode TEST)
- [ ] 4 produits créés dans Stripe avec Price IDs
- [ ] Toutes les clés dans `.env.local`
- [ ] Serveur redémarré après ajout des clés
- [ ] Modal "Acheter Points" s'ouvre correctement
- [ ] Redirection vers Stripe Checkout fonctionne
- [ ] Points affichés dans le Header
- [ ] (Optionnel) Webhook configuré et teste

---

## 🚀 PROCHAINES ÉTAPES

Une fois Sprint 6 validé:

1. **Implémenter Feed Découverte** (page d'accueil)
2. **GiftPanel** (envoyer cadeaux en live)
3. **Premium Beefs** (paywall + access control)
4. **Gamification UI** (badges + levels visibles)

---

**Questions? Problèmes? Dis-moi où tu bloques et je t'aide!** 🎯
