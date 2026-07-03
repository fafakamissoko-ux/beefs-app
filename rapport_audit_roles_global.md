# Rapport d'audit RBAC global — Arène, Feed, Invitations

**Date :** 31 mai 2026  
**Périmètre :** 4 profils (Invité, Spectateur, Combattant, Ref/Médiateur)  
**Statut :** diagnostic pur — **aucun correctif implémenté**

---

## Synthèse exécutive

| Zone | Garde principal | Niveau de confiance |
|------|-----------------|---------------------|
| Middleware Next.js | `/invitations`, `/create`, etc. — **pas** `/arena` | Partiel |
| Mur auth arène | Client `app/arena/[roomId]/page.tsx` | Moyen |
| Billet Daily | `GET /api/beef/access` (serveur) | **Élevé** (source de vérité WebRTC) |
| Rôle UI arène | `setUserRole` client → `TikTokStyleArena` | **Faible** (désaligné du token) |
| Acceptation convocations | RLS Supabase `bi_update_invitee` | Moyen (pas d’API dédiée) |
| Feed / BeefCard | Props conditionnelles par `user?.id` | Moyen |

**Constat central :** la sécurité WebRTC repose sur le **jeton Daily émis côté serveur** ; le rôle React (`userRole`) pilote l’UX (PreJoin, caméra, staging) et peut diverger — bugs d’expérience et incohérences RBAC, pas nécessairement une élévation de privilège Daily si le token est correct.

---

## Matrice des profils

| Profil | Feed | `/arena/[id]` | `/live/[id]` | Billet `/api/beef/access` | Caméra PreJoin |
|--------|------|---------------|--------------|---------------------------|----------------|
| **Invité** | Lecture OK (spinner auth puis feed) | Mur « Connexion requise » | Redirect `/login` (sans `next`) | 401 `AUTH_REQUIRED` | Non atteint |
| **Spectateur** | CTA « Rejoindre la salle d'attente » | `userRole = viewer` | `userRole = viewer` | `role: spectator` | `viewerMode` → skip |
| **Combattant** | `user_invite_status`, CTA convocation | `challenger` si `invite_status === 'accepted'` | Idem (avec bug `.toLowerCase()` résiduel) | `role: participant` | PreJoin + caméra |
| **Ref** | `onPrepareAudience` si `mediator_id` | `mediator` si `effectiveHostId` | `mediator` si `mediator_id` | `role: mediator` si `mediator_id` | PreJoin + staging |

---

## 1. Vecteur d'accès anonyme (Guest)

### 1.1 Middleware — routes protégées vs ouvertes

```149:165:middleware.ts
  const protectedPrefixes = ['/create', '/settings', '/invitations', '/messages', '/admin', '/notifications'];

  const isProtectedPath =
    pathname === '/profile' ||
    protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // 1. Bloquer les non-connectés hors des zones sécurisées
  if (!user && isProtectedPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }
```

```81:86:middleware.ts
function pathRequiresArenaProfile(pathname: string): boolean {
  if (pathname === '/feed' || pathname.startsWith('/feed/')) return true;
  if (pathname === '/live' || pathname.startsWith('/live/')) return true;
  if (pathname === '/arena' || pathname.startsWith('/arena/')) return true;
  return false;
}
```

| Route | Middleware bloque invité ? | Comportement réel |
|-------|---------------------------|-------------------|
| `/feed` | **Non** | Feed charge après `authLoading` |
| `/arena/[id]` | **Non** | Page client → mur login |
| `/invitations` | **Oui** → `/login?next=…` | — |
| `/live/[id]` | **Non** | Redirect client `window.location.href = '/login'` |

**Faille / lacune :** pas de garde middleware sur `/arena` ni `/live`. L’invité **peut charger la page** (fetch beef public, spinners) avant le mur login — pas de crash, mais surface d’exposition et requêtes DB anon.

**Layouts :** aucun `app/arena/**/layout.tsx` ni `app/invitations/layout.tsx` — protection uniquement middleware + client.

---

### 1.2 Feed — invité clique BeefCard

```792:803:app/feed/page.tsx
  const handleBeefClick = (beef: Beef) => {
    if (
      beef.status === 'ended' ||
      beef.status === 'replay' ||
      beef.status === 'completed' ||
      beef.status === 'cancelled'
    ) {
      router.push(`/beef/${beef.id}/summary`);
      return;
    }
    router.push(`/arena/${beef.id}`);
  };
```

- Pas de test `if (!user)` avant navigation.
- Invité : modale Teaser → « Rejoindre la salle d'attente » → `/arena/[id]`.

```298:331:app/arena/[roomId]/page.tsx
  if (entryPhase === 'READY' && !beefEndedInfo && !userId.trim() && !accessError) {
    return (
      // ...
      <Link href={`/login?next=${encodeURIComponent(loginNext)}`}>
        Se connecter
      </Link>
    );
  }
```

**Verdict invité :** redirect **différé** (mur client), pas middleware. Pas de crash ; billet vidéo jamais émis sans auth :

```121:127:app/api/beef/access/route.ts
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'AUTH_REQUIRED', error: 'Authentification requise' },
        { status: 401 },
      );
    }
```

---

### 1.3 Session expirée / token JWT instable

```167:174:middleware.ts
  if (
    user == null &&
    getUserError &&
    isAuthenticatedExperiencePath(pathname)
  ) {
    return response;
  }
```

Sur `/feed` ou `/arena`, une **erreur transitoire** `getUser` laisse passer la requête même sans user middleware — cohérent avec le mur client arène, mais peut afficher un feed « déconnecté » sans redirect immédiat.

---

### 1.4 Fuite de données anon (RLS)

Migration `51_nuke_and_reset_rls_beef_participants.sql` :

- `beefs` : `SELECT USING (true)` — public
- `beef_participants` : `SELECT USING (true)` — **public**

**Impact :** un invité (client anon) peut lire **tous** les participants et `invite_status` d’un beef via Supabase client, indépendamment du feed. Plus large que `userInviteStatus` (filtré par user courant).

---

## 2. Étanchéité des rôles WebRTC (Arène)

### 2.1 Assignation client — `app/arena/[roomId]/page.tsx`

```129:188:app/arena/[roomId]/page.tsx
      const effectiveHostId: string = beef.mediator_id ?? beef.created_by ?? '';
      // ...
      if (userIdsEqual(effectiveHostId, uidTrim)) {
        setUserRole('mediator');
      } else {
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', uidTrim)
          .maybeSingle();

        if (participation && participation.invite_status === 'accepted') {
          setUserRole('challenger');
        } else {
          setUserRole('viewer');
        }
      }
```

| Condition | `userRole` client | Commentaire |
|-----------|-------------------|-------------|
| `userId === mediator_id \|\| created_by` | `mediator` | **Fallback `created_by`** si pas de Ref |
| `invite_status === 'accepted'` | `challenger` | **Sans** filtre `is_main`, `role !== 'witness'` |
| Sinon | `viewer` | |

**Failles logiques identifiées :**

1. **Créateur manifesto sans `mediator_id`** → client `mediator`, mais API access ne reconnaît que `beef.mediator_id` → jeton **`spectator`** (voir §2.3).
2. **Témoin (`witness`) accepté** → client `challenger` + staging caméra ; token probablement `participant` si accepted en DB.
3. **Raise-hand accepté** (`is_main: false`) → client `challenger` — peut être voulu, mais élargit le ring au-delà des « main » du feed.
4. **`ticket.role` ignoré** après fetch — seul `dailyRoomUrl` / `dailyToken` sont stockés ; pas de réconciliation.

---

### 2.2 Consommation rôle — `TikTokStyleArena.tsx`

```269:313:components/TikTokStyleArena.tsx
  const isViewer = userRole === 'viewer' || userRole === 'spectator';

  useEffect(() => {
    if (isViewer) {
      setShowPreJoin(false);
      setHasJoined(true);
    }
  }, [isViewer]);
```

```3150:3150:components/TikTokStyleArena.tsx
          <PreJoinScreen userName={userName} onJoin={handleJoin} viewerMode={isViewer} mediatorName={mediatorName} />
```

**Conséquence :** tout utilisateur classé `challenger` ou `mediator` côté client active PreJoin / `getUserMedia`, **indépendamment** du rôle réel du jeton Daily.

---

### 2.3 Source de vérité serveur — `app/api/beef/access/route.ts`

```152:171:app/api/beef/access/route.ts
    let tokenRole: DailyTokenRole = 'spectator';
    let isCreator = false;

    if (userIdsEqual(beef.mediator_id, user.id)) {
      tokenRole = 'mediator';
      isCreator = true;
    } else {
      const uidForParticipant = canonicalUserUuid(user.id) ?? user.id.trim();
      const { data: part } = await supabaseAdmin
        .from('beef_participants')
        .select('id')
        .eq('beef_id', beefId)
        .eq('user_id', uidForParticipant)
        .eq('invite_status', 'accepted')
        .maybeSingle();
      if (part) {
        tokenRole = 'participant';
        isCreator = true;
      }
    }
```

```79:85:app/api/beef/access/route.ts
  if (role === 'mediator') {
    properties.is_owner = true;
  }
  if (role === 'spectator') {
    properties.start_video_off = true;
    properties.start_audio_off = true;
  }
```

| Rôle API | Propriétés Daily | Qui l’obtient |
|----------|------------------|---------------|
| `mediator` | `is_owner: true` | **`mediator_id` uniquement** |
| `participant` | Pistes locales autorisées | `beef_participants.accepted` |
| `spectator` | `start_video_off`, `start_audio_off` | Tous les autres (si room existe) |

**Incohérence critique (Ref manifesto) :**

- Client arène : `effectiveHostId = created_by` → UI Ref + Check Matériel.
- API : pas de `created_by` → jeton **spectator**.
- **Sécurité Daily :** le créateur ne devient pas owner Daily ; **UX :** incohérence majeure.

**Spectateur authentifié peut-il devenir combattant par faille client ?**

- **Non** via manipulation pure du state React seul : le join Daily utilise le **token signé** serveur.
- **Oui** côté UX si `setUserRole('challenger')` à tort (ex. fausse ligne `accepted`, ou bug `/live` avec `.toLowerCase()`) : PreJoin demande la caméra ; Daily peut quand même refuser la publication si token = `spectator`.
- **Oui** côté métier si l’utilisateur obtient légitimement `invite_status = 'accepted'` (convocation, acceptation médiateur via `ACCEPT_PARTICIPANT`).

---

### 2.4 Divergence `/live/[id]` (route régie)

```145:161:app/live/[id]/page.tsx
      if (userIdsEqual(beef.mediator_id, userId)) {
        setUserRole('mediator');
      } else {
        const uidNorm = userId.trim().toLowerCase();
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', uidNorm)
          .maybeSingle();
        // ...
      }
```

**Faille résiduelle :** `/live/[id]` conserve `.toLowerCase()` sur UUID — `/arena/[id]` corrigé. Risque de `viewer` client + mauvaise UX, ou inversement selon casse DB.

**Autres écarts `/live` vs `/arena` :**

- Pas de sas « Check Matériel » sur `/live`.
- Auth : redirect `/login` **sans** `?next=` (perte de deep link).
- Pas de fallback `created_by` pour hôte manifesto.

---

### 2.5 `fetchBeefVideoTicket` — rôle retourné non propagé

```63:69:lib/client/fetch-beef-video-ticket.ts
  return {
    ok: true,
    role: typeof data.role === 'string' ? data.role : 'spectator',
    viewerAccess: typeof data.viewerAccess === 'string' ? data.viewerAccess : 'full',
    dailyRoomUrl: url,
    dailyToken: tok,
  };
```

La page arène **n’utilise pas** `ticket.role` pour `setUserRole` — écart architecture client/serveur documenté.

---

## 3. Convocations & acceptations

### 3.1 `handleResponse` — `app/invitations/page.tsx`

```271:288:app/invitations/page.tsx
      const { error: invError } = await supabase
        .from('beef_invitations')
        .update({
          status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId);
      // ...
      const { error: partError } = await supabase
        .from('beef_participants')
        .update({
          invite_status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('beef_id', beefId)
        .eq('user_id', user?.id);
```

**Peut-on forcer l’acceptation d’un beef non convoqué en modifiant l’ID client ?**

| Vecteur | Résultat |
|---------|----------|
| Changer `invitationId` (invitation d’un autre) | **Bloqué** — RLS `bi_update_invitee` : `auth.uid() = invitee_id` |
| Changer `beefId` avec invitation valide | Invitation OK ; update participant sur **mauvais** `beef_id` → 0 ligne si pas participant → **désync** possible invitation/participant |
| Accepter sans ligne `beef_participants` | Update participant sans erreur (0 rows) ; invitation `accepted` — **état incohérent** |
| Accepter sans invitation (appel direct Supabase) | Update participant own row via `bp_update_self` **si** ligne existe ; insert `accepted` **non** autorisé sans policy créateur/médiateur |

**RLS pertinent :**

```139:141:supabase_migrations/51_nuke_and_reset_rls_beef_participants.sql
CREATE POLICY "bi_update_invitee"
  ON public.beef_invitations FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id);
```

```109:111:supabase_migrations/51_nuke_and_reset_rls_beef_participants.sql
CREATE POLICY "bp_update_self"
  ON public.beef_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
```

**Verdict :** pas d’élévation directe vers combattant d’un beef arbitraire **sans** ligne participant préalable + invitation ; failles = **désynchronisation** et absence de validation serveur `beefId === invitation.beef_id`.

**Garde page :** `/invitations` protégé middleware + redirect client si `!user`.

---

### 3.2 API `POST /api/beef/manage` — acceptation par le médiateur

```160:178:app/api/beef/manage/route.ts
    if (action === 'ACCEPT_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      // ...
      const { error } = await supabaseAdmin
        .from('beef_participants')
        .update({
          role: 'participant',
          invite_status: 'accepted',
          responded_at: now,
        })
        .eq('beef_id', beefId)
        .eq('user_id', participantId);
```

- Auth Bearer obligatoire.
- Actions sensibles après `isMediatorOfBeef` (inclut `created_by` si `mediator_id` null).
- **Service role** — contourne RLS ; contrôle d’accès = logique route uniquement.

---

### 3.3 `userInviteStatus` sur BeefCard — fuite inter-utilisateur ?

```432:441:app/feed/page.tsx
          const ringUid = user?.id;
          if (ringUid && partRows) {
            for (const row of partRows as PartRow[]) {
              if (row.user_id !== ringUid) continue;
              userInviteStatusByBeef.set(row.beef_id, row.invite_status);
              if (row.invite_status !== 'accepted') continue;
              if (row.role === 'witness') continue;
              userOnLiveRingByBeef.set(row.beef_id, true);
            }
          }
```

```506:506:app/feed/page.tsx
          user_invite_status: userInviteStatusByBeef.get(bid) || null,
```

**Verdict prop feed :** strictement filtré sur `user.id` — **pas de fuite** via cette prop.

**Mais :** `beef_participants` SELECT public expose les statuts de **tous** les participants à quiconque interroge Supabase directement.

---

## 4. Cycle de vie Feed (scheduled → live → ended)

### 4.1 Propagation des CTAs par statut

| Statut | Props feed | CTA BeefCard |
|--------|------------|--------------|
| `pending` / `scheduled` | `onPrepareAudience` si `user === mediator_id` | Préparer Régie / convocation / rejoindre |
| `live` | `liveAudienceAction` (`return` si `user_is_live_ring`) | Rejoindre / Retourner Agora |
| `ended` / `replay` / `cancelled` | Aucune prop ring | « Voir le Verdict & Résumé » |

```1054:1103:app/feed/page.tsx
                    onPrepareAudience={
                      (beef.status === 'scheduled' || beef.status === 'pending') && user?.id === beef.mediator_id
                        ? () => router.push(`/arena/${beef.id}`)
                        : undefined
                    }
                    liveAudienceAction={
                      beef.status === 'live'
                        ? {
                            variant: beef.user_is_live_ring ? 'return' : 'join',
                            onClick: () => router.push(`/arena/${beef.id}`),
                          }
                        : undefined
                    }
```

```712:722:components/BeefCard.tsx
                {isReplay || status === 'cancelled' ? (
                  <button /* Voir le Verdict & Résumé */ />
                ) : status === 'live' ? (
                  // Rejoindre le Direct / Retourner
                ) : status === 'scheduled' || status === 'pending' ? (
```

**Révocation post-combat :** une fois `ended`, les CTAs ring/regie **disparaissent** — cohérent.

**Incohérences résiduelles :**

1. **`onPrepareAudience`** exige `mediator_id` — le **créateur manifesto** (`created_by`, pas encore Ref) ne voit pas « Préparer la Régie » alors que l’arène peut le traiter comme `mediator` via `effectiveHostId`.
2. **`isParticipant` BeefCard** (heuristique username) ≠ `user_invite_status` :

```146:153:components/BeefCard.tsx
  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      // ...
    : false;
```

Peut masquer/afficher « Devenir le Ref » incorrectement vs statut réel en DB.

3. **`user_is_live_ring`** : médiateur (`mid === uid`) compte comme « on ring » même sans ligne participant — CTA « Retourner dans l'Agora » en live même si jamais entré dans l’arène.

4. **Transition realtime** : dépend du canal `beefs_changes` + `loadBeefs` — fenêtre stale possible avant refresh ; pas de révocation côté client du billet Daily déjà émis (TTL 2 h).

---

## 5. Inventaire des gardes par fichier

| Fichier | Rôle RBAC |
|---------|-----------|
| `middleware.ts` | Auth `/invitations`, onboarding, rate limit API ; **pas** `/arena` |
| `contexts/AuthContext.tsx` | Session app (`user`, `loading`) — rôle app admin/modérateur séparé du rôle arène |
| `app/arena/[roomId]/page.tsx` | Mur login, rôle client, sas staging, fetch billet |
| `app/live/[id]/page.tsx` | Auth obligatoire, rôle client (bug casse UUID) |
| `app/api/beef/access/route.ts` | **RBAC WebRTC serveur** |
| `app/api/beef/manage/route.ts` | Actions médiateur (service role) |
| `app/api/beef/raise-hand/route.ts` | Spectateur → `pending` (live only) |
| `app/feed/page.tsx` | Props CTA par profil + statut |
| `components/BeefCard.tsx` | Rendu CTAs exclusifs (Ref vs autres) |
| `app/invitations/page.tsx` | Acceptation RLS + redirect arène |

---

## 6. Tableau des failles & manques (priorisé)

| ID | Sévérité | Description | Fichiers |
|----|----------|-------------|----------|
| F1 | **Haute** | Désalignement client `mediator` (`created_by`) vs token Daily `spectator` | `arena/page.tsx`, `access/route.ts` |
| F2 | **Moyenne** | `userRole` client ignore `ticket.role` — UX caméra / staging incorrecte | `arena/page.tsx`, `TikTokStyleArena.tsx`, `fetch-beef-video-ticket.ts` |
| F3 | **Moyenne** | `/live/[id]` : `.toLowerCase()` UUID + pas de sas + login sans `next` | `live/[id]/page.tsx` |
| F4 | **Moyenne** | `challenger` client sans filtre `witness` / `is_main` | `arena/page.tsx` |
| F5 | **Moyenne** | `beef_participants` SELECT public — fuite statuts participants | RLS migration 51 |
| F6 | **Basse** | `/arena` accessible anon (spinners + lecture beef) sans redirect middleware | `middleware.ts`, `arena/page.tsx` |
| F7 | **Basse** | `handleResponse` ne valide pas `beefId === invitation.beef_id` | `invitations/page.tsx` |
| F8 | **Basse** | `isParticipant` BeefCard heuristique username ≠ RBAC DB | `BeefCard.tsx` |
| F9 | **Basse** | Créateur manifesto sans CTA « Préparer la Régie » (`mediator_id` requis) | `feed/page.tsx` |
| F10 | **Info** | Jeton Daily TTL 2 h — accès persiste après fin de beef côté client jusqu’à exp | `access/route.ts` |

---

## 7. Conclusion par profil

### Invité
- Peut parcourir le feed et ouvrir l’URL arène ; **bloqué au mur login** avant WebRTC.
- Données beef/participants **lisibles publiquement** via RLS (F5).

### Spectateur
- Rôle par défaut correct si pas `accepted`.
- Protégé côté Daily par token `spectator` ; risque UX si client le classe `challenger` (F2, F3).

### Combattant
- Doit avoir `invite_status = 'accepted'` (RLS + API).
- Acceptation non forgeable sur beef tiers sans invitation + ligne participant (RLS).
- Élargissement ring (witness, raise-hand) possible selon DB (F4).

### Ref / Médiateur
- Token owner Daily **uniquement** si `mediator_id` en DB.
- Fallback `created_by` côté arène **non reflété** dans l’API billet (F1).
- CTAs feed alignés sur `mediator_id` strict (F9).

---

**Fin d’audit — diagnostic uniquement. En attente GO pour plan de remédiation.**
