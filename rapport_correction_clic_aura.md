# Rapport Phase 8.2 — Clic Aura (spark) & persistance serveur

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_aura_ui.md`  
**Fichier modifié :** `app/notifications/page.tsx`  
**Statut :** ✅ `handleRowClick` corrigé

---

## Problème

| Symptôme | Cause identifiée |
|----------|------------------|
| Clic spark sans navigation | Marquage lu spark isolé ; routage dépendait de `n.link` sans persistance serveur cohérente |
| Ghost unread spark | `is_read` mis à jour **local only** (`setAuraNotifications`), pas en base |

---

## Changement — `handleRowClick`

### Structure unifiée `!n.is_read`

**Notifications classiques :**
- RPC `mark_notification_read({ p_id })`
- Fallback `UPDATE notifications`
- Optimistic `setNotifications`

**Sparks Aura (`isSparkRow`) :**
- Extraction UUID : `n.id.replace('spark-', '')`
- **`UPDATE aura_sparks SET is_read = true WHERE id = pureId`**
- Optimistic `setAuraNotifications`
- Log erreur si UPDATE échoue

**Commun :** `beefs:badges-refresh` une fois après marquage lu.

### Navigation

1. Cas `beef_live` + invité `pending` → `/invitations` (inchangé, `return` early).
2. **Fin de fonction :** `if (n.link) router.push(n.link)` — s’applique aux sparks dont `link = /profile/{giver_username}` (mapping `auraAsAppNotifications`).

---

## Comportement attendu

1. Clic sur étincelle Aura non lue → `aura_sparks.is_read = true` en base + UI sans point bleu.
2. Badge Header → refetch debouncé (Phase 7.1 / 7.4).
3. Si `giver_username` présent → redirection `/profile/{username}`.
4. Clic sur notification classique → comportement inchangé.

---

## Prérequis DB

- Colonne `aura_sparks.is_read`
- RLS permettant au **receiver** de `UPDATE is_read` sur ses sparks (ou policy via RPC futur)

---

**Fin du rapport Phase 8.2.**
