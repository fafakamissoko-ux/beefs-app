import { Crown } from 'lucide-react';
import { motion } from 'framer-motion';

interface PremiumBadgeProps {
  user: {
    isPremium: boolean;
    settings?: {
      showPremiumBadge?: boolean;
    };
  };
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export function PremiumBadge({ user, size = 'md', animated = false }: PremiumBadgeProps) {
  // Don't show if user is not premium
  if (!user.isPremium) return null;
  
  // Don't show if user has disabled the badge in settings
  if (user.settings?.showPremiumBadge === false) return null;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  const iconSizes = {
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const Badge = (
    <span
      className={`
        inline-flex items-center gap-1
        bg-gradient-to-r from-yellow-400 to-brand-400
        text-black font-bold rounded
        ${sizeClasses[size]}
      `}
    >
      <Crown className={iconSizes[size]} />
      PREMIUM
    </span>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      >
        {Badge}
      </motion.div>
    );
  }

  return Badge;
}

interface PremiumAvatarFrameProps {
  user: {
    isPremium: boolean;
    settings?: {
      showPremiumFrame?: boolean;
    };
  };
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function PremiumAvatarFrame({ user, children, size = 'md' }: PremiumAvatarFrameProps) {
  const shouldShowFrame = user.isPremium && user.settings?.showPremiumFrame !== false;

  const ringClasses = {
    sm: 'ring-1 ring-yellow-400 ring-offset-1',
    md: 'ring-2 ring-yellow-400 ring-offset-2',
    lg: 'ring-2 ring-yellow-400 ring-offset-2',
  };

  return (
    <div className={`relative rounded-full ${shouldShowFrame ? `${ringClasses[size]} ring-offset-black` : ''}`}>
      {children}
    </div>
  );
}
