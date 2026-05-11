/**
 * Identité Daily ↔ profils Supabase (beef_participants / users).
 * Phase Tabula Rasa : couche « PhysicalPeer » (Daily) + « SemanticIdentity » (DB),
 * réconciliées sans jamais perdre un peer physique.
 */

export const ARENA_USER_DATA_KEY = 'arenaUserId' as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidArenaUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

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

// ── Tabula Rasa : Physical vs Semantic ───────────────────────────────

/**
 * Ce que Daily expose réellement (pistes natives, sans logique Beef).
 */
export interface PhysicalPeer {
  sessionId: string;
  /** `user_name` Daily ou équivalent brut */
  displayName: string;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
  isLocal: boolean;
  /** UUID applicatif si extractible (token / userData) */
  arenaUserId: string | null;
  /** Optionnel : états Daily (`off`, `playable`, …) pour dériver videoOn/audioOn côté UI */
  videoTrackState?: string;
  audioTrackState?: string;
}

/**
 * Ce que la base attend pour une ligne beef_participants.
 */
export interface SemanticIdentity {
  /** UUID beef valide, ou `null` si orphelin / invité non résolu */
  arenaUserId: string | null;
  role: string;
  /** 0 = slot A … 3 = slot D ; `-1` = médiateur / hors grille 4 cases */
  expectedSlotIndex: number;
  kind: 'expected' | 'orphan';
}

export interface ReconciledPeer {
  physical: PhysicalPeer;
  semantic: SemanticIdentity;
}

/** Entrée pour la réconciliation : ordre des challengers + médiateur connu */
export interface ReconcileExpectedRoles {
  mediatorUserId: string;
  mediatorDisplayName: string;
  /** UUID des challengers attendus, ordre stable → slots 0…n-1 (max 4 typiquement) */
  challengerUidsOrdered: string[];
  roles: Record<string, BeefParticipantRowMeta>;
}

function matchNameToUid(
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

function isMediatorPeer(p: PhysicalPeer, mediatorUserId: string, mediatorDisplayName: string): boolean {
  const mid = mediatorUserId.trim().toLowerCase();
  if (p.arenaUserId && p.arenaUserId === mid) return true;
  const nu = normalizeParticipantLabel(p.displayName);
  const mn = normalizeParticipantLabel(mediatorDisplayName);
  return nu.length > 0 && mn.length > 0 && nu === mn;
}

/**
 * Règle d'or : la sortie a **exactement** une entrée par `physicalPeers`
 * (même ordre d’itération que l’entrée ; aucune suppression).
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

  /** Réserve un slot libre pour un orphelin (premier index libre 0..3) */
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

  /** 1 — Médiateur par UUID ou nom */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (isMediatorPeer(p, mediatorUserId, mediatorDisplayName)) {
      const meta = roles[mediatorUserId.trim().toLowerCase()];
      assigned.set(p.sessionId, {
        arenaUserId: mediatorUserId.trim().toLowerCase(),
        role: meta?.role ?? 'mediator',
        expectedSlotIndex: -1,
        kind: 'expected',
      });
    }
  }

  /** 2 — UUID direct = challenger attendu */
  for (const p of needPhysical) {
    if (assigned.has(p.sessionId)) continue;
    if (!p.arenaUserId) continue;
    const uid = p.arenaUserId;
    if (uid === mediatorUserId.trim().toLowerCase()) continue;
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
    const uid = matchNameToUid(p.displayName, mediatorUserId, roles);
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

  /** 4 — Orphelins : identité invitée + premier slot vide parmi 0…3 */
  for (const p of physicalPeers) {
    if (assigned.has(p.sessionId)) continue;
    const slot = takeFirstEmptySlot();
    assigned.set(p.sessionId, {
      arenaUserId: p.arenaUserId,
      role: 'guest',
      expectedSlotIndex: slot,
      kind: 'orphan',
    });
  }

  return physicalPeers.map((p) => ({
    physical: p,
    semantic: assigned.get(p.sessionId)!,
  }));
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

export function remoteMatchesExpectedBeefParticipantUid(
  remote: { userName: string; arenaUserId: string | null },
  expectedUserId: string,
  mediatorUserId: string,
  mediatorDisplayName: string,
  roles: Record<string, BeefParticipantRowMeta>,
): boolean {
  const eu = expectedUserId.trim().toLowerCase();
  const aid = remote.arenaUserId?.trim().toLowerCase() ?? '';
  if (aid && aid === eu) return true;
  const match = matchRemoteToExpectedBeefParticipant(
    remote,
    mediatorUserId,
    mediatorDisplayName,
    roles,
  );
  return match?.userId === eu;
}

export function buildDailyJoinUserData(arenaUserId: string | null | undefined): Record<string, string> | undefined {
  if (!arenaUserId || !isValidArenaUserId(arenaUserId)) return undefined;
  return { [ARENA_USER_DATA_KEY]: arenaUserId.trim().toLowerCase() };
}
