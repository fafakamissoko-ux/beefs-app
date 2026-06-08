# Rapport — Unboxing Commentaires (refonte UI/UX)

**Date :** 31 mai 2026  
**Statut :** ✅ Refonte appliquée  
**Fichier modifié :** `components/CommentsDrawer.tsx`

---

## Synthèse

| Objectif | Statut |
|----------|--------|
| Révéler `<StarField />` global via transparence glass | ✅ |
| Supprimer les boîtes commentaires (bulles messagerie) | ✅ |
| Grille Flex flat type TikTok/Instagram | ✅ |
| Input pill + bouton envoi circulaire | ✅ |

---

## Étape 1 — Révélation du fond étoilé

| Surface | Avant | Après |
|---------|-------|-------|
| Panneau principal (`z-[10000]`) | `bg-slate-950` | `bg-slate-950/70 backdrop-blur-md` |
| Header « Commentaires » | `bg-slate-950` | `bg-transparent` |
| Zone input sticky | `bg-slate-950` | `bg-slate-950/80 backdrop-blur-md` |

Le `<StarField />` monté globalement dans `app/layout.tsx` (`fixed inset-0 -z-10`) reste visible à travers le panneau grâce à l’opacité 70 % et au flou. Le portal (`document.body`, `z-[10000]`) place le drawer au-dessus du fond sans le dupliquer.

**Conservé :** overlay `bg-black/60`, bordures `border-white/10`, safe area input `pb-[max(1rem,env(safe-area-inset-bottom))]`.

---

## Étape 2 — Destruction des boîtes

**`<li>` commentaire — avant :**
```
rounded-2xl border border-white/10 bg-slate-900/40 p-3 backdrop-blur-sm
+ réponses : ml-8 border-l-2 border-l-white/10 pl-4
```

**`<li>` commentaire — après :**
```
relative py-3 group
+ réponses : ml-11
```

Supprimé : `rounded-*`, `border`, `bg-slate-900/40`, `backdrop-blur-sm`, bordure latérale réponse.

---

## Étape 3 — Grille flat Tier-1

Architecture interne par commentaire :

```
flex items-start gap-3
├── Colonne gauche : avatar 36×36 (sans bordure)
├── Colonne centrale : displayName, contenu 14px, date + Répondre
└── Colonne droite : Sparkles + InlineAuraGivers
```

**Ajouts UX :**
- Date relative courte (`toLocaleDateString` fr-FR)
- `@username` retiré de l’affichage (conservé pour `setReplyingTo`)
- Aura isolée à droite avec glow amber si liké

**Liste :** `space-y-4` → `space-y-0` (espacement porté par `py-3` sur chaque `<li>`).

---

## Étape 4 — Input pill

| Élément | Avant | Après |
|---------|-------|-------|
| Input | `rounded-xl bg-slate-900/60 text-sm` | `rounded-full bg-white/5 border border-white/10 text-[14px]` |
| Bouton envoi | `h-11 w-11 rounded-xl` | `h-[42px] w-[42px] rounded-full` |

---

## Checklist validation manuelle

- [ ] Ouvrir le drawer : étoiles visibles à travers le panneau glass
- [ ] Commentaires sans boîtes — layout horizontal fluide
- [ ] Réponses indentées (`ml-11`) sans bordure verticale
- [ ] Aura / Sparkles fonctionnels colonne droite
- [ ] Input pill + bouton rond alignés, safe area bas OK
- [ ] Mobile bottom sheet : `80dvh` + blur lisible

---

## Fichiers non modifiés

- `app/feed/page.tsx` — inchangé (StarField reste global via layout)
- `components/Arena/shared/StarField.tsx` — inchangé

**Fin du rapport.**
