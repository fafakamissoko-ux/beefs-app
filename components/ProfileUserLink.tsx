'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { hrefWithFrom } from '@/lib/navigation-return';

const BLOCKED = new Set(['unknown', 'anonyme', 'utilisateur', '?']);

function isRouteUsername(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  const t = value.trim();
  if (!t || BLOCKED.has(t.toLowerCase())) return false;
  // Évite les URLs profil basées sur un display name (ex. « Jean Dupont ») — utiliser `host_username` connu.
  if (/\s/.test(t)) return false;
  return true;
}

function canArenaProfileLookup(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  const t = value.trim();
  if (!t || BLOCKED.has(t.toLowerCase())) return false;
  return true;
}

export type ProfileUserLinkProps = {
  /** Identifiant de route : vrai `username` en base (pas le display name seul, sauf mode arène). */
  username: string | null | undefined;
  /** Texte affiché ; défaut : `username`. */
  children?: ReactNode;
  className?: string;
  /**
   * Live / arène : pas de navigation — le parent appelle `openProfile` avec ce libellé (pseudo ou nom affiché).
   */
  onArenaProfileClick?: (displayOrUsername: string) => void;
  /** Préfixe aria / title */
  profileLabel?: string;
};

/**
 * Rend un lien vers `/profile/[username]` (ou `/profile` si c’est toi).
 * Sans username valide → texte inerte.
 */
export function ProfileUserLink({
  username,
  children,
  className = '',
  onArenaProfileClick,
  profileLabel,
}: ProfileUserLinkProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const viewerUsername = (user?.user_metadata?.username as string | undefined)?.trim() || null;
  const display = children ?? username ?? '';

  if (onArenaProfileClick) {
    if (!canArenaProfileLookup(username)) {
      return <span className={className}>{display}</span>;
    }
    const q = username.trim();
    const label = profileLabel ?? `Profil de ${display}`;
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onArenaProfileClick(q);
        }}
        className={`relative z-[1] inline max-w-full truncate bg-transparent p-0 text-left font-inherit text-inherit border-0 cursor-pointer hover:underline hover:decoration-white/40 underline-offset-2 ${className}`}
      >
        {display}
      </button>
    );
  }

  if (!isRouteUsername(username)) {
    return <span className={className}>{display}</span>;
  }

  const u = username.trim();
  const isSelf = viewerUsername && viewerUsername.toLowerCase() === u.toLowerCase();
  const label = profileLabel ?? (isSelf ? 'Mon profil' : `Profil de ${display}`);

  const href = isSelf ? hrefWithFrom('/profile', pathname) : hrefWithFrom(`/profile/${encodeURIComponent(u)}`, pathname);

  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`relative z-[1] inline max-w-full truncate hover:underline hover:decoration-white/40 underline-offset-2 ${className}`}
    >
      {display}
    </Link>
  );
}
