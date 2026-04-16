/**
 * Client → POST /api/beef/manage (service role côté serveur, vérif médiateur).
 * Centralise l’en-tête Authorization pour les écritures beefs / beef_participants sous RLS strict.
 */

export type BeefManageAction =
  | {
      action: 'ACCEPT_PARTICIPANT';
      beefId: string;
      participantId: string;
    }
  | {
      action: 'REMOVE_PARTICIPANT';
      beefId: string;
      participantId: string;
      /** decline = refus invitation ; purge = suppression de la ligne (retrait ring) */
      removeKind?: 'decline' | 'purge';
    }
  | {
      action: 'INVITE_PARTICIPANT';
      beefId: string;
      participantId: string;
    }
  | {
      action: 'TOGGLE_STATUS';
      beefId: string;
      toggle:
        | 'START_LIVE_SESSION'
        | 'SYNC_LIVE'
        | 'REMATCH_MEDIATION_SUMMARY'
        | 'END_BEEF';
      /** Libellé côté client (même logique que endBeef) pour END_BEEF */
      endReason?: string;
      /** Surcharge optionnelle pour REMATCH_MEDIATION_SUMMARY */
      mediationSummary?: string;
    };

export type BeefManageResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: string; status?: number };

export async function postBeefManage(
  accessToken: string,
  body: BeefManageAction,
): Promise<BeefManageResult> {
  try {
    const res = await fetch('/api/beef/manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; [k: string]: unknown };
    if (!res.ok) {
      return { ok: false, error: typeof json.error === 'string' ? json.error : 'Erreur', status: res.status };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: 'Réseau' };
  }
}
