# Rapport d'audit — UI Aura (clics morts & preuve sociale)

**Date :** 31 mai 2026  
**Cibles :** `app/notifications/page.tsx`, `components/BeefCard.tsx`, `components/AuraGiversModal.tsx`  
**Statut :** extraction uniquement (aucune modification)

---

## 1. Le clic mort — routage notifications (`page.tsx`)

### 1.1 Handler clic ligne

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 222–272

```typescript
  const handleRowClick = async (n: AppNotification) => {
    const isSparkRow = n.type === 'aura' || n.id.startsWith('spark-');
    if (!n.is_read && !isSparkRow) {
      const { error: rpcErr } = await supabase.rpc('mark_notification_read', { p_id: n.id });
      if (rpcErr && user) {
        const { error: upErr } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', n.id)
          .eq('user_id', user.id);
        if (upErr) {
          console.error('[notifications] mark one read', rpcErr, upErr);
        }
      }
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } else if (!n.is_read && isSparkRow) {
      setAuraNotifications((prev) =>
        prev.map((x) => {
          const sparkId = x.id.startsWith('spark-') ? x.id : `spark-${x.id}`;
          return sparkId === n.id ? { ...x, is_read: true } : x;
        }),
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    }

    // Invité mais pas encore accepté : l’arène ouvre en spectateur ; on envoie vers les invitations.
    if (n.type === 'beef_live' && user?.id && n.metadata && typeof n.metadata === 'object') {
      const beefId = (n.metadata as Record<string, unknown>).beef_id;
      if (typeof beefId === 'string' && beefId.length > 0) {
        const { data: part } = await supabase
          .from('beef_participants')
          .select('invite_status')
          .eq('beef_id', beefId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (part?.invite_status === 'pending') {
          router.push('/invitations');
          return;
        }
      }
    }

    if (n.link) router.push(n.link);
  };
```

**Seul appel navigation :** `if (n.link) router.push(n.link);` — pas de branche `router.push` dédiée au type `aura`.

### 1.2 Mapping spark → `link` (construction de la ligne Aura)

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 274–290

```typescript
  const auraAsAppNotifications = useMemo((): AppNotification[] => {
    if (!user) return [];
    return auraNotifications.map((a) => {
      const giverLabel = a.giver_name || a.giver_username || 'Quelqu\'un';
      return {
        id: a.id.startsWith('spark-') ? a.id : `spark-${a.id}`,
        created_at: a.created_at,
        user_id: user.id,
        type: 'aura' as const,
        title: 'Étincelle d\'Aura',
        body: `${giverLabel} t'a transmis de l'Aura`,
        link: a.giver_username ? `/profile/${a.giver_username}` : null,
        is_read: a.is_read,
        metadata: a.aura_kind ? { aura_kind: a.aura_kind } : null,
      };
    });
  }, [auraNotifications, user]);
```

**Condition de navigation spark :** `link` non null **uniquement si** `giver_username` est présent dans la vue `aura_notifications`. Sinon `link: null` → clic sans `router.push`.

### 1.3 Déclencheur UI (pas de `<Link>`)

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 367–373

```tsx
                  <motion.button
                    key={n.id}
                    type="button"
                    ...
                    onClick={() => handleRowClick(n)}
```

---

## 2. Preuve sociale — BeefCard (compteur & modale)

### 2.1 Bloc Aura carte principale (engagement)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 445–521

```tsx
              {onAuraClick ? (
                <div
                  className={`relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg font-mono text-[9px] sm:text-[10px] font-bold ${
                    has_liked_by_user ? 'border-amber-400/50 text-amber-400' : 'border-white/10 text-white'
                  }`}
                >
                  <AnimatePresence>
                    {cardFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        ...
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <button
                    type="button"
                    ...
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!has_liked_by_user) {
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                        setTimeout(() => {
                          setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
                        }, 800);
                      }
                      onAuraClick?.();
                    }}
                    aria-label={has_liked_by_user ? "Retirer l'Aura" : "Envoyer de l'Aura"}
                  >
                    <Sparkles ... />
                  </button>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              ) : (
                <div className="relative flex h-6 sm:h-7 items-center ...">
                  <div className="flex h-full items-center justify-center pl-2.5 pr-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <button
                    type="button"
                    ...
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              )}
```

**Affichage carte :** compteur `engagement_score` (prop numérique). **Aucun** appel direct à `get_universal_aura_givers` dans `BeefCard.tsx`.  
**Preuve sociale inline :** absente (pas d’avatars / liste de givers sur la carte).  
**Modale :** ouverture via `setIsBeefAuraModalOpen(true)` au clic sur le score.

### 2.2 Bloc Aura teaser (modale plein écran)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 660–682

```tsx
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTeaserAuraModalOpen(true);
                        }}
                        ...
                        aria-label="Voir les donateurs d'Aura teaser"
                      >
                        {(teaser_score || 0).toLocaleString()}
                      </span>
```

Compteur `teaser_score` statique ; modale teaser séparée.

### 2.3 Montage modales `AuraGiversModal` (BeefCard)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 890–907

```tsx
      <AuraGiversModal
        isOpen={isBeefAuraModalOpen}
        onClose={() => setIsBeefAuraModalOpen(false)}
        targetId={id}
        type="beef"
        ownerId={mediator_id || created_by || ''}
      />
      <AuraGiversModal
        isOpen={isTeaserAuraModalOpen}
        onClose={() => setIsTeaserAuraModalOpen(false)}
        targetId={id}
        type="teaser"
        ownerId={created_by || ''}
      />
      <AuraGiversModal
        isOpen={isViewsModalOpen}
        onClose={() => setIsViewsModalOpen(false)}
        targetId={id}
        type="views"
        ownerId={mediator_id || created_by || ''}
      />
```

---

## 3. RPC `get_universal_aura_givers` — consommé dans la modale (pas sur la carte)

**Fichier :** `components/AuraGiversModal.tsx`  
**Lignes :** 78–86

```typescript
        } else {
          const { data } = await supabase.rpc('get_universal_aura_givers', {
            p_target_id: targetId,
            p_type: type,
            p_owner_id: ownerId,
          });
          if (!cancelled) {
            setGivers((data as AuraGiver[] | null) || []);
          }
        }
```

**Déclenchement :** `useEffect` quand `isOpen === true` — liste chargée **à l’ouverture de la modale**, pas au rendu de la BeefCard.

**Rendu modale (extrait liste givers) — l. 176–205 :**

```tsx
              {givers.map((giver) => (
                <div key={giver.giver_id} className="flex items-center justify-between gap-3 ...">
                  ...
                  <span className="truncate text-sm font-bold text-white">{giver.display_name}</span>
                  <span className="truncate text-xs text-cyan-400">@{giver.username}</span>
                  ...
                  <button type="button" className="...">Suivre</button>
                </div>
              ))}
```

---

## 4. Observations Architecte (sans correctif)

### 4.1 Clic mort spark Aura

| Cause possible | Code |
|----------------|------|
| `link: null` si `giver_username` absent dans `aura_notifications` | § 1.2 |
| Branche spark : marquage lu **local only** (`setAuraNotifications`), pas de RPC serveur spark | § 1.1 `isSparkRow` |
| Pas de `router.push` fallback profil via `giver_id` / metadata | § 1.1 |
| Navigation conditionnelle unique : `if (n.link)` | § 1.1 fin |

### 4.2 Preuve sociale BeefCard

| Élément | État |
|---------|------|
| Compteur visible | `engagement_score` / `teaser_score` (props feed) |
| Liste givers sur carte | ❌ absent |
| `get_universal_aura_givers` dans BeefCard | ❌ absent (délégué à `AuraGiversModal`) |
| Modale donateurs | ✅ présente, ouverture au clic score |
| Avatars inline type « X personnes ont donné » | ❌ absent |

---

**Fin du rapport — prêt pour plan correction UI Aura.**
