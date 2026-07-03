# Rapport d'audit — Base de données (+2 teaser) & sémantique Arène

**Date :** 31 mai 2026  
**Contexte :** après Phase 3 (optimistic partiel sans `teaser_score`), le score serveur bondit encore de **+2** ; challengers voient un texte générique « En attente des participants… » (rapporté en **Arène**).  
**Statut :** exploration uniquement — **aucun correctif implémenté**

---

## Synthèse exécutive

| Anomalie | Verdict audit | Piste principale |
|----------|---------------|------------------|
| **+2 teaser_score serveur** | Le repo ne contient **qu’un seul** trigger `+1` par INSERT ; un **+2 persistant en DB** implique trigger dupliqué en prod, double INSERT client, ou état non déployé | Vérifier `pg_trigger` en production |
| **Texte pending challenger en Arène** | La chaîne exacte **« En attente des participants… »** n’existe **pas** dans `TikTokStyleArena` ni `arena/[roomId]/page.tsx` | Placeholders arène (`Participant N`, `Challenger 1/2`) + fallback BeefCard si `userInviteStatus` null |

---

## Partie 1 — Fouille SQL (bug +2)

### 1.1 Inventaire migrations (repo)

| Fichier | Objet | Impact `teaser_score` |
|---------|-------|------------------------|
| **`supabase_migrations/58_teaser_likes_teaser_score.sql`** | Table `teaser_likes`, colonne `beefs.teaser_score`, fonction + trigger | **+1 / −1** par INSERT/DELETE |
| `supabase_migrations/57_beef_likes_aura_trigger.sql` | `beef_likes` → `engagement_score` | **Aucun** impact sur `teaser_score` |
| `supabase_migrations/54_radar_aura_dynamic.sql` | `aura_sparks`, `transmit_aura` (profil) | **Aucun** impact sur `teaser_score` |
| `init.sql` / autres | Triggers beefs, participants, notifications | **Aucun** sur `teaser_score` |

**Conclusion repo :** une seule définition canonique du sync teaser.

---

### 1.2 Définition complète — migration 58

```1:52:supabase_migrations/58_teaser_likes_teaser_score.sql
-- Aura « teaser » (modal) : compteur teaser_score séparé de engagement_score ; pas d’impact sur les points utilisateur.
BEGIN;

ALTER TABLE public.beefs
  ADD COLUMN IF NOT EXISTS teaser_score integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.teaser_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  beef_id uuid NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  UNIQUE (beef_id, user_id)
);

CREATE OR REPLACE FUNCTION public.trg_teaser_likes_sync_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
BEGIN
  IF tg_op = 'INSERT' THEN
    bid := NEW.beef_id;
  ELSE
    bid := OLD.beef_id;
  END IF;

  IF tg_op = 'INSERT' THEN
    UPDATE public.beefs
    SET teaser_score = COALESCE(teaser_score, 0) + 1
    WHERE id = bid;
  ELSE
    UPDATE public.beefs
    SET teaser_score = GREATEST(0, COALESCE(teaser_score, 0) - 1)
    WHERE id = bid;
  END IF;

  RETURN CASE WHEN tg_op = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS tr_teaser_likes_sync_score ON public.teaser_likes;

CREATE TRIGGER tr_teaser_likes_sync_score
  AFTER INSERT OR DELETE ON public.teaser_likes
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_teaser_likes_sync_score();
```

**Comportement attendu (1 clic, 1 INSERT) :**

```
INSERT teaser_likes (beef_id, user_id)
  → tr_teaser_likes_sync_score (FOR EACH ROW)
  → UPDATE beefs SET teaser_score = teaser_score + 1
```

Contrainte **`UNIQUE (beef_id, user_id)`** : un second INSERT identique **échoue** (pas de deuxième ligne), mais si **deux triggers** existent sur la même table, **un seul INSERT** peut produire **+2**.

---

### 1.3 Chaîne applicative (post Phase 3)

```757:782:app/feed/page.tsx
    // --- AJOUT OPTIMISTIC UI (Partiel) ---
    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          return {
            ...b,
            has_liked_teaser: !b.has_liked_teaser,
            // On retire l'incrémentation locale du score pour éviter le glitch "+2".
            // Le Realtime se chargera de fetcher le compte exact après 1500ms.
          };
        }
        return b;
      }),
    );

    try {
      // ...
        const { error } = await supabase.from('teaser_likes').insert({ beef_id: beefId, user_id: user.id });
```

**Realtime (refetch score affiché) :**

```629:637:app/feed/page.tsx
    const channel = supabase
      .channel('beefs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void loadBeefs(true);
        }, 1500);
      })
```

**Si le score affiché saute encore de +2 sans optimistic local :** la valeur **`beefs.teaser_score` en base** est réellement +2 → cause **SQL ou double INSERT**, pas React.

---

### 1.4 Hypothèses classées (+2 serveur)

| # | Hypothèse | Plausibilité | Vérification prod |
|---|-----------|--------------|-------------------|
| **H1** | **Trigger dupliqué** (migration rejouée, ancien trigger non droppé sous autre nom) | **Élevée** | `SELECT tgname FROM pg_trigger JOIN pg_class ... WHERE relname = 'teaser_likes';` |
| **H2** | **Double INSERT** (double appel `handleTeaserAuraClick` avant verrou) | Moyenne | Logs Supabase / count rows `teaser_likes` par user/beef |
| **H3** | **Deux triggers sur événements différents** (ex. INSERT + autre hook) | Faible dans repo | Audit `pg_proc` / triggers sur `teaser_likes` et `beefs` |
| **H4** | Confusion **particule UI « +1 »** + score numérique +1 = perception « +2 » | Moyenne (UX) | Comparer valeur DB vs animation BeefCard |
| **H5** | Déploiement Phase 3 **non actif** en prod | À confirmer | Vérifier commit déployé Vercel |

**Note client (double appel handler) — peut causer double INSERT si verrous contournés :**

```623:637:components/BeefCard.tsx
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!has_liked_teaser && !localTeaserAuraLock.current) {
                            // ... particule +1 ...
                          }
                          onTeaserAuraClick();  // ← toujours appelé
                        }}
```

`isLikingTeaser` (feed) limite à 1,5 s, mais un **double INSERT** reste impossible grâce à `UNIQUE` — sauf **deux triggers** sur le premier INSERT réussi.

---

### 1.5 Requêtes SQL de diagnostic recommandées (prod)

```sql
-- Triggers actifs sur teaser_likes
SELECT t.tgname, p.proname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE c.relname = 'teaser_likes' AND NOT t.tgisinternal;

-- Cohérence score vs comptage réel
SELECT b.id, b.teaser_score, COUNT(tl.id) AS likes_count
FROM beefs b
LEFT JOIN teaser_likes tl ON tl.beef_id = b.id
WHERE b.id = '<beef_uuid>'
GROUP BY b.id, b.teaser_score;
```

Si `teaser_score > likes_count` → incréments fantômes (triggers multiples ou updates manuels).

---

## Partie 2 — Sémantique Arène (textes « attente / participants »)

### 2.1 Résultat grep ciblé

| Fichier | Occurrence « En attente des participants… » |
|---------|---------------------------------------------|
| `components/TikTokStyleArena.tsx` | **Aucune** |
| `app/arena/[roomId]/page.tsx` | **Aucune** |
| `components/BeefCard.tsx` | **Oui** (modale feed — corrigé Phase sémantique, voir §2.4) |

La chaîne exacte signalée par l’utilisateur est **hors Arène** dans le code actuel, sauf si l’utilisateur confond **modale BeefCard** (avant entrée) et **interface Arène**.

---

### 2.2 `app/arena/[roomId]/page.tsx` — textes visibles

**Sas Check Matériel (personnalisation partielle par `userRole`) :**

```397:403:app/arena/[roomId]/page.tsx
            <h2 className="text-2xl font-black uppercase tracking-widest text-white">Check Matériel</h2>
            <p className="text-sm font-semibold text-white/50">
              Tu entres dans l&apos;Agora en tant que{' '}
              <span className="uppercase text-cyan-400">
                {userRole === 'mediator' ? 'Ref' : userRole === 'challenger' ? 'Combattant' : userRole}
              </span>
              .
            </p>
```

**Autres messages arène page :** « Connexion requise », « Accès vidéo indisponible », « Beef terminé », « Préparation de la room vidéo… » (via enfant) — **aucun** « En attente des participants ».

**Props passées à l’arène :**

```441:453:app/arena/[roomId]/page.tsx
      <TikTokStyleArena
        host={host}
        roomId={roomId}
        userId={userId}
        userName={userName}
        userRole={userRole}
        viewerCount={initialViewerCount}
        debateTitle={beefTitle}
        dailyRoomUrl={dailyRoomUrl}
        dailyMeetingToken={dailyMeetingToken}
        ...
      />
```

`userRole` est disponible mais **non exploité** pour un bandeau d’attente pending global.

---

### 2.3 `TikTokStyleArena.tsx` — placeholders & attente

#### A. Filtrage noms « En attente* » (legacy feed)

```1776:1781:components/TikTokStyleArena.tsx
    challengerRemoteSlots.forEach((p, idx) => {
      if (!p?.arenaUserId) return;
      const name = p.userName?.trim();
      const label =
        name && !name.startsWith('En attente') ? name : `Combattant ${idx + 1}`;
      push(p.arenaUserId, label);
    });
```

**Observation :** le code **anticipe** des `userName` Daily/feed préfixés « En attente… » et les remplace par « Combattant N ». Aucune source repo actuelle ne produit « En attente des participants » pour les noms de slot.

#### B. Labels panels latéraux (placeholders génériques)

```1692:1713:components/TikTokStyleArena.tsx
    ? (challengerRemoteSlots[0]?.userName || 'Challenger 1')
    // ...
    ? (challengerRemoteSlots[1]?.userName || 'Challenger 2')
    : (challengerRemoteSlots[0]?.userName || 'Challenger 2');
```

#### C. Grille arène — `useArenaLayoutTiles.ts`

```20:36:components/Arena/useArenaLayoutTiles.ts
function resolveTileName(...): string {
  // ...
  if (uid && participantRoles[uid]?.name) {
    return participantRoles[uid].name;
  }
  const trimmed = panel?.userName?.trim();
  if (trimmed) return trimmed;
  return `Participant ${idx + 1}`;
}
```

#### D. Tuile sans vidéo — badge « Absent »

```123:127:components/Arena/shared/ArenaVideoSurface.tsx
        {!tile.panel && (
          <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-400">
            Absent
          </span>
        )}
```

#### E. Chargement participants (accepted only)

```891:896:components/TikTokStyleArena.tsx
    const validData = (data as ParticipantRow[]).filter(
      (p) =>
        p.role !== 'witness' &&
        p.invite_status === 'accepted',
    );
```

En beef **`pending`**, un challenger **seul accepté** voit des slots vides → **`Participant 1` / `Participant 2`** ou **« Absent »** — pas de message rôle personnalisé.

#### F. Écran VS — noms depuis `participantRoles`

```3126:3134:components/TikTokStyleArena.tsx
              <VsTransition
                challengers={
                  [
                    participantRoles[expectedUids[0]]?.name,
                    participantRoles[expectedUids[1]]?.name,
                    // ...
                  ].filter(Boolean) as string[]
                }
```

Si un seul accepted → VS partiel ; fallback nom DB : `'Participant'` (L.917).

#### G. `userRole` consommé pour comportement, pas pour copy pending

```269:313:components/TikTokStyleArena.tsx
  const isViewer = userRole === 'viewer' || userRole === 'spectator';

  useEffect(() => {
    if (isViewer) {
      setShowPreJoin(false);
      setHasJoined(true);
    }
  }, [isViewer]);
```

**Manque identifié :** aucun bandeau du type « En attente de ton adversaire » basé sur `userRole === 'challenger'` + statut beef `pending`.

#### H. PreJoin — message room pas prête

```3151:3155:components/TikTokStyleArena.tsx
          {!effectiveDailyRoomUrl && (
            <div className="absolute bottom-10 left-1/2 ...">
              Préparation de la room vidéo...
            </div>
          )}
```

Identique pour Ref, challenger, spectateur.

---

### 2.4 BeefCard — source probable du texte exact (feed / modale)

Correction Phase sémantique **déjà commitée** :

```224:230:components/BeefCard.tsx
  const getPendingRefText = () => {
    if (intent !== 'manifesto') {
      if (user?.id === mediator_id) return 'En attente des combattants…';
      if (userInviteStatus === 'pending') return null;
      if (userInviteStatus === 'accepted') return 'En attente de ton adversaire…';
      return 'En attente des participants…'; // Spectateurs
    }
```

**Faille résiduelle :** si `userInviteStatus === null` (participant non résolu dans `loadBeefs`) alors qu’il est **challenger accepté**, le fallback **spectateur** s’applique → « En attente des participants… ».

**Overlay carte (visible avant ouverture modale) — placeholders VS :**

```409:411:components/BeefCard.tsx
            <span className="italic">{challenger_a_name || 'Challenger 1'}</span>
            <span className="text-brand-400">VS</span>
            <span className="italic">{challenger_b_name || 'Challenger 2'}</span>
```

---

### 2.5 Matrice rôle → texte (état actuel)

| Profil | BeefCard modale (`getPendingRefText`) | Arène (`TikTokStyleArena` / staging) |
|--------|--------------------------------------|--------------------------------------|
| **Ref** | « En attente des combattants… » | Staging : « Ref » |
| **Challenger accepted** | « En attente de ton adversaire… » | Slots vides : `Participant N` / `Absent` |
| **Challenger pending** | `null` (+ CTA convocation) | Idem arène |
| **Spectateur** | « En attente des participants… » | PreJoin skip, pas de copy pending |
| **Challenger sans `userInviteStatus` en feed** | **Fallback spectateur** ⚠️ | Placeholders génériques |

---

## Partie 3 — Pistes correctives anticipées (non implémentées)

### +2 teaser_score

1. Exécuter requêtes §1.5 en prod ; supprimer trigger en double si présent.
2. Vérifier cohérence `teaser_score` vs `COUNT(teaser_likes)`.
3. Option défensive : remplacer trigger par **recalcul** `teaser_score = (SELECT COUNT(*) FROM teaser_likes WHERE beef_id = …)` (idempotent).
4. Client : déplacer `onTeaserAuraClick()` **inside** le garde animation ; aligner `onKeyDown`.

### Sémantique challenger

1. **Arène** : bandeau pending basé sur `userRole` + `beef.status` (props à ajouter).
2. **Feed** : ne pas fallback spectateur si `user?.id` ∈ `beef_participants` accepted.
3. Remplacer placeholders `Participant N` par copy rôle (« Tu es au ring — en attente de l’adversaire ») quand `userRole === 'challenger'`.

---

**Fin d’audit — extraits SQL et UI documentés. En attente GO pour correctifs.**
