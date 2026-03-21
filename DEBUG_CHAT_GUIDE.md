# 🔍 **DEBUG CHAT - GUIDE ÉTAPE PAR ÉTAPE**

---

## **ÉTAPE 1: Vérifier Supabase Realtime**

Le problème peut être que **Realtime n'est pas activé** pour la table `beef_messages`.

### **Action:**
1. Va sur [Supabase Database](https://hffhucapmkjsgmrdgelq.supabase.co/project/hffhucapmkjsgmrdgelq/database/tables)
2. Clique sur la table **`beef_messages`**
3. Clique sur l'onglet **"Realtime"** (en haut)
4. **Vérifie:**
   - ✅ "Enable Realtime" doit être **activé** (switch ON)
   - ✅ "INSERT" doit être **coché**
   - ✅ "UPDATE" doit être **coché**

**Si ce n'est pas activé:**
- Active "Enable Realtime"
- Coche "INSERT" et "UPDATE"
- Clique "Save"

---

## **ÉTAPE 2: Test avec Console F12**

### **Actions:**
1. Ouvre `http://localhost:3000/arena/test-room-1`
2. Appuie sur **F12** (ouvre la console)
3. Onglet **"Console"**
4. **Écris un message:** "Test 123"
5. **Appuie sur Entrée**

### **Ce que tu DOIS voir dans la console:**

**Scénario A - Succès (message s'affiche):**
```
🔔 Subscribing to beef_messages for roomId: test-room-1
🔗 Subscription status: SUBSCRIBED
📤 Sending message: Test 123
✅ Message sent successfully: [Object]
📨 New message received: {id: "...", username: "...", content: "Test 123"}
✅ Message formatted: {id: "...", user_name: "...", content: "Test 123"}
📋 Visible messages updated: [Object]
```
**→ Le message apparaît en haut à gauche pendant 5 secondes**

**Scénario B - Erreur d'envoi:**
```
🔔 Subscribing to beef_messages for roomId: test-room-1
📤 Sending message: Test 123
❌ Error sending message: {code: "...", message: "..."}
```
**→ Problème de permissions ou de rate limiting**

**Scénario C - Pas de réception:**
```
🔔 Subscribing to beef_messages for roomId: test-room-1
📤 Sending message: Test 123
✅ Message sent successfully: [Object]
(mais pas de "📨 New message received")
```
**→ Supabase Realtime pas activé**

---

## **ÉTAPE 3: Screenshot à envoyer**

**Prends un screenshot de:**
1. **Console F12** (toute la sortie)
2. **Page complète** avec l'URL visible
3. **Onglet Realtime dans Supabase** (si tu peux y accéder)

---

## **ÉTAPE 4: Vérification manuelle Supabase**

### **Actions:**
1. Va sur [Supabase Table Editor](https://hffhucapmkjsgmrdgelq.supabase.co/project/hffhucapmkjsgmrdgelq/editor)
2. Clique sur la table **`beef_messages`**
3. **Vérifie:**
   - Y a-t-il des messages dans la table?
   - Quel est le `beef_id` des messages?
   - Est-ce qu'il correspond à `test-room-1`?

**Si des messages existent:**
- Ça veut dire que l'envoi fonctionne
- Mais Realtime ne fonctionne pas

**Si aucun message:**
- Problème d'insertion
- Permissions RLS peut-être

---

## **SOLUTIONS POSSIBLES:**

### **Solution A: Realtime pas activé**
→ Active Realtime (Étape 1)

### **Solution B: RLS trop strict**
→ Vérifie les policies dans Supabase

### **Solution C: `beef_id` incorrect**
→ L'URL doit être `/arena/test-room-1`
→ Dans la table, `beef_id` doit être exactement `test-room-1`

---

**Fais ces vérifications et dis-moi ce que tu trouves!** 🔍
