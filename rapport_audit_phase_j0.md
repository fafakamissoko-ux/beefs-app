# Rapport d'audit — Phase J.0 (P0 HTTP 401 `/api/beef/manage`)

- **Date :** 2026-07-21
- **Commit ref :** `c4428e6`
- **Contrainte :** zéro modification du dépôt — lecture seule
- **Symptôme cible :** HTTP **401** avec `{"error": "Non authentifié"}` lorsque le médiateur **accepte** ou **refuse** un participant depuis la régie (Command Deck / sidebar médiateur).

---

## Synthèse exécutive

| Zone | Fichier | Observation |
|------|---------|-------------|
| Handlers régie | `components/TikTokStyleArena.tsx` L.629–656 | `handleAcceptPendingInvite` / `handleRejectPendingInvite` délèguent à `runBeefManage` — **pas de `fetch` direct** |
| Construction headers | `lib/beef-manage-client.ts` L.48–60 | `Authorization: Bearer ${accessToken}` + `Content-Type: application/json` |
| Obtention token | `components/TikTokStyleArena.tsx` L.249–263 | `supabase.auth.getSession()` → `session.access_token` ; si absent → toast « Session expirée », **pas d'appel API** |
| Validation serveur | `app/api/beef/manage/route.ts` L.11–28 | `getAuthUser` : header `Authorization` Bearer, longueur ≥ 15, puis `supabaseAuth.auth.getUser()` |
| Réponse 401 | `app/api/beef/manage/route.ts` L.58–61 | `if (!user) return 401 { error: 'Non authentifié' }` |

**Chaîne d'appel (accept / refuse) :**

```
handleAcceptPendingInvite / handleRejectPendingInvite
  → runBeefManage(body)
    → supabase.auth.getSession()
    → postBeefManage(session.access_token, body)
      → fetch('/api/beef/manage', { headers: { Authorization: Bearer … } })
        → route POST → getAuthUser(request) → 401 si user null
```

**Hypothèses 401 priorisées :**

1. **`access_token` expiré ou invalide** — `getSession()` renvoie encore une session en cache alors que `getUser()` côté serveur échoue.
2. **Header `Authorization` absent ou mal formé** — peu probable ici : `postBeefManage` l'injecte systématiquement si le token existe.
3. **Token vide / undefined** — bloqué côté client L.254–257 avant le fetch (toast « Session expirée ») ; un 401 implique que le fetch **a bien été émis** avec un token présent mais **rejeté** par le serveur.
4. **Variables d'environnement serveur** — `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` incorrectes → `getUser()` échoue silencieusement (`return null`).

**Note :** un 401 se produit **avant** la vérification médiateur (L.157–159 → 403 « Réservé au médiateur »). Le bug est donc **strictement auth**, pas autorisation métier.

---

## Cartographie — tous les appels `/api/beef/manage` depuis l'arène

| Ligne | Contexte | Action |
|-------|----------|--------|
| L.631–635 | Régie | `ACCEPT_PARTICIPANT` |
| L.646–651 | Régie | `REMOVE_PARTICIPANT` (`removeKind: 'decline'`) |
| L.1081+ | Démarrage live | `TOGGLE_STATUS` / `START_LIVE_SESSION` |
| L.1148+ | Fin beef | `TOGGLE_STATUS` / `END_BEEF` |
| L.1199+ | Sync live | `TOGGLE_STATUS` / `SYNC_LIVE` |
| L.2335+ | Invitation participant | `INVITE_PARTICIPANT` |
| L.3560+ | UI Command Deck | divers `runBeefManage` |

Aucun `fetch('/api/beef/manage')` direct dans `TikTokStyleArena.tsx` — tout passe par `postBeefManage`.

---

# 1. Extraction — Requête Front-end (Client)

## 1.1 `runBeefManage` — obtention session + délégation

**Fichier :** `components/TikTokStyleArena.tsx`  
**Lignes :** 249–263

```tsx
  const runBeefManage = useCallback(
    async (body: BeefManageAction) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast('Session expirée', 'error');
        return { ok: false as const, error: 'Session' };
      }
      const r = await postBeefManage(session.access_token, body);
      if (!r.ok) toast(r.error, 'error');
      return r;
    },
    [toast],
  );
```

**Analyse headers :** les headers HTTP ne sont **pas** construits ici. Seul `session.access_token` est extrait et passé à `postBeefManage`.

---

## 1.2 `handleAcceptPendingInvite` — accepter un challenger

**Fichier :** `components/TikTokStyleArena.tsx`  
**Lignes :** 629–641

```tsx
  const handleAcceptPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'ACCEPT_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
      });
      if (!r.ok) return;
      toast('Challenger accepté !', 'success');
      void fetchPendingInvites();
    },
    [roomId, toast, fetchPendingInvites, runBeefManage],
  );
```

---

## 1.3 `handleRejectPendingInvite` — refuser un challenger

**Fichier :** `components/TikTokStyleArena.tsx`  
**Lignes :** 643–656

```tsx
  /** Refus : UPDATE → declined (pas de DELETE RLS médiateur sur beef_participants). */
  const handleRejectPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'REMOVE_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
        removeKind: 'decline',
      });
      if (!r.ok) return;
      void fetchPendingInvites();
    },
    [roomId, fetchPendingInvites, runBeefManage],
  );
```

---

## 1.4 `postBeefManage` — construction effective des headers (couche client)

**Fichier :** `lib/beef-manage-client.ts`  
**Lignes :** 1–69 (source intégral)

```tsx
/**
 * Client → POST /api/beef/manage (service role côté serveur, vérif médiateur).
 * Centralise l'en-tête Authorization pour les écritures beefs / beef_participants sous RLS strict.
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
      /** decline = refus invitation ; purge | kick = suppression de la ligne (retrait ring / expulsion) */
      removeKind?: 'decline' | 'purge' | 'kick';
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
      /** Stats taps audience (resonanceA–F, resonanceM, viewers…) persistées dans beefs.live_summary */
      summary?: Record<string, unknown>;
      /** Surcharge optionnelle pour REMATCH_MEDIATION_SUMMARY */
      mediationSummary?: string;
    }
  | { action: 'CLAIM_MANIFESTO'; beefId: string }
  | { action: 'APPROVE_MANIFESTO'; beefId: string }
  | { action: 'REJECT_MANIFESTO'; beefId: string }
  | { action: 'WITHDRAW_MANIFESTO'; beefId: string };

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
```

**Points d'audit headers :**

- `Authorization` : template `` `Bearer ${accessToken}` `` — pas de trim explicite du token.
- Pas de `credentials: 'include'` — auth **uniquement** via Bearer (cohérent avec le serveur).
- Pas de header `apikey` Supabase — le serveur recrée un client anon avec le Bearer reçu.

---

## 1.5 Câblage UI régie (référence)

**Fichier :** `components/TikTokStyleArena.tsx`  
**Lignes :** 3593–3594

```tsx
          onAcceptPendingInvite={handleAcceptPendingInvite}
          onRejectPendingInvite={handleRejectPendingInvite}
```

---

# 2. Extraction — Route API Back-end (Serveur)

**Fichier :** `app/api/beef/manage/route.ts`  
**Source intégral :** 351 lignes

```tsx
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;
  try {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

function isMediatorOfBeef(
  beef: { mediator_id: string | null; created_by: string | null },
  userId: string,
): boolean {
  if (beef.mediator_id === userId) return true;
  if (beef.mediator_id == null && beef.created_by === userId) return true;
  return false;
}

function resolutionFromEndReason(reason: string): 'resolved' | 'unresolved' | 'abandoned' {
  const resolutionMap: Record<string, 'resolved' | 'unresolved' | 'abandoned'> = {
    'Terminé par le médiateur': 'resolved',
    'Le médiateur a mis fin au beef': 'resolved',
    'Temps écoulé': 'resolved',
    'Temps écoulé (60 min)': 'resolved',
    'Verdict : résolu': 'resolved',
    'Tous les challengers ont quitté': 'unresolved',
    'Clos par le médiateur': 'unresolved',
    'Rematch demandé': 'unresolved',
    'Médiateur déconnecté': 'abandoned',
    'Le médiateur a quitté': 'abandoned',
  };
  return resolutionMap[reason] ?? 'abandoned';
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      beefId?: string;
      participantId?: string;
      removeKind?: 'decline' | 'purge' | 'kick';
      toggle?: string;
      endReason?: string;
      mediationSummary?: string;
      summary?: Record<string, unknown>;
    };

    const rawBeefId = typeof body.beefId === 'string' ? body.beefId : '';
    const beefId = normalizeBeefId(rawBeefId.trim());
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide' }, { status: 400 });
    }

    const action = body.action;

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, created_by, status')
      .eq('id', beefId)
      .maybeSingle();

    if (beefErr?.code === 'PGRST116' || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }

    if (action === 'CLAIM_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: user.id })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .is('mediator_id', null)
        .neq('created_by', user.id);
      if (error) return NextResponse.json({ error: 'Candidature impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'APPROVE_MANIFESTO') {
      const { data: beef } = await supabaseAdmin
        .from('beefs')
        .select('title, mediator_id')
        .eq('id', beefId)
        .single();

      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ status: 'scheduled' })
        .eq('id', beefId)
        .eq('created_by', user.id)
        .eq('intent', 'manifesto')
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: 'Validation impossible' }, { status: 500 });

      if (beef?.mediator_id) {
        const msg = `Tu as été choisi comme médiateur pour l'affaire : ${beef.title ?? ''}`;
        await supabaseAdmin.from('notifications').insert({
          user_id: beef.mediator_id,
          type: 'system',
          title: 'Candidature validée !',
          body: msg,
          link: `/arena/${beefId}`,
          metadata: { subtype: 'manifesto_approved', related_id: beefId },
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'REJECT_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: null })
        .eq('id', beefId)
        .eq('created_by', user.id)
        .eq('intent', 'manifesto')
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: 'Refus impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'WITHDRAW_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: null, status: 'pending' })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .eq('mediator_id', user.id);
      if (error) return NextResponse.json({ error: 'Désistement impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (!isMediatorOfBeef(beef, user.id)) {
      return NextResponse.json({ error: 'Réservé au médiateur de ce beef' }, { status: 403 });
    }

    if (action === 'ACCEPT_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from('beef_participants')
        .update({
          role: 'participant',
          invite_status: 'accepted',
          responded_at: now,
        })
        .eq('beef_id', beefId)
        .eq('user_id', participantId);
      if (error) {
        return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'REMOVE_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const kind =
        body.removeKind === 'purge' || body.removeKind === 'kick' ? 'purge' : 'decline';
      if (kind === 'purge') {
        const { error: delInv } = await supabaseAdmin
          .from('beef_invitations')
          .delete()
          .eq('beef_id', beefId)
          .eq('invitee_id', participantId);
        if (delInv) {
          /* non bloquant */
        }
        const { error } = await supabaseAdmin
          .from('beef_participants')
          .delete()
          .eq('beef_id', beefId)
          .eq('user_id', participantId);
        if (error) {
          return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 });
        }
      } else {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from('beef_participants')
          .update({
            invite_status: 'declined',
            responded_at: now,
          })
          .eq('beef_id', beefId)
          .eq('user_id', participantId)
          .eq('invite_status', 'pending');
        if (error) {
          return NextResponse.json({ error: 'Refus impossible' }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'INVITE_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const { error: upErr } = await supabaseAdmin.from('beef_participants').upsert(
        {
          beef_id: beefId,
          user_id: participantId,
          role: 'participant',
          is_main: false,
          invite_status: 'pending',
        },
        { onConflict: 'beef_id,user_id' },
      );
      if (upErr) {
        return NextResponse.json({ error: 'Invitation participant impossible' }, { status: 500 });
      }
      const { data: existingInv } = await supabaseAdmin
        .from('beef_invitations')
        .select('id')
        .eq('beef_id', beefId)
        .eq('invitee_id', participantId)
        .maybeSingle();
      if (!existingInv) {
        const { error: invErr } = await supabaseAdmin.from('beef_invitations').insert({
          beef_id: beefId,
          inviter_id: user.id,
          invitee_id: participantId,
          status: 'sent',
        });
        if (invErr) {
          return NextResponse.json({ error: 'Enregistrement invitation impossible' }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'TOGGLE_STATUS') {
      const toggle = body.toggle;
      if (toggle === 'START_LIVE_SESSION') {
        const mediatorId = beef.mediator_id ?? user.id;
        const { count, error: cErr } = await supabaseAdmin
          .from('beefs')
          .select('*', { count: 'exact', head: true })
          .eq('mediator_id', mediatorId)
          .eq('resolution_status', 'resolved')
          .neq('id', beefId);
        if (cErr) {
          return NextResponse.json({ error: 'Lecture tarif impossible' }, { status: 500 });
        }
        const price = continuationPriceFromResolvedCount(count ?? 0);
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({
            status: 'live',
            started_at: new Date().toISOString(),
            price,
            is_premium: false,
          })
          .eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Démarrage live impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'SYNC_LIVE') {
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({ status: 'live' })
          .eq('id', beefId)
          .in('status', ['pending', 'ready']);
        if (error) {
          return NextResponse.json({ error: 'Sync statut impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'REMATCH_MEDIATION_SUMMARY') {
        const summary =
          typeof body.mediationSummary === 'string' && body.mediationSummary.trim()
            ? body.mediationSummary.trim()
            : 'Rematch demandé — Round 2 à planifier avec les challengers.';
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({ mediation_summary: summary })
          .eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Mise à jour résumé impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'END_BEEF') {
        const reason =
          typeof body.endReason === 'string' && body.endReason.trim()
            ? body.endReason.trim()
            : 'Terminé par le médiateur';
        const resolution = resolutionFromEndReason(reason);
        const updatePayload: {
          status: 'ended';
          ended_at: string;
          resolution_status: 'resolved' | 'unresolved' | 'abandoned';
          live_summary?: Record<string, unknown>;
        } = {
          status: 'ended',
          ended_at: new Date().toISOString(),
          resolution_status: resolution,
        };
        if (body.summary && typeof body.summary === 'object' && !Array.isArray(body.summary)) {
          updatePayload.live_summary = body.summary;
        }
        const { error } = await supabaseAdmin.from('beefs').update(updatePayload).eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Fin de beef impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: 'toggle invalide' }, { status: 400 });
    }

    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

---

## 2.1 Audit ciblé — `getAuthUser` (conditions de rejet → 401)

```tsx
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;
  try {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}
```

| Étape | Échec → `user = null` → 401 |
|-------|-------------------------------|
| L.12–13 | Pas de header `authorization`, ou ne commence pas par `Bearer `, ou longueur < 15 |
| L.20–24 | `getUser()` Supabase renvoie `error` ou `user` absent (JWT expiré, révoqué, signature invalide) |
| L.26–27 | Exception réseau / config client Supabase |

**Comparaison avec `/api/beef/access` :** même pattern `getAuthUser` (identique structure Bearer + `getUser()`).

---

## 2.2 Flux POST accept / refuse (après auth OK)

| Action client | Action serveur | Statuts possibles après auth |
|---------------|----------------|------------------------------|
| `ACCEPT_PARTICIPANT` | UPDATE `beef_participants` → `accepted` | 400, 403, 404, 500, 200 |
| `REMOVE_PARTICIPANT` + `decline` | UPDATE `invite_status: declined` WHERE `pending` | idem |

Le **403** « Réservé au médiateur » n'apparaît qu'**après** auth réussie (L.157).

---

# 3. Fichiers consultés

| Fichier | Rôle |
|---------|------|
| `components/TikTokStyleArena.tsx` | Handlers régie + `runBeefManage` |
| `lib/beef-manage-client.ts` | `fetch` + headers `Authorization` |
| `app/api/beef/manage/route.ts` | Route POST + `getAuthUser` |

---

*Fin du rapport Phase J.0 — extraction uniquement, aucune modification applicative.*
