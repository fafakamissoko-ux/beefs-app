# Rapport d'audit — Convocations & accès Arène (Severity 1)

**Date :** 31 mai 2026  
**Périmètre :** flux convocations challengers, logique d'acceptation feed/BeefCard  
**Statut :** exploration uniquement — **aucun correctif implémenté**

---

## Synthèse exécutive

| Zone | Fichier principal | Verdict |
|------|-------------------|---------|
| Affichage convocations | `app/invitations/page.tsx` | Requête identifiée — **failles logiques confirmées** |
| Badge nav | `components/Header.tsx` | Compteur partiel (`sent` uniquement) |
| Popup temps réel | `components/GlobalDuelAmbush.tsx` | Écoute Realtime `beef_invitations` |
| Notifications | `app/notifications/page.tsx` | Lien `/invitations`, pas de fetch direct |
| Acceptation feed | `app/feed/page.tsx` | `user_is_live_ring` = `accepted` uniquement |
| CTA Arène | `components/BeefCard.tsx` | **Aucune prop fiable `invite_status`** |

**Cause racine la plus probable du « trou noir » :** la page Convocations ne lit **que** `beef_invitations` avec filtres `status ∈ {sent, seen}` + `expires_at > now`. Les lignes expirées ou absentes disparaissent **silencieusement**, alors que `beef_participants.invite_status = 'pending'` peut subsister → beef bloqué en `pending`.

---

## 1. Fichier des convocations — emplacement exact

### Fichier canonique (UI Convocations)

**`app/invitations/page.tsx`** — route `/invitations`, titre « CONVOCATIONS ».

### Fichiers satellites (découverte / alerte)

| Fichier | Rôle |
|---------|------|
| `components/Header.tsx` | Badge compteur + toast Realtime INSERT |
| `components/GlobalDuelAmbush.tsx` | Modal ambush 30 s sur INSERT `status = 'sent'` |
| `app/notifications/page.tsx` | Notifications type `invite` → `link: '/invitations'` |
| `lib/submitNewBeef.ts` | Création initiale `beef_invitations` à la convocation |
| `components/EditBeefModal.tsx` | Ajout participants + INSERT invitations en édition |

---

## 2. Requête Supabase incriminée — `app/invitations/page.tsx`

### 2.1 Requête principale (fetch convocations)

```104:109:app/invitations/page.tsx
      const { data: invs, error } = await supabase
        .from('beef_invitations')
        .select('id, created_at, beef_id, inviter_id, invitee_id, personal_message, status, expires_at')
        .eq('invitee_id', user.id)
        .in('status', ['sent', 'seen'])
        .order('created_at', { ascending: false });
```

### 2.2 Filtre client post-requête (expiration)

```117:123:app/invitations/page.tsx
      // Filtrer les invitations déjà expirées côté serveur
      const validInvs = invs.filter(inv => new Date(inv.expires_at).getTime() > Date.now());

      if (!validInvs.length) {
        setInvitations([]);
        return;
      }
```

### 2.3 Jointure beefs (enrichissement)

```126:129:app/invitations/page.tsx
      const { data: beefRows, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, subject, description, mediator_id, status, scheduled_at')
        .in('id', beefIds);
```

Boucle finale : si `beefById.get(inv.beef_id)` est absent → invitation **ignorée** (`if (!beef) continue`).

### 2.4 Requête participants (affichage adversaires — pas pour la liste convocations)

```143:147:app/invitations/page.tsx
      const { data: participantsData } = await supabase
        .from('beef_participants')
        .select('beef_id, user_id')
        .in('beef_id', beefIds)
        .eq('is_main', true);
```

### 2.5 Side-effect au chargement (sent → seen)

```190:195:app/invitations/page.tsx
      if (formattedInvitations.length > 0) {
        await supabase
          .from('beef_invitations')
          .update({ status: 'seen', seen_at: new Date().toISOString() })
          .eq('invitee_id', user.id)
          .eq('status', 'sent');
```

---

## 3. RLS — contexte implicite

### `beef_invitations`

```1119:1141:supabase_migrations/init.sql
CREATE POLICY "bi_select_invitee" ON public.beef_invitations
  FOR SELECT USING (auth.uid() = invitee_id);

CREATE POLICY "bi_select_inviter" ON public.beef_invitations
  FOR SELECT USING (auth.uid() = inviter_id);
```

**Confirmé :** un challenger (`invitee_id = auth.uid()`) **peut** lire ses propres lignes. Le bug n'est **pas** un blocage RLS SELECT invitee en conditions nominales.

### `beef_participants`

```1055:1057:supabase_migrations/init.sql
CREATE POLICY "bp_select_public" ON public.beef_participants
  FOR SELECT USING (true);
```

**Confirmé :** lecture publique — fallback possible via `beef_participants` si la page l'utilisait (elle ne le fait pas pour la liste).

### Commentaire feed (RLS spectateurs)

```390:391:app/feed/page.tsx
            // Inclure les « pending » dès qu’ils sont dans beef_participants : les spectateurs ne voient
            // pas les lignes beef_invitations (RLS), donc invited serait vide sans ce cas.
```

Le feed compense pour l'**affichage des noms** ; la page Convocations **n'a pas** cette compensation.

---

## 4. Diagnostic — pourquoi les challengers ne voient rien

### Hypothèse A — Expiration `expires_at` (probable, Severity 1)

**Source :** `lib/submitNewBeef.ts` (création) et `EditBeefModal.tsx` (édition) — même logique.

```151:157:lib/submitNewBeef.ts
      let expiresAt = new Date();
      if (when) {
        expiresAt = new Date(when);
        expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Période de grâce de 10 min
      } else {
        expiresAt.setHours(expiresAt.getHours() + 24);
      }
```

| Cas | `expires_at` | Effet |
|-----|--------------|-------|
| Beef **sans** `scheduled_at` | now + **24 h** | Après 24 h, convocation **invisible** alors que beef peut rester `pending` des jours |
| Beef **avec** `scheduled_at` | scheduled + **10 min** | Fenêtre d'acceptation calée sur l'événement, pas sur la durée de vie du pending |
| Schéma DB default | `NOW() + 7 days` | **Non utilisé** par le client lors de l'INSERT explicite |

**Chaîne causale :**
1. Challenger convoqué → `beef_participants.invite_status = 'pending'` + `beef_invitations.status = 'sent'`.
2. > 24 h sans acceptation (beef non programmé) → requête Convocations retourne des lignes, **filtre client les élimine**.
3. UI affiche « Aucun Défi Actuel » — **aucune alerte**.
4. Trigger `check_beef_ready` ne passera jamais en `ready` → **beef bloqué en `pending`**.

### Hypothèse B — Désynchronisation `beef_invitations` / `beef_participants` (probable)

La page Convocations **ne consulte jamais** `beef_participants.invite_status = 'pending'`.

Scénarios où le participant existe sans invitation visible :
- INSERT `beef_participants` réussi, INSERT `beef_invitations` échoué (RLS, contrainte UNIQUE, rollback partiel).
- Invitation supprimée (`EditBeefModal` delete) sans purge participant.
- `INVITE_PARTICIPANT` API (`app/api/beef/manage/route.ts`) upsert participant + insert invitation conditionnelle — si `existingInv` existe déjà avec status `accepted`/`declined`, pas de nouvelle invitation.

**Résultat :** challenger « fantôme » — dans le ring côté DB, **sans UI d'acceptation**.

### Hypothèse C — Filtre `status` exclut les cas utiles (modéré)

Requête : `.in('status', ['sent', 'seen'])` — exclut explicitement `accepted`, `declined`, `expired`.

Normal pour une inbox d'actions en attente. **Mais** si une invitation passe en `expired` côté DB (job/trigger futur) sans update participant, même impasse.

### Hypothèse D — Badge Header trompeur (UX, aggravant)

```204:208:components/Header.tsx
      supabase
        .from('beef_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .eq('status', 'sent'),
```

- Compte **uniquement** `status = 'sent'`.
- La page Convocations affiche aussi `seen`.
- Au premier chargement `/invitations`, auto-update `sent → seen` → **badge tombe à 0** alors que des convocations restent actionnables.

### Hypothèse E — RLS INSERT (moins probable si création OK)

Policy INSERT `bi_insert_mediator_or_author` exige `auth.uid() = inviter_id` + lien créateur/médiateur sur le beef. Si la création réussit côté créateur, les lignes existent. Échec INSERT = erreur visible au créateur (`submitNewBeef` throw).

### Hypothèse F — GlobalDuelAmbush ne couvre pas tous les cas (modéré)

```77:78:components/GlobalDuelAmbush.tsx
          const inv = payload.new as InvitationRow;
          if (!inv || inv.status !== 'sent') return;
```

- Popup uniquement sur INSERT `status = 'sent'`.
- Utilisateur hors ligne / onglet fermé / déjà passé en `seen` → pas de seconde chance via ambush.
- **Seule file de secours** = page `/invitations` (sujet de cet audit).

---

## 5. Logique d'acceptation — `app/feed/page.tsx`

### 5.1 Construction `userOnLiveRingByBeef`

```430:437:app/feed/page.tsx
          const ringUid = user?.id;
          if (ringUid && partRows) {
            for (const row of partRows as PartRow[]) {
              if (row.user_id !== ringUid) continue;
              if (row.invite_status !== 'accepted') continue;
              if (row.role === 'witness') continue;
              userOnLiveRingByBeef.set(row.beef_id, true);
            }
          }
```

**Confirmé :** seul `invite_status === 'accepted'` positionne l'utilisateur sur le ring.

### 5.2 Propagation vers les cartes

```455:455:app/feed/page.tsx
        const onRing = Boolean(uid && (mid === uid || userOnLiveRingByBeef.get(bid)));
```

```502:502:app/feed/page.tsx
          user_is_live_ring: onRing,
```

Utilisation actuelle dans `BeefCard` :

```1091:1097:app/feed/page.tsx
                    liveAudienceAction={
                      beef.status === 'live'
                        ? {
                            variant: beef.user_is_live_ring ? 'return' : 'join',
                            onClick: () => router.push(`/arena/${beef.id}`),
                          }
                        : undefined
                    }
```

**Limitation :** `user_is_live_ring` ne couvre que le statut **`live`**, pas `scheduled` / `pending`.

### 5.3 Requête feed `beef_invitations` (contexte ring names)

```327:331:app/feed/page.tsx
        const { data: inviteRows } = await supabase
          .from('beef_invitations')
          .select('beef_id, invitee_id, inviter_id, status')
          .in('beef_id', beefIds)
          .in('status', ['sent', 'seen', 'accepted']);
```

Sous RLS, l'utilisateur ne voit que **ses** invitations + celles qu'il a envoyées — pas un bug pour le feed, mais incomplet pour dériver un statut d'acceptation global.

### 5.4 Piste d'enrichissement (non implémentée)

Les `partRows` sont déjà chargés avec `invite_status`. Il serait trivial d'ajouter :

```typescript
userInviteStatusByBeef: Map<string, 'pending' | 'accepted' | 'declined'>
```

…pour le `user.id` courant — **non fait aujourd'hui**.

---

## 6. `components/BeefCard.tsx` — props disponibles

### Interface actuelle (extrait pertinent)

```18:70:components/BeefCard.tsx
interface BeefCardProps {
  // ...
  onPrepareAudience?: () => void;
  liveAudienceAction?: { variant: 'join' | 'return'; onClick: () => void };
  created_by?: string | null;
  // ...
}
```

### Prop existante liée à l'acceptation

**Aucune** prop `invite_status`, `user_has_accepted`, ou `canJoinWaitingRoom`.

### Heuristique `isParticipant` (non fiable pour l'acceptation)

```144:151:components/BeefCard.tsx
  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      // ...
    : false;
```

**Confirmé :** basé sur **usernames affichés**, pas sur `beef_participants.invite_status`. Un challenger `pending` peut apparaître comme « participant » visuellement sans avoir accepté.

### CTA « Rejoindre la salle d'attente » (Phase 1 — non conditionné)

```733:758:components/BeefCard.tsx
                ) : status === 'scheduled' ? (
                  onPrepareAudience ? (
                    // Ref → Préparer la Régie
                  ) : (
                    <button ... onClick={() => { onClick(); setIsTeaserOpen(false); }}>
                      Rejoindre la salle d'attente
                    </button>
                  )
```

**Confirmé :** bouton affiché pour **tout spectateur** sur un beef `scheduled`, **sans vérifier** `invite_status === 'accepted'`. `onClick()` appelle `handleBeefClick` → `/arena/[id]` sans garde.

---

## 7. Flux d'acceptation de référence (réponse convocation)

### Page Convocations — `handleResponse`

```237:254:app/invitations/page.tsx
      const { error: invError } = await supabase
        .from('beef_invitations')
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId);

      const { error: partError } = await supabase
        .from('beef_participants')
        .update({
          invite_status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('beef_id', beefId)
        .eq('user_id', user?.id);
```

**Double écriture** requise. Si l'invitation n'est pas visible (Hypothèse A/B), **ce flux est inaccessible** → pending permanent.

### Trigger DB — passage `pending` → `ready`

```919:925:supabase_migrations/init.sql
  IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
    IF public.check_beef_ready(NEW.beef_id) THEN
      UPDATE public.beefs SET status = 'ready' WHERE id = NEW.beef_id AND status = 'pending';
    END IF;
  END IF;
```

Tous les `is_main = true` doivent être `accepted` pour débloquer le beef.

---

## 8. Matrice des écarts — accès Arène vs acceptation

| Statut beef | Condition actuelle CTA modale | Acceptation requise ? | Écart |
|-------------|------------------------------|----------------------|-------|
| `live` | `liveAudienceAction` (join/return) | Non pour join spectateur | OK |
| `scheduled` | Bouton salle d'attente **ou** Régie (Ref) | **Oui (demandé)** | ❌ Non vérifié |
| `pending` | Messages attente / Devenir Ref / Valider Ref | Oui pour combattants | ❌ Pas de CTA acceptation dans modale |

---

## 9. Pistes correctives anticipées (non implémentées)

| Priorité | Action |
|----------|--------|
| P0 | Fallback Convocations : UNION `beef_participants` WHERE `user_id = auth.uid()` AND `invite_status = 'pending'` AND `is_main = true` |
| P0 | Revoir `expires_at` : aligner sur durée pending (ex. 7 j) ou supprimer filtre client si participant pending |
| P1 | Prop `userInviteStatus` feed → BeefCard ; conditionner CTA salle d'attente à `accepted` |
| P1 | Badge Header : compter `sent` + `seen` non expirés |
| P2 | Réconciliation admin : invitation manquante pour participant pending existant |

---

## 10. Validation audit

- ✅ Fichier convocations identifié : **`app/invitations/page.tsx`**
- ✅ Requête Supabase principale extraite (§2.1)
- ✅ RLS invitee SELECT : **autorisé** — bug plutôt **logique/filtre** que permission
- ✅ Cause probable : **expiration 24 h** + **absence fallback `beef_participants`**
- ✅ BeefCard : **pas de prop fiable** pour acceptation ; CTA scheduled **non conditionné**
- ✅ Feed : `userOnLiveRingByBeef` = **`accepted` only** — réutilisable comme modèle

**En attente GO / VALIDÉ Architecte pour implémentation.**
