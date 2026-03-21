# ✅ **DAILY.CO - INSTALLATION COMPLÈTE**

## 🎯 **CE QUI A ÉTÉ PRÉPARÉ:**

✅ **SDK installé:** `@daily-co/daily-js`  
✅ **API créée:** `/api/daily/rooms` (création/lecture/suppression rooms)  
✅ **Frontend existant:** `/arena/[roomId]` avec composants vidéo  
✅ **Guide complet:** `DAILY_SETUP_GUIDE.md`  
✅ **Variables env:** `.env.local.example`  

---

## 📋 **TON ACTION MAINTENANT (10 minutes):**

### **ÉTAPE 1: Créer compte Daily.co**

```
1. Va sur: https://dashboard.daily.co/
2. Clique "Sign Up"
3. Email + Password
4. Confirme ton email
```

---

### **ÉTAPE 2: Obtenir API Key**

```
1. Dashboard Daily.co
2. Menu gauche → "Developers"
3. "API Keys" → "Create API Key"
4. Nom: "Beefs Production"
5. COPIE la clé (commence par abc123...)
```

---

### **ÉTAPE 3: Ajouter à .env.local**

Ouvre ton fichier `.env.local` et ajoute:

```bash
# Daily.co Configuration
NEXT_PUBLIC_DAILY_DOMAIN=your-account.daily.co
DAILY_API_KEY=abc123def456... (colle ta clé ici)
```

**Remplace:**
- `your-account` → Ton nom de compte Daily (ex: beefs-prod)
- `abc123...` → Ta vraie API key

---

### **ÉTAPE 4: Redémarre le serveur**

```bash
# Tue le serveur actuel (Ctrl+C dans le terminal)
# Puis relance:
npm run dev
```

---

### **ÉTAPE 5: Teste!**

**Test simple:**

```
1. Va sur: http://localhost:3003/arena/test-room-1
2. Autorise caméra/micro (popup navigateur)
3. Tu devrais te voir en vidéo!
4. Ouvre mode incognito (Ctrl+Shift+N)
5. Même URL: http://localhost:3003/arena/test-room-1
6. Tu vois 2 participants! 🎉
```

---

## 🎥 **COMMENT ÇA MARCHE:**

### **Création automatique de room:**

Quand tu vas sur `/arena/test-room-1`:

```
1. Frontend détecte room "test-room-1"
2. Appelle API: /api/daily/rooms?name=test-room-1
3. Si room existe → Rejoindre
4. Si room existe pas → Créer automatiquement
5. Daily.co retourne URL: https://your-account.daily.co/test-room-1
6. Vidéo démarre!
```

---

## 🔧 **FEATURES ACTIVÉES:**

✅ **Vidéo HD** (720p par défaut)  
✅ **Audio** (avec noise cancellation)  
✅ **Partage d'écran**  
✅ **Jusqu'à 50 participants** (configurable)  
✅ **Recording cloud** (optionnel)  
✅ **Active speaker detection**  
✅ **Network quality indicator**  

---

## 🐛 **SI ÇA NE MARCHE PAS:**

### **Erreur: "Unauthorized"**
```
❌ API key incorrecte
✅ Vérifie .env.local
✅ Redémarre npm run dev
✅ Check console: "DAILY_API_KEY not configured"
```

### **Erreur: "Room not found"**
```
❌ Room inexistante
✅ L'API doit la créer automatiquement
✅ Check console pour les logs
```

### **Pas de vidéo:**
```
❌ Permissions caméra refusées
✅ Clique icône caméra (barre URL Chrome)
✅ "Autoriser" caméra et micro
✅ Refresh la page
```

### **Audio coupé:**
```
❌ Micro bloqué par navigateur
✅ Click icône micro (barre URL)
✅ Sélectionne bon micro
✅ Volume pas à 0
```

---

## 📊 **PLAN GRATUIT:**

**10,000 minutes/mois = GRATUIT**

Ça représente:
- 333 beefs de 30 minutes
- 166 beefs de 1 heure
- 83 beefs de 2 heures

**Plus que suffisant pour commencer!** ✅

Après 10k minutes:
- **Starter:** $99/mois (50k minutes)
- **Business:** $249/mois (100k minutes)

---

## 🎯 **PROCHAINES ÉTAPES (APRÈS TEST):**

### **1. Custom Domain (optionnel)**

Au lieu de `your-account.daily.co`:
```
1. Dashboard → Settings
2. "Custom Domain"
3. Demande: beefs.daily.co
```

### **2. Recording (optionnel)**

Sauvegarder les beefs:
```
- Activé par défaut dans l'API
- Recordings dans Dashboard
- 10 GB gratuit
- Téléchargeable en MP4
```

### **3. Modération vidéo:**

Kick/mute participants:
```
- API Daily.co support tout
- À implémenter dans HostControlPanel
```

---

## 💡 **TIPS:**

**Performance:**
- Daily.co s'adapte automatiquement à la bande passante
- Réduit qualité si connexion faible
- Reconnecte automatiquement

**Mobile:**
- Fonctionne sur iOS Safari
- Fonctionne sur Android Chrome
- PWA = expérience native!

**HTTPS:**
- Caméra/Micro requiert HTTPS en prod
- Localhost OK pour dev
- Vercel = HTTPS automatique ✅

---

## 🚀 **QUAND TU AS TERMINÉ:**

**Dis-moi:**
1. ✅ Compte créé?
2. ✅ API key obtenue?
3. ✅ `.env.local` configuré?
4. ✅ Serveur redémarré?
5. ✅ Test vidéo OK?

**Ensuite on passe à:**
- Chat persistant (commentaires)
- Ajout participants
- Déploiement Vercel

---

**🎥 PRÊT À TESTER? GO!** 🚀

Ouvre **http://localhost:3003/arena/test-room-1** dès que l'API key est configurée!
