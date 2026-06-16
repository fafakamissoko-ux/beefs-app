# Rapport Phase 4.2 — SQL `prestige_ledger` + RPC `adjust_prestige_aura`

**Date :** 31 mai 2026  
**Instance :** `clsztcvmhvccvjxdwapt` — https://clsztcvmhvccvjxdwapt.supabase.co  
**Statut :** déployé et vérifié

---

## 1. Fichier migration (repo)

**Chemin :** `supabase/migrations/101_prestige_ledger_adjust_prestige_aura.sql`

Contenu : table `prestige_ledger`, RLS activé, fonction `adjust_prestige_aura` (`SECURITY DEFINER`), révocation `PUBLIC` + grant `service_role`.

---

## 2. Déploiement

| Action | Résultat |
|--------|----------|
| `apply_migration` (MCP Supabase) | `{ "success": true }` |
| Nom migration enregistrée | `prestige_ledger_adjust_prestige_aura` |

---

## 3. Vérifications post-déploiement

### 3a. Table `prestige_ledger`

```json
[
  { "column_name": "id",         "data_type": "uuid",                     "column_default": "gen_random_uuid()", "is_nullable": "NO" },
  { "column_name": "user_id",    "data_type": "uuid",                     "column_default": null,              "is_nullable": "NO" },
  { "column_name": "beef_id",    "data_type": "uuid",                     "column_default": null,              "is_nullable": "NO" },
  { "column_name": "event_type", "data_type": "text",                     "column_default": null,              "is_nullable": "NO" },
  { "column_name": "aura_delta", "data_type": "integer",                  "column_default": null,              "is_nullable": "NO" },
  { "column_name": "created_at", "data_type": "timestamp with time zone","column_default": "now()",           "is_nullable": "NO" }
]
```

**RLS :** `relrowsecurity = true` (activé, aucune policy → accès client bloqué par défaut).

**Contraintes :**

| constraint_name                              | type |
|----------------------------------------------|------|
| `prestige_ledger_pkey`                       | PK   |
| `prestige_ledger_user_id_beef_id_event_type_key` | UNIQUE `(user_id, beef_id, event_type)` |
| `prestige_ledger_user_id_fkey`               | FK → `users(id)` ON DELETE CASCADE |

### 3b. Fonction `adjust_prestige_aura`

```json
[
  {
    "routine_name": "adjust_prestige_aura",
    "routine_type": "FUNCTION",
    "security_type": "DEFINER",
    "return_type": "jsonb"
  }
]
```

**Signature :** `(p_user_id UUID, p_beef_id UUID, p_event_type TEXT, p_delta INTEGER) → JSONB`

**Comportement attendu :**
- Insert idempotent dans `prestige_ledger` ; doublon → `{ "success": false, "reason": "already_applied" }`
- Mise à jour `users.lifetime_points` uniquement (plancher 0)
- **`users.points` non modifié**

### 3c. Privilèges fonction (constat)

```json
[
  { "grantee": "postgres",       "privilege_type": "EXECUTE" },
  { "grantee": "anon",           "privilege_type": "EXECUTE" },
  { "grantee": "authenticated",  "privilege_type": "EXECUTE" },
  { "grantee": "service_role",   "privilege_type": "EXECUTE" }
]
```

**Note sécurité :** le script exécute `REVOKE ALL … FROM PUBLIC` puis `GRANT … TO service_role`, mais Supabase conserve des grants `EXECUTE` sur `anon` / `authenticated` (comportement plateforme). **En pratique, seule l’API backend (service role) doit appeler cette RPC** — une migration corrective `REVOKE EXECUTE ON FUNCTION … FROM anon, authenticated` pourra être ajoutée en Phase 4.3 si souhaité.

---

## 4. Prochaine étape (hors scope 4.2)

Brancher les handlers identifiés en Phase 4.1 (`submitNewBeef`, acceptation invitation, forfait) via routes API service role :

| Événement PO | `event_type` suggéré | `p_delta` |
|--------------|----------------------|-----------|
| Création beef | `beef_created` | +100 |
| Acceptation défi | `challenge_accepted` | +150 |
| Abandon / forfait | `beef_forfeited` | −50 |

---

*Phase 4.2 SQL — table et RPC opérationnelles sur prod `clsztcvmhvccvjxdwapt`.*
