# Rapport d'audit préalable — Phase 1 Debugging (Production)

**Date :** 31 mai 2026  
**Fichiers analysés :** `components/BeefCard.tsx` (post-Phase 5), `components/CreateBeefForm.tsx`, `app/feed/page.tsx` (handlers Aura)  
**Statut :** Exploration uniquement — **aucun correctif appliqué**

---

## Anomalie 1 — Placeholder Fantôme (`BeefCard.tsx`)

### Localisation

Le texte `"En attente d'un Ref…"` apparaît dans la **modale teaser** (portal), bloc CTA « PENDING & MANIFESTO », vers les lignes **784–794**.

### Structure exacte de la div englobante

```784:794:components/BeefCard.tsx
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && (
                      <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                        {user?.id === created_by
                          ? user?.id !== mediator_id
                            ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…`
                            : null
                          : isWaitingForMe
                            ? null
                            : "En attente d'un Ref…"}
                      </div>
                    )}
```

### Contexte parent immédiat

```726:728:components/BeefCard.tsx
                ) : (
                  /* PENDING & MANIFESTO */
                  <div className="flex flex-col gap-2">
```

La condition externe `{status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && (` est **indépendante** du contenu textuel interne.

### Variable auxiliaire `isWaitingForMe`

```151:155:components/BeefCard.tsx
  const isWaitingForMe =
    status === 'pending' &&
    Boolean(mediator_id) &&
    user?.id === mediator_id &&
    user?.id !== created_by;
```

### Diagnostic

| Scénario utilisateur | Condition externe | Contenu interne | Rendu visuel |
|---------------------|-------------------|-----------------|--------------|
| Spectateur neutre | ✅ vraie | `"En attente d'un Ref…"` | Texte OK |
| Créateur ≠ médiateur | ✅ vraie | Message validation Ref | Texte OK |
| **Créateur = médiateur** (`user.id === mediator_id === created_by`) | ✅ vraie | **`null`** | **Boîte vide** (bordure + `py-4` + fond) |
| **Médiateur en attente de validation** (`isWaitingForMe`) | ✅ vraie | **`null`** | **Boîte vide** |

**Cause racine :** la `div` chrome (`rounded-xl border … py-4`) est montée dès que `mediator_name` est présent et qu'aucun handler `onValiderRef` / `onSaisirAffaire` n'est passé, **même lorsque le ternaire interne renvoie `null`**. React rend alors un conteneur stylé sans enfant textuel → **placeholder fantôme**.

### Note — homonyme sur la carte (hors bug modal)

Un badge distinct `"En attente de Ref"` (sans ellipsis) existe sur l'overlay carte, lignes **409–412**, avec rendu **toujours non vide** lorsque `!mediator_name`. Ce n'est pas la source du fantôme modal.

---

## Anomalie 2 — Double-Aura / Race Condition

### 2.A — Bouton Aura carte principale

**Emplacement :** overlay bas de carte, lignes **445–458**.

```445:458:components/BeefCard.tsx
                  <button
                    type="button"
                    className={`flex h-full items-center justify-center pl-2.5 pr-1.5 transition-all hover:bg-white/10 active:bg-white/20 ${
                      !has_liked_by_user ? 'hover:text-amber-400' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_by_user) {
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                        setTimeout(() => setCardFloatingAuras((p) => p.filter((a) => a.id !== newId)), 1000);
                      }
                      onAuraClick();
                    }}
```

**Lecture de `has_liked_by_user` au clic :** lue **directement depuis la prop** (pas de ref, pas d'état local). L'animation `+1` est conditionnée par `!has_liked_by_user` ; l'appel `onAuraClick()` est **inconditionnel**.

### 2.B — Bouton Aura modale teaser

**Emplacement :** lignes **594–604**.

```594:604:components/BeefCard.tsx
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_teaser) {
                        const newId = Date.now() + Math.random();
                        setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                        setTimeout(() => setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId)), 1000);
                      }
                      onTeaserAuraClick();
                    }}
```

**Lecture de `has_liked_teaser` :** même pattern — prop lue au moment du clic, animation si `!has_liked_teaser`, handler **toujours appelé**.

### 2.C — Handlers parent (`app/feed/page.tsx`)

**Aura carte — optimistic + debounce ref :**

```690:727:app/feed/page.tsx
  const handleAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingCard.current) return;
    isLikingCard.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    ...
    const isCurrentlyLiked = !!targetBeef.has_liked_by_user;

    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          const wasLiked = !!b.has_liked_by_user;
          return {
            ...b,
            has_liked_by_user: !wasLiked,
            engagement_score: Math.max(0, (b.engagement_score || 0) + (wasLiked ? -1 : 1)),
          };
        }
        return b;
      }),
    );
    ...
    setTimeout(() => {
      isLikingCard.current = false;
    }, 1000);
  };
```

**Aura teaser — pas d'optimistic, debounce ref seulement :**

```730:757:app/feed/page.tsx
  /** Teaser : pas d’optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
  const handleTeaserAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingTeaser.current) return;
    isLikingTeaser.current = true;
    ...
    const isCurrentlyLiked = !!targetBeef.has_liked_teaser;
    // Pas de setBeefs optimiste
    ...
    setTimeout(() => {
      isLikingTeaser.current = false;
    }, 1000);
  };
```

### 2.D — Chaîne Realtime (amplificateur de race)

Canal Supabase sur table `beefs` :

```621:624:app/feed/page.tsx
    const channel = supabase
      .channel('beefs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => void loadBeefs(true))
```

Les triggers SQL `trg_beef_likes_aura` et `trg_teaser_likes_sync_score` **mettent à jour `beefs.engagement_score` / `beefs.teaser_score`**, ce qui déclenche un événement Realtime → **`loadBeefs(true)`** après chaque like/unlike.

### Diagnostic — mécanismes de double-Aura identifiés

| # | Mécanisme | Gravité | Détail |
|---|-----------|---------|--------|
| 1 | **Désynchronisation prop / UI locale** | Élevée | `BeefCard` décide l'animation `+1` via prop **stale** avant re-render. Double tap rapide : les deux clics voient `has_liked_by_user === false` → **deux animations `+1`**, alors que `isLikingCard` bloque le **second** appel API. |
| 2 | **Optimistic + Realtime** | Moyenne | `handleAuraClick` incrémente localement `engagement_score`, puis le trigger SQL incrémente aussi en DB ; `loadBeefs` refetch peut **réécrire** l'état pendant la fenêtre debounce 1 s → flicker score ou reset visuel. |
| 3 | **Teaser sans optimistic** | Élevée | `has_liked_teaser` reste `false` jusqu'au refetch Realtime ; l'UI permet plusieurs `+1` animés tant que la prop n'est pas à jour ; après 1 s debounce, un second clic API tente un **unlike** ou re-like selon timing. |
| 4 | **Pas de rollback on error** | Moyenne | Échec Supabase après optimistic card → UI et DB divergent jusqu'au prochain `loadBeefs`. |
| 5 | **Handler inconditionnel** | Faible | `onAuraClick()` / `onTeaserAuraClick()` appelés même quand l'animation est skippée (état déjà liké) — comportement voulu pour unlike, mais coupling animation ↔ prop fragile. |

**Synthèse :** la race n'est pas un double INSERT garanti (UNIQUE `(beef_id, user_id)` côté DB), mais un **double feedback visuel** et une **fenêtre de prop stale** entre clic, optimistic parent, et refetch Realtime déclenché par update `beefs`.

---

## Anomalie 3 — Centrage Date/Heure (`CreateBeefForm.tsx`)

### Structure Flexbox du sélecteur « Démarrage du beef »

**Conteneur section (l. 734–825) :**

```734:825:components/CreateBeefForm.tsx
                <div className="space-y-3 rounded-[2rem] border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Calendar className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
                    Démarrage du beef
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      {/* radio « Dès que c'est prêt » */}
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      {/* radio « Programmer » */}
                    </label>
                  </div>
                  {beefData.is_scheduled && (
                    <div className="flex flex-col gap-2 pl-8">
                      <div className="flex flex-wrap gap-2">
                        {/* boutons rapides : Dans 2h, Ce soir 21h, Demain 20h */}
                      </div>
                      <div className="relative mt-2">
                        <input
                          type="datetime-local"
                          value={beefData.scheduled_at}
                          min={minDateTimeLocalValue()}
                          onChange={...}
                          style={{ colorScheme: 'dark' }}
                          className="w-full cursor-pointer rounded-xl border border-white/20 bg-black/60 px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
```

### Diagnostic CSS / layout

| Facteur | Impact sur le centrage perçu |
|---------|------------------------------|
| **`pl-8` asymétrique** | Le bloc date (input + boutons rapides) est indenté de `2rem` à gauche **sans padding droit compensateur** → le champ paraît décalé vers la droite par rapport au titre « Démarrage du beef » et aux radios au-dessus. |
| **Pas de Grid / alignement central** | Le parent est `flex flex-col` ; l'input est `w-full` dans un `div.relative` sans `flex items-center justify-center`. Aucune règle ne centre le **texte interne** de l'input. |
| **Contrôle natif `datetime-local`** | Le libellé localisé (« 1 juin 2026 à 01:44 ») est rendu par le **moteur du navigateur** (WebKit/Blink). Le texte et l'icône calendrier ont des paddings internes non contrôlables par Tailwind seul. |
| **`colorScheme: 'dark'`** | Force le thème sombre du picker natif ; sur mobile Safari / Chrome Android, la zone cliquable et le glyph calendrier sont souvent **alignés à droite**, le texte à gauche — impression de déséquilibre dans un conteneur `text-center` absent. |
| **`px-4 py-2.5` uniforme** | Padding symétrique sur l'input, mais le **contenu natif** n'occupe pas le centre géométrique du box model (icône picker ~40px à droite en WebKit). |
| **Absence de styles globaux** | Aucune règle `::-webkit-calendar-picker-indicator` ou `datetime-local` dans `globals.css` (contrairement à une approche custom type `EditBeefModal` qui utilise les mêmes primitives sans workaround). |

### Comparaison `EditBeefModal.tsx`

L'édition utilise un input similaire mais **sans `pl-8` parent** et avec `rounded-[2rem]` + `py-3` :

```665:671:components/EditBeefModal.tsx
                    <input
                      id="edit-beef-date"
                      type="datetime-local"
                      value={scheduledAt}
                      ...
                      className="w-full rounded-[2rem] border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-white ..."
                    />
```

Le décalage est **plus visible dans `CreateBeefForm`** à cause de l'indentation `pl-8` cumulée au comportement natif du picker.

### Synthèse centrage

Le problème n'est probablement **pas un bug Flexbox classique** (items mal alignés entre siblings), mais la combinaison de :

1. **Indentation gauche seule** (`pl-8`) sur le sous-arbre « Programmer »  
2. **Rendering natif asymétrique** du `datetime-local` (texte + icône calendrier)  
3. **Absence de couche de présentation** (wrapper flex centré ou input custom) entre la valeur ISO et l'affichage utilisateur

---

## Matrice des fichiers impactés (correctifs futurs)

| Anomalie | Fichier principal | Fichier secondaire | Type de fix anticipé |
|----------|-------------------|--------------------|----------------------|
| Placeholder fantôme | `BeefCard.tsx` | — | Guard render : ne monter la `div` que si le message calculé ≠ `null` |
| Double-Aura | `BeefCard.tsx` | `app/feed/page.tsx` | Ref/local lock clic, aligner animation sur handler, optimistic teaser ou rollback |
| Centrage date | `CreateBeefForm.tsx` | `globals.css` (optionnel) | Rééquilibrer padding section, styles picker WebKit, ou composant date custom |

---

## Prochaine étape recommandée

Attendre validation **GO** / **VALIDÉ** de l'Architecte avant toute implémentation chirurgicale Phase 1.
