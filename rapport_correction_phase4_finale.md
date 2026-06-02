# Rapport de validation — Phase 4 finale (Teaser lock & sémantique carte)

**Date :** 31 mai 2026  
**Référence :** `rapport_audit_db_arena.md`  
**Fichier modifié :** `components/BeefCard.tsx`  
**Statut :** ✅ correctifs appliqués

---

## Synthèse

| Correctif | Objectif |
|-----------|----------|
| **Anti double-fire Teaser** | `onTeaserAuraClick()` uniquement sous verrou `localTeaserAuraLock` + `!has_liked_teaser` |
| **Overlay VS manifesto** | Fallback `À Saisir` au lieu de `Challenger 1` si manifeste sans challenger |
| **pendingRefText** | Masqué si `userInviteStatus === 'pending'` (évite doublon avec CTA convocation) |

---

## Étape 1 — Verrouillage strict Teaser Aura

**Avant :** `onTeaserAuraClick()` était appelé **après** le bloc `if`, à chaque clic — y compris quand le verrou animation bloquait déjà, et sur `onKeyDown` sans garde → risque de **double INSERT** réseau (+2 en base via trigger SQL).

**Après :**

```typescript
onClick={(e) => {
  e.stopPropagation();
  if (!has_liked_teaser && !localTeaserAuraLock.current) {
    localTeaserAuraLock.current = true;
    onTeaserAuraClick();  // ← réseau UNIQUEMENT ici
    // particule +1, timeouts 800 ms / 1500 ms
  }
}}
```

**`onKeyDown` (Enter/Espace) :** même garde + même séquence (réseau, animation, timeouts).

**Comportement attendu :**

- Un seul INSERT `teaser_likes` par fenêtre de 1,5 s.
- Clic répété / clavier pendant le lock → **aucun** appel réseau.
- Clic quand `has_liked_teaser === true` → pas de toggle unlike depuis ce bouton (like unique).

---

## Étape 2 — Sémantique carte

### Overlay TikTok (l. ~409)

```typescript
challenger_a_name || (intent === 'manifesto' ? 'À Saisir' : 'Challenger 1')
```

Manifeste sans combattant nommé → **« À Saisir »** au lieu du générique « Challenger 1 ».

### pendingRefText (CTAs modale)

```typescript
{status === 'pending' && pendingRefText && userInviteStatus !== 'pending' && (
  <div>...</div>
)}
```

Le bandeau italic n’apparaît plus sous **« ⚠️ Convocation en attente »**.

---

## Plan de test manuel

1. Modale teaser — double-clic rapide : une seule requête INSERT, score +1 après Realtime.
2. Enter sur bouton Aura teaser : même comportement que clic.
3. Manifeste sans `challenger_a_name` : overlay affiche « À Saisir ».
4. Challenger `userInviteStatus === 'pending'` : CTA convocation seul, pas de `pendingRefText` en dessous.

---

**Phase 4 validée en code.**
