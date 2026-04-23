/**
 * Identité des participants Daily ↔ profils Supabase (beef_participants / users).
 * - userData.arenaUserId : alignement fort (UUID uniquement, côté client issu de la session).
 * - Noms : normalisation pour limiter les faux négatifs sans ouvrir des matchs arbitraires.
 */

export const ARENA_USER_DATA_KEY = 'arenaUserId' as const;

/** UUID RFC (versions 1–8), rejet des chaînes arbitraires dans userData. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidArenaUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Identité arena : priorité au `user_id` Daily issu d’un meeting token serveur (UUID),
 * sinon userData client (rétrocompat / secours).
 */
export function extractArenaUserIdFromDailyParticipant(p: {
  user_id?: string;
  userData?: unknown;
}): string | null {
  const uidRaw = typeof p.user_id === 'string' ? p.user_id.trim() : '';
  if (uidRaw && isValidArenaUserId(uidRaw)) return uidRaw.toLowerCase();
  return parseTrustedArenaUserId(p.userData);
}

export function parseTrustedArenaUserId(userData: unknown): string | null {
  if (userData === null || userData === undefined || typeof userData !== 'object') return null;
  const raw = (userData as Record<string, unknown>)[ARENA_USER_DATA_KEY];
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!isValidArenaUserId(t)) return null;
  return t.toLowerCase();
}

export function normalizeParticipantLabel(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('und');
}

/**
 * Alias normalisés pour rapprocher user_name Daily de users.display_name / username.
 */
export function buildParticipantAliasSet(
  displayName: string | null | undefined,
  username: string | null | undefined,
  fallbackLabel: string,
): string[] {
  const dn = (displayName ?? '').trim();
  const un = (username ?? '').trim();
  const out = new Set<string>();
  const add = (s: string) => {
    const n = normalizeParticipantLabel(s);
    if (n) out.add(n);
  };
  add(dn);
  add(un);
  if (dn && un) {
    add(`${dn} ${un}`);
    add(`${un} ${dn}`);
  }
  const primary = dn || un;
  if (primary) add(primary);
  const genericParticipant = normalizeParticipantLabel('Participant');
  const fbNorm = normalizeParticipantLabel(fallbackLabel);
  if (dn || un) {
    add(fallbackLabel);
  } else if (fbNorm && fbNorm !== genericParticipant) {
    add(fallbackLabel);
  }
  return [...out];
}

/** Métadonnées beef_participants + alias pour rapprochement Daily. */
export interface BeefParticipantRowMeta {
  role: string;
  name: string;
  matchAliases: string[];
}

/**
 * Remote Daily correspond au médiateur (présence / grâce).
 * Défense anti-null : `mediatorUserId` peut être null/vide en Manifeste orphelin
 * (beefs.mediator_id = NULL). On considère alors qu'aucun remote ne peut être
 * « médiateur » — comportement souhaité.
 */
export function remoteMatchesMediator(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string | null | undefined,
  mediatorDisplayName: string | null | undefined,
): boolean {
  const mid = (mediatorUserId ?? '').trim().toLowerCase();
  if (!mid) return false;
  if (remote.arenaUserId && remote.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName ?? '');
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

/**
 * Remote = challenger (ou témoin) attendu dans beef_participants, pas le médiateur.
 * Priorité : arenaUserId (UUID validé côté join) puis alias de profil uniquement pour les user_id connus.
 * Défense anti-null : `mediatorUserId` peut être null/vide en Manifeste orphelin.
 */
export function matchRemoteToExpectedBeefParticipant(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string | null | undefined,
  mediatorDisplayName: string | null | undefined,
  roles: Record<string, BeefParticipantRowMeta>,
): { userId: string; role: string } | null {
  const mid = (mediatorUserId ?? '').trim().toLowerCase();
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName ?? '');

  if (mid) {
    if (remote.arenaUserId && remote.arenaUserId === mid) return null;
    if (nu && mn && nu === mn) return null;
  }

  if (remote.arenaUserId && remote.arenaUserId !== mid) {
    const row = roles[remote.arenaUserId];
    if (row) return { userId: remote.arenaUserId, role: row.role };
  }
  if (!nu) return null;
  for (const [uid, meta] of Object.entries(roles)) {
    if (mid && uid === mid) continue;
    if (meta.matchAliases.includes(nu)) return { userId: uid, role: meta.role };
  }
  return null;
}

export function buildDailyJoinUserData(arenaUserId: string | null | undefined): Record<string, string> | undefined {
  if (!arenaUserId || !isValidArenaUserId(arenaUserId)) return undefined;
  return { [ARENA_USER_DATA_KEY]: arenaUserId.trim().toLowerCase() };
}
