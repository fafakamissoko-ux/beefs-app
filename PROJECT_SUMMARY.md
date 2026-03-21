# 📊 Arena VS - Synthèse du Projet

## 🎯 Vision

**Arena VS** est une plateforme de débat en temps réel haute-énergie qui transforme les discussions en événements spectaculaires. Inspirée de TikTok Live, X Spaces et Jubilee's "20 vs 1", elle crée un "ring digital" où la foule alimente l'énergie et où l'IA arbitre les faits.

---

## 🏗️ Architecture Technique

### Stack Principal

```
Frontend:   Next.js 14 (App Router) + TypeScript + Tailwind CSS
Backend:    Supabase (PostgreSQL + Realtime + Auth)
AI:         OpenAI GPT-4o (Fact-checking)
Animations: Framer Motion
Icons:      Lucide React
State:      React Hooks + Zustand (optionnel)
```

### Composants Clés Implémentés

#### 1. **Tension Meter** (`hooks/useTensionMeter.ts`)
- Jauge interactive alimentée par clics utilisateurs
- Throttling : agrégation toutes les 300ms
- Decay automatique : -2% par seconde
- Mode Chaos : déclenchement à 100%
- Synchronisation temps réel via Supabase Realtime

#### 2. **Arena Layout** (`components/ArenaLayout.tsx`)
- Split-screen Host/Challenger
- Placeholders vidéo (prêt pour LiveKit/Agora)
- Badges dynamiques (Host Immunity, Controversial)
- Contrôles audio/vidéo simulés

#### 3. **Chat System** (`components/ChatPanel.tsx`)
- Messages texte classiques
- Mode "Source" : partage de liens avec style différencié
- Free Source Pinning : épinglage automatique des liens pertinents
- Temps réel via Supabase channels

#### 4. **Challenger Queue** (`components/ChallengerQueue.tsx`)
- File d'attente FIFO
- Host peut appeler le prochain challenger
- Position badges (1, 2, 3...)
- Temps réel pour updates instantanées

#### 5. **AI Fact-Check** (`components/AIFactCheck.tsx`)
- Input simulant transcription audio
- Appel API OpenAI GPT-4o
- 4 types de verdicts avec codes couleur
- Auto-dismiss après 10 secondes
- Stockage en DB pour historique

#### 6. **Gift System** (`components/GiftSystem.tsx`)
- 4 types de gifts (Flamme, Couronne, Éclair, Diamant)
- Animations float avec Framer Motion
- Broadcast temps réel à tous les spectateurs
- Prêt pour monétisation Stripe

---

## 📂 Structure des Fichiers (Complète)

```
arena-vs/
├── app/
│   ├── api/
│   │   └── fact-check/
│   │       └── route.ts           # API fact-checking OpenAI
│   ├── arena/
│   │   ├── [roomId]/
│   │   │   └── page.tsx           # Page Arena principale
│   │   └── demo/
│   │       └── page.tsx           # Création démo auto
│   ├── browse/
│   │   └── page.tsx               # Liste des arenas actives
│   ├── globals.css                # Styles globaux + animations
│   ├── layout.tsx                 # Layout racine
│   ├── page.tsx                   # Page d'accueil
│   └── not-found.tsx              # Page 404 stylée
│
├── components/
│   ├── ui/
│   │   └── Tabs.tsx               # Composant Tabs custom
│   ├── AIFactCheck.tsx            # Fact-checking IA
│   ├── ArenaLayout.tsx            # Layout split-screen
│   ├── ChallengerQueue.tsx        # File d'attente
│   ├── ChatPanel.tsx              # Chat temps réel
│   ├── ErrorBoundary.tsx          # Error handling
│   ├── GiftSystem.tsx             # Gifts virtuels
│   ├── LoadingScreen.tsx          # Écran de chargement
│   └── TensionGauge.tsx           # Jauge de tension
│
├── hooks/
│   └── useTensionMeter.ts         # Hook tension meter
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Client Supabase + types
│   │   └── schema.sql             # Schéma DB complet
│   └── utils.ts                   # Fonctions utilitaires
│
├── types/
│   └── index.ts                   # Types TypeScript globaux
│
├── public/                        # Assets statiques (à ajouter)
│
├── .env.local.example             # Template variables env
├── .env.local                     # Variables env (gitignored)
├── .gitignore                     # Fichiers exclus de Git
├── CONTRIBUTING.md                # Guide de contribution
├── DEPLOYMENT.md                  # Guide de déploiement
├── FEATURES.md                    # Documentation fonctionnalités
├── README.md                      # Documentation principale
├── SETUP.md                       # Guide configuration rapide
├── START.bat                      # Script démarrage Windows
├── next.config.js                 # Config Next.js
├── package.json                   # Dépendances npm
├── postcss.config.js              # Config PostCSS
├── tailwind.config.ts             # Config Tailwind
└── tsconfig.json                  # Config TypeScript
```

---

## 🎨 Design System

### Palette de Couleurs

| Couleur | Hex | Usage |
|---------|-----|-------|
| Arena Blue | `#00F0FF` | Primaire, Host side, Links |
| Arena Red | `#FF0055` | Danger, Challenger side, Chaos |
| Arena Purple | `#B800FF` | AI, Accents, Gradients |
| Arena Dark | `#0A0A0F` | Backgrounds |
| Arena Darker | `#050508` | Overlays, Cards |
| Arena Gray | `#1A1A24` | Borders, Inactive |

### Animations Clés

```css
shake           : Mode Chaos (tremblement écran)
pulse-fast      : Éléments haute tension
tension-rise    : Jauge de tension (spring)
gift-float      : Gifts virtuels (float + fade)
```

### Typography

- **Headings** : Font-black, tracking-tight
- **Body** : -apple-system, BlinkMacSystemFont, 'Segoe UI'
- **Mono** : Pour timestamps, stats

---

## 🔄 Flux de Données Temps Réel

### Channels Supabase

```typescript
room_{id}_tension      // Mise à jour Tension Meter
room_{id}_messages     // Chat + Sources + Fact-Checks
room_{id}_queue        // File d'attente challengers
room_{id}_gifts        // Gifts virtuels
public_rooms           // Liste arenas (browse page)
```

### Pattern Subscription

```typescript
useEffect(() => {
  const channel = supabase
    .channel('channel_name')
    .on('postgres_changes', { ... }, handler)
    .subscribe();
  
  return () => channel.unsubscribe();
}, [dependencies]);
```

---

## 📊 Schéma Base de Données

### Tables Principales

1. **rooms**
   - id, title, host_id, host_name
   - tension_level, status
   - current_challenger_id
   - created_at, updated_at

2. **challenger_queue**
   - id, room_id, user_id, user_name
   - position, status
   - created_at

3. **messages**
   - id, room_id, user_id, user_name
   - content, type (chat/source/fact_check)
   - is_pinned, created_at

4. **gifts**
   - id, room_id
   - from_user_id, to_user_id
   - gift_type, created_at

---

## 🚀 Fonctionnalités Implémentées

### ✅ Phase 1 (Actuelle)

- [x] Structure Next.js App Router
- [x] Configuration Supabase complète
- [x] Tension Meter avec throttling et decay
- [x] Layout Arena split-screen
- [x] Chat temps réel avec source pinning
- [x] File d'attente challengers
- [x] AI Fact-checking (OpenAI)
- [x] Système de gifts virtuels
- [x] Page browse des arenas
- [x] Animations Framer Motion
- [x] Thème dark néon
- [x] Documentation complète

### 🔨 Phase 2 (À Venir)

- [ ] Authentification Supabase Auth
- [ ] Intégration LiveKit/Agora (audio/vidéo)
- [ ] Transcription Whisper (vraie)
- [ ] Rate limiting API
- [ ] Tests (Jest + Playwright)
- [ ] Analytics dashboard
- [ ] Mobile responsive optimisé
- [ ] PWA (Progressive Web App)

### 🌟 Phase 3 (Future)

- [ ] Système de replay intelligent
- [ ] Prédictions de foule (betting)
- [ ] Mode "Jury Panel" (3-5 debaters)
- [ ] Analyse sentiment temps réel
- [ ] Leagues & Ranking ELO
- [ ] Paiements Stripe (gifts réels)
- [ ] API publique
- [ ] Modération IA avancée

---

## 📈 Métriques de Performance

### Objectifs

- **LCP** (Largest Contentful Paint) : < 2.5s
- **FID** (First Input Delay) : < 100ms
- **CLS** (Cumulative Layout Shift) : < 0.1
- **TTI** (Time to Interactive) : < 3.5s

### Optimisations Appliquées

- Throttling tension updates (300ms)
- Optimistic UI (feedback immédiat)
- Lazy loading composants
- Image optimization (next/image)
- Code splitting automatique (Next.js)
- Supabase connection pooling

---

## 🔐 Sécurité

### Implémenté

- Environment variables pour secrets
- Supabase RLS (policies à configurer)
- XSS prevention (sanitization basique)
- HTTPS/SSL (en production)

### À Implémenter

- Rate limiting (middleware)
- CSRF tokens
- Content Security Policy
- Input validation stricte
- Audit logs

---

## 💰 Modèle de Monétisation

### Placeholders Implémentés

1. **Gifts Virtuels** : 4 types (10-100 points)
2. **Boost Theme** : Modal simulé
3. **PPV Access** : Wall pour rooms premium

### Intégrations Futures

- Stripe pour paiements réels
- Système de crédits/tokens
- Abonnements premium (host features)
- Sponsorship ads dans débats publics

---

## 🎓 Apprentissage & Ressources

### Technologies à Maîtriser

- **Next.js 14** : App Router, Server Components
- **Supabase** : Realtime, RLS, Auth
- **TypeScript** : Types avancés, Generics
- **Framer Motion** : Animations complexes
- **Tailwind** : Utility-first CSS

### Docs Recommandées

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [OpenAI API](https://platform.openai.com/docs)

---

## 🎯 Quick Start

```bash
# 1. Installation
npm install

# 2. Configuration
cp .env.local.example .env.local
# Éditez .env.local avec vos clés Supabase/OpenAI

# 3. Setup DB
# Exécutez lib/supabase/schema.sql dans Supabase SQL Editor

# 4. Lancer
npm run dev

# Ouvrez http://localhost:3000
```

---

## 🐛 Debugging Tips

### Tension Meter ne sync pas
- Vérifiez la fonction RPC `increment_tension` dans Supabase
- Vérifiez Realtime activé sur table `rooms`

### Fact-check retourne toujours mock
- Normal sans `OPENAI_API_KEY` configurée
- Ajoutez la clé dans `.env.local`

### Chat ne s'affiche pas
- Vérifiez RLS policies sur table `messages`
- Vérifiez channel subscription dans console

---

## 📞 Support

- **GitHub Issues** : [Lien vers repo]
- **Documentation** : Ce dossier + `/docs`
- **Email** : team@arena-vs.com

---

## 🏆 Crédits

**Développé par** : [Votre nom/équipe]  
**Stack** : Next.js, Supabase, OpenAI  
**Inspiration** : TikTok Live, X Spaces, Jubilee  
**License** : [À définir]

---

**Version** : 0.1.0  
**Dernière mise à jour** : 4 février 2026  
**Status** : MVP fonctionnel ✅
