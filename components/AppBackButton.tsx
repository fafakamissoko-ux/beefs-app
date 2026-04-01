'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { navigateSmartBack } from '@/lib/navigation-return';

type AppBackButtonProps = {
  /** Si aucun retour fiable (historique, from, session), navigation ici (défaut : feed). */
  fallback?: string;
  className?: string;
  label?: string;
};

/**
 * Retour in-app : priorité `?from=` → session (NavigationReturnTracker) → historique → fallback.
 */
export function AppBackButton({
  fallback = '/feed',
  className = '',
  label = 'Retour',
}: AppBackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    navigateSmartBack(router, fallback);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label === 'Retour' ? 'Retour à la page précédente' : `${label} — retour`}
      className={`inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4 shrink-0 text-gray-500" aria-hidden />
      <span className="font-semibold">{label}</span>
    </button>
  );
}
