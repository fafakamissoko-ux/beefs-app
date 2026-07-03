# Rapport d'audit Zero-Blind — Système de commentaires Tier 1

**Date :** 31 mai 2026  
**Mission :** cartographier tables SQL et composants UI existants avant conception « commentaires + Aura »  
**Statut :** extraction uniquement — **aucun fichier modifié**

---

## Synthèse exécutive

| Cible audit | Résultat |
|-------------|----------|
| `comments` | **Absente** (toutes migrations) |
| `beef_comments` | **Absente** |
| `post_comments` | **Absente** |
| `reviews` (nom générique) | **Absente** — existe `mediator_viewer_reviews` (domaine distinct) |
| `CommentSection.tsx` / `Comment.tsx` / `Reply.tsx` | **Absents** |
| Composant proche | `ChatPanel.tsx` — persiste `beef_messages`, **non branché** sur `BeefCard` / feed |
| Point d'injection | Barre overlay `BeefCard` L424–538 : `flex gap-1.5` (vues + Aura) |

**Risque de collision principal :** ne pas confondre le futur fil **commentaires feed/carte** avec `beef_messages` (chat live arène) ni `mediator_viewer_reviews` (notation Ref).

---

## 1. Scan SQL — tables « fantômes »

Méthode : recherche dans `supabase_migrations/*.sql`, `init.sql`, `ALL_MIGRATIONS_DEV.sql` (équivalent local à `SELECT ... FROM pg_proc` / catalogue tables).

### 1.1 Tables demandées explicitement

| Nom recherché | Présence | Fichier source |
|---------------|----------|----------------|
| `comments` | ❌ **Aucune** `CREATE TABLE` | — |
| `beef_comments` | ❌ **Aucune** | — |
| `post_comments` | ❌ **Aucune** | — |
| `reviews` (table) | ❌ **Aucune** | — |

**Confirmation :** pas de table générique `comments` / `beef_comments` / `post_comments` dans le dépôt.

### 1.2 Table proche : `mediator_viewer_reviews`

**Présente** — `supabase_migrations/35_mediator_viewer_reviews.sql` :

```sql
CREATE TABLE IF NOT EXISTS public.mediator_viewer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  beef_id UUID NOT NULL REFERENCES public.beefs(id) ON DELETE CASCADE,
  mediator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  CONSTRAINT mediator_viewer_reviews_one_per_beef_reviewer UNIQUE (beef_id, reviewer_id)
);
```

| Attribut | Implication Tier 1 |
|----------|-------------------|
| 1 avis / beef / reviewer | Pas un fil de commentaires publics sur la carte |
| Champ `comment` | Texte optionnel **dans** une note Ref (post-médiation) |
| Affichage | Profil médiateur (`ProfileContent`, page publique onglet Vox Populi) |

**Verdict :** hors scope « commentaires beef feed » — ne pas réutiliser cette table sans refonte produit.

### 1.3 Tables adjacentes (collision sémantique)

| Table | Migration | Rôle | Aura ? |
|-------|-----------|------|--------|
| `beef_messages` | `11_chat_system.sql`, `init.sql` | Chat live par `beef_id` (content, pin, soft-delete) | ❌ |
| `beef_reactions` | `11_chat_system.sql`, `19_live_fixes.sql` | Emojis broadcast live | ❌ |
| `beef_likes` | `57_beef_likes_aura_trigger.sql` | Like beef → `engagement_score` | ✅ (via trigger) |
| `teaser_likes` | `58_teaser_likes_teaser_score.sql` | Like teaser | ❌ (score seulement) |
| `direct_messages` | `22_direct_messages.sql` | DM privés | ❌ |

Schéma `beef_messages` (extrait) :

```sql
CREATE TABLE IF NOT EXISTS public.beef_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES public.beefs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Consommateurs code :

- `components/TikTokStyleArena.tsx` — lecture / suppression directe
- `components/ChatPanel.tsx` — insert + Realtime
- `hooks/useArenaRealtime.ts` — polling fallback
- `app/api/fact-check/route.ts` — insert admin

**Verdict :** `beef_messages` = **chat temps réel arène**, pas commentaires persistés type feed. Une nouvelle table dédiée (ex. `beef_comments`) évite de mélanger modération live et fil public carte.

### 1.4 Requête SQL équivalente (à exécuter en prod pour double-check)

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'comments', 'beef_comments', 'post_comments', 'reviews',
    'beef_messages', 'mediator_viewer_reviews', 'beef_reactions'
  )
ORDER BY tablename;
```

Résultat attendu côté migrations repo : `beef_messages`, `beef_reactions`, `mediator_viewer_reviews` — **pas** les trois premiers noms.

---

## 2. Scan UI — composants morts ou proches

### 2.1 Fichiers ciblés par l'Architecte

| Fichier | Présent ? |
|---------|-----------|
| `CommentSection.tsx` | ❌ |
| `Comment.tsx` | ❌ |
| `Reply.tsx` | ❌ |

Recherche glob `**/*Comment*` et `**/*Reply*` dans `components/` : **0 fichier**.

### 2.2 Composants existants liés au « commentaire » (sémantique large)

| Fichier | Rôle | Utilisé sur BeefCard / feed ? |
|---------|------|-------------------------------|
| `components/ChatPanel.tsx` | UI messages `beef_messages` ; prop `commentsStyle` + `CommentsStyleMessage` | ❌ **Non monté** dans le tree feed |
| `components/TikTokStyleArena.tsx` | Drawer / messages arène ; import `ChatPanel` **sans JSX** `<ChatPanel />` | ❌ (import potentiellement mort) |
| `components/ReviewMediatorModal.tsx` | Formulaire note + `comment` texte pour Ref | ❌ — `app/beef/[id]/summary/page.tsx` |
| `components/MessagesUI.tsx` | DMs — icône `MessageCircle` | ❌ |
| `components/PreJoinScreen.tsx` | Copy marketing « commenter » | ❌ |

**Conclusion UI :** terrain **vert** pour nouveaux composants (`BeefCommentDrawer`, etc.) sans supprimer d'ancien `Comment*.tsx`.

### 2.3 `ChatPanel` — état du code (extrait structure)

```tsx
export function ChatPanel({ roomId, userId, userName, tiktokStyle = false, commentsStyle = false }: ChatPanelProps) {
  // charge beef_messages, Realtime INSERT/UPDATE, sendMessage → insert
  if (commentsStyle) {
    return ( /* CommentsStyleMessage list */ );
  }
  return ( /* chat classique + input */ );
}
```

Aucune référence `commentsStyle={true}` dans le repo (grep). Pattern UI réutilisable visuellement, **pas** la couche données Tier 1 feed.

---

## 3. Point d'injection — `BeefCard.tsx` (barre d'actions)

### 3.1 Contexte layout

- Overlay TikTok : `pointer-events-none` sur le conteneur bas, **`pointer-events-auto`** sur la barre d'actions (L424).
- Ligne actions : `flex flex-wrap items-center justify-between gap-2` (Ref badge | groupe droite).

### 3.2 JSX extrait — barre droite (vues + Aura)

```tsx
          <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
            {mediator_name ? (
              <span className="w-fit rounded-full border border-white/20 bg-black/40 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-gray-200 sm:px-2.5 sm:py-1 sm:text-[10px]">
                REF: <span className="text-white">@{mediator_name}</span>
              </span>
            ) : (
              <span className="w-fit rounded-full border border-prestige-gold/40 bg-prestige-gold/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-prestige-gold sm:px-2.5 sm:py-1 sm:text-[10px]">
                En attente de Ref
              </span>
            )}

            <div className="flex items-center gap-1.5">
              {/* ─── PILL VUES ─── */}
              <div
                className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsViewsModalOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                <span>{viewer_count.toLocaleString()}</span>
              </div>

              {/* ─── PILL AURA (si onAuraClick fourni par le feed) ─── */}
              {onAuraClick ? (
                <div
                  className={`relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg font-mono text-[9px] sm:text-[10px] font-bold ${
                    has_liked_by_user ? 'border-amber-400/50 text-amber-400' : 'border-white/10 text-white'
                  }`}
                >
                  <AnimatePresence>{/* floating +1 chips */}</AnimatePresence>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center pl-2.5 pr-1.5 transition-all hover:bg-white/10 active:bg-white/20 ..."
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      /* floating aura animation */
                      onAuraClick?.();
                      window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
                    }}
                    aria-label={has_liked_by_user ? "Retirer l'Aura" : "Envoyer de l'Aura"}
                  >
                    <Sparkles className="h-3.5 w-3.5 ..." aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <InlineAuraGivers targetId={id} type="beef" ownerId={mediator_id || created_by || ''} />
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              ) : (
                /* variante lecture seule : Sparkles décoratif + modale donateurs */
                <div className="relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg font-mono text-[9px] sm:text-[10px] font-bold text-white">
                  <div className="flex h-full items-center justify-center pl-2.5 pr-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <button type="button" className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 ..." onClick={... setIsBeefAuraModalOpen(true)}>
                    <InlineAuraGivers ... />
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
```

**Lignes source :** ~424–538 (`components/BeefCard.tsx`).

### 3.3 Design system — espace pour `MessageCircle`

| Contrainte | Valeur actuelle |
|------------|-----------------|
| Conteneur actions droite | `flex items-center gap-1.5` |
| Hauteur pills | `h-6 sm:h-7` |
| Style pill | `rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg` |
| Icônes existantes | `Eye` 3.5, `Sparkles` 3.5 |
| Pattern clic | `e.stopPropagation()` obligatoire (carte cliquable) |

**Options d'injection recommandées (analyse, pas implémentées) :**

1. **Troisième pill** dans `gap-1.5`, entre `Eye` et pill Aura — symétrie arène (`Eye` | `MessageCircle` | `Sparkles+score`).
2. **Pill icône seule** (sans compteur) si largeur mobile critique — badge compteur optionnel `text-[10px] font-mono`.
3. **Ne pas fusionner** avec le bouton Sparkles (leçon Phase 10.2 lightbox).

**Imports actuels BeefCard :** pas de `MessageCircle` — à ajouter depuis `lucide-react` avec les autres icônes L7.

**Props feed actuelles** (`app/feed/page.tsx`) : `onAuraClick`, pas de `onCommentClick` — nouvelle prop callback + compteur `comment_count?` à prévoir côté data.

---

## 4. Cartographie consommateurs `BeefCard`

| Page | Props Aura | Commentaires |
|------|------------|--------------|
| `app/feed/page.tsx` | `onAuraClick={() => handleAuraClick(beef.id)}` | ❌ aucune prop commentaire |

Seul point d'injection Tier 1 identifié dans le périmètre audit : **overlay bas de carte feed**.

---

## 5. Recommandations Architecte (post-audit)

1. **Nouvelle table** `beef_comments` (ou nom validé) — ne pas surcharger `beef_messages`.
2. **Ne pas réutiliser** `mediator_viewer_reviews` pour le fil public carte.
3. **Composants neufs** plutôt que renommer `ChatPanel` — éviter confusion chat live / commentaires feed.
4. **BeefCard** : pill `MessageCircle` dans `flex gap-1.5`, même gabarit que pill `Eye`, `stopPropagation`, prop `onCommentClick` + `commentCount?`.
5. **Aura sur commentaires** : prévoir type RPC `get_universal_aura_givers` / table likes dédiée — hors scope de cet audit (aucune table comment-like existante).

---

## 6. Fichiers inspectés

- `supabase_migrations/` (11, 19, 22, 35, 57, 58, 60, init.sql, ALL_MIGRATIONS_DEV.sql)
- `components/BeefCard.tsx`
- `components/ChatPanel.tsx`
- `components/TikTokStyleArena.tsx`
- `app/feed/page.tsx`
- Glob `components/**/*Comment*`, `**/*Reply*`

**Aucune modification de code effectuée.**
