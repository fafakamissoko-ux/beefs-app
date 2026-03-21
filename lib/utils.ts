/**
 * Utility functions for Arena VS
 */

/**
 * Format a timestamp to relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  if (diffHours < 24) return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`;
  if (diffDays < 7) return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  
  return past.toLocaleDateString('fr-FR');
}

/**
 * Validate if a string is a valid URL
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Generate a random user avatar URL
 */
export function generateAvatarUrl(userId: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
}

/**
 * Calculate tension level color class
 */
export function getTensionColorClass(tension: number): string {
  if (tension >= 80) return 'text-arena-red';
  if (tension >= 50) return 'text-arena-purple';
  return 'text-arena-blue';
}

/**
 * Calculate tension level gradient
 */
export function getTensionGradient(tension: number): string {
  if (tension >= 80) return 'from-arena-red to-arena-purple';
  if (tension >= 50) return 'from-arena-purple to-arena-blue';
  return 'from-arena-blue to-arena-purple';
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Format number with K/M suffix
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate random room title
 */
export function generateRoomTitle(): string {
  const topics = [
    'Tech vs Vie Privée',
    'Capitalisme vs Socialisme',
    'IA : Menace ou Opportunité',
    'Crypto : Révolution ou Arnaque',
    'Télétravail vs Bureau',
    'Éducation Classique vs Alternative',
    'Réseaux Sociaux : Bien ou Mal',
    'Voiture Électrique vs Thermique',
  ];
  
  return topics[Math.floor(Math.random() * topics.length)];
}

/**
 * Check if user is host
 */
export function isUserHost(userId: string, hostId: string): boolean {
  return userId === hostId;
}

/**
 * Calculate debate duration
 */
export function calculateDuration(startTime: string): string {
  const now = new Date();
  const start = new Date(startTime);
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins} min`;
  
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Get verdict emoji
 */
export function getVerdictEmoji(verdict: string): string {
  const emojis: Record<string, string> = {
    true: '✅',
    false: '❌',
    misleading: '⚠️',
    'needs-context': '💡',
  };
  return emojis[verdict] || '❓';
}

/**
 * Sanitize chat message (basic XSS prevention)
 */
export function sanitizeMessage(message: string): string {
  return message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
