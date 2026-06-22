# Phase A.2.B — Activation `tailwindcss-animate`

> **Date :** 2026-05-31  
> **Statut :** ✅ Plugin injecté  
> **Fichier modifié :** `tailwind.config.ts` (seule la clé `plugins`)

---

## 1. Objectif

Activer les utilitaires d'animation Tailwind (`animate-in`, `animate-out`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*`) requis par les attributs `data-[state=open|closed]` de Radix UI, notamment sur le dropdown Header.

---

## 2. Modification appliquée

### Avant

```typescript
  plugins: [],
```

### Après

```typescript
  plugins: [require("tailwindcss-animate")],
```

### Garantie d'isolation

| Zone config | Modifiée ? |
|-------------|------------|
| `content` | ❌ Non |
| `theme.extend` (obsidian, cyan, brand, shadows, zIndex, …) | ❌ Non |
| `plugins` | ✅ Oui — ajout unique |
| `postcss.config.js` | ❌ Non |

---

## 3. Dépendances

| Package | Version | Rôle |
|---------|---------|------|
| `tailwindcss` | `^3.3.0` | Moteur CSS |
| `tailwindcss-animate` | `^1.0.7` | Plugin animations data-state |

Les deux étaient déjà dans `package.json` ; seul le branchement config manquait.

---

## 4. Consommateur activé

**`components/Header.tsx`** — `DropdownMenu.Content` :

```
data-[state=open]:animate-in
data-[state=closed]:animate-out
data-[state=closed]:fade-out-0
data-[state=open]:fade-in-0
data-[state=closed]:zoom-out-95
data-[state=open]:zoom-in-95
data-[side=bottom]:slide-in-from-top-2
data-[side=top]:slide-in-from-bottom-2
```

Ces classes sont désormais générées par Tailwind après redémarrage du serveur dev.

---

## 5. Validation requise (Architecte)

> **Important :** redémarrer le serveur de développement pour recharger la config Tailwind.

1. Arrêter le terminal actuel (`Ctrl+C`)
2. Relancer `npm run dev`
3. Cliquer sur l'avatar profil dans le Header
4. Vérifier : ouverture/fermeture fluide (fade + zoom + slide)

---

## 6. Checklist post-redémarrage

- [ ] Menu Radix s'ouvre avec fade-in + zoom-in
- [ ] Menu se ferme avec fade-out + zoom-out
- [ ] Slide directionnel selon `side` (top/bottom)
- [ ] Tokens couleurs Beefs inchangés (obsidian, cyan, brand, …)
- [ ] Aucune régression visuelle ailleurs dans l'app

---

## 7. Diff exact — `tailwind.config.ts`

```diff
-  plugins: [],
+  plugins: [require("tailwindcss-animate")],
```

---

*Phase A.2.B terminée — plugin activé, `theme.extend` intact.*
