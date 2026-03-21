# ⚡ Arena VS - Démarrage Ultra-Rapide

## 🚀 En 3 Minutes Chrono

### Étape 1 : Installation (1 min)

```bash
cd arena-vs
npm install
```

### Étape 2 : Configuration Supabase (1 min)

1. **Créez un compte** sur [supabase.com](https://supabase.com) (gratuit)
2. **Nouveau projet** → Notez l'URL et la clé anon
3. **SQL Editor** → Copiez-collez `lib/supabase/schema.sql` → RUN
4. **Créez la fonction RPC** :

```sql
CREATE OR REPLACE FUNCTION increment_tension(
  room_id UUID,
  increment_value INT
)
RETURNS VOID AS $$
BEGIN
  UPDATE rooms 
  SET tension_level = LEAST(100, GREATEST(0, tension_level + increment_value))
  WHERE id = room_id;
END;
$$ LANGUAGE plpgsql;
```

### Étape 3 : Variables d'Environnement (30 sec)

Éditez `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
OPENAI_API_KEY=sk-optional (pour fact-check)
```

### Étape 4 : Lancement (30 sec)

```bash
npm run dev
```

**Ouvrez** : [http://localhost:3000](http://localhost:3000)

---

## 🎮 Tester les Fonctionnalités

### 1️⃣ Créer une Arena (10 sec)

Page d'accueil → **"Lancer un Débat"** → Arena créée !

### 2️⃣ Tension Meter (15 sec)

Cliquez rapidement sur **"TAP TO FUEL THE TENSION"** → Regardez la jauge monter → À 100%, **MODE CHAOS** se déclenche ! 🔥

### 3️⃣ Chat & Sources (20 sec)

- Onglet **"Chat"** → Envoyez un message
- Cliquez sur l'icône **Link** → Collez `https://wikipedia.org`
- Le lien s'affiche avec un style spécial

### 4️⃣ File d'Attente (30 sec - 2 onglets)

- **Onglet 1** : Votre arena (vous êtes Host)
- **Onglet 2** : Même URL → Onglet "Queue" → **"Rejoindre la Queue"**
- **Onglet 1** : Cliquez **"Prochain Challenger"**
- Le challenger de l'onglet 2 apparaît sur l'écran ! 🎯

### 5️⃣ AI Fact-Check (15 sec)

- Onglet **"AI Check"**
- Entrez : `"La Terre est plate"`
- Cliquez **"Lancer Fact-Check"**
- L'IA retourne un verdict avec explication

### 6️⃣ Gifts Virtuels (10 sec)

- Section "ENVOYER UN GIFT"
- Cliquez sur un bouton gift
- Choisissez une icône (Flamme, Couronne...)
- Animation apparaît sur l'écran du destinataire ✨

---

## 🐛 Problèmes Courants

### "Cannot connect to Supabase"

❌ **Erreur** : Clés incorrectes dans `.env.local`  
✅ **Solution** : Revérifiez URL et anon key depuis Supabase Dashboard

### "increment_tension not found"

❌ **Erreur** : Fonction RPC non créée  
✅ **Solution** : Exécutez la fonction SQL dans Étape 2

### Les changements temps réel ne marchent pas

❌ **Erreur** : Realtime pas activé  
✅ **Solution** : Supabase Dashboard → Database → Replication → Activez pour toutes les tables

### Mode mock pour Fact-Check

ℹ️ **Normal** : Sans `OPENAI_API_KEY`, le fact-check retourne des réponses simulées

---

## 📚 Documentation Complète

- **README.md** : Vue d'ensemble du projet
- **SETUP.md** : Guide de configuration détaillé
- **FEATURES.md** : Documentation technique des fonctionnalités
- **DEPLOYMENT.md** : Guide de déploiement en production
- **PROJECT_SUMMARY.md** : Synthèse complète

---

## 🎯 Prochaines Étapes

1. ✅ Tester toutes les fonctionnalités
2. 📖 Lire la documentation
3. 🎨 Personnaliser les couleurs (tailwind.config.ts)
4. 🚀 Déployer sur Vercel (voir DEPLOYMENT.md)
5. 🤝 Contribuer (voir CONTRIBUTING.md)

---

## 💡 Astuces Pro

### Simuler Plusieurs Utilisateurs

Ouvrez l'arena dans **plusieurs onglets/fenêtres** :
- Fenêtre 1 : Mode normal (Host)
- Fenêtre 2 : Navigation privée (Challenger)
- Fenêtre 3 : Autre navigateur (Spectateur)

Tous verront les mises à jour en temps réel ! 🔄

### Mode Développement Avancé

```bash
# Vérifier les types TypeScript
npm run type-check

# Linter le code
npm run lint

# Build de production en local
npm run build
npm run start
```

### Débug Realtime

Ouvrez la console du navigateur → Onglet Network → Filtre "ws" → Voir les WebSocket messages

---

## 🎉 Vous êtes Prêt !

Bienvenue dans **Arena VS** ! Vous avez maintenant :

- ✅ Une plateforme de débat temps réel fonctionnelle
- ✅ Toutes les fonctionnalités principales implémentées
- ✅ Un code propre et bien documenté
- ✅ Prêt pour la production (après config sécurité)

**Amusez-vous bien et créez des débats épiques !** 🔥⚡

---

**Temps total** : ~5 minutes pour setup complet  
**Niveau** : Débutant friendly  
**Support** : [GitHub Issues](https://github.com/votre-username/arena-vs/issues)
