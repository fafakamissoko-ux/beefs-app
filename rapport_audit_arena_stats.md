# Rapport d'audit — Stats Arène & fin de Beef

**Date :** 2026-05-31  
**Projet Supabase prod :** `clsztcvmhvccvjxdwapt`  
**Mode :** extraction lecture seule — aucune modification de code  
**Contexte :** préparation refonte — persistance des Taps (A, B, Ref) en fin de Live

---

## 1. Schéma `beefs` — colonnes tap / vote

### Requête demandée (exécutée telle quelle via MCP Supabase)

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'beefs' AND column_name LIKE '%tap%' OR column_name LIKE '%vote%';
```

**Résultat prod :** `[]` (aucune ligne)

> **Note de précédence SQL :** cette requête évalue `(table_name = 'beefs' AND column_name LIKE '%tap%') OR (column_name LIKE '%vote%')`. Elle cherche `%vote%` sur **toutes** les tables du schéma courant, pas uniquement `beefs`. Le résultat vide confirme l'absence de colonnes `%vote%` globalement.

### Requête corrigée (complément d'audit)

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'beefs' 
  AND (column_name LIKE '%tap%' OR column_name LIKE '%vote%' OR column_name LIKE '%resonance%' OR column_name LIKE '%aura%');
```

**Résultat prod :** `[]` (aucune ligne)

### Recherche globale schéma `public` (tap / vote / resonance)

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND (column_name LIKE '%tap%' OR column_name LIKE '%vote%' OR column_name LIKE '%resonance%')
ORDER BY table_name, column_name;
```

**Résultat prod :** `[]` (aucune colonne nommée tap, vote ou resonance dans aucune table)

### Colonnes statistiques existantes sur `beefs` (prod — inventaire complet)

| column_name | data_type |
|-------------|-----------|
| id | uuid |
| created_at | timestamp with time zone |
| updated_at | timestamp with time zone |
| title | text |
| description | text |
| subject | text |
| severity | text |
| mediator_id | uuid |
| origin | text |
| conflict_date | date |
| status | text |
| is_premium | boolean |
| price | numeric |
| started_at | timestamp with time zone |
| ended_at | timestamp with time zone |
| duration_minutes | integer |
| **viewer_count** | integer |
| **max_viewers** | integer |
| **total_gifts_received** | integer |
| tags | ARRAY |
| scheduled_at | timestamp with time zone |
| **resolution_status** | text |
| is_featured | boolean |
| feed_position | integer |
| free_preview_minutes | integer |
| mediation_summary | text |
| created_by | uuid |
| intent | text |
| event_type | text |
| thumbnail | text |
| video_url | text |
| **engagement_score** | integer |
| **teaser_score** | bigint |
| **comment_count** | integer |

**Conclusion schéma `beefs` :** aucune colonne dédiée aux taps par slot (A/B/C/D/E/F/M). Les stats live persistées sont `viewer_count`, `max_viewers`, `total_gifts_received`, `engagement_score`, `teaser_score`, `comment_count`. **Il n'existe pas aujourd'hui de colonnes pour sauvegarder les résonances/taps de fin de live.**

### Table connexe : `beef_reactions` (prod)

| column_name | data_type |
|-------------|-----------|
| id | uuid |
| beef_id | uuid |
| user_id | uuid |
| emoji | text |
| created_at | timestamp with time zone |

**Limite :** pas de colonne `support_slot` / `target` — impossible de distinguer un tap A vs B vs Ref en base. Schéma repo : `supabase_migrations/init.sql` L237–243, commentaire « Reaction history for analytics ».

---

## 2. Schéma `users` — stats Sagesse (resolved / abandoned / hosted)

### Requête demandée (exécutée telle quelle via MCP Supabase)

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name IN ('beefs_resolved', 'beefs_abandoned', 'beefs_hosted');
```

**Résultat prod :** `[]` (aucune ligne)

**Conclusion :** les colonnes `beefs_resolved`, `beefs_abandoned`, `beefs_hosted` **n'existent pas** en base prod. L'« Indice de Sagesse » est calculé **côté client** dans `app/profile/ProfileContent.tsx` à partir des beefs médiés chargés (`mediationCategoryForBeef` → `lib/mediation-resolution.ts`).

### Colonnes `users` liées aux beefs (prod — requête complémentaire)

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'users' 
  AND (column_name LIKE '%beef%' OR column_name LIKE '%resolved%' 
       OR column_name LIKE '%abandon%' OR column_name LIKE '%hosted%' OR column_name LIKE '%mediat%');
```

| column_name | data_type |
|-------------|-----------|
| total_beefs_completed | integer |
| beefs_attended | integer |
| beefs_created | integer |
| beefs_mediated | integer |

**Source repo :** `supabase_migrations/34_users_columns_for_safe_update_trigger.sql`

**Alerte refonte :** les résolutions/abandons sont portés par `beefs.resolution_status` (par beef), pas agrégés en colonnes `users`. Pour l'Indice de Sagesse post-refonte, il faudra soit agréger à la volée, soit matérialiser via trigger/RPC à la fin du live.

---

## 3. Contrôleur de fin de Beef — `app/api/beef/manage/route.ts`

### Helper `resolutionFromEndReason` (utilisé par `END_BEEF`)

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

### Bloc complet `action === 'TOGGLE_STATUS'` → `toggle === 'END_BEEF'`

Contexte : accessible uniquement si `isMediatorOfBeef(beef, user.id)` (vérification L156–158). Le bloc `END_BEEF` se trouve dans la branche `action === 'TOGGLE_STATUS'` :

```typescript
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

      return NextResponse.json({ error: 'toggle invalide' }, { status: 400 });
    }
```

### Corps de requête attendu pour `END_BEEF`

```json
{
  "action": "TOGGLE_STATUS",
  "beefId": "<uuid>",
  "toggle": "END_BEEF",
  "endReason": "Terminé par le Ref"
}
```

**Champs écrits en DB à la fin :** `status = 'ended'`, `ended_at`, `resolution_status` (dérivé de `endReason`). **Aucun champ tap/vote/résonance n'est persisté.**

---

## 4. Annexe — Contrôleur d'état client des Taps (non persisté)

Le client qui appelle `END_BEEF` est `endBeef()` dans `components/TikTokStyleArena.tsx`. Les compteurs de taps vivent en mémoire :

| Ref | Rôle |
|-----|------|
| `statsRef.current.votesA`–`votesF` | Résonance distante (broadcast reçu) |
| `supportBurstRef.current` (`AuraBatchPayload`) | Taps locaux par slot A–F + M (Ref) |
| `emitTapSupport(target)` | Incrémente `supportBurst` + aura visuelle locale |

Extrait `endBeef` (L1204–1260) — **résumé calculé mais jamais envoyé à l'API** :

```typescript
  const endBeef = useCallback(async (reason: string = 'Terminé par le Ref') => {
    if (beefEndedRef.current) return;
    // ... cleanup session ...

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

    const s = statsRef.current;
    // ... durée elapsed ...

    const sb = supportBurstRef.current;
    const summary = {
      duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
      viewers: s.liveViewerCount,
      resonanceA: s.votesA + sb.A,
      resonanceB: s.votesB + sb.B,
      resonanceC: s.votesC + sb.C,
      resonanceD: s.votesD + sb.D,
      resonanceE: s.votesE + sb.E,
      resonanceF: s.votesF + sb.F,
      resonanceM: sb.M,
      messages: s.messagesCount,
      endReason: reason,
    };
    setEndSummary(summary);
    setBeefEnded(true);

    arenaOutboundRef.current.broadcastBeefEnded?.({
      reason,
      summary,
    });

    await leaveRef.current();
    // ...
  }, [/* ... */]);
```

**Gap identifié pour la refonte :** `summary.resonanceA`–`F` et `resonanceM` sont broadcastés aux viewers et affichés en overlay de fin, mais **disparaissent au reload** — aucune écriture Supabase à la clôture.

---

## 5. Synthèse pour l'Architecte

| Question | Réponse |
|----------|---------|
| Colonnes tap/vote sur `beefs` ? | **Non** — résultat SQL vide |
| Où sont les taps aujourd'hui ? | État React (`supportBurst`, `statsRef.votes*`) + broadcast realtime |
| `END_BEEF` persiste les taps ? | **Non** — seulement `status`, `ended_at`, `resolution_status` |
| `beefs_resolved` / `abandoned` / `hosted` sur `users` ? | **Non** — calcul client ; prod a `beefs_mediated`, `beefs_created`, etc. |
| Table exploitable pour taps ? | `beef_reactions` (emoji seul, sans slot) — insuffisante |

### Pistes de refonte (hors scope — analyse uniquement)

1. **Migration `beefs`** : colonnes `tap_a`…`tap_f`, `tap_m` (integer) ou JSONB `audience_resonance`.
2. **Ou table dédiée** : `beef_live_stats (beef_id, slot, tap_count, updated_at)`.
3. **Étendre `END_BEEF`** : accepter `audienceSummary` dans le body et persister en même temps que `resolution_status`.
4. **Étendre `beef_reactions`** : colonne `support_slot` si persistance événementielle par tap.

---

## Méthodologie

- Requêtes SQL exécutées via MCP Supabase (`execute_sql`) sur projet `clsztcvmhvccvjxdwapt`.
- Code extrait depuis `app/api/beef/manage/route.ts` (lecture fichier, L40–54, L261–338).
- Annexe client depuis `components/TikTokStyleArena.tsx` (L712–723, L804–822, L1204–1260).
- Aucune modification de code effectuée.
