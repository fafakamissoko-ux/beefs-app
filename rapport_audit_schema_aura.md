# Rapport d'audit — Schéma Aura (Supabase prod)

**Date :** 31 mai 2026  
**Projet :** `clsztcvmhvccvjxdwapt` — https://clsztcvmhvccvjxdwapt.supabase.co  
**Objectif :** vérifier la structure des tables avant création de la RPC `adjust_prestige_aura`  
**Statut :** extraction uniquement (aucune modification)

---

## Contexte exécution

| Étape | Résultat |
|-------|----------|
| `supabase login` | Session CLI déjà active (liste projets OK) |
| `supabase init` | Dossier `supabase/` déjà présent (`config.toml`, migrations) |
| `supabase link --project-ref clsztcvmhvccvjxdwapt` | **Échec CLI** — compte sans privilèges sur ce ref via l’API Platform |
| Requêtes SQL | **Exécutées via MCP Supabase** (`execute_sql`) sur `clsztcvmhvccvjxdwapt` |

---

## 1. Structure `users` — colonnes Points / Aura

**Requête :**

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name IN ('points', 'lifetime_points');
```

**Résultat brut :**

```json
[
  {
    "column_name": "lifetime_points",
    "data_type": "integer",
    "column_default": "0"
  },
  {
    "column_name": "points",
    "data_type": "integer",
    "column_default": "0"
  }
]
```

| column_name       | data_type | column_default |
|-------------------|-----------|----------------|
| lifetime_points   | integer   | 0              |
| points            | integer   | 0              |

**Lecture :** `lifetime_points` = prestige Aura affiché ; `points` = solde dépensable (séparés, tous deux `integer NOT NULL DEFAULT 0` en prod).

---

## 2. Structure `transactions`

**Requête :**

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions';
```

**Résultat brut :**

```json
[
  { "column_name": "id",            "data_type": "uuid" },
  { "column_name": "user_id",       "data_type": "uuid" },
  { "column_name": "type",          "data_type": "text" },
  { "column_name": "amount",        "data_type": "integer" },
  { "column_name": "balance_after", "data_type": "integer" },
  { "column_name": "description",   "data_type": "text" },
  { "column_name": "metadata",      "data_type": "jsonb" },
  { "column_name": "created_at",    "data_type": "timestamp with time zone" }
]
```

| column_name   | data_type                   |
|---------------|-----------------------------|
| id            | uuid                        |
| user_id       | uuid                        |
| type          | text                        |
| amount        | integer                     |
| balance_after | integer                     |
| description   | text                        |
| metadata      | jsonb                       |
| created_at    | timestamp with time zone    |

**Lecture :** journal financier lié au solde `points` (`amount`, `balance_after`). Pas de colonne `lifetime_points` — si journalisation Aura requise, soit réutiliser `transactions` avec un `type` dédié (ex. `prestige_aura`) et `amount = 0` / `balance_after = points` inchangé, soit nouvelle table dédiée.

---

## 3. Tables publiques contenant « aura »

**Requête :**

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE '%aura%';
```

**Résultat brut :**

```json
[
  { "table_name": "aura_notifications" },
  { "table_name": "aura_sparks" }
]
```

| table_name          |
|---------------------|
| aura_notifications  |
| aura_sparks         |

**Lecture :**

- **`aura_sparks`** — historique des transmissions sociales (profil, beef, teaser) entre utilisateurs ; pas un ledger de prestige système (+100 / +150 / −50).
- **`aura_notifications`** — vue ou table de notifications UI (étincelles reçues) ; pas un journal comptable.

Aucune table `aura_events` / `prestige_ledger` dédiée aux mouvements automatiques Beef n’existe aujourd’hui en prod.

---

## Synthèse pour `adjust_prestige_aura`

1. **Cible d’écriture :** `users.lifetime_points` uniquement — ne pas toucher `users.points`.
2. **Journalisation existante :** `transactions` orientée solde financier ; les tables `%aura%` couvrent le social (sparks), pas l’économie Beef.
3. **Décision à trancher en implémentation :** insérer dans `transactions` (type `prestige_*`, metadata `{ beef_id, event }`) vs créer une table `prestige_aura_events` pour idempotence et audit.

---

*Fin du rapport — résultats bruts Supabase prod `clsztcvmhvccvjxdwapt`.*
