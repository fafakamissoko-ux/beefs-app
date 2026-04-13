'use client';

import type { StatsShortcuts } from '@/lib/profile-stats-shortcuts';

type Key = keyof StatsShortcuts;

const ROWS: { key: Key; title: string; hint: string }[] = [
  { key: 'participations', title: 'Participations', hint: 'Permet d’accéder à la liste de tes débats en un clic.' },
  { key: 'mediations', title: 'Médiations', hint: 'Raccourci vers les beefs que tu animes.' },
  { key: 'followers', title: 'Abonnés', hint: 'Ouvre la liste de tes abonnés.' },
  { key: 'following', title: 'Abonnements', hint: 'Ouvre la liste des profils que tu suis.' },
];

type Props = {
  value: StatsShortcuts;
  onChange: (key: Key, next: boolean) => void;
};

/**
 * Interrupteurs type « réglages iOS » pour les raccourcis stats (moins « formulaire admin »).
 */
export function StatShortcutToggles({ value, onChange }: Props) {
  return (
    <div className="rounded-[2rem] border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-transparent p-4 sm:p-5">
      <div className="mb-4">
        <p className="text-white font-semibold text-sm">Liens sur les chiffres</p>
        <p className="text-gray-500 text-xs mt-1 leading-relaxed">
          Sur ton profil public, tu choisis quels nombres restent décoratifs ou deviennent des raccourcis pour les visiteurs.
        </p>
      </div>
      <ul className="divide-y divide-white/[0.06]">
        {ROWS.map(({ key, title, hint }) => {
          const checked = value[key];
          return (
            <li key={key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">{title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-snug">{hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={`${checked ? 'Désactiver' : 'Activer'} le lien pour ${title}`}
                onClick={() => onChange(key, !checked)}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                  checked
                    ? 'border-brand-500/50 bg-brand-500/90 shadow-[0_0_16px_-4px_rgba(232,58,20,0.45)]'
                    : 'border-white/15 bg-white/[0.08]'
                }`}
              >
                <span
                  className={`pointer-events-none absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-glow transition-transform duration-200 ease-out ${
                    checked ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
