# Rapport technique — Phase 1 : Virtualisation des nœuds vidéo

**Date :** 31 mai 2026  
**Commit :** `perf(feed): implement strict video node virtualization to prevent GPU/RAM choke`  
**Fichiers modifiés :** `app/feed/page.tsx`, `components/BeefCard.tsx`

---

## Objectif

Centraliser l'observation de visibilité des cartes feed et ne monter **qu'un seul** élément `<video>` inline à la fois — celui de la carte la plus visible — afin de réduire la pression RAM/GPU causée par N decodeurs vidéo simultanés.

---

## Étape 1 — Radar central (`app/feed/page.tsx`)

### État ajouté

```ts
const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
```

### IntersectionObserver unique

- Instancié dans un `useEffect` dépendant de `[loading, beefs, mobileViewMode]`.
- **Root :** `#feed-scroll-container` (scroll interne du feed, pas `window`).
- **Cibles :** tous les nœuds `[data-beef-id]` présents dans le conteneur.
- **Seuils :** `[0, 0.25, 0.5, 0.75, 1]`.
- **Algorithme :** une `Map<beefId, intersectionRatio>` est mise à jour à chaque callback ; la carte avec le **ratio maximal strictement positif** devient `activeVideoId`. Si aucune carte n'intersecte, `activeVideoId` repasse à `null`.

### Marquage DOM & prop

- Attribut `data-beef-id={beef.id}` ajouté sur la `div` enveloppant directement `<BeefCard />`.
- Prop transmise : `isActiveVideo={beef.id === activeVideoId}`.

---

## Étape 2 — Démontage vidéo (`components/BeefCard.tsx`)

### Prop ajoutée

```ts
isActiveVideo?: boolean; // défaut false
```

Les pages profil et autres consommateurs de `BeefCard` hors feed ne passent pas cette prop → comportement inchangé (thumbnail / gradient uniquement).

### Suppression

- `useLayoutEffect` + `IntersectionObserver` interne **supprimés**.
- Import `useLayoutEffect` retiré.

### Rendu média inline (conditionnel)

| Condition | Rendu |
|-----------|-------|
| `isActiveVideo && video_url` | `<video autoPlay loop muted playsInline />` |
| Sinon, `thumbnail` présent | `<Image />` Next.js |
| Sinon | Gradient `from-obsidian-900 to-black` |

### Non modifié (volontairement)

- `<video>` de la modale teaser (`modalVideoRef`, portal `createPortal`).
- Boutons Aura, vues, mute, menus, modales `AuraGiversModal`.
- `handleToggleMute` synchronise toujours inline + modal quand les refs existent.

---

## Comportement attendu après déploiement

1. **Scroll feed :** une seule vidéo inline active à la fois (celle la plus visible dans le viewport du conteneur).
2. **Cartes hors champ :** affichent thumbnail ou gradient — **aucun nœud `<video>`** dans le DOM.
3. **Grille desktop :** fin du multi-play simultané (plusieurs cartes ≥ 50 % visibles) — une seule gagnante par ratio max.
4. **Modale teaser :** ouverture au clic → second `<video>` via portal, indépendant du radar central.
5. **Profils :** pas de régression — `isActiveVideo` absent → jamais de vidéo inline.

---

## Risques résiduels & pistes Phase 2

| Point | Détail |
|-------|--------|
| `isMuted` local | Reset à `true` si la carte perd puis regagne le focus vidéo (remount du `<video>`). |
| Pas de thumbnail | Carte inactive avec `video_url` seulement → gradient noir jusqu'à activation. |
| Realtime `loadBeefs` | Re-render complet de la liste ; l'IO se ré-abonne via le `useEffect` — acceptable. |
| Scroll restoration | Toujours basé sur `window.scrollY`, pas `#feed-scroll-container` — hors scope Phase 1. |
| Limite 3–5 nœuds | Phase 1 = **1** nœud vidéo inline ; extension windowing possible en Phase 2 si besoin de pré-buffer adjacent. |

---

## Vérifications effectuées

- [x] TypeScript : `npx tsc --noEmit` sans erreur
- [x] Linter : aucune alerte sur les fichiers modifiés
- [x] Auras, modales, CTA dynamiques : non touchés
- [x] Vidéo modale portal : non touchée

---

## Synthèse pour l'Architecte

Le feed passe d'un modèle **N observers + N vidéos** à **1 observer central + 1 vidéo active**. C'est la fondation performance requise avant l'application du Design System Starry Glass et l'intégration future de l'enregistrement 15 secondes.
