# Rapport d'audit — Primitives UI Tier-1

**Date :** 2026-05-31  
**Périmètre :** `components/` (+ consommation dans `app/feed/page.tsx` pour modales inline)  
**Statut :** Analyse uniquement — **aucune modification de code**

---

## Synthèse exécutive

| Axe | Implémentation actuelle | Librairies Tier-1 présentes | Verdict |
|-----|-------------------------|----------------------------|---------|
| Tiroirs / Modales | 100 % fait maison (`fixed` + `framer-motion` + états booléens) | ❌ Ni `vaul`, ni `@radix-ui/react-dialog` | **Refonte recommandée** |
| Toasts | Contexte React + tableau + `setTimeout` | ❌ Ni `sonner`, ni `react-hot-toast` | **Refonte recommandée** |
| Menus contextuels | `position: absolute` + `useState` local | ❌ Ni `@radix-ui/react-dropdown-menu` | **Refonte recommandée** |

**Dépendances UI actuelles (`package.json`) :** `framer-motion`, `lucide-react`, `swiper` — aucune primitive d'accessibilité (Radix, Vaul, Sonner).

---

## 1. Tiroirs (Drawers) et Modales

### Inventaire analysé

| Fichier | Rôle | Mécanisme d'ouverture |
|---------|------|------------------------|
| `CommentsDrawer.tsx` | Bottom sheet mobile / panneau latéral desktop | Monté via `createPortal` ; parent contrôle via prop `onClose` (`AnimatePresence` dans `app/feed/page.tsx`) |
| `CreateBeefForm.tsx` | Modale création beef (*pas de fichier `CreateBeefModal`*) | `{showCreateModal && <CreateBeefForm />}` dans le feed |
| `EditBeefModal.tsx` | Modale édition beef pending | `{editBeefId && <EditBeefModal />}` |
| `AuraGiversModal.tsx` | Modale liste donateurs / vues | Prop `isOpen: boolean` + `AnimatePresence` interne |
| `GlobalMessagesDrawer.tsx` | Tiroir messages global | `isDrawerOpen` via `MessagesDrawerContext` |

### Animation ouverture / fermeture

Toutes reposent sur **framer-motion** :

| Composant | Entrée | Sortie |
|-----------|--------|--------|
| `CommentsDrawer` | Mobile : `y: '100%'` → `0` ; Desktop : `x: '100%'` → `0` (spring) | Inverse |
| `CreateBeefForm` | `scale: 0.9, opacity: 0` → plein | ❌ Pas de `AnimatePresence` / pas d'exit animé |
| `EditBeefModal` | `scale: 0.94, opacity: 0` → plein | ❌ Idem — démontage brutal |
| `AuraGiversModal` | Fade + scale + `y: 12` | `AnimatePresence` avec exit |
| `GlobalMessagesDrawer` | Slide `x: '100%'` → `0` (spring) | Slide retour + fade overlay |

**Observations :**
- Aucun composant n'utilise **Vaul** (snap points, drag-to-dismiss natif mobile).
- `CommentsDrawer` imite un bottom sheet via CSS (`max-md:bottom-0 max-md:h-[80dvh] max-md:rounded-t-3xl`) sans gestion de geste ni hauteur dynamique.
- Incohérence : certains overlays ont exit animé, d'autres disparaissent instantanément au démontage React.

### Focus trap & accessibilité

| Critère | État |
|---------|------|
| `role="dialog"` + `aria-modal="true"` | ✅ Présent sur la plupart (CommentsDrawer, CreateBeefForm, EditBeefModal, AuraGiversModal) |
| Focus initial sur ouverture | ❌ Absent partout |
| Focus trap (Tab cycle) | ❌ Absent — pas de `@radix-ui/react-focus-scope`, pas de `focus-trap-react` |
| Restitution focus à la fermeture | ⚠️ Partiel — `GlobalMessagesDrawer` blur `activeElement` uniquement |
| Touche **Escape** | ❌ Absente sur les 5 cibles (présente ailleurs : `ImageCropModal`, `GlobalSearchBar`, `TikTokStyleArena`) |
| `aria-labelledby` | ✅ Souvent présent |
| Scroll lock body | ⚠️ `CommentsDrawer` force `document.body.style.overflow = 'hidden'` manuellement ; les autres modales scrollent via l'overlay |

### Clics extérieurs (backdrop dismiss)

| Composant | Fermeture backdrop |
|-----------|-------------------|
| `CommentsDrawer` | ✅ Overlay séparé `onClick={onClose}` |
| `CreateBeefForm` | ❌ Overlay = conteneur scroll ; **pas** de fermeture au clic extérieur (seulement bouton X → `onCancel`) |
| `EditBeefModal` | ✅ `onMouseDown` sur overlay si `e.target === e.currentTarget` |
| `AuraGiversModal` | ✅ `onClick={onClose}` sur overlay |
| `GlobalMessagesDrawer` | ✅ Overlay `onClick={handleClose}` |

### Pattern général

```
Parent: const [open, setOpen] = useState(false)
        {open && <Modal isOpen onClose={() => setOpen(false)} />}
Modal:  fixed inset-0 z-[…] + framer-motion + stopPropagation sur contenu
```

**Conclusion axe 1 :** Implémentation **100 % artisanale**. Fonctionnelle visuellement (Premium Glass cohérent), mais **non conforme Tier-1** sur l'accessibilité et la robustesse mobile (drawers).

### Standards visés vs recommandation

| Besoin | Standard | Migration suggérée |
|--------|----------|-------------------|
| Bottom sheet mobile (commentaires) | **vaul** | `Drawer` avec `shouldScaleBackground`, snap, drag handle |
| Modales centrées (Create / Edit / Aura) | **@radix-ui/react-dialog** | Focus trap, Escape, `Dialog.Portal`, inert background |
| Tiroir messages | **vaul** (mobile) ou **Radix Dialog** (desktop slide-over) | Unifier `GlobalMessagesDrawer` + pattern CommentsDrawer |

**Refonte requise :** ✅ **Oui** — priorité haute sur `CommentsDrawer` (feed critique) et modales Create/Edit.

---

## 2. Système de notifications (Toasts)

### Fichier : `components/Toast.tsx`

### Architecture

```typescript
ToastContext → ToastProvider
  state: Toast[]  // tableau en mémoire
  toast(msg, type, options?) → push + setTimeout(remove, durationMs)
  UI: fixed top-16 right-4, AnimatePresence + motion.div par toast
```

### Codé de zéro ?

**Oui.** Aucune dépendance toast tierce. Provider monté dans le layout racine (pattern classique maison).

### File d'attente (queue)

| Comportement | Implémentation actuelle | Attendu Tier-1 (sonner) |
|--------------|-------------------------|---------------------------|
| Empilement | Tous les toasts visibles simultanément (`flex-col gap-2`) | Limite configurable (ex. 3 visibles) |
| 5 toasts d'un coup | **5 cartes empilées** — pas de fusion, pas de défilement | Queue avec shift ou stacking intelligent |
| ID unique | `Date.now().toString()` — **collision possible** si appels synchrones | UUID / compteur incrémental |
| Durée | 4 s (10 s si `action`) par toast, `setTimeout` indépendant | Pause au hover, prolongation focus |
| Fermeture manuelle | Bouton X → `removeToast(id)` | ✅ équivalent |
| Action CTA | `options.action` inline | ✅ équivalent |
| Variantes visuelles | success / error / info + tone `ember` | ✅ custom classes reproductibles dans sonner |

### Animations

- **Entrée :** spring `opacity + y + scale` — fluide
- **Sortie :** `AnimatePresence` exit — correcte
- **Pas de** swipe-to-dismiss, pas de barre de progression temporelle

### Risques identifiés

1. **Saturation UI** : rafale de toasts (ex. erreurs Supabase realtime) peut recouvrir le header.
2. **Fuites timer** : si le composant toast est retiré avant `setTimeout`, pas de cleanup explicite (filtre idempotent limite le dommage).
3. **Pas de priorité** : un toast `error` n'éjecte pas un toast `info`.

### Standard visé : `sonner`

| Avantage | Impact projet |
|----------|---------------|
| `<Toaster richColors closeButton />` | Remplacement ~120 lignes Toast.tsx |
| API `toast.success()`, `toast.error()` | Migration mécanique des ~40+ appels `useToast()` |
| Stacking / limite | Résout saturation |
| Accessibilité | `aria-live` régions gérées |

**Refonte requise :** ✅ **Oui** — effort faible, gain immédiat sur robustesse queue et DX.

---

## 3. Menus contextuels (Dropdowns)

### Cibles analysées

| Emplacement | Fichier | Pattern |
|-------------|---------|---------|
| Actions beef (⋯) | `BeefCard.tsx` | `isMenuOpen` + `motion.div absolute right-0 mt-2` |
| Menu utilisateur header | `Header.tsx` | `userMenuOpen` + `absolute` + **click outside** via `document.addEventListener('click')` + `[data-user-menu]` |
| Menu conversation DM | `MessagesUI.tsx` | `showChatMenu` + `absolute right-0 top-full` — **sans** click outside |
| Menu message (réactions) | `MessagesUI.tsx` | Mobile : bottom sheet fixe + overlay ; Desktop : `absolute` relatif à la bulle |
| Profil public (⋯) | `[username]/page.tsx` | Bouton → ouvre `ReportBlockModal` (pas dropdown) |
| Select signalement | `ReportBlockModal.tsx` | `dropdownOpen` + liste `absolute z-10` |
| Retraits settings | `WithdrawalWizard.tsx` | Dropdowns `absolute top-full` custom |

### Pattern BeefCard (référence feed)

```tsx
const [isMenuOpen, setIsMenuOpen] = useState(false);
// Toggle sur MoreVertical
{isMenuOpen && (
  <motion.div className="absolute right-0 z-[70] mt-2 ...">
    <button onClick={() => { setIsMenuOpen(false); onEdit(); }} />
  </motion.div>
)}
```

| Critère | BeefCard | Radix DropdownMenu |
|---------|----------|-------------------|
| Fermeture clic extérieur | ❌ Non | ✅ Automatique |
| Touche Escape | ❌ Non | ✅ |
| Focus management | ❌ Non | ✅ roving focus |
| Collision viewport | ❌ Menu peut déborder bas/écran | ✅ Flip / shift auto |
| Portal | ❌ Rendu in-place (clip possible dans SwiperSlide) | ✅ `Portal` body |
| `aria-expanded` | ✅ Sur le trigger | ✅ Complet |

### Header (meilleur effort maison)

```typescript
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    if (userMenuOpen && !target.closest('[data-user-menu]')) setUserMenuOpen(false);
  };
  document.addEventListener('click', handleClickOutside);
}, [userMenuOpen]);
```

Fonctionne mais :
- Pas de gestion clavier
- Listener global sur **chaque** menu (pattern dupliqué si d'autres menus)
- Risque conflit avec `stopPropagation` sur BeefCard / Swiper

### MessagesUI — complexité élevée

Le menu message hybride (bottom sheet mobile / pill desktop) est **sur-mesuré** (~80 lignes JSX) — candidat idéal à **Radix DropdownMenu** (desktop) + **Vaul** ou **Radix Dialog** (mobile actions).

### Standard visé : `@radix-ui/react-dropdown-menu`

**Refonte requise :** ✅ **Oui** — priorité **BeefCard** (actions dans Swiper mobile = risque clip/z-index) et **Header** (menu utilisateur).

---

## 4. Cartographie complémentaire (hors cibles strictes)

| Composant | Type | Note |
|-----------|------|------|
| `GlobalMessagesDrawer.tsx` | Drawer | Même dette que CommentsDrawer |
| `app/feed/page.tsx` modales delete/forfeit | Modale inline | Pas d'animation, pas Escape — dupliquerait Radix Dialog |
| `BeefCard` teaser modal | `createPortal` fullscreen | Modale custom séparée (hors scope strict) |
| `ImageCropModal.tsx` | Modale | Escape ✅ — rare exception |
| `ReportBlockModal.tsx` | Modale + dropdown custom | Double dette |

---

## 5. Matrice de décision refonte

| Composant / système | Effort estimé | Risque si inchangé | Librairie cible |
|--------------------|---------------|-------------------|-----------------|
| `Toast.tsx` | **Faible** | Saturation UI, a11y | **sonner** |
| `BeefCard` menu ⋯ | **Faible** | Clip Swiper, pas Escape | **radix dropdown-menu** |
| `CommentsDrawer` | **Moyen** | a11y feed, gesture mobile | **vaul** |
| `CreateBeefForm` / `EditBeefModal` | **Moyen** | Focus trap, backdrop UX | **radix dialog** |
| `AuraGiversModal` | **Faible** | a11y | **radix dialog** |
| `GlobalMessagesDrawer` | **Moyen** | Cohérence drawers | **vaul** ou radix |
| `Header` user menu | **Faible** | Dette listeners | **radix dropdown-menu** |
| `MessagesUI` menus | **Élevé** | UX mobile/desktop split | radix + vaul |

---

## 6. Conclusion

L'écosystème UI du dossier `components/` repose sur un **socle visuel Premium Glass cohérent** (`backdrop-blur`, bordures `white/10`, `framer-motion`) mais sur des **primitives interactionnelles entièrement artisanales**.

### Confirmations finales

1. **Tiroirs / Modales :** Oui, ce sont des `div fixed` + états `isOpen` / montage conditionnel manuels. **Refonte vers vaul + Radix Dialog recommandée.**

2. **Toasts :** Oui, système codé de zéro sans gestion de queue avancée. **Refonte vers sonner recommandée.**

3. **Dropdowns :** Oui, `position: absolute` + `useState`, fermeture extérieure inégale (Header seulement). **Refonte vers Radix DropdownMenu recommandée.**

### Ordre de migration suggéré (Architecte)

1. **sonner** — remplacement Toast (quick win, faible régression)
2. **Radix DropdownMenu** — BeefCard + Header
3. **vaul** — CommentsDrawer mobile
4. **Radix Dialog** — CreateBeefForm, EditBeefModal, AuraGiversModal, modales feed inline

**Aucune modification de code effectuée dans le cadre de cet audit.**
