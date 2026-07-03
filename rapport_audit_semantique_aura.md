# Rapport d'audit — Sémantique pending & Aura Teaser

**Date :** 31 mai 2026  
**Périmètre :** anomalies production (+2 Aura teaser, texte pending générique pour challengers)  
**Statut :** exploration uniquement — **aucun correctif implémenté**

---

## Synthèse exécutive

| Anomalie | Cause probable | Fichiers |
|----------|----------------|----------|
| **+2 Aura teaser** | Cumul **Optimistic UI (+1)** + **trigger SQL (+1)** sur `beefs.teaser_score`, avec risque de race Realtime ; commentaire obsolète disant « pas d’optimiste » | `app/feed/page.tsx`, `BeefCard.tsx`, migration `58_teaser_likes_teaser_score.sql` |
| **Texte pending générique** | `getPendingRefText()` renvoie toujours « En attente des participants… » pour `intent !== 'manifesto'` **sans** tenir compte du rôle utilisateur | `BeefCard.tsx` |
| **Empilement UI** | `pendingRefText` affiché **sous** le CTA principal même quand `userInviteStatus === 'accepted'` | `BeefCard.tsx` L.815–842 |

---

## 1. Mécanique Aura Teaser

### 1.1 Handler feed — `handleTeaserAuraClick` (`page.tsx`)

**Commentaire vs code (contradiction) :**

```746:770:app/feed/page.tsx
  /** Teaser : pas d’optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
  const handleTeaserAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingTeaser.current) return;
    isLikingTeaser.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    if (!targetBeef) {
      isLikingTeaser.current = false;
      return;
    }
    const isCurrentlyLiked = !!targetBeef.has_liked_teaser;

    // --- AJOUT OPTIMISTIC UI ---
    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          const wasLiked = !!b.has_liked_teaser;
          return {
            ...b,
            has_liked_teaser: !wasLiked,
            teaser_score: Math.max(0, (b.teaser_score || 0) + (wasLiked ? -1 : 1)),
          };
        }
        return b;
      }),
    );
    // ---------------------------
```

**Observations :**

- Le commentaire L.746 décrit l’**ancienne** stratégie (pas d’optimiste).
- Le bloc L.757–770 applique bien un **+1 / −1 immédiat** sur `teaser_score` et bascule `has_liked_teaser`.
- Verrou réseau : `isLikingTeaser.current` + `setTimeout(..., 1500)` (L.787–789) — aligné sur le debounce Realtime.

**Persistance serveur :**

```773:782:app/feed/page.tsx
    try {
      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from('teaser_likes')
          .delete()
          .match({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teaser_likes').insert({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      }
```

### 1.2 Trigger SQL — double incrément métier

```33:36:supabase_migrations/58_teaser_likes_teaser_score.sql
  IF tg_op = 'INSERT' THEN
    UPDATE public.beefs
    SET teaser_score = COALESCE(teaser_score, 0) + 1
    WHERE id = bid;
```

Chaque INSERT dans `teaser_likes` incrémente **déjà** `beefs.teaser_score` en base.

### 1.3 Realtime — resynchronisation feed

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

L’INSERT teaser déclenche un UPDATE sur `beefs` (via trigger) → `loadBeefs(true)` recharge `teaser_score` depuis la DB.

**Chaîne complète d’un vote « like » :**

```
Clic → Optimistic +1 (React)
     → INSERT teaser_likes
     → Trigger SQL +1 (PostgreSQL)
     → Realtime beefs (debounce 1,5 s)
     → loadBeefs → teaser_score DB (déjà +1 vs valeur initiale)
```

### 1.4 Diagnostic du « +2 »

| Hypothèse | Plausibilité | Détail |
|-----------|--------------|--------|
| **A. Double comptage score** | **Élevée** | Optimistic +1 **puis** refetch avec score déjà incrémenté par le trigger — si un second `setBeefs` optimiste s’applique **après** le refetch (race React / double handler), le score affiché peut sauter de **+2** en un clic |
| **B. Trigger + optimistic sur même baseline** | Moyenne | Valeur UI = `N+1` (optimistic) ; DB = `N+1` (trigger) ; refetch correct → **+1** attendu — sauf si optimistic relit un état déjà à `N+1` et ajoute encore +1 |
| **C. Particule « +1 » dupliquée** | Moyenne | L’animation flottante est **toujours** le texte `+1` (L.616) ; deux particules ≠ score +2, mais **perception visuelle « +2 »** |
| **D. Double appel handler** | Moyenne | Voir §1.5 — `onTeaserAuraClick()` invoqué **hors** du garde animation |

**Comparaison Aura carte (engagement)** : `handleAuraClick` (L.706–728) utilise la **même** pattern optimistic + Realtime sur `beefs` — même classe de risque sur `engagement_score`.

---

### 1.5 Bouton Teaser Aura — `BeefCard.tsx` (modale)

```604:638:components/BeefCard.tsx
                  {onTeaserAuraClick && (
                    <div className="relative flex flex-col items-center gap-1.5">
                      <AnimatePresence>
                        {teaserFloatingAuras.map((aura) => (
                          <motion.span
                            key={aura.id}
                            ...
                          >
                            +1
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      <div
                        role="button"
                        ...
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!has_liked_teaser && !localTeaserAuraLock.current) {
                            localTeaserAuraLock.current = true;
                            const newId = Date.now() + Math.random();
                            setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                            setTimeout(() => {
                              setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                            }, 800);

                            setTimeout(() => {
                              localTeaserAuraLock.current = false;
                            }, 1500);
                          }
                          onTeaserAuraClick();
                        }}
```

**Observations :**

1. **Particule** : une puce `{ id, x }` par clic, texte fixe `+1`, durée 800 ms, lock local 1500 ms.
2. **`onTeaserAuraClick()` est appelé à chaque clic**, y compris :
   - quand `has_liked_teaser === true` (toggle unlike) ;
   - quand `localTeaserAuraLock` bloque déjà l’animation (second clic rapide).
3. Le verrou **animation** (`localTeaserAuraLock`) et le verrou **réseau** (`isLikingTeaser`) sont **indépendants** — un double clic entre 800 ms et 1500 ms peut déclencher **deux** optimistic updates si `isLikingTeaser` a été libéré.
4. **`onKeyDown` Enter/Espace** (L.639–644) appelle `onTeaserAuraClick()` **sans** particule ni lock animation → risque double invocation clic + clavier.

**Affichage score :**

```661:683:components/BeefCard.tsx
                      <span ...>
                        {(teaser_score || 0).toLocaleString()}
                      </span>
```

Le compteur affiché = prop `teaser_score` du feed (optimistic + refetch), **pas** la particule.

---

## 2. Logique sémantique pending — `getPendingRefText`

### 2.1 Fonction actuelle

```224:237:components/BeefCard.tsx
  const getPendingRefText = () => {
    // Si ce n'est pas un manifeste, le Ref est déjà présent. On attend les combattants.
    if (intent !== 'manifesto') {
      return "En attente des participants…";
    }

    // Logique spécifique aux manifestes
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validation…' : "En attente d'un Ref…";
  };
  const pendingRefText = getPendingRefText();
```

**Faille :** pour tout beef **non manifesto** en `pending`, le texte est **identique pour tous** (Ref, challenger, spectateur) : « En attente des participants… ».

Aucune branche sur :

- `userInviteStatus` (`pending` | `accepted` | `declined`)
- `user?.id === mediator_id` (Ref)
- `isParticipant` / combattant identifié

---

### 2.2 Variables disponibles pour personnalisation

```146:159:components/BeefCard.tsx
  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      user.user_metadata?.username === challenger_c_username ||
      user.user_metadata?.username === challenger_d_username ||
      user.user_metadata?.username === host_username
    : false;

  const isWaitingForMe =
    status === 'pending' &&
    Boolean(mediator_id) &&
    user?.id === mediator_id &&
    user?.id !== created_by;
```

| Variable | Source | Usage actuel | Limite |
|----------|--------|--------------|--------|
| `userInviteStatus` | Prop feed (`beef_participants.invite_status`) | CTAs convocation L.817–824 | **Non** utilisé dans `getPendingRefText` |
| `isParticipant` | Heuristique username / `created_by` | Masque « Devenir le Ref » L.772 | Peut diverger de `userInviteStatus` |
| `user?.id === mediator_id` | Auth | `onPrepareAudience` (feed) | Absent de `getPendingRefText` non-manifesto |
| `created_by` | Prop | Branche manifesto créateur | — |
| `challenger_*_username` | Feed agrégé | `isParticipant` | Fiable si username metadata à jour |

**Recommandation d’audit (sans implémentation) :** prioriser **`userInviteStatus`** (filtré par user courant dans `loadBeefs` L.432–436) plutôt que seul `isParticipant` pour détecter un **challenger convoqué / accepté**.

---

### 2.3 Scénario production — challenger accepté

Utilisateur : combattant avec `userInviteStatus === 'accepted'`, beef `pending`, `intent !== 'manifesto'`.

1. `getPendingRefText()` → **« En attente des participants… »** (générique).
2. CTA modale → branche `else` → **« Rejoindre la salle d'attente »** (L.826–836).
3. Bloc `pendingRefText` affiché **en plus** (L.838–841).

**Résultat UX :** un combattant déjà accepté voit un message indiquant qu’on attend **des participants**, alors qu’il **en fait partie** — incohérence sémantique confirmée.

---

## 3. Empilement visuel — bloc `pending` modale

```815:842:components/BeefCard.tsx
                        {(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef)) && (
                          <>
                            {userInviteStatus === 'pending' ? (
                              <div ...>⚠️ Convocation en attente</div>
                            ) : userInviteStatus === 'declined' ? (
                              <div ...>❌ Convocation refusée</div>
                            ) : (
                              <button ...>Rejoindre la salle d'attente</button>
                            )}
                            {status === 'pending' && pendingRefText && (
                              <div ...>{pendingRefText}</div>
                            )}
                          </>
                        )}
```

**Confirmé :**

| `userInviteStatus` | CTA principal | `pendingRefText` (non manifesto) | Empilement |
|--------------------|---------------|----------------------------------|------------|
| `pending` | ⚠️ Convocation en attente | « En attente des participants… » | **Oui** — double message |
| `accepted` | Rejoindre la salle d'attente | « En attente des participants… » | **Oui** — message inadapté au challenger |
| `declined` | ❌ Convocation refusée | « En attente des participants… » | **Oui** |
| `null` (spectateur) | Rejoindre | « En attente des participants… » | **Oui** — cohérent pour spectateur |

Le texte `pendingRefText` n’est **pas** mutuellement exclusif avec les CTAs convocation / rejoindre (contrairement à la branche Ref `onPrepareAudience`).

---

## 4. Matrice textuelle cible (proposition d’audit)

| Profil | Condition suggérée | Message attendu (exemple) |
|--------|-------------------|----------------------------|
| **Ref** | `user?.id === mediator_id` | « En attente des combattants… » / prep ring |
| **Challenger pending** | `userInviteStatus === 'pending'` | (CTA convocation suffit — **pas** de texte générique) |
| **Challenger accepted** | `userInviteStatus === 'accepted'` | « En attente de ton adversaire… » / « Tu es au ring » |
| **Spectateur** | pas participant / pas invite | « En attente des participants… » |
| **Créateur manifesto** | branche existante | Inchangé |

---

## 5. Pistes correctives anticipées (non implémentées)

### Aura +2

1. **Retirer** l’optimistic sur `teaser_score` (revenir au commentaire L.746) **ou** ignorer `teaser_score` au refetch si vote en cours.
2. **Ou** ne pas écouter Realtime `beefs` pour les champs score pendant 1,5 s après vote teaser.
3. Déplacer `onTeaserAuraClick()` **inside** le garde `localTeaserAuraLock` ; aligner `onKeyDown` sur le même chemin.
4. Rollback optimistic en cas d’erreur INSERT (non fait actuellement).

### Texte pending

1. Réécrire `getPendingRefText()` avec branches `mediator_id`, `userInviteStatus`, `user?.id === created_by`.
2. Supprimer ou conditionner `pendingRefText` quand `userInviteStatus === 'pending'` (éviter double bandeau).
3. Pour challenger accepté : message dédié, pas « En attente des participants… ».

---

**Fin d’audit — extraits et diagnostics documentés. En attente GO pour implémentation.**
