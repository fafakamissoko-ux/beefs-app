# Rapport Phase 1 — Persistance stats Arène (live_summary + Sagesse)

**Date :** 2026-05-31  
**Statut :** Implémenté (backend + câblage client, sans modification UI/CSS)

---

## 1. Migration SQL

**Fichier :** `supabase/migrations/104_arena_live_stats_and_wisdom.sql`

| Mission | Détail |
|---------|--------|
| `beefs.live_summary` | JSONB NOT NULL DEFAULT `'{}'` — stocke taps audience en fin de live |
| `users.beefs_resolved` | INTEGER NOT NULL DEFAULT 0 |
| `users.beefs_abandoned` | INTEGER NOT NULL DEFAULT 0 |
| Backfill | Compte historique depuis `beefs` (`status IN ('ended','replay')` + `resolution_status`) |
| Trigger | `trg_update_mediator_wisdom_stats` AFTER UPDATE ON `beefs` |

### Logique trigger

Quand `NEW.status = 'ended'` et `OLD.status IS DISTINCT FROM 'ended'` :

- `resolution_status = 'resolved'` → `users.beefs_resolved += 1` (pour `mediator_id`)
- `resolution_status = 'abandoned'` → `users.beefs_abandoned += 1`
- `unresolved` → aucun incrément (comportement explicite)

### Déploiement

| Canal | Résultat |
|-------|----------|
| CLI `supabase db push` | ❌ Non disponible (binaire Supabase absent sur la machine) |
| MCP Supabase prod (`clsztcvmhvccvjxdwapt`) | ✅ Migration `arena_live_stats_and_wisdom` appliquée |

---

## 2. API — `app/api/beef/manage/route.ts`

Bloc `toggle === 'END_BEEF'` étendu :

- Accepte `body.summary` (objet JSON)
- Écrit `live_summary` dans le payload Supabase si présent
- Conserve `status`, `ended_at`, `resolution_status`

```typescript
const updatePayload = {
  status: 'ended',
  ended_at: new Date().toISOString(),
  resolution_status: resolution,
};
if (body.summary && typeof body.summary === 'object' && !Array.isArray(body.summary)) {
  updatePayload.live_summary = body.summary;
}
```

---

## 3. Typage client — `lib/beef-manage-client.ts`

Action `TOGGLE_STATUS` / `END_BEEF` :

```typescript
summary?: Record<string, unknown>;
```

---

## 4. Câblage live — `components/TikTokStyleArena.tsx`

Fonction `endBeef` :

1. **Avant** : `summary` calculé après `runBeefManage` → perdu en DB
2. **Après** : `summary` agrégé depuis `statsRef` + `supportBurstRef` **avant** l'appel API
3. Payload : `{ action, beefId, toggle: 'END_BEEF', endReason, summary }`

Champs persistés dans `live_summary` :

| Clé | Source |
|-----|--------|
| `duration` | Chrono wall-clock |
| `viewers` | `statsRef.liveViewerCount` |
| `resonanceA`–`F` | `votesA`–`F` + burst local |
| `resonanceM` | burst Ref |
| `messages` | `messagesCount` |
| `endReason` | libellé fin |

Le broadcast `broadcastBeefEnded` et l'overlay UI restent inchangés (même objet `summary`).

---

## 5. Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit code 0

---

## 6. Flux bout en bout

```
Spectateurs tap (emitTapSupport)
    → supportBurstRef / statsRef (mémoire client)
         ↓
Ref termine le live → endBeef()
    → summary calculé
    → POST /api/beef/manage { toggle: END_BEEF, summary }
         ↓
    → UPDATE beefs SET status, ended_at, resolution_status, live_summary
         ↓
    → TRIGGER trg_update_mediator_wisdom_stats
         → users.beefs_resolved | beefs_abandoned += 1
```

---

## 7. Hors scope (non modifié)

- Aucun changement UI/CSS
- `ProfileContent.tsx` continue le calcul client Sagesse (peut migrer vers `users.beefs_*` en phase ultérieure)
- Viewers qui reçoivent `broadcastBeefEnded` sans être le Ref ne déclenchent pas l'API (comportement attendu)

---

## 8. Prochaines étapes suggérées

1. Commit & push migration + API + client
2. Phase 2 : lire `users.beefs_resolved` / `beefs_abandoned` dans le profil public
3. Phase 2 : exposer `beefs.live_summary` en replay / page summary beef
4. Installer CLI Supabase localement pour aligner migrations sans MCP
