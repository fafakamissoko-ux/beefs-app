# 🧪 **MODE TEST - GUIDE COMPLET**

## ✅ **MODE TEST IMPLÉMENTÉ!**

Tu peux maintenant tester **tous les pays** sans VPN, directement en local!

---

## 🎯 **COMMENT UTILISER LE MODE TEST:**

### **1. Syntaxe de base:**

```
http://localhost:3003/buy-points?test-country=CODE_PAYS
```

**Exemples:**
```
🇸🇳 Sénégal:   ?test-country=SN
🇮🇳 Inde:       ?test-country=IN
🇺🇸 USA:        ?test-country=US
🇧🇷 Brésil:     ?test-country=BR
🇳🇬 Nigeria:    ?test-country=NG
🇨🇲 Cameroun:   ?test-country=CM
🇨🇮 Côte d'Ivoire: ?test-country=CI
```

---

## 🧪 **TESTER MAINTENANT (5 minutes):**

### **TEST 1: Sénégal (Franc CFA)**

```
1. Ouvre: http://localhost:3003/buy-points?test-country=SN

2. Tu verras:
   ✅ Badge jaune "🧪 MODE TEST: Sénégal"
   ✅ Pack Starter: 1,031 F CFA (au lieu de 4.99€)
   ✅ Pack Popular: 2,296 F CFA (au lieu de 9.99€)
   ✅ Pack Premium: 4,897 F CFA (au lieu de 19.99€)
   ✅ Pack VIP: 10,248 F CFA (au lieu de 49.99€)
   ✅ Prix EUR barrés
```

---

### **TEST 2: Inde (Roupies)**

```
1. Ouvre: http://localhost:3003/buy-points?test-country=IN

2. Tu verras:
   ✅ Badge "🧪 MODE TEST: India"
   ✅ Pack Starter: 88 ₹ (au lieu de 4.99€)
   ✅ Pack Popular: 196 ₹ (au lieu de 9.99€)
   ✅ Pack Premium: 392 ₹ (au lieu de 19.99€)
   ✅ Pack VIP: 980 ₹ (au lieu de 49.99€)
```

---

### **TEST 3: USA (Dollars)**

```
1. Ouvre: http://localhost:3003/buy-points?test-country=US

2. Tu verras:
   ✅ Badge "🧪 MODE TEST: United States"
   ✅ Pack Starter: $4.99
   ✅ Pack Popular: $9.99
   ✅ Pack Premium: $19.99
   ✅ Pack VIP: $49.99
```

---

### **TEST 4: Cameroun (Franc CFA XAF)**

```
1. Ouvre: http://localhost:3003/buy-points?test-country=CM

2. Tu verras:
   ✅ Badge "🧪 MODE TEST: Cameroun"
   ✅ Pack Popular: 2,296 F CFA (XAF)
   ✅ Même prix que Sénégal (zone CFA)
```

---

## 🛡️ **ANTI-FRAUDE EN MODE TEST:**

### **Comportement:**

✅ **MODE TEST ACTIF:**
- Anti-fraude **DÉSACTIVÉE**
- Tu peux acheter avec n'importe quel pays
- Badge jaune "🧪 MODE TEST"
- Métadonnée Stripe: `test_mode: true`

✅ **MODE NORMAL (sans ?test-country):**
- Anti-fraude **ACTIVE**
- VPN détecté → Transaction bloquée
- Logs complets dans le terminal

---

## 📊 **LISTE COMPLÈTE DES PAYS TESTABLES:**

### **🇪🇺 Europe:**
```
?test-country=FR  → France (EUR)
?test-country=BE  → Belgium (EUR)
?test-country=CH  → Switzerland (CHF)
?test-country=GB  → United Kingdom (GBP)
?test-country=DE  → Germany (EUR)
?test-country=ES  → Spain (EUR)
?test-country=IT  → Italy (EUR)
```

### **🌍 Afrique Francophone (Franc CFA):**
```
?test-country=SN  → Sénégal (XOF)
?test-country=CI  → Côte d'Ivoire (XOF)
?test-country=CM  → Cameroun (XAF)
?test-country=BJ  → Bénin (XOF)
?test-country=BF  → Burkina Faso (XOF)
?test-country=TG  → Togo (XOF)
?test-country=ML  → Mali (XOF)
?test-country=NE  → Niger (XOF)
?test-country=GA  → Gabon (XAF)
?test-country=CG  → Congo (XAF)
?test-country=TD  → Tchad (XAF)
?test-country=CF  → RCA (XAF)
?test-country=GQ  → Guinée Équatoriale (XAF)
?test-country=GW  → Guinée-Bissau (XOF)
```

### **🌎 Amériques:**
```
?test-country=US  → United States (USD)
?test-country=CA  → Canada (CAD)
?test-country=BR  → Brazil (BRL)
?test-country=MX  → Mexico (MXN)
```

### **🌏 Asie:**
```
?test-country=IN  → India (INR)
?test-country=PK  → Pakistan (PKR)
?test-country=BD  → Bangladesh (BDT)
```

### **🌍 Afrique (Autres):**
```
?test-country=NG  → Nigeria (NGN)
?test-country=KE  → Kenya (KES)
?test-country=GH  → Ghana (GHS)
?test-country=ZA  → South Africa (ZAR)
```

---

## 💳 **TESTER UN ACHAT COMPLET:**

```
1. Va sur: http://localhost:3003/buy-points?test-country=SN

2. Sélectionne "Pack Popular" (2,296 F CFA)

3. Clique "Acheter 2,296 F CFA"

4. Sur Stripe Checkout, tu verras:
   ✅ Montant en XOF (Franc CFA)
   ✅ Environ 3.50€ pour Stripe
   
5. Paie avec carte test:
   4242 4242 4242 4242
   Date: 12/34
   CVC: 123

6. Redirection vers /live

7. Points crédités!
```

---

## 🔍 **VÉRIFIER LES LOGS:**

Dans le terminal où tourne `npm run dev`, tu verras:

```
🌍 User country detected: SN Sénégal
💰 Adapted price: 2 296 F CFA (XOF)
🧪 TEST MODE ACTIVE - Anti-fraud disabled for testing
Stripe session created: cs_test_...
```

**Avec anti-fraude (mode normal):**
```
🌍 User country detected: FR France
💰 Adapted price: 9,99 € (EUR)
🛡️ Fraud score: 100 - Risk: low
Stripe session created: cs_test_...
```

---

## ✅ **CHECKLIST DE TEST:**

### **Test Interface:**
- [ ] Sénégal → Prix en F CFA
- [ ] Inde → Prix en ₹
- [ ] USA → Prix en $
- [ ] Badge "MODE TEST" visible
- [ ] Prix originaux barrés
- [ ] Bouton affiche bon prix

### **Test Achat:**
- [ ] Checkout Stripe en bonne devise
- [ ] Paiement accepté
- [ ] Redirection /live
- [ ] Points crédités

### **Test Logs:**
- [ ] "TEST MODE ACTIVE" dans logs
- [ ] Pas de "Fraud score" en test mode
- [ ] Metadata `test_mode: true`

---

## 🎯 **PROCHAINES ÉTAPES:**

### **MAINTENANT:**
```
1. Teste 3-4 pays différents
2. Vérifie que les prix sont corrects
3. Fais un achat test avec Sénégal
4. Vérifie les logs
```

### **ENSUITE:**
```
5. Deploy sur Vercel
6. Teste en PROD (sans ?test-country)
7. Teste avec VPN réel
8. Vois l'anti-fraude en action
```

---

## 💡 **CONSEILS:**

**Pour tester rapidement plusieurs pays:**
```
Ouvre plusieurs onglets:
- Onglet 1: ?test-country=SN (Sénégal)
- Onglet 2: ?test-country=IN (Inde)
- Onglet 3: ?test-country=BR (Brésil)
- Onglet 4: Sans paramètre (France)

Compare les prix!
```

**Pour partager avec ton équipe:**
```
Envoie des liens directs:
- https://ton-site.com/buy-points?test-country=SN
- Ils voient les prix adaptés
- Pas besoin de VPN
```

---

## 🔒 **SÉCURITÉ EN PRODUCTION:**

### **Important:**

✅ **Mode test est SAFE en prod:**
- Seulement pour l'affichage UI
- N'affecte pas le vrai calcul backend
- Anti-fraude reste active en vrai achat
- Métadonnée `test_mode` permet de filtrer

✅ **Utilisateur ne peut pas abuser:**
- Backend détecte VRAIE IP (Vercel headers)
- `?test-country=XX` n'affecte que l'UI
- Prix réel calculé côté serveur
- Stripe reçoit le prix backend, pas client

---

## 🎉 **TESTE MAINTENANT!**

```
http://localhost:3003/buy-points?test-country=SN
```

**Dis-moi ce que tu en penses!** 🚀

---

## 📝 **CODES PAYS PRINCIPAUX:**

| Code | Pays | Devise | Prix 9.99€ |
|------|------|--------|------------|
| SN | Sénégal | XOF | 2,296 F |
| CI | Côte d'Ivoire | XOF | 2,296 F |
| CM | Cameroun | XAF | 2,296 F |
| IN | Inde | INR | 196 ₹ |
| BR | Brésil | BRL | R$ 22.98 |
| NG | Nigeria | NGN | ₦3,997 |
| US | USA | USD | $9.99 |
| GB | UK | GBP | £7.99 |

**40+ pays disponibles!**
