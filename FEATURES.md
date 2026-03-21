# 🎯 Arena VS - Détails des Fonctionnalités

## 📋 Table des Matières

1. [Tension Meter](#tension-meter)
2. [Système de Chat](#système-de-chat)
3. [File d'Attente des Challengers](#file-dattente-des-challengers)
4. [AI Fact-Checking](#ai-fact-checking)
5. [Système de Gifts](#système-de-gifts)
6. [Architecture Temps Réel](#architecture-temps-réel)

---

## ⚡ Tension Meter

### Concept

Le Tension Meter est une jauge interactive alimentée par les clics de tous les spectateurs en temps réel. C'est l'âme de l'engagement de la plateforme.

### Fonctionnement Technique

#### Client-Side (hooks/useTensionMeter.ts)

```typescript
// État local pour feedback optimiste
const [localTension, setLocalTension] = useState(0);

// Buffer de clics pour agrégation
const clickBuffer = useRef(0);

// Throttling : sync toutes les 300ms
useEffect(() => {
  const interval = setInterval(() => {
    syncToServer(); // Envoie clickBuffer au serveur
  }, throttleMs);
}, []);
```

#### Server-Side (Supabase)

```sql
-- Mise à jour atomique pour éviter race conditions
UPDATE rooms 
SET tension_level = LEAST(100, tension_level + increment)
WHERE id = room_id;
```

#### Decay Automatique

```typescript
// Décroissance naturelle toutes les secondes
setInterval(async () => {
  const newTension = Math.max(0, currentTension - 2);
  await supabase.from('rooms').update({ tension_level: newTension });
}, 1000);
```

### Mode Chaos

Déclenché automatiquement quand `tension >= 100` :

- **Effets Visuels** : Classe CSS `.chaos-mode` avec animation shake
- **Overlay Rouge** : Gradient pulsant rouge/violet
- **Durée** : 5 secondes
- **Reset** : Tension retombe à 50% après le chaos

### Animations

```css
/* Framer Motion spring effect */
animate={{ 
  width: `${tension}%`,
  boxShadow: tension >= 80 
    ? '0 0 30px rgba(255, 0, 85, 0.8)' 
    : '0 0 10px rgba(0, 240, 255, 0.4)'
}}
transition={{ 
  type: 'spring', 
  stiffness: 300, 
  damping: 30 
}}
```

---

## 💬 Système de Chat

### Types de Messages

1. **Chat Normal** : Messages texte standard
2. **Source URL** : Liens partagés (avec icône spéciale)
3. **Fact-Check AI** : Résultats de vérification automatique

### Free Source Pinning

#### Workflow

1. Utilisateur clique sur l'icône **Link** (mode Source activé)
2. Colle une URL dans l'input
3. Message envoyé avec `type: 'source'`
4. Affichage différencié avec bordure bleue et icône LinkIcon

#### Validation AI (Future)

```typescript
// À implémenter : validation de pertinence
const isRelevant = await validateSourceWithAI(url, debateContext);
if (isRelevant) {
  // Pin automatiquement en haut du chat
  await supabase.from('messages').update({ is_pinned: true });
}
```

### Temps Réel

```typescript
// Subscription aux nouveaux messages
const channel = supabase
  .channel(`room_${roomId}_messages`)
  .on('postgres_changes', {
    event: 'INSERT',
    table: 'messages',
  }, (payload) => {
    setMessages(prev => [...prev, payload.new]);
  });
```

---

## 👥 File d'Attente des Challengers

### 1 vs All Logic

- **Host Immunity** : Le `host_id` ne peut pas être expulsé
- **Queue FIFO** : Premier arrivé, premier à challenger
- **One at a Time** : Un seul challenger actif à la fois

### Workflow

#### Rejoindre la Queue

```typescript
const maxPosition = queue.length > 0 ? Math.max(...queue.map(c => c.position)) : 0;

await supabase.from('challenger_queue').insert({
  room_id: roomId,
  user_id: userId,
  position: maxPosition + 1,
  status: 'waiting'
});
```

#### Host Appelle le Prochain

```typescript
const nextChallenger = queue[0];

// 1. Marquer comme actif
await supabase.from('challenger_queue')
  .update({ status: 'active' })
  .eq('id', nextChallenger.id);

// 2. Update room
await supabase.from('rooms')
  .update({ current_challenger_id: nextChallenger.user_id });
```

### UI/UX

- **Position Badge** : Numéro dans la queue (1, 2, 3...)
- **Highlight "Suivant !"** : Premier de la queue en bleu
- **Auto-scroll** : La queue scroll automatiquement vers le nouveau challenger

---

## 🤖 AI Fact-Checking

### Architecture

```
User Audio → Transcription (Whisper) → OpenAI GPT-4o → Fact-Check Card
```

### Format de Réponse AI

```json
{
  "claim": "La déclaration principale extraite",
  "verdict": "true | false | misleading | needs-context",
  "explanation": "Explication courte (2-3 phrases)",
  "sources": ["https://source1.com", "https://source2.com"],
  "timestamp": "2026-02-04T10:30:00Z"
}
```

### Prompting Strategy

```typescript
const systemPrompt = `
Tu es un fact-checker professionnel pour une plateforme de débat en direct.
Analyse la déclaration fournie et détermine sa véracité.
Sois concis, factuel, et cite des sources vérifiables.
Évite le jargon et privilégie la clarté.
`;
```

### Affichage des Résultats

4 types de cartes avec codes couleur :

- **VÉRIFIÉ** (Vert) : CheckCircle2 icon
- **FAUX** (Rouge) : XCircle icon
- **TROMPEUR** (Jaune) : AlertTriangle icon
- **CONTEXTE REQUIS** (Bleu) : AlertTriangle icon

### Auto-Dismiss

```typescript
setTimeout(() => {
  setCurrentCheck(null);
}, 10000); // Disparaît après 10 secondes
```

---

## 🎁 Système de Gifts

### Types de Gifts

| Gift | Icon | Coût | Couleur |
|------|------|------|---------|
| Flamme | 🔥 | 10 pts | Rouge |
| Couronne | 👑 | 50 pts | Jaune |
| Éclair | ⚡ | 25 pts | Bleu |
| Diamant | 💎 | 100 pts | Violet |

### Animation Float

```typescript
// Framer Motion keyframes
initial={{ opacity: 0, scale: 0, x: gift.x + '%', y: gift.y + '%' }}
animate={{ 
  opacity: [0, 1, 1, 0], 
  scale: [0, 1.2, 1.5],
  y: [gift.y + '%', (gift.y - 30) + '%']
}}
transition={{ duration: 2, ease: 'easeOut' }}
```

### Workflow

1. Spectateur clique sur "Offrir Gift"
2. Menu modal avec 4 options
3. Clic sur un gift → Insert en DB
4. Realtime broadcast à tous les clients
5. Animation float sur le destinataire
6. Auto-remove après 2 secondes

### Monétisation Future

```typescript
// Placeholder pour intégration Stripe
const handleGiftPurchase = async (giftType) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: GIFT_PRICES[giftType], quantity: 1 }],
    mode: 'payment',
    success_url: `${DOMAIN}/arena/${roomId}?gift_sent=true`,
  });
  window.location = session.url;
};
```

---

## 🔄 Architecture Temps Réel

### Channels Supabase Utilisés

```typescript
1. room_{id}_tension      // Mise à jour Tension Meter
2. room_{id}_messages     // Chat, Sources, Fact-Checks
3. room_{id}_queue        // File d'attente challengers
4. room_{id}_gifts        // Gifts virtuels
```

### Pattern de Subscription

```typescript
useEffect(() => {
  const channel = supabase
    .channel(`channel_name`)
    .on('postgres_changes', {
      event: 'INSERT',      // ou UPDATE, DELETE, *
      schema: 'public',
      table: 'table_name',
      filter: `room_id=eq.${roomId}`
    }, (payload) => {
      // Traitement en temps réel
      updateLocalState(payload.new);
    })
    .subscribe();

  return () => channel.unsubscribe();
}, [roomId]);
```

### Optimisations Réalisées

1. **Throttling** : Réduction des appels réseau (300ms batches)
2. **Debouncing** : Decay checks espacés (1s)
3. **Optimistic UI** : Feedback immédiat avant confirmation serveur
4. **Atomic Updates** : Fonction RPC pour éviter race conditions
5. **Cleanup** : Unsubscribe systématique dans useEffect return

---

## 📊 Metrics & Analytics (À Implémenter)

### Métriques Clés

```typescript
interface RoomAnalytics {
  total_taps: number;
  peak_tension: number;
  chaos_triggers: number;
  avg_tension: number;
  messages_count: number;
  challengers_total: number;
  gifts_sent: number;
  duration_minutes: number;
  unique_viewers: number;
}
```

### Événements à Tracker

- `room_created`
- `tension_chaos_triggered`
- `challenger_joined_queue`
- `fact_check_requested`
- `gift_sent`
- `source_pinned`

---

## 🔮 Roadmap Technique

### Court Terme (v0.2)

- [ ] Intégration Whisper pour vraie transcription
- [ ] Authentification Supabase Auth
- [ ] Rate limiting sur les taps
- [ ] Modération automatique du chat

### Moyen Terme (v0.3)

- [ ] LiveKit/Agora pour audio/vidéo
- [ ] Système de replay des moments forts
- [ ] Dashboard analytics temps réel
- [ ] Mobile responsive optimisé

### Long Terme (v1.0)

- [ ] Système de leagues et ranking ELO
- [ ] Paiements Stripe pour gifts réels
- [ ] API publique pour intégrations tierces
- [ ] Mode "Jury Panel" (3-5 debaters)

---

**Dernière mise à jour** : 4 février 2026
