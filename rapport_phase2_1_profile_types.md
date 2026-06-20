# Rapport Phase 2.1 — Typage profil Sagesse (sans UI)

**Date :** 2026-05-31  
**Statut :** API publique + typage front prêts pour le badge « Taux de Fiabilité »

---

## 1. Migration SQL

**Fichier :** `supabase/migrations/105_expose_wisdom_stats.sql`

| Objet | Modification |
|-------|--------------|
| `user_public_profile` | Recréée avec `beefs_resolved`, `beefs_abandoned` (COALESCE 0) + toutes les colonnes existantes (migration 61) |
| `get_public_profile_by_username` | RETURNS TABLE + SELECT étendus avec les 2 colonnes |

**Déploiement prod :** MCP Supabase (`clsztcvmhvccvjxdwapt`) — migration `expose_wisdom_stats` appliquée ✅  
**Note :** `avatar_likes` / `banner_likes` via sous-requêtes `profile_media_likes` (aligné prod, pas colonnes `users`)  
**CLI locale :** non disponible sur la machine (`supabase` absent du PATH)

---

## 2. Typage TypeScript

### `components/profile/ProfileHeader.tsx`

```typescript
export interface ProfileHeaderStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
  beefs_resolved: number;   // NEW
  beefs_abandoned: number;  // NEW
}
```

Aucun changement JSX — le badge UI viendra en Phase 2.2.

### `app/profile/[username]/page.tsx`

- `UserProfile` : champs optionnels `beefs_resolved?`, `beefs_abandoned?`
- `UserStats` : champs obligatoires `beefs_resolved`, `beefs_abandoned`
- Helper `wisdomFromRaw(raw)` → extraction `?? 0`
- Hydratation :
  - **Auth tiers** : `user_public_profile.select('*')`
  - **Auth self** : `users.select('*')`
  - **Anonyme** : RPC `get_public_profile_by_username` (mapping RPC étendu)
- `setStats` (chemins anon + auth) : inclut `wisdom.beefs_resolved` / `wisdom.beefs_abandoned`
- `<ProfileHeader stats={...} />` : passe les valeurs réelles

### `app/profile/ProfileContent.tsx` (stubs temporaires)

Deux appels `<ProfileHeader>` (owner + preview) :

```typescript
beefs_resolved: 0,
beefs_abandoned: 0,
```

**Raison :** hub privé utilise encore le calcul client `mediationCategoryForBeef` — branchement DB prévu Phase 2.2.

---

## 3. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit code 0 — tous les consommateurs de `ProfileHeaderStats` satisfaits.

---

## 4. Matrice fetch → stats

| Contexte | Source données Sagesse | Branché ? |
|----------|------------------------|-----------|
| Profil public (auth, tiers) | Vue `user_public_profile` | ✅ |
| Profil public (auth, soi) | Table `users` | ✅ |
| Profil public (anon) | RPC `get_public_profile_by_username` | ✅ |
| Hub owner `/profile` | Stub `0` | ⏳ Phase 2.2 |
| Modale preview owner | Stub `0` | ⏳ Phase 2.2 |

---

## 5. Prochaine étape (Phase 2.2)

1. Badge « Taux de Fiabilité » dans `ProfileHeader.tsx` :
   - `rate = resolved / (resolved + abandoned) × 100`
   - Seuil d'affichage (ex. `resolved >= 3`)
2. Brancher `ProfileContent` sur `users.beefs_resolved` / `beefs_abandoned` (remplacer stubs)
3. Supprimer calcul client redondant + JSX « Indice de Sagesse » modale preview

---

## Fichiers modifiés

- `supabase/migrations/105_expose_wisdom_stats.sql` (nouveau)
- `components/profile/ProfileHeader.tsx`
- `app/profile/[username]/page.tsx`
- `app/profile/ProfileContent.tsx` (stubs uniquement)
