# 📦 Documentation des Nouveaux Composants

## Table des Matières
1. [ReactionButtons](#reactionbuttons)
2. [ReactionOverlay](#reactionoverlay)
3. [PointsDisplay](#pointsdisplay)
4. [Leaderboard](#leaderboard)
5. [LivePoll](#livepoll)
6. [PredictionSystem](#predictionsystem)
7. [ClipButton](#clipbutton)
8. [SpectacleMode](#spectaclemode)
9. [ComboCounter](#combocounter)
10. [StreakBadge](#streakbadge)
11. [usePointsSystem](#usepointssystem-hook)

---

## ReactionButtons

### Description
Boutons pour envoyer des réactions rapides (émojis) sur le stream.

### Props
```typescript
interface ReactionButtonsProps {
  onReaction: (emoji: string) => void;
  disabled?: boolean;
}
```

### Utilisation
```tsx
<ReactionButtons 
  onReaction={(emoji) => handleReaction(emoji)}
  disabled={false}
/>
```

### Réactions Disponibles
- 🔥 Fire
- 👏 Applause
- 😂 LOL
- 😱 Shocked
- 💀 Dead
- 💯 100
- 👀 Eyes
- 🎯 Target

---

## ReactionOverlay

### Description
Overlay qui affiche les réactions animées sur l'écran.

### Props
```typescript
interface Reaction {
  id: string;
  emoji: string;
  x: number;
  y: number;
  timestamp: number;
}

interface ReactionOverlayProps {
  reactions: Reaction[];
}
```

### Utilisation
```tsx
const [reactions, setReactions] = useState<Reaction[]>([]);

<ReactionOverlay reactions={reactions} />
```

### Comportement
- Animation de 2 secondes
- Monte et s'agrandit
- Disparaît automatiquement

---

## PointsDisplay

### Description
Affiche les points de l'utilisateur avec une icône de pièce.

### Props
```typescript
interface PointsDisplayProps {
  points: number;
  userName: string;
  compact?: boolean;
}
```

### Utilisation
```tsx
// Mode compact (petit badge)
<PointsDisplay points={1000} userName="User123" compact />

// Mode complet
<PointsDisplay points={1000} userName="User123" />
```

### Variantes
- **Compact** : Badge rond avec icône + nombre
- **Complet** : Carte avec nom + points

---

## Leaderboard

### Description
Tableau de classement des meilleurs débatteurs.

### Props
```typescript
interface LeaderboardProps {
  roomId?: string;
  limit?: number;
}
```

### Utilisation
```tsx
<Leaderboard roomId="room_123" limit={10} />
```

### Fonctionnalités
- 2 onglets : Points / Victoires
- Top 3 avec icônes spéciales
- Affichage des streaks
- Animations d'entrée

---

## LivePoll

### Description
Sondage en temps réel avec barres de progression.

### Props
```typescript
interface PollOption {
  id: string;
  text: string;
  votes: number;
  color: string;
}

interface LivePollProps {
  question: string;
  options: PollOption[];
  onVote: (optionId: string) => void;
  hasVoted?: boolean;
  timeRemaining?: number;
  totalVotes: number;
}
```

### Utilisation
```tsx
<LivePoll
  question="Qui gagne ce débat ?"
  options={[
    { id: '1', text: 'Host', votes: 45, color: '#3b82f6' },
    { id: '2', text: 'Challenger', votes: 32, color: '#ef4444' }
  ]}
  onVote={(id) => handleVote(id)}
  hasVoted={false}
  timeRemaining={60}
  totalVotes={77}
/>
```

### États
- **Avant vote** : Boutons cliquables
- **Après vote** : Pourcentages affichés
- **Timer** : Compte à rebours optionnel

---

## PredictionSystem

### Description
Système de paris avec cotes et gains potentiels.

### Props
```typescript
interface Prediction {
  id: string;
  question: string;
  options: PredictionOption[];
  status: 'active' | 'locked' | 'resolved';
  userPrediction?: string;
  pointsWagered?: number;
}

interface PredictionOption {
  id: string;
  text: string;
  odds: number;
  totalPoints: number;
  color: string;
}

interface PredictionSystemProps {
  prediction: Prediction;
  userPoints: number;
  onPredict: (optionId: string, points: number) => void;
}
```

### Utilisation
```tsx
<PredictionSystem
  prediction={{
    id: '1',
    question: "Qui va gagner ?",
    options: [
      { id: '1', text: 'Host', odds: 1.5, totalPoints: 5000, color: '#3b82f6' },
      { id: '2', text: 'Challenger', odds: 2.5, totalPoints: 3000, color: '#ef4444' }
    ],
    status: 'active'
  }}
  userPoints={1000}
  onPredict={(optionId, points) => handlePredict(optionId, points)}
/>
```

### Fonctionnalités
- Slider pour choisir le montant
- Boutons rapides : 100, 500, 1000, MAX
- Calcul automatique du gain potentiel
- 3 statuts : active, locked, resolved

---

## ClipButton

### Description
Bouton pour créer un clip de 30 secondes.

### Props
```typescript
interface ClipButtonProps {
  onCreateClip: () => Promise<string>;
  disabled?: boolean;
}
```

### Utilisation
```tsx
<ClipButton 
  onCreateClip={async () => {
    // Logique de création de clip
    await new Promise(resolve => setTimeout(resolve, 1500));
    return 'https://example.com/clip/123';
  }}
/>
```

### États
- **Défaut** : "CRÉER CLIP (30s)"
- **Création** : "CRÉATION..." + spinner
- **Succès** : "CLIP CRÉÉ !" + bouton partage

---

## SpectacleMode

### Description
Effets visuels spectaculaires pour le mode chaos.

### Props
```typescript
interface SpectacleModeProps {
  isChaosMode: boolean;
  tension: number;
}
```

### Utilisation
```tsx
<SpectacleMode 
  isChaosMode={tension >= 100} 
  tension={tension} 
/>
```

### Effets
- **Mode Chaos** :
  - Vignette rouge
  - Particules animées
  - Effets d'éclairs
  - Alerte centrale
- **Gradient de tension** : Progressif selon le niveau

---

## ComboCounter

### Description
Affiche un compteur de combo pour actions répétées.

### Props
```typescript
interface ComboCounterProps {
  combo: number;
  show: boolean;
}
```

### Utilisation
```tsx
<ComboCounter combo={5} show={comboCount >= 2} />
```

### Niveaux
- **2-4** : Bleu, taille moyenne
- **5-9** : Jaune, grande taille
- **10+** : Orange, très grande taille

---

## StreakBadge

### Description
Badge pour afficher les séries de victoires.

### Props
```typescript
interface StreakBadgeProps {
  streak: number;
  compact?: boolean;
}
```

### Utilisation
```tsx
// Compact
<StreakBadge streak={7} compact />

// Complet
<StreakBadge streak={7} />
```

### Couleurs par Niveau
- **1-4** : Jaune
- **5-9** : Jaune-Orange
- **10+** : Orange-Rouge (avec animation pulse)

---

## usePointsSystem (Hook)

### Description
Hook personnalisé pour gérer le système de points.

### Signature
```typescript
function usePointsSystem(options: {
  userId: string;
  roomId: string;
  initialPoints?: number;
}): {
  points: number;
  pointsEarned: number;
  addPoints: (amount: number, reason?: string) => void;
  spendPoints: (amount: number, reason?: string) => boolean;
  hasEnoughPoints: (amount: number) => boolean;
}
```

### Utilisation
```tsx
const { 
  points, 
  pointsEarned,
  addPoints, 
  spendPoints, 
  hasEnoughPoints 
} = usePointsSystem({
  userId: 'user_123',
  roomId: 'room_456',
  initialPoints: 1000,
});

// Ajouter des points
addPoints(10, 'Réaction envoyée');

// Dépenser des points
const success = spendPoints(50, 'Gift acheté');
if (!success) {
  alert('Pas assez de points !');
}

// Vérifier le solde
if (hasEnoughPoints(100)) {
  // Autoriser l'action
}
```

### Fonctionnalités
- **Gain passif** : 10 points/minute automatique
- **Console logs** : Affiche les transactions
- **Validation** : Vérifie le solde avant dépense

---

## 🎨 Styles et Animations

Tous les composants utilisent :

### Bibliothèques
- **Framer Motion** : Pour les animations fluides
- **Tailwind CSS** : Pour le styling
- **Lucide React** : Pour les icônes

### Classes CSS Personnalisées
```css
.neon-blue { /* Effet néon bleu */ }
.neon-purple { /* Effet néon violet */ }
.arena-blue { /* Bleu de l'arène */ }
.arena-red { /* Rouge de l'arène */ }
.arena-purple { /* Violet de l'arène */ }
.arena-dark { /* Fond sombre */ }
.arena-darker { /* Fond très sombre */ }
.arena-gray { /* Gris de l'arène */ }
```

---

## 📝 Exemple d'Intégration Complète

```tsx
'use client';

import { useState } from 'react';
import { ReactionButtons } from '@/components/ReactionButtons';
import { ReactionOverlay } from '@/components/ReactionOverlay';
import { PointsDisplay } from '@/components/PointsDisplay';
import { Leaderboard } from '@/components/Leaderboard';
import { LivePoll } from '@/components/LivePoll';
import { PredictionSystem } from '@/components/PredictionSystem';
import { ClipButton } from '@/components/ClipButton';
import { SpectacleMode } from '@/components/SpectacleMode';
import { usePointsSystem } from '@/hooks/usePointsSystem';

export default function ArenaPage() {
  const { points, addPoints, spendPoints } = usePointsSystem({
    userId: 'user_123',
    roomId: 'room_456',
  });

  const [reactions, setReactions] = useState([]);

  const handleReaction = (emoji: string) => {
    const newReaction = {
      id: Date.now().toString(),
      emoji,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      timestamp: Date.now(),
    };
    
    setReactions(prev => [...prev, newReaction]);
    addPoints(1, 'Réaction');
    
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 2000);
  };

  return (
    <div className="relative h-screen">
      {/* Points */}
      <PointsDisplay points={points} userName="User123" compact />
      
      {/* Reactions */}
      <ReactionButtons onReaction={handleReaction} />
      <ReactionOverlay reactions={reactions} />
      
      {/* Other components... */}
    </div>
  );
}
```

---

## 🔧 Configuration TypeScript

Tous les composants sont **typés** avec TypeScript pour :
- Autocomplétion dans votre IDE
- Détection d'erreurs
- Documentation inline

---

## 📚 Ressources

- [Framer Motion Docs](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)

---

**Besoin d'aide ?** Consultez les exemples dans `app/arena/[roomId]/page.tsx` ! 🚀
