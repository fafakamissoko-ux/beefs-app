# Rapport d'audit — Chat Performance (Phase I.1)

**Date d'extraction :** 2026-07-01  
**Branche :** `main` (post favicon `0050e49`)  
**Mission :** Extraction ArenaChatMessages + store Zustand + statut virtualisation avant Phase I.1.  
**Contrainte :** Zéro modification du code source.

---

## Contexte Phase I.1

Objectifs Architecte :
1. Virtualisation DOM du chat live (`ArenaChatMessages`)
2. Politique de rétention mémoire Zustand (cap messages)

---

## 1. Composant Chat — `ArenaChatMessages`

**Emplacement :** `components/TikTokStyleArena.tsx` (l.4286–4348) — **non refactorisé** dans un fichier dédié.

**Montages (2 instances) :**
| Instance | Ligne | Refs scroll | Refs end |
|----------|-------|-------------|----------|
| Desktop | ~3397 | `chatMessagesScrollRef` (l.465) | `chatMessagesEndRef` (l.466) |
| Mobile | ~3539 | `chatMessagesMobileScrollRef` (l.467) | `chatMessagesMobileEndRef` (l.468) |

**Scroll parent (doublon) :** `scrollChatToEnd()` (l.592–608) — même logique rAF double que dans le composant enfant.

**Points d'intérêt Architecte :**
- `useLayoutEffect` sur `[messages]` → scroll forcé bas à chaque message
- `messages.map()` sans clé virtualisée — rendu DOM complet (max 40 nœuds grâce au cap store)
- `scrollRef` sur le conteneur scrollable ; `endRef` sur `<div className="h-px">` sentinel
- Variantes mobile (`isMobile`) vs desktop (bulles glass)

```tsx
// --- COMPOSANTS VOLATILS ZUSTAND ---

export function ArenaChatMessages({
  isMobile,
  scrollRef,
  endRef,
}: {
  isMobile?: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  endRef: React.RefObject<HTMLDivElement>;
}) {
  const messages = useArenaVolatileStore((s) => s.messages);

  useLayoutEffect(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
        endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
      });
    });
  }, [messages, scrollRef, endRef]);

  return (
    <div
      ref={scrollRef}
      className={
        isMobile
          ? 'pointer-events-none w-fit max-w-[85%] min-w-[50%] max-h-[30vh] overflow-y-auto overscroll-contain touch-pan-y px-3 mb-2 flex flex-col hide-scrollbar'
          : 'flex-1 overflow-y-auto pl-2 pr-4 py-2 hide-scrollbar'
      }
    >
      <div className="mt-auto flex flex-col justify-end">
        {messages.map((msg) =>
          isMobile ? (
            <div key={msg.id} className="mb-2 pointer-events-auto w-fit max-w-[70%] leading-tight">
              <span
                className={`text-[11px] font-bold mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${getUsernameColor(msg.user_name)}`}
              >
                {msg.user_name}
              </span>
              <span className="text-[13px] text-white font-medium break-all drop-shadow-md [text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]">
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={msg.id} className="mb-3">
              <span
                className={`block mb-1 ml-2 text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}
              >
                {msg.user_name}
              </span>
              <div className="inline-block rounded-2xl rounded-tl-sm border border-white/10 bg-white/10 px-3 py-2 text-[13px] leading-snug text-white/90 shadow-md">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="h-px w-full" />
      </div>
    </div>
  );
}
```

---

## 2. Store volatil — `lib/stores/arenaVolatileStore.ts`

**Cap messages :** **OUI — déjà en place** (`slice(-40)` dans `addMessage`, l.42).

**Cap réactions :** **OUI — 40 particules** (`slice(-40)` dans `addReaction`, l.54).

**Déduplication :** par `msg.id` avant append (l.40).

```typescript
import { create } from 'zustand';

export interface VisibleMessage {
  id: string;
  user_name: string;
  content: string;
  timestamp: number;
  initial: string;
}

export interface FlyingReaction {
  id: number;
  emoji: string;
  x: number;
  opacityMul: number;
  scaleMul: number;
}

interface ArenaVolatileStore {
  // --- MOTEUR DE CHAT ---
  messages: VisibleMessage[];
  addMessage: (msg: Omit<VisibleMessage, 'timestamp'>) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;

  // --- MOTEUR DE RÉACTIONS ---
  reactions: FlyingReaction[];
  addReaction: (reaction: Omit<FlyingReaction, 'id'>) => void;
  removeReaction: (id: number) => void;
  clearReactions: () => void;
}

let reactionIdSeq = 0;

export const useArenaVolatileStore = create<ArenaVolatileStore>((set) => ({
  // --- ACTIONS CHAT ---
  messages: [],
  addMessage: (msg) => set((state) => {
    // Déduplication stricte pour éviter les fantômes
    if (state.messages.some(m => m.id === msg.id)) return state;
    // Capacité maximale de 40 messages en mémoire pour préserver la RAM
    return { messages: [...state.messages, { ...msg, timestamp: Date.now() }].slice(-40) };
  }),
  deleteMessage: (id) => set((state) => ({
    messages: state.messages.filter(m => m.id !== id)
  })),
  clearMessages: () => set({ messages: [] }),

  // --- ACTIONS RÉACTIONS ---
  reactions: [],
  addReaction: (reaction) => set((state) => {
    const id = ++reactionIdSeq;
    // Limite stricte de 40 particules simultanées à l'écran pour éviter la surcharge GPU
    return { reactions: [...state.reactions, { ...reaction, id }].slice(-40) };
  }),
  removeReaction: (id) => set((state) => ({
    reactions: state.reactions.filter(r => r.id !== id)
  })),
  clearReactions: () => set({ reactions: [] }),
}));
```

---

## 3. Dépendances virtualisation (`package.json`)

| Librairie | Statut |
|-----------|--------|
| `@tanstack/react-virtual` | **Non installée** |
| `react-window` | **Non installée** |
| `react-virtuoso` | **Non installée** |

**Note :** `@tanstack/react-query` est présent — **ne pas confondre** avec `@tanstack/react-virtual`.

**Recommandation I.1 :** ajouter une librairie (ex. `@tanstack/react-virtual` — léger, aligné stack TanStack existante, ou `react-virtuoso` — scroll-to-bottom natif).

---

## Synthèse topographique

| Zone | État actuel | Cible I.1 |
|------|-------------|-----------|
| Cap Zustand messages | **40** (`slice(-40)`) | Vérifier si suffisant ou rendre configurable |
| Rendu DOM | `messages.map` full list (≤40) | Virtualisation fenêtre glissante |
| Scroll auto | Double rAF + `scrollIntoView` (parent + enfant) | Unifier + compat virtualizer |
| Instances chat | Desktop + Mobile (2× DOM) | Virtualiser les deux |
| Lib virtualisation | Absente | Installation requise |

### Risques identifiés pour I.1

1. **Double scroll** : `scrollChatToEnd` (parent) + `useLayoutEffect` (enfant) — redondance à consolider
2. **Cap 40 + virtualisation** : gain DOM limité si cap reste à 40 ; virtualisation utile surtout si cap augmente ou messages longs (hauteur variable)
3. **Extraction fichier** : composant encore dans monolithe `TikTokStyleArena.tsx` (~4375 lignes) — refactor optionnel

---

*Fin du rapport — extraction Phase I.1.*
