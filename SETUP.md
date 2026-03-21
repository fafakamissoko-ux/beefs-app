# 🚀 Guide de Configuration Rapide - Arena VS

## Étape 1 : Installation des Dépendances

```bash
cd arena-vs
npm install
```

## Étape 2 : Configuration Supabase

### 2.1 Créer un Projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Notez votre **URL du projet** et **anon key**

### 2.2 Configurer la Base de Données

1. Dans le dashboard Supabase, allez dans **SQL Editor**
2. Créez une nouvelle requête
3. Copiez-collez le contenu de `lib/supabase/schema.sql`
4. Exécutez la requête (bouton RUN)

### 2.3 Créer la Fonction RPC

Toujours dans SQL Editor, exécutez :

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

### 2.4 Configurer les Variables d'Environnement

Modifiez `.env.local` avec vos vraies clés :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
```

## Étape 3 : Configuration OpenAI (Optionnel)

Pour activer le fact-checking AI :

1. Créez un compte sur [platform.openai.com](https://platform.openai.com)
2. Générez une clé API
3. Ajoutez-la dans `.env.local` :

```env
OPENAI_API_KEY=sk-votre-clé
```

**Note** : Sans clé OpenAI, le fact-check fonctionnera en mode mock.

## Étape 4 : Lancer l'Application

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000)

## 🎯 Tester l'Application

### Scénario 1 : Créer une Arena de Démo

1. Page d'accueil → Cliquez sur **"Lancer un Débat"**
2. Une arena sera créée automatiquement
3. Testez le **Tension Meter** en tapant rapidement sur le bouton
4. Observez le mode **Chaos** quand la tension atteint 100%

### Scénario 2 : Tester le Chat et les Sources

1. Dans l'arena, cliquez sur l'onglet **"Chat"**
2. Envoyez un message normal
3. Cliquez sur l'icône **Link** pour activer le mode Source
4. Collez une URL (exemple : `https://wikipedia.org`)
5. L'URL apparaîtra avec un style différent

### Scénario 3 : File d'Attente des Challengers

1. Ouvrez l'arena dans **2 onglets** (multi-utilisateurs simulés)
2. Onglet 2 : Allez dans **"Queue"** → **"Rejoindre la Queue"**
3. Onglet 1 (Host) : Cliquez sur **"Prochain Challenger"**
4. Le challenger de l'onglet 2 apparaît sur le côté droit de l'arena

### Scénario 4 : AI Fact-Check

1. Onglet **"AI Check"**
2. Entrez une phrase à vérifier (ex: "La Terre est plate")
3. Cliquez sur **"Lancer Fact-Check"**
4. L'AI analyse et retourne un verdict avec explication

### Scénario 5 : Gifts Virtuels

1. Dans l'onglet **"AI Check"**, section **"ENVOYER UN GIFT"**
2. Cliquez sur un bouton gift (Host ou Challenger)
3. Choisissez un gift (Flamme, Couronne, etc.)
4. L'animation apparaît sur l'écran du destinataire

## ⚠️ Dépannage

### Erreur : "Unable to connect to Supabase"

- Vérifiez que vos clés dans `.env.local` sont correctes
- Redémarrez le serveur (`Ctrl+C` puis `npm run dev`)

### Erreur : "increment_tension function not found"

- Retournez à l'Étape 2.3 et créez la fonction RPC

### Les changements temps réel ne fonctionnent pas

- Vérifiez dans Supabase Dashboard > Database > Replication
- Assurez-vous que Realtime est activé pour toutes les tables

### Le Fact-Check retourne toujours le même message

- C'est normal si vous n'avez pas configuré `OPENAI_API_KEY`
- Le mode mock est actif

## 📊 Structure de Test Recommandée

Pour une démo complète, ouvrez **3 onglets** :

1. **Onglet Host** : L'initiateur du débat
2. **Onglet Challenger 1** : Rejoint la queue, devient challenger
3. **Onglet Spectateur** : Tape sur le Tension Meter, envoie des messages

## 🎨 Personnalisation Rapide

### Changer les Couleurs Néon

Éditez `tailwind.config.ts` :

```typescript
colors: {
  'arena-blue': '#00F0FF',   // Votre couleur
  'arena-red': '#FF0055',    // Votre couleur
  'arena-purple': '#B800FF', // Votre couleur
}
```

### Ajuster la Vitesse du Tension Meter

Éditez `hooks/useTensionMeter.ts` :

```typescript
const {
  throttleMs = 300,           // Fréquence sync (ms)
  decayIntervalMs = 1000,     // Intervalle decay (ms)
  decayPercent = 2,           // % de decay par intervalle
} = options;
```

## 🚀 Prêt pour la Production

### Checklist Avant Déploiement

- [ ] Configurer Row Level Security (RLS) dans Supabase
- [ ] Ajouter vraie authentification (Supabase Auth)
- [ ] Intégrer LiveKit/Agora pour vidéo/audio
- [ ] Implémenter rate limiting sur les API routes
- [ ] Configurer domaine custom et SSL
- [ ] Optimiser les images (next/image)
- [ ] Ajouter analytics (Vercel Analytics)

### Déploiement sur Vercel

```bash
vercel deploy
```

Ajoutez vos variables d'environnement dans Vercel Dashboard.

---

**Besoin d'aide ?** Consultez le [README.md](./README.md) complet ou créez une issue sur GitHub.
