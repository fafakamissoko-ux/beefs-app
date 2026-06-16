# Rapport Phase 4.3 — Triggers gamification Aura

**Date :** 31 mai 2026  
**Instance :** `clsztcvmhvccvjxdwapt` — https://clsztcvmhvccvjxdwapt.supabase.co  
**Statut :** déployé et vérifié

---

## 1. Fichier migration (repo)

**Chemin :** `supabase/migrations/102_gamification_aura_triggers.sql`

Contenu :
- Fonction trigger `trigger_gamification_aura()` (`SECURITY DEFINER`)
- 3 triggers sur `beefs` (INSERT, UPDATE OF status) et `beef_participants` (UPDATE OF invite_status)
- `REVOKE EXECUTE` sur `adjust_prestige_aura` pour `anon` et `authenticated`

---

## 2. Déploiement

| Action | Résultat |
|--------|----------|
| `apply_migration` (MCP Supabase) | `{ "success": true }` |
| Version enregistrée | `20260616032603` — `gamification_aura_triggers` |

---

## 3. Vérifications post-déploiement

### 3a. Fonction trigger

```json
[
  {
    "routine_name": "trigger_gamification_aura",
    "security_type": "DEFINER"
  }
]
```

### 3b. Triggers actifs

| trigger_name | table_name | définition |
|--------------|------------|------------|
| `trg_gamification_beefs_insert` | `beefs` | `AFTER INSERT` → `trigger_gamification_aura()` |
| `trg_gamification_beefs_update` | `beefs` | `AFTER UPDATE OF status` → `trigger_gamification_aura()` |
| `trg_gamification_participants_update` | `beef_participants` | `AFTER UPDATE OF invite_status` → `trigger_gamification_aura()` |

### 3c. Matrice événements → Aura

| Action trigger | Condition | `event_type` | Delta | Bénéficiaire |
|----------------|-----------|--------------|-------|--------------|
| A — INSERT `beefs` | toujours | `beef_created` | **+100** | `created_by` |
| B — UPDATE `beefs.status` | `NEW = cancelled` et `OLD ≠ cancelled` | `beef_forfeited` | **−50** | `created_by` |
| C — UPDATE `beef_participants.invite_status` | `NEW = accepted` et `OLD ≠ accepted` | `challenge_accepted` | **+150** | `user_id` participant |

Chaque appel passe par `adjust_prestige_aura` → journalisation idempotente dans `prestige_ledger` (`UNIQUE user_id, beef_id, event_type`).

### 3d. Renforcement sécurité RPC

**Avant (Phase 4.2) :** `anon`, `authenticated`, `postgres`, `service_role` avaient `EXECUTE`.

**Après REVOKE :**

```json
[
  { "grantee": "postgres",       "privilege_type": "EXECUTE" },
  { "grantee": "service_role",   "privilege_type": "EXECUTE" }
]
```

`adjust_prestige_aura` n'est plus invocable directement depuis le client Supabase — uniquement via triggers `SECURITY DEFINER` et routes API service role.

---

## 4. Flux couverts automatiquement (rappel Phase 4.1)

| Flux applicatif | Table / opération | Trigger |
|-----------------|-------------------|---------|
| `submitNewBeef` → INSERT beef | `beefs` INSERT | A (+100 créateur) |
| `confirmForfeit` → `status = cancelled` | `beefs` UPDATE | B (−50 créateur) |
| `handleResponse(accept)` / `GlobalDuelAmbush join` | `beef_participants` UPDATE | C (+150 acceptant) |
| `ACCEPT_PARTICIPANT` (médiateur) | `beef_participants` UPDATE | C (+150 participant) |

**Non couvert par ces triggers :** `END_BEEF` avec `resolution_status = abandoned` (statut `ended`, pas `cancelled`) — pénalité −50 non déclenchée sur ce chemin.

---

## 5. Recommandation UI (hors scope SQL)

Le toast `confirmForfeit` (« L'Aura a été impactée ») est désormais **effectif** via le trigger B — aucune modification API requise.

---

*Phase 4.3 — économie Aura automatisée par triggers Postgres sur prod `clsztcvmhvccvjxdwapt`.*
