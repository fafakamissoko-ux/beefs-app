# Rapport d'audit — Moteur Aura & points d'entrée Beef

**Date :** 31 mai 2026  
**Objectif :** radiographie des handlers avant implémentation de la nouvelle économie Aura (+100 création, +150 acceptation, −50 abandon/forfait)  
**Statut :** extraction uniquement (aucune modification de code)

---

## 0. Synthèse cartographique

| Action PO | Handler principal | Fichier | Couche | Aura aujourd'hui |
|-----------|-------------------|---------|--------|------------------|
| **Création Beef** | `submitNewBeef()` | `lib/submitNewBeef.ts` | Client Supabase (RLS) | ❌ Aucun |
| **Acceptation défi (challenger)** | `handleResponse(accept=true)` | `app/invitations/page.tsx` | Client Supabase (RLS) | ❌ Aucun |
| **Acceptation défi (embuscade UI)** | `executeResponse('join')` | `components/GlobalDuelAmbush.tsx` | Client Supabase (RLS) | ❌ Aucun |
| **Acceptation par médiateur (ring)** | `ACCEPT_PARTICIPANT` | `app/api/beef/manage/route.ts` | API service role | ❌ Aucun |
| **Forfait créateur (scheduled)** | `confirmForfeit()` | `app/feed/page.tsx` | Client Supabase (RLS) | ⚠️ Toast « Aura impactée » mais **aucun code Aura** |
| **Fin beef → abandoned** | `END_BEEF` + `resolutionFromEndReason` | `app/api/beef/manage/route.ts` | API service role | ❌ Aucun |
| **Désistement médiateur manifeste** | `WITHDRAW_MANIFESTO` | `app/api/beef/manage/route.ts` | API service role | ❌ Aucun |
| **Refus / retrait participant** | `REMOVE_PARTICIPANT` (decline/purge) | `app/api/beef/manage/route.ts` | API service role | ❌ Aucun |
| **Refus invitation (challenger)** | `handleResponse(accept=false)` / `executeResponse('decline')` | `invitations/page.tsx`, `GlobalDuelAmbush.tsx` | Client Supabase | ❌ Aucun |

**Callers création :** `app/create/page.tsx`, `app/feed/page.tsx` (`handleCreateBeef`), `app/live/page.tsx` — tous appellent `submitNewBeef(supabase, user.id, beefData)`.

**Trigger DB lié acceptation (statut beef, pas Aura) :** `update_beef_status_on_acceptance()` dans `supabase_migrations/init.sql` — passe le beef `pending → ready` quand tous les `is_main` ont `invite_status = 'accepted'`.

**Constat clé pour l'Architecte :** aucun des trois flux cibles n'appelle aujourd'hui `updateUserBalance` ni une RPC Aura dédiée. Le seul moteur transactionnel existant (`update_user_balance`) modifie **simultanément** `points` (solde dépensable) et `lifetime_points` (prestige affiché) — voir §4.

---

## 1. Création — `submitNewBeef` (insertion Beef)

**Fichier :** `lib/submitNewBeef.ts`  
**Appelé depuis :** `app/create/page.tsx`, `app/feed/page.tsx`, `app/live/page.tsx`

```typescript
export async function submitNewBeef(
  supabase: SupabaseClient,
  userId: string,
  beefData: SubmitBeefPayload
) {
  assertValidUuid(userId, 'userId');
  const { count } = await supabase
    .from('beefs')
    .select('*', { count: 'exact', head: true })
    .eq('mediator_id', userId)
    .eq('resolution_status', 'resolved');

  const price = continuationPriceFromResolvedCount(count ?? 0);

  // --- VÉRIFICATION BOUCLIER ANTI-SPAM (Mode: Fail-Closed) ---
  const inviteesList = (beefData.participants ?? []).filter((p) => p.user_id !== userId);
  if (inviteesList.length > 0) {
    const inviteeIds = [...new Set(inviteesList.map((i) => i.user_id))];
    const { data: targetUsers, error: targetErr } = await supabase.rpc('get_users_privacy', {
      target_ids: inviteeIds,
    });

    if (targetErr) {
      throw new Error("Erreur serveur lors de la vérification de la confidentialité. Opération annulée par sécurité.");
    }

    if (!targetUsers || targetUsers.length !== inviteeIds.length) {
      throw new Error("Impossible de vérifier les paramètres de tous les utilisateurs. Opération annulée.");
    }

    for (const target of targetUsers) {
      const privacy = target.invitation_privacy || 'everyone';
      const targetName = target.display_name || target.username || 'Cet utilisateur';

      if (privacy === 'nobody') {
        throw new Error(`${targetName} n'accepte aucune invitation pour le moment (Mode Ne pas déranger).`);
      }

      if (privacy === 'following') {
        const { data: follows, error: followErr } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', target.id)
          .eq('following_id', userId)
          .maybeSingle();

        if (followErr) {
          throw new Error(`Erreur lors de la vérification des accès pour ${targetName}.`);
        }

        if (!follows) {
          throw new Error(`${targetName} n'accepte les défis que de ses abonnements.`);
        }
      }
    }
  }
  // --- FIN VÉRIFICATION ---

  const insertData: Record<string, unknown> = {
    title: beefData.title,
    subject: beefData.title,
    description: beefData.description || '',
    mediator_id: beefData.intent === 'mediation' ? userId : null,
    created_by: userId,
    intent: beefData.intent,
    event_type: beefData.event_type,
    status: 'pending',
    is_premium: false,
    price,
    tags: beefData.tags || [],
  };

  const when = normalizeScheduledAtForInsert(beefData.scheduled_at);
  if (when) insertData.scheduled_at = when;

  if (beefData.teaser_file) {
    const fileExt = beefData.teaser_file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('teasers')
      .upload(fileName, beefData.teaser_file);

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = supabase.storage.from('teasers').getPublicUrl(fileName);
      const isVideo = beefData.teaser_file.type.startsWith('video/');
      if (isVideo) insertData.video_url = publicUrlData.publicUrl;
      else insertData.thumbnail = publicUrlData.publicUrl;
    }
  }

  const { data: beef, error } = await supabase.from('beefs').insert(insertData).select().single();
  if (error) throw new Error(error.message);

  // Validation UUID de tous les participants avant toute insertion
  for (const p of beefData.participants ?? []) {
    assertValidUuid(p.user_id, `participant user_id`);
  }

  const participantRows = (beefData.participants ?? []).map((p) => ({
    beef_id: beef.id,
    user_id: p.user_id,
    role: p.role || 'participant',
    is_main: Boolean(p.is_main),
    invite_status: p.user_id === userId ? 'accepted' : 'pending',
  }));

  if (participantRows.length > 0) {
    const { error: pErr } = await supabase.from('beef_participants').insert(participantRows);
    if (pErr) throw new Error(pErr.message);

    const invitees = (beefData.participants ?? []).filter((p) => p.user_id !== userId);

    if (invitees.length > 0) {
      let expiresAt = new Date();
      if (when) {
        expiresAt = new Date(when);
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 24);
      }

      const { error: invErr } = await supabase.from('beef_invitations').insert(
        invitees.map((p) => ({
          beef_id: beef.id,
          inviter_id: userId,
          invitee_id: p.user_id,
          status: 'sent',
          expires_at: expiresAt.toISOString(),
        }))
      );
      if (invErr) throw new Error(invErr.message);
    }
  }

  await Promise.allSettled([
    supabase.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: beefData.intent === 'manifesto' ? 'Manifeste publié !' : 'Convocations envoyées !',
      body:
        beefData.intent === 'manifesto'
          ? `Ton manifeste "${beefData.title}" est en attente d'un Ref.`
          : `Ton beef "${beefData.title}" est prêt — en attente des confirmations.`,
      link: `/arena/${beef.id}`,
      metadata: {
        subtype: 'beef_created',
        beef_id: beef.id,
        intent: beefData.intent,
      },
    }),
  ]);

  return beef as { id: string };
}
```

**Point d'accroche recommandé :** immédiatement après l'insert réussi (`beef.id`), côté serveur (RPC/trigger ou route API) — le flux actuel est 100 % client RLS.

---

## 2. Acceptation — challenger accepte un défi

### 2a. Page Invitations (flux principal)

**Fichier :** `app/invitations/page.tsx`  
**Fonction :** `handleResponse`

```typescript
  const handleResponse = async (
    invitationId: string,
    beefId: string,
    accept: boolean,
    isAutoExpire: boolean = false
  ) => {
    if (respondingTo) return;
    setRespondingTo(invitationId);

    const currentInv = invitations.find((i) => i.id === invitationId);
    const scheduledAt = currentInv?.beef.scheduled_at;
    const isScheduledForLater =
      Boolean(scheduledAt) &&
      new Date(scheduledAt!).getTime() > Date.now() + 5 * 60_000 &&
      currentInv?.beef.status !== 'live';

    if (accept && !isScheduledForLater && !isAutoExpire) {
      setTransitioningTo(beefId);
    }

    try {
      const { error: invError } = await supabase
        .from('beef_invitations')
        .update({
          status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
        .eq('beef_id', beefId);
      if (invError) throw invError;

      const { error: partError } = await supabase
        .from('beef_participants')
        .update({
          invite_status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('beef_id', beefId)
        .eq('user_id', user?.id);
      if (partError) throw partError;

      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));

      if (accept) {
        if (isScheduledForLater && currentInv?.beef.scheduled_at) {
          const dateStr = new Date(currentInv.beef.scheduled_at).toLocaleDateString('fr-FR', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
          });
          toast(`Défi relevé ! Programmé pour ${dateStr}`, 'success');
          setRespondingTo(null);
        } else {
          setTimeout(() => router.push(`/arena/${beefId}`), 600);
        }
      } else {
        if (isAutoExpire) {
          toast('Temps écoulé ! Défi considéré comme fui.', 'error');
        } else {
          toast('Défi esquivé', 'info');
        }
        setRespondingTo(null);
      }
    } catch (error) {
      console.error('Error responding to invitation:', error);
      if (!isAutoExpire) toast('Erreur lors de la réponse', 'error');
      setRespondingTo(null);
      setTransitioningTo(null);
    }
  };
```

### 2b. Embuscade globale (popup temps réel)

**Fichier :** `components/GlobalDuelAmbush.tsx`  
**Fonction :** `executeResponse` (branche `join`)

```typescript
  const executeResponse = useCallback(
    async (action: ActionState, message?: string) => {
      if (!ambush || !user) return;
      setIsResponding(true);

      try {
        const invStatus = action === 'join' ? 'accepted' : action === 'later' ? 'seen' : 'declined';

        const partStatus = action === 'join' ? 'accepted' : action === 'decline' ? 'declined' : null;

        const { error: invError } = await supabase
          .from('beef_invitations')
          .update({
            status: invStatus,
            responded_at: action !== 'later' ? new Date().toISOString() : null,
            ...(action === 'later' ? { seen_at: new Date().toISOString() } : {}),
          })
          .eq('id', ambush.id);
        if (invError) throw invError;

        if (partStatus) {
          const { error: partError } = await supabase
            .from('beef_participants')
            .update({
              invite_status: partStatus,
              responded_at: new Date().toISOString(),
            })
            .eq('beef_id', ambush.beef_id)
            .eq('user_id', user.id);
          if (partError) throw partError;
        }

        // ... DM optionnel + navigation arena ...

        if (action === 'join') {
          const isScheduledForLater =
            Boolean(ambush.scheduled_at) &&
            new Date(ambush.scheduled_at!).getTime() > Date.now() + 5 * 60_000 &&
            ambush.status !== 'live';

          const hasRef = Boolean(ambush.mediator_id);

          if (isScheduledForLater || !hasRef) {
            // toast succès
          } else {
            router.push(`/arena/${ambush.beef_id}`);
          }
        }

        setAmbush(null);
        // ...
      } catch (err) {
        console.error('Erreur réponse embuscade:', err);
      } finally {
        setIsResponding(false);
      }
    },
    [ambush, user, router, toast]
  );
```

### 2c. Acceptation côté médiateur (ring / pending invites)

**Fichier :** `app/api/beef/manage/route.ts`  
**Action :** `ACCEPT_PARTICIPANT`  
**Appelé depuis :** `components/TikTokStyleArena.tsx` → `handleAcceptPendingInvite`

```typescript
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
```

**Note rôle :** 2a/2b = le **challenger invité** accepte ; 2c = le **médiateur** valide un participant (ex. spectateur `raise-hand`). Pour le PO (+150 acceptation défi), le hook prioritaire est **2a/2b** (transition `pending → accepted` sur `beef_participants` par l'invité).

### 2d. Trigger Postgres (statut beef, pas Aura)

**Fichier :** `supabase_migrations/init.sql`

```sql
CREATE OR REPLACE FUNCTION public.update_beef_status_on_acceptance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
    IF public.check_beef_ready(NEW.beef_id) THEN
      UPDATE public.beefs SET status = 'ready' WHERE id = NEW.beef_id AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
```

---

## 3. Abandon / Forfait / retrait

### 3a. Forfait créateur (beef `scheduled → cancelled`)

**Fichier :** `app/feed/page.tsx`  
**Fonction :** `confirmForfeit`  
**Déclencheur UI :** `BeefCard` prop `onForfeit` quand `status === 'scheduled' && user === created_by`

```typescript
  const confirmForfeit = async () => {
    if (!beefToForfeit || !user?.id) return;
    const { error } = await supabase.from('beefs').update({ status: 'cancelled' }).eq('id', beefToForfeit).eq('created_by', user.id);
    if (error) {
      toast('Erreur lors du forfait', 'error');
      return;
    }
    toast('Forfait déclaré. L\'Aura a été impactée.', 'info');
    setBeefToForfeit(null);
    void loadBeefs();
  };
```

**⚠️ Écart produit :** le toast annonce un impact Aura, mais **aucune écriture** `users.lifetime_points` / RPC n'est exécutée ici.

**Catégorisation profil :** `lib/mediation-resolution.ts` mappe `status === 'cancelled'` → catégorie `'abandoned'`.

```typescript
export function mediationCategoryForBeef(beef: {
  status: string;
  resolution_status?: string | null;
}): MediationDisplayCategory {
  const s = beef.status;
  if (s === 'cancelled') return 'abandoned';
  // ...
}
```

### 3b. Désistement médiateur manifeste

**Fichier :** `app/api/beef/manage/route.ts`  
**Action :** `WITHDRAW_MANIFESTO`  
**Déclencheur UI :** `app/feed/page.tsx` → `handleWithdrawManifesto` via `BeefCard.onSeDesister`

```typescript
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
```

### 3c. Fin de beef avec résolution `abandoned`

**Fichier :** `app/api/beef/manage/route.ts`  
**Appelé depuis :** `components/TikTokStyleArena.tsx` → `endBeef()` → `TOGGLE_STATUS / END_BEEF`

```typescript
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
```

```typescript
      if (toggle === 'END_BEEF') {
        const reason =
          typeof body.endReason === 'string' && body.endReason.trim()
            ? body.endReason.trim()
            : 'Terminé par le médiateur';
        const resolution = resolutionFromEndReason(reason);
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            resolution_status: resolution,
          })
          .eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Fin de beef impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }
```

**Client `endBeef` (extrait) :**

```typescript
  const endBeef = useCallback(async (reason: string = 'Terminé par le Ref') => {
    if (beefEndedRef.current) return;
    // ...
    const r = await runBeefManage({
      action: 'TOGGLE_STATUS',
      beefId: roomId,
      toggle: 'END_BEEF',
      endReason: reason,
    });
    if (!r.ok) {
      stopAllMediaTracksRef.current();
      return;
    }
    beefEndedRef.current = true;
    // ... résumé fin de session ...
  }, [roomId, /* ... */]);
```

### 3d. Refus / retrait participant (decline / kick)

**Fichier :** `app/api/beef/manage/route.ts`  
**Action :** `REMOVE_PARTICIPANT`

```typescript
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
        // ...
        const { error } = await supabaseAdmin
          .from('beef_participants')
          .delete()
          .eq('beef_id', beefId)
          .eq('user_id', participantId);
        // ...
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
        // ...
      }
      return NextResponse.json({ success: true });
    }
```

### 3e. Refus invitation challenger (client)

Même tables que §2, branche `accept: false` dans `handleResponse` / `action === 'decline'` dans `GlobalDuelAmbush` — pas de changement de statut beef, uniquement `beef_invitations` + `beef_participants`.

---

## 4. Moteur Aura actuel

### 4a. Wrapper TypeScript serveur — `updateUserBalance`

**Fichier :** `lib/updateUserBalance.ts`  
**Consommateurs connus :** `app/api/stripe/webhook/route.ts`, `app/api/withdrawals/request/route.ts`, `app/api/withdrawals/process/route.ts`  
**Accès :** service role uniquement (RPC révoquée au PUBLIC)

```typescript
/** Utilise la RPC `update_user_balance` (écrit aussi dans `transactions`). */
export async function updateUserBalance(
  admin: SupabaseClient,
  params: {
    userId: string;
    amount: number;
    type: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await admin.rpc('update_user_balance', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_type: params.type,
    p_description: params.description,
    p_metadata: (params.metadata ?? {}) as object,
  });
  if (error) throw error;
  return data as { new_balance?: number; old_balance?: number; transaction_id?: string };
}
```

### 4b. RPC canonique (version prod récente) — `update_user_balance`

**Fichier :** `supabase/migrations/99_aura_absolute_economy.sql`

```sql
CREATE OR REPLACE FUNCTION public.update_user_balance(
  p_user_id UUID, p_amount INTEGER, p_type TEXT,
  p_description TEXT, p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_aura_increase INTEGER := 0;
BEGIN
  SELECT points INTO v_current FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  v_new := v_current + p_amount;
  IF v_new < 0 AND p_type != 'refund' THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  -- Mécanique Gamification : Tout flux (positif ou négatif) augmente l'Aura, sauf retraits
  IF p_type NOT IN ('withdrawal_hold', 'refund_withdrawal') THEN
    v_aura_increase := ABS(p_amount);
  END IF;

  UPDATE public.users 
  SET 
    points = v_new, 
    lifetime_points = COALESCE(lifetime_points, 0) + v_aura_increase,
    updated_at = NOW() 
  WHERE id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, metadata)
  VALUES (p_user_id, p_type, p_amount, v_new, p_description, p_metadata);

  RETURN jsonb_build_object('success', true, 'newBalance', v_new, 'auraAdded', v_aura_increase);
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_balance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_balance TO service_role;
```

**Implication PO :** cette RPC **ne peut pas** appliquer −50 Aura sans aussi modifier `points` (solde). De plus, `v_aura_increase := ABS(p_amount)` fait que **toute pénalité négative sur `points` augmente quand même `lifetime_points`**. Une nouvelle RPC `adjust_lifetime_aura(p_user_id, p_delta, p_reason, p_metadata)` (ou refonte de la sémantique) sera probablement nécessaire pour +100 / +150 / −50 **sans effet de bord sur le solde dépensable**.

### 4c. Triggers Aura « sociaux » (hors scope Beef, mais existants)

**Likes beef → +1 lifetime_points créateur** — `supabase_migrations/57_beef_likes_aura_trigger.sql` :

```sql
CREATE OR REPLACE FUNCTION public.trg_beef_likes_aura()
RETURNS trigger
-- ...
  IF tg_op = 'INSERT' THEN
    -- engagement_score beef +1
    -- users.lifetime_points +1, users.points +1 pour created_by
  ELSE
    -- retrait symétrique (≥ 0)
  END IF;
```

**Étincelles profil** — `supabase_migrations/54_radar_aura_dynamic.sql` :

```sql
-- transmit_aura(p_entity_id) → INSERT aura_sparks + lifetime_points +1
-- revoke_profile_aura(p_entity_id) → DELETE sparkle + lifetime_points −1
-- follow_adjust_recipient_lifetime() trigger → +10 / −10 lifetime_points sur following_id
```

### 4d. Affichage rang (pas moteur économique)

**Fichier :** `lib/prestige.ts`

```typescript
export function getAuraRank(aura: number): PrestigeRank {
  if (aura >= 5000) return { title: 'Aura Suprême', colorClass: '...', tier: 5 };
  if (aura >= 2000) return { title: 'Sommité', colorClass: '...', tier: 4 };
  if (aura >= 500) return { title: 'Éminent', colorClass: '...', tier: 3 };
  if (aura >= 100) return { title: 'Initié', colorClass: '...', tier: 2 };
  return { title: 'Citoyen', colorClass: 'text-gray-500', tier: 1 };
}
```

**Colonne affichée :** `users.lifetime_points` (alias « Aura » dans `ProfileHeader`, feed, header).

---

## 5. Recommandations d'implémentation (lecture seule — hors scope exécution)

1. **Centraliser côté Postgres (triggers SECURITY DEFINER)** sur `beefs INSERT`, `beef_participants UPDATE (invite_status → accepted)`, `beefs UPDATE (status → cancelled)` — évite la duplication entre `invitations/page`, `GlobalDuelAmbush`, et futures routes.
2. **Idempotence :** table `aura_events` ou metadata `{ beef_id, event: 'beef_created' | 'challenge_accepted' | 'forfeit' }` pour ne pas créditer/débiter deux fois.
3. **Nouvelle RPC dédiée** pour modifier `lifetime_points` sans toucher `points`, avec plancher à 0 sur les pénalités.
4. **Corriger le toast mensonger** dans `confirmForfeit` une fois la logique branchée.
5. **Clarifier le périmètre −50 :** forfait créateur (`cancelled`), refus explicite (`declined`), fin `abandoned` en arène, ou les trois ?

---

*Fin du rapport — extraction brute, zéro modification de code.*
