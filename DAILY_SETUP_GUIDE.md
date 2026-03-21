# 🎥 **DAILY.CO - GUIDE D'INSTALLATION**

## ✅ **ÉTAPE 1: COMPTE DAILY.CO**

### **Créer ton compte:**
1. Va sur: https://dashboard.daily.co/
2. Clique "Sign Up"
3. Remplis: Email, Password
4. Confirme ton email

### **Plan gratuit inclut:**
- ✅ 10,000 minutes/mois GRATUIT
- ✅ Participants illimités
- ✅ Enregistrements (optionnel)
- ✅ API complète

---

## ✅ **ÉTAPE 2: OBTENIR L'API KEY**

Une fois connecté:

```
1. Dashboard Daily.co
2. Menu gauche → "Developers"
3. Section "API Keys"
4. Clique "Create API Key"
5. Nom: "Beefs Production"
6. Permissions: "Full Access"
7. COPIE la clé (abc123...)
```

**Format de la clé:**
```
abc123def456ghi789jkl012mno345pqr678stu901
```

---

## ✅ **ÉTAPE 3: AJOUTER À .ENV.LOCAL**

Dans ton fichier `.env.local`:

```bash
# Daily.co Configuration
NEXT_PUBLIC_DAILY_DOMAIN=your-account.daily.co
DAILY_API_KEY=abc123def456... (ta clé ici)
```

**Remplace:**
- `your-account` → Ton nom de compte Daily.co
- `abc123...` → Ta vraie API key

---

## ✅ **ÉTAPE 4: INSTALLER DAILY SDK**

```bash
npm install @daily-co/daily-js
```

---

## ✅ **ÉTAPE 5: CRÉER UNE ROOM DE TEST**

### **Option A: Via Dashboard (Manuel)**

```
1. Dashboard Daily.co
2. "Rooms" (menu gauche)
3. "Create Room"
4. Nom: "test-beef-1"
5. Privacy: "Public" (pour tester)
6. Save
```

### **Option B: Via API (Automatique)**

Le code que j'ai créé fait ça automatiquement!

---

## ✅ **ÉTAPE 6: TESTER**

### **Test simple:**

```
1. Va sur: http://localhost:3003/arena/test-beef-1
2. Autorise caméra/micro
3. Tu devrais te voir!
4. Ouvre un autre onglet (mode incognito)
5. Même URL
6. Tu vois les 2 participants!
```

---

## 🐛 **DÉPANNAGE**

### **Erreur: "Unauthorized"**
- ❌ API key incorrecte
- ✅ Vérifie `.env.local`
- ✅ Redémarre `npm run dev`

### **Erreur: "Room not found"**
- ❌ Room inexistante
- ✅ Créer room via dashboard
- ✅ Ou utiliser création automatique

### **Pas de vidéo:**
- ❌ Permissions caméra refusées
- ✅ Vérifie paramètres navigateur
- ✅ Utilise HTTPS en prod (obligatoire)

### **Audio coupé:**
- ❌ Micro bloqué
- ✅ Clique sur icône micro (barre URL)
- ✅ Autoriser le micro

---

## 📊 **LIMITES FREE TIER**

| Feature | Free Tier | Limite |
|---------|-----------|--------|
| Minutes/mois | 10,000 | ✅ Largement suffisant |
| Participants | Illimité | ✅ |
| Rooms | Illimité | ✅ |
| Recordings | 10 GB | ⚠️ Optionnel |
| Support | Community | ⚠️ |

**10,000 minutes = ~333 beefs de 30min** 🔥

---

## 💰 **UPGRADE (SI BESOIN)**

**Starter ($99/mois):**
- 50,000 minutes
- Priority support
- Custom branding

**Business ($249/mois):**
- 100,000 minutes
- SLA uptime
- Dedicated support

**Pour commencer: FREE suffit!** ✅

---

## 🔗 **LIENS UTILES**

- Dashboard: https://dashboard.daily.co/
- Docs: https://docs.daily.co/
- React SDK: https://docs.daily.co/reference/daily-js
- Support: https://help.daily.co/

---

## ✅ **CHECKLIST**

- [ ] Compte créé
- [ ] Email confirmé
- [ ] API key obtenue
- [ ] `.env.local` configuré
- [ ] SDK installé (`@daily-co/daily-js`)
- [ ] Serveur redémarré
- [ ] Test local réussi

---

**Une fois configuré, reviens me dire et on testera ensemble!** 🚀
