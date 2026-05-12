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

/** Remote Daily correspond au médiateur (présence / grâce). */
export function remoteMatchesMediator(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string,
  mediatorDisplayName: string,
): boolean {
  const mid = mediatorUserId.trim().toLowerCase();
  if (remote.arenaUserId && remote.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

/**
 * Remote = challenger (ou témoin) attendu dans beef_participants, pas le médiateur.
 * Priorité : arenaUserId (UUID validé côté join) puis alias de profil uniquement pour les user_id connus.
 */
export function matchRemoteToExpectedBeefParticipant(
  remote: { userName: string; arenaUserId: string | null },
  mediatorUserId: string,
  mediatorDisplayName: string,
  roles: Record<string, BeefParticipantRowMeta>,
): { userId: string; role: string } | null {
  const mid = mediatorUserId.trim().toLowerCase();
  if (remote.arenaUserId && remote.arenaUserId === mid) return null;
  const nu = normalizeParticipantLabel(remote.userName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  if (nu && mn && nu === mn) return null;

  if (remote.arenaUserId && remote.arenaUserId !== mid) {
    const row = roles[remote.arenaUserId];
    if (row) return { userId: remote.arenaUserId, role: row.role };
  }
  if (!nu) return null;
  for (const [uid, meta] of Object.entries(roles)) {
    if (uid === mid) continue;
    if (meta.matchAliases.includes(nu)) return { userId: uid, role: meta.role };
  }
  return null;
}

export function buildDailyJoinUserData(arenaUserId: string | null | undefined): Record<string, string> | undefined {
  if (!arenaUserId || !isValidArenaUserId(arenaUserId)) return undefined;
  return { [ARENA_USER_DATA_KEY]: arenaUserId.trim().toLowerCase() };
}

// ── PhysicalPeer + réconciliation « Tabula Rasa » (Phase 2 — aucun flux détruit) ──

/**
 * Représentation brute d’un pair WebRTC Daily (pistes + identité extraite).
 */
export interface PhysicalPeer {
  sessionId: string;
  /** `user_name` Daily */
  displayName: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  isLocal: boolean;
  arenaUserId: string | null;
  videoTrackState?: string;
  audioTrackState?: string;
}

export interface SemanticIdentity {
  arenaUserId: string | null;
  role: string;
  /** 0…3 grille challengers ; -1 médiateur ; orphelins remplissent les trous */
  expectedSlotIndex: number;
  kind: 'expected' | 'orphan';
}

export interface ReconciledPeer {
  physical: PhysicalPeer;
  semantic: SemanticIdentity;
}

export interface ReconcileExpectedRoles {
  mediatorUserId: string;
  mediatorDisplayName: string;
  challengerUidsOrdered: string[];
  roles: Record<string, BeefParticipantRowMeta>;
}

/** Étiquette UI lorsqu’aucun passeport DB ne matche (flux toujours conservé). */
export const ORPHAN_GUEST_ROLE = 'guest' as const;
export const ORPHAN_GUEST_LABEL = 'Invité';

function isMediatorPeerPhysical(
  p: PhysicalPeer,
  mediatorUserId: string,
  mediatorDisplayName: string,
): boolean {
  const mid = mediatorUserId.trim().toLowerCase();
  if (p.arenaUserId && p.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(p.displayName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

function matchNameToUidPhysical(
  displayName: string,
  mediatorUserId: string,
  roles: Record<string, BeefParticipantRowMeta>,
): string | null {
  const nu = normalizeParticipantLabel(displayName);
  if (!nu) return null;
  const mid = mediatorUserId.trim().toLowerCase();
  for (const [uid, meta] of Object.entries(roles)) {
    if (uid === mid) continue;
    if (meta.matchAliases.includes(nu)) return uid;
  }
  return null;
}

/**
 * Associe chaque flux physique à une identité sémantique.
 * **Règle absolue :** la sortie a **exactement** une entrée par `physicalPeers` (même ordre) —
 * un pair non reconnu n’est **jamais** filtré : il devient `kind: 'orphan'`, `role: 'guest'`, slot libre.
 */
export function reconcilePeers(
  physicalPeers: readonly PhysicalPeer[],
  expected: ReconcileExpectedRoles,
): ReconciledPeer[] {
  const { mediatorUserId, mediatorDisplayName, challengerUidsOrdered, roles } = expected;
  const nSlots = 4;
  const slotUsed: boolean[] = [false, false, false, false];
  const assigned = new Map<string, SemanticIdentity>();
  const needPhysical = [...physicalPeers];

  const takeFirstEmptySlot = (): number => {
    for (let i = 0; i < nSlots; i++) {
      if (!slotUsed[i]) {
        slotUsed[i] = true;
        return i;
      }
    }
    return nSlots - 1;
  };

  const markSlot = (idx: number) => {
    if (idx >= 0 && idx < nSlots) slotUsed[idx] = true;
  };

  /** 1 — Médiateur */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (isMediatorPeerPhysical(p, mediatorUserId, mediatorDisplayName)) {
      const meta = roles[mediatorUserId.trim().toLowerCase()];
      assigned.set(p.sessionId, {
        arenaUserId: mediatorUserId.trim().toLowerCase(),
        role: meta?.role ?? 'mediator',
        expectedSlotIndex: -1,
        kind: 'expected',
      });
    }
  }

  /** 2 — UUID challenger attendu */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (!p.arenaUserId) continue;
    const uid = p.arenaUserId;
    const mid = mediatorUserId.trim().toLowerCase();
    if (uid === mid) continue;
    const idx = challengerUidsOrdered.indexOf(uid);
    if (idx >= 0 && idx < nSlots && roles[uid]) {
      markSlot(idx);
      assigned.set(p.sessionId, {
        arenaUserId: uid,
        role: roles[uid].role,
        expectedSlotIndex: idx,
        kind: 'expected',
      });
    }
  }

  /** 3 — Alias pseudo → UID */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    const uid = matchNameToUidPhysical(p.displayName, mediatorUserId, roles);
    if (!uid || uid === mediatorUserId.trim().toLowerCase()) continue;
    const idx = challengerUidsOrdered.indexOf(uid);
    if (idx >= 0 && idx < nSlots && roles[uid]) {
      markSlot(idx);
      assigned.set(p.sessionId, {
        arenaUserId: uid,
        role: roles[uid].role,
        expectedSlotIndex: idx,
        kind: 'expected',
      });
    }
  }

  /** 4 — Orphelins : **conserver** le flux, slot vide, rôle invité (pas de suppression) */
  for (const p of physicalPeers) {
    if (assigned.has(p.sessionId)) continue;
    const slot = takeFirstEmptySlot();
    assigned.set(p.sessionId, {
      arenaUserId: p.arenaUserId,
      role: ORPHAN_GUEST_ROLE,
      expectedSlotIndex: slot,
      kind: 'orphan',
    });
  }

  return physicalPeers.map((p) => ({
    physical: p,
    semantic: assigned.get(p.sessionId)!,
  }));
}
