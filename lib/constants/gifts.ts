export interface GiftItem {
  id: string;
  label: string;
  emoji: string;
  cost: number;
  messageTemplate: string;
}

export const GIFT_CATALOG: GiftItem[] = [
  { id: 'salt', label: 'Sel', emoji: '🧂', cost: 1, messageTemplate: "Salé ! {sender} régale {recipient}." },
  { id: 'mic_drop', label: 'Mic Drop', emoji: '🎤', cost: 5, messageTemplate: "{sender} valide la punchline de {recipient}." },
  { id: 'spicy', label: 'Spicy', emoji: '🌶️', cost: 10, messageTemplate: "{sender} rajoute du piment pour {recipient}." },
  { id: 'big_brain', label: 'Big Brain', emoji: '🧠', cost: 25, messageTemplate: "{sender} salue le QI de {recipient}." },
  { id: 'lightning', label: 'Foudre', emoji: '⚡', cost: 50, messageTemplate: "{sender} choqué ! {recipient} a foudroyé !!!" },
  { id: 'ko', label: 'K.O.', emoji: '🥊', cost: 99, messageTemplate: "Au tapis ! {sender} consacre la victoire de {recipient}." },
  { id: 'banger', label: 'Banger', emoji: '💣', cost: 199, messageTemplate: "{sender} kiffe ce banger de {recipient}." },
  { id: 'wolf', label: 'Loup', emoji: '🐺', cost: 500, messageTemplate: "{sender} hurle avec {recipient}." },
  { id: 'meteor', label: 'Météore', emoji: '☄️', cost: 1000, messageTemplate: "{sender} appuie la frappe cosmique de {recipient}." },
  { id: 'volcano', label: 'Éruption', emoji: '🌋', cost: 2500, messageTemplate: "Fusion totale ! {sender} annonce une éruption de {recipient}." },
  { id: 'champion', label: 'Champion', emoji: '🏆', cost: 5000, messageTemplate: "{sender} couronne {recipient} Champion !" },
  { id: 'goat', label: 'G.O.A.T', emoji: '🐐', cost: 10000, messageTemplate: "BEHEHEHE !!! de {sender} à {recipient}" },
];
