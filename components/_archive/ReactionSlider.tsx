'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Smile, Plus } from 'lucide-react';

interface ReactionSliderProps {
  onReaction: (emoji: string) => void;
  disabled?: boolean;
}

// 🔥 RÉACTIONS POPULAIRES (mises en avant)
const POPULAR_REACTIONS = [
  '👍', '👎', '😂', '🔥', '💯', '👏', '🤔', '😮', '💀', 
  '🎯', '⚡', '💪', '🧠', '👀', '🤯', '😡', '❤️', '🎉', 
  '🙌', '💎', '🌟', '✨', '🚀', '💥'
];

// 📦 TOUTES LES CATÉGORIES D'EMOJIS
const EMOJI_CATEGORIES = {
  smileys: {
    name: '😀 Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚',
      '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
      '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
      '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯',
      '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
      '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡',
      '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺'
    ]
  },
  gestures: {
    name: '👋 Gestes',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂'
    ]
  },
  hearts: {
    name: '❤️ Cœurs',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'
    ]
  },
  animals: {
    name: '🐶 Animaux',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒',
      '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇',
      '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜',
      '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑'
    ]
  },
  food: {
    name: '🍕 Nourriture',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
      '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔',
      '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈',
      '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟',
      '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘',
      '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪'
    ]
  },
  sports: {
    name: '⚽ Sports',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷'
    ]
  },
  travel: {
    name: '✈️ Voyages',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟',
      '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇',
      '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🚁', '🛰️', '🚀'
    ]
  },
  objects: {
    name: '💎 Objets',
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️',
      '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥',
      '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️',
      '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋',
      '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴',
      '💶', '💷', '🪙', '💰', '💳', '🧾', '💎', '⚖️', '🪜', '🧰'
    ]
  },
  symbols: {
    name: '⚡ Symboles',
    emojis: [
      '💯', '🔥', '⚡', '💥', '✨', '🌟', '⭐', '💫', '🔴', '🟠',
      '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪', '🟥', '🟧', '🟨',
      '🟩', '🟦', '🟪', '🟫', '⬛', '⬜', '◼️', '◻️', '◾', '◽',
      '▪️', '▫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘',
      '🔳', '🔲', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️'
    ]
  },
  flags: {
    name: '🇫🇷 Drapeaux',
    emojis: [
      '🇫🇷', '🇺🇸', '🇬🇧', '🇩🇪', '🇮🇹', '🇪🇸', '🇵🇹', '🇧🇷', '🇲🇽', '🇨🇦',
      '🇦🇷', '🇨🇱', '🇨🇴', '🇻🇪', '🇵🇪', '🇨🇳', '🇯🇵', '🇰🇷', '🇮🇳', '🇷🇺',
      '🇹🇷', '🇸🇦', '🇦🇪', '🇪🇬', '🇿🇦', '🇳🇬', '🇰🇪', '🇲🇦', '🇸🇳', '🇨🇮'
    ]
  }
};

export function ReactionSlider({ onReaction, disabled = false }: ReactionSliderProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('smileys');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 200;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleEmojiClick = (emoji: string) => {
    onReaction(emoji);
    setShowEmojiPicker(false);
  };

  return (
    <>
      <div className="w-full bg-arena-dark/95 backdrop-blur-sm border-t border-arena-gray py-1.5 sm:py-2 px-2 sm:px-3">
        <div className="flex items-center gap-1.5 sm:gap-2 max-w-7xl mx-auto">
          {/* Scroll Left Button */}
          <button
            onClick={() => scroll('left')}
            className="hidden sm:flex flex-shrink-0 p-2 bg-arena-darker hover:bg-purple-500/20 border border-arena-gray hover:border-purple-500/50 rounded-lg transition-all"
            aria-label="Faire défiler à gauche"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Popular Reactions Container */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-x-auto hide-scrollbar"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="flex gap-1.5 sm:gap-2 px-1 sm:px-2">
              {POPULAR_REACTIONS.map((emoji, index) => (
                <motion.button
                  key={`${emoji}-${index}`}
                  onClick={() => !disabled && onReaction(emoji)}
                  disabled={disabled}
                  whileHover={!disabled ? { scale: 1.15, rotate: 5 } : {}}
                  whileTap={!disabled ? { scale: 0.85 } : {}}
                  className={`flex-shrink-0 w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center text-2xl sm:text-3xl bg-arena-darker border border-arena-gray rounded-lg transition-all touch-manipulation ${
                    disabled 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-purple-500/20 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/20 active:scale-95 active:bg-purple-500/30'
                  }`}
                  title={`Réaction ${emoji}`}
                >
                  {emoji}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Scroll Right Button */}
          <button
            onClick={() => scroll('right')}
            className="hidden sm:flex flex-shrink-0 p-2 bg-arena-darker hover:bg-purple-500/20 border border-arena-gray hover:border-purple-500/50 rounded-lg transition-all"
            aria-label="Faire défiler à droite"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* "Plus" Button - Open Full Emoji Picker */}
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`flex-shrink-0 p-2 sm:p-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border border-orange-400 rounded-lg transition-all shadow-lg ${
              showEmojiPicker ? 'ring-2 ring-orange-400' : ''
            }`}
            aria-label="Ouvrir sélecteur d'emojis"
          >
            {showEmojiPicker ? <Smile className="w-4 h-4 sm:w-5 sm:h-5" /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </div>
      </div>

      {/* Full Emoji Picker Modal */}
      <AnimatePresence>
        {showEmojiPicker && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
              onClick={() => setShowEmojiPicker(false)}
            />

            {/* Emoji Picker Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95vw] sm:w-[600px] max-h-[70vh] bg-gray-900 rounded-xl border-2 border-orange-500/50 shadow-2xl z-[101] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-3 border-b border-gray-700 bg-gradient-to-r from-orange-500/10 to-red-500/10">
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Smile className="w-5 h-5" />
                  Toutes les réactions
                </h3>
              </div>

              {/* Category Tabs */}
              <div className="flex gap-1 p-2 border-b border-gray-700 overflow-x-auto hide-scrollbar bg-gray-800/50">
                {Object.entries(EMOJI_CATEGORIES).map(([key, category]) => (
                  <button
                    key={key}
                    onClick={() => setActiveCategory(key as keyof typeof EMOJI_CATEGORIES)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                      activeCategory === key
                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Emoji Grid */}
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-8 sm:grid-cols-10 gap-2">
                  {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
                    <motion.button
                      key={`${emoji}-${index}`}
                      onClick={() => handleEmojiClick(emoji)}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center text-2xl sm:text-3xl bg-gray-800 hover:bg-purple-500/20 border border-gray-700 hover:border-purple-500/50 rounded-lg transition-all"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-gray-700 bg-gray-800/50">
                <button
                  onClick={() => setShowEmojiPicker(false)}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
