# Rapport — Phase 9.1 : Refonte page Notifications

**Date :** 31 mai 2026  
**Fichier cible :** `app/notifications/page.tsx`  
**Statut :** ✅ Implémenté

---

## 1. Navigation par onglets (Premium Glass)

| Élément | Détail |
|---------|--------|
| State | `activeTab: 'all' \| 'aura' \| 'mentions'` (défaut `'all'`) |
| Filtrage | `filteredNotifications` via `useMemo` sur `displayNotifications` + `activeTab` |
| Onglet **Tout** | Liste complète fusionnée (`notifications` + `aura_notifications`) |
| Onglet **Aura** | `n.type === 'aura'` (étincelles + notifications système aura) |
| Onglet **Mentions** | `n.type !== 'aura'` (follow, invite, beef_live, gift, message, system) |
| UI | 3 boutons `rounded-full` sous le titre, style glass actif : `bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white` |
| Compteur filtré | `unreadFilteredCount` pour le bouton « Tout marquer comme lu » |

---

## 2. Correction critique — `handleRowClick`

### Bug identifié (avant)

```typescript
const isSparkRow = n.type === 'aura' || n.id.startsWith('spark-');
```

Cette condition traitait **toutes** les notifications de type `'aura'` (table `notifications`, générées par triggers) comme des étincelles `aura_sparks`. Résultat :

- Appel erroné à `aura_sparks.update()` avec un UUID de la table `notifications`
- Pastille non retirée pour les vraies notifications aura système
- RPC `mark_notification_read` jamais invoquée pour ces lignes

### Correction (après)

```typescript
const isSparkRow = n.id.startsWith('spark-');
```

| Cas | Table / RPC | État local |
|-----|-------------|------------|
| ID `spark-*` | `aura_sparks.update({ is_read: true })` | `setAuraNotifications` |
| Tout le reste (y compris `type === 'aura'`) | `mark_notification_read` + fallback direct | `setNotifications` |

La navigation `beef_live` (invitation pending → `/invitations`) et le routage `n.link` sont conservés inchangés.

---

## 3. « Tout marquer comme lu » contextuel

Le bouton n’apparaît que si `filteredNotifications.length > 0 && unreadFilteredCount > 0`.

| Onglet actif | Action DB | Mise à jour optimiste |
|--------------|-----------|------------------------|
| **Tout** | RPC `mark_all_notifications_read` | `notifications` + `auraNotifications` |
| **Aura** | `notifications` (`type = aura`) + `aura_sparks` (`receiver_id`) | Uniquement lignes aura |
| **Mentions** | `notifications` (`type != aura`) | Uniquement non-aura |

Événement `beefs:badges-refresh` dispatché après chaque opération réussie.

---

## 4. Vérifications recommandées

1. **Onglet Aura** — Cliquer une étincelle (`spark-*`) : pastille disparaît, badge header décrémenté.
2. **Onglet Aura** — Cliquer une notification `type='aura'` (table `notifications`, sans préfixe `spark-`) : RPC `mark_notification_read` appelée, pastille retirée.
3. **Onglet Mentions** — « Tout marquer comme lu » ne touche pas aux sparks ni aux notifications aura.
4. **Onglet Tout** — Comportement global identique à l’avant Phase 9.1 pour le mark-all.

---

## 5. Fichiers modifiés

- `app/notifications/page.tsx` — onglets, filtre, `handleRowClick`, `markAllRead` contextuel
- `rapport_refonte_notifications.md` — ce document
