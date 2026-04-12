'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Check, Share2 } from 'lucide-react';

interface ClipButtonProps {
  onCreateClip: () => Promise<string>;
  disabled?: boolean;
}

export function ClipButton({ onCreateClip, disabled = false }: ClipButtonProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [clipCreated, setClipCreated] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const handleCreateClip = async () => {
    if (isCreating || disabled) return;

    setIsCreating(true);
    try {
      const url = await onCreateClip();
      setClipUrl(url);
      setClipCreated(true);
      
      // Reset after 3 seconds
      setTimeout(() => {
        setClipCreated(false);
        setIsCreating(false);
      }, 3000);
    } catch (error) {
      console.error('Error creating clip:', error);
      setIsCreating(false);
    }
  };

  const handleShare = () => {
    if (clipUrl) {
      navigator.clipboard.writeText(clipUrl);
      // Could also open share dialog
    }
  };

  return (
    <div className="relative">
      <motion.button
        onClick={handleCreateClip}
        disabled={disabled || isCreating}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm transition-all touch-manipulation ${
          clipCreated
            ? 'bg-green-500 text-white'
            : 'bg-arena-red hover:bg-arena-red/80 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <AnimatePresence mode="wait">
          {clipCreated ? (
            <motion.div
              key="success"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">CLIP CRÉÉ !</span>
              <span className="sm:hidden">✅</span>
            </motion.div>
          ) : isCreating ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">CRÉATION...</span>
            </motion.div>
          ) : (
            <motion.div
              key="default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 sm:gap-2"
            >
              <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">CRÉER CLIP (30s)</span>
              <span className="md:hidden">📹</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Share button appears after clip creation */}
      <AnimatePresence>
        {clipCreated && clipUrl && (
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onClick={handleShare}
            className="absolute -right-12 top-0 bottom-0 flex items-center justify-center w-10 bg-arena-blue hover:bg-arena-blue/80 rounded-lg transition-colors"
            title="Partager"
          >
            <Share2 className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
