# 🔥 Arena VS - Digital Boxing Ring for Ideas

Une plateforme de débat en temps réel haute-énergie inspirée de TikTok Live, X Spaces, et le format "20 vs 1" de Jubilee.

## ✨ Fonctionnalités Principales

### 🎯 The Arena (Live Room)
- **Host Immunity** : Le créateur du débat ne peut pas être expulsé
- **1 vs All Logic** : Système de file d'attente pour les challengers
- **Free Source Pinning** : Validation AI des liens et épinglage automatique

### ⚡ Tension Meter (Crowd-Powered)
- Jauge visuelle alimentée par les clics de la foule
- Synchronisation temps réel via WebSockets
- Mode "Chaos" avec effets visuels (secousses, filtres rouges) à 100%
- Mécanisme de décroissance naturelle (-2% par seconde)

### 🤖 AI Silent Referee
- Transcription audio en temps réel (simulation)
- Fact-checking différé après chaque intervention
- Cartes overlay "Reality: [Fait]" avec sources

### 🎮 UI/UX Gamifiée
- Thème dark mode avec couleurs néon (Bleu Électrique vs Rouge Néon)
- Badge "Controversial" pour hosts à faible score logique mais haute engagement
- Système de gifts virtuels (flammes, couronnes, éclairs, diamants)

### 💰 Hooks de Monétisation (Placeholders)
- Bouton "Boost Theme" (simulation de paiement)
- Mur d'accès PPV pour salles premium

## 🛠️ Stack Technique

- **Frontend** : Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **UI/Animations** : Framer Motion + Lucide React (icônes)
- **Backend/Temps Réel** : Supabase (Auth, DB, Realtime)
- **AI Engine** : OpenAI API (GPT-4o) pour fact-checking
- **State Management** : React Hooks + Zustand (optionnel)

## 🚀 Installation

### 1. Cloner et installer les dépendances

```bash
npm install
# ou
yarn install
# ou
pnpm install
```

### 2. Configuration Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. Copiez `.env.local.example` vers `.env.local`
3. Ajoutez vos clés Supabase :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anonyme_supabase
```

4. Exécutez le schéma SQL dans l'éditeur SQL de Supabase :

```bash
# Copiez le contenu de lib/supabase/schema.sql
# Et exécutez-le dans : Supabase Dashboard > SQL Editor
```

### 3. Configuration OpenAI (Optionnel)

Pour le fact-checking AI :

```env
OPENAI_API_KEY=votre_clé_openai
```

**Note** : Sans clé OpenAI, le fact-check retournera une réponse mock pour la démo.

### 4. Fonction RPC Supabase (Important)

Créez cette fonction dans l'éditeur SQL de Supabase pour l'incrémentation atomique du Tension Meter :

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

### 5. Lancer le serveur de développement

```bash
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## 📁 Structure du Projet

```
arena-vs/
├── app/
│   ├── arena/
│   │   ├── [roomId]/
│   │   │   └── page.tsx          # Page Arena principale
│   │   └── demo/
│   │       └── page.tsx           # Création d'arena de démo
│   ├── api/
│   │   └── fact-check/
│   │       └── route.ts           # API fact-checking AI
│   ├── layout.tsx                 # Layout racine
│   ├── page.tsx                   # Page d'accueil
│   └── globals.css                # Styles globaux
├── components/
│   ├── ArenaLayout.tsx            # Split-screen Host/Challenger
│   ├── TensionGauge.tsx           # Jauge de tension avec animations
│   ├── ChatPanel.tsx              # Chat temps réel + Source Pinning
│   ├── ChallengerQueue.tsx        # File d'attente des challengers
│   ├── AIFactCheck.tsx            # Composant fact-checking AI
│   ├── GiftSystem.tsx             # Système de gifts virtuels
│   └── ui/
│       └── Tabs.tsx               # Composant Tabs custom
├── hooks/
│   └── useTensionMeter.ts         # Hook tension meter avec throttling
├── lib/
│   └── supabase/
│       ├── client.ts              # Client Supabase + types
│       └── schema.sql             # Schéma de base de données
├── tailwind.config.ts             # Config Tailwind (couleurs néon)
├── next.config.js
├── tsconfig.json
└── package.json
```

## 🎨 Système de Design

### Palette de Couleurs

```css
--arena-blue: #00F0FF      /* Néon Bleu */
--arena-red: #FF0055       /* Néon Rouge */
--arena-purple: #B800FF    /* Néon Violet */
--arena-dark: #0A0A0F      /* Background principal */
--arena-darker: #050508    /* Background plus sombre */
--arena-gray: #1A1A24      /* Bordures/Cards */
```

### Animations Clés

- **shake** : Effet tremblement en mode Chaos
- **pulse-fast** : Pulsation rapide pour éléments haute tension
- **tension-rise** : Animation spring pour la jauge
- **gift-float** : Animation de flottement des gifts

## 🔧 Fonctionnement Technique

### Tension Meter - Stratégie "Throttled Aggregation"

1. **Client-Side** :
   - `localTension` : État local pour feedback optimiste instantané
   - `clickBuffer` : Compteur de clics en mémoire
   - Throttling : Envoi groupé toutes les 300ms au serveur

2. **Server-Side** :
   - Canal Realtime : `room_{id}_tension`
   - Mise à jour atomique via fonction RPC
   - Broadcast du `globalTension` toutes les 500ms
   - Décroissance automatique : -2% par seconde

3. **Chaos Trigger** :
   - Seuil : `globalTension >= 100`
   - Effets : Classe CSS `.chaos-mode`, overlay rouge, shake
   - Auto-reset à 50% après 5 secondes

### Architecture Realtime

```typescript
// Channels Supabase utilisés :
- room_{id}_tension      // Mise à jour tension
- room_{id}_messages     // Chat et sources
- room_{id}_queue        // File d'attente challengers
- room_{id}_gifts        // Gifts virtuels
```

## 🚀 Suggestions d'Améliorations Futures

1. **Système de Replay Intelligent** : Clips auto des moments Chaos pour partage social
2. **Prédictions de Foule** : Paris sur le gagnant avec points virtuels
3. **Mode "Jury Panel"** : 3-5 experts au lieu d'un seul challenger
4. **Reactions Émotionnelles** : Analyse de sentiment temps réel (😡, 🔥, 💯)
5. **Système de Leagues** : Classement ELO, tournois mensuels
6. **Intégration LiveKit/Agora** : Audio/vidéo temps réel
7. **Transcription Whisper** : Vraie transcription audio pour fact-check
8. **Paiements Stripe** : Monétisation réelle des Gifts et PPV

## 🧪 Mode Démo

Pour tester rapidement sans configuration Supabase complète :

1. Cliquez sur "Lancer un Débat" sur la page d'accueil
2. Une room de démo sera créée (peut échouer sans Supabase)
3. Les fonctionnalités fonctionneront en mode "mock" local

## 📝 License

Ce projet est un prototype de démonstration. Code fourni "as-is" à des fins éducatives.

## 🤝 Contribution

Pour toute amélioration ou bug :
1. Forkez le projet
2. Créez une branche (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add AmazingFeature'`)
4. Pushez vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

---

Développé avec ❤️ et ⚡ par l'équipe Arena VS
