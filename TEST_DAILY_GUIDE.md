# 🎥 **TEST DAILY.CO - GUIDE COMPLET**

Date: 17 Mars 2026  
Status: **PRÊT À TESTER**

---

## ✅ **CE QUI A ÉTÉ PRÉPARÉ:**

### **1. Configuration**
- ✅ Daily.co API key configurée dans `.env.local`
- ✅ Domaine: `beefs.daily.co`
- ✅ API `/api/daily/rooms` créée (POST, GET, DELETE)
- ✅ SDK `@daily-co/daily-js` installé

### **2. Composants**
- ✅ `components/DailyVideo.tsx` - Composant vidéo avec Daily iframe
- ✅ `app/test-daily/page.tsx` - Page de test dédiée

---

## 🧪 **INSTRUCTIONS DE TEST:**

### **Test 1: Accès basique (1 participant)**

1. **Va sur la page de test:**
   ```
   http://localhost:3000/test-daily
   ```

2. **Clique sur "Créer une Room de Test"**
   - Une room Daily.co est créée automatiquement
   - L'URL est générée (ex: `https://beefs.daily.co/test-1234567890`)

3. **Clique sur "Rejoindre"**
   - Le navigateur demande l'accès à ta caméra et ton micro
   - **Clique "Autoriser"**

4. **Tu devrais voir:**
   - ✅ Ta vidéo en direct
   - ✅ Controls Daily.co (muet, caméra on/off, plein écran)
   - ✅ "1 participant" affiché en bas

---

### **Test 2: Multi-participants (2 fenêtres)**

1. **Copie l'URL de la room** (bouton "Copier")

2. **Ouvre un nouvel onglet en mode incognito:**
   - **Chrome/Brave:** Ctrl+Shift+N
   - **Firefox:** Ctrl+Shift+P

3. **Colle l'URL copiée**
   - La même room s'ouvre
   - Autorise caméra/micro

4. **Tu devrais voir:**
   - ✅ **2 vidéos** (toi dans les 2 fenêtres)
   - ✅ **Audio des 2 côtés**
   - ✅ **"2 participants"** affiché
   - ✅ Les noms des participants

5. **Teste:**
   - Parle dans la fenêtre 1 → Tu t'entends dans la fenêtre 2
   - Coupe le micro dans la fenêtre 1 → L'audio s'arrête dans la fenêtre 2
   - Coupe la caméra → La vidéo s'arrête

---

### **Test 3: Fonctionnalités avancées**

**Teste les boutons Daily.co:**
- 🎤 Mute/Unmute
- 📹 Caméra On/Off
- 🖥️ Partage d'écran (screen share)
- 🔊 Volume
- ⛶ Plein écran

---

## 📊 **CHECKLIST:**

**Basique:**
- [ ] Page `/test-daily` charge
- [ ] Bouton "Créer Room" fonctionne
- [ ] Room URL générée
- [ ] Popup "Autoriser caméra/micro" apparaît
- [ ] Vidéo s'affiche après autorisation
- [ ] Audio fonctionne

**Multi-participants:**
- [ ] URL copiable
- [ ] 2ème fenêtre (incognito) peut rejoindre
- [ ] 2 vidéos visibles
- [ ] Audio bidirectionnel
- [ ] Compteur de participants correct

**Controls:**
- [ ] Bouton Mute fonctionne
- [ ] Bouton Caméra fonctionne
- [ ] Bouton Quitter fonctionne

---

## 🔧 **SI PROBLÈMES:**

### **Erreur "Impossible de créer la room"**
**Causes possibles:**
1. API key invalide
2. Limite de rooms atteinte (gratuit = 10 rooms/mois)
3. Problème réseau

**Solution:**
- Vérifie les logs console (F12)
- Vérifie que `DAILY_API_KEY` est dans `.env.local`
- Redémarre le serveur Next.js

---

### **Pas de vidéo/audio**
**Causes possibles:**
1. Permissions caméra/micro refusées
2. Caméra/micro déjà utilisés par une autre app
3. Navigateur bloque l'accès

**Solution:**
- Clique sur l'icône 🔒 dans la barre d'adresse
- Autorise caméra et micro
- Rafraîchis la page
- Teste dans Chrome/Brave (meilleur support)

---

### **Audio se répercute (écho)**
**C'est normal!** Tu as 2 fenêtres ouvertes sur le même PC.

**Pour tester correctement:**
- Utilise 2 appareils différents (PC + téléphone)
- OU utilise des écouteurs dans une des fenêtres

---

## 🎯 **PROCHAINES ÉTAPES:**

**Si les tests fonctionnent:**
1. Intégrer Daily.co dans la page `/arena/[roomId]`
2. Remplacer les placeholders vidéo par de vrais flux Daily
3. Ajouter le partage d'écran
4. Gérer les permissions (qui peut activer sa caméra)

**Si ça ne fonctionne pas:**
- Envoie screenshot de la console (F12)
- Dis-moi quelle erreur tu vois

---

## 💡 **NOTES:**

**Daily.co Free Plan:**
- 10,000 minutes/mois (gratuit)
- Max 10 participants par room
- Pas de limit de rooms concurrentes
- Features: vidéo, audio, screen share, recording

**C'est largement suffisant pour tester et pour les premiers utilisateurs!**

---

**Teste maintenant et dis-moi comment ça se passe!** 🎥
