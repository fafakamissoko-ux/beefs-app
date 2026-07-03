export interface GiftItem {
  id: string;
  label: string;
  emoji: string;
  cost: number;
}

export const GIFT_CATALOG: GiftItem[] = [
  { id: 'salt', label: 'Sel', emoji: '🧂', cost: 1 },
  { id: 'mic_drop', label: 'Mic Drop', emoji: '🎤', cost: 5 },
  { id: 'spicy', label: 'Spicy', emoji: '🌶️', cost: 10 },
  { id: 'big_brain', label: 'Big Brain', emoji: '🧠', cost: 25 },
  { id: 'lightning', label: 'Foudre', emoji: '⚡', cost: 50 },
  { id: 'ko', label: 'K.O.', emoji: '🥊', cost: 99 },
  { id: 'banger', label: 'Banger', emoji: '💣', cost: 199 },
  { id: 'wolf', label: 'Loup', emoji: '🐺', cost: 500 },
  { id: 'meteor', label: 'Météore', emoji: '☄️', cost: 1000 },
  { id: 'volcano', label: 'Éruption', emoji: '🌋', cost: 2500 },
  { id: 'champion', label: 'Champion', emoji: '🏆', cost: 5000 },
  { id: 'goat', label: 'G.O.A.T', emoji: '🐐', cost: 10000 },
];
