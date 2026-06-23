# Rapport Phase C1 — Séparation post-live ended / replay

**Date :** 31 mai 2026  
**Phase :** C.1 — Distinction visuelle BeefCard + lecteur VOD ArenaPage  
**Statut :** ✅ Terminé

---

## Objectif

Séparer formellement la logique post-live :

| Statut | Sémantique UX | Accès |
|--------|---------------|-------|
| `ended` / `completed` | Traitement en cours | Résumé / verdict uniquement |
| `replay` | VOD disponible | Lecteur vidéo natif + résumé |
| `cancelled` | Beef annulé | Résumé uniquement |

---

## Fichiers modifiés

| Fichier | Changement |
|---------|------------|
| `components/BeefCard.tsx` | Badges, CTA et variantes visuelles différenciés ended vs replay |
| `app/arena/[roomId]/page.tsx` | État `beefEndedInfo` enrichi + lecteur `<video>` natif en mode replay |

---

## C1.1 — BeefCard : séparation visuelle

### `getPrimaryStatusBadge`

- **`ended` / `completed`** → badge gris « TERMINÉ » (`border-gray-500/30`, `text-gray-300`)
- **`replay`** → badge cyan « REPLAY » avec icône `Play`

### Dynamic CTA (Monolith Standard)

Trois branches distinctes :

1. **`replay`** → bouton cyan « Regarder le Replay » (shadow glow cyan)
2. **`ended` / `completed` / `cancelled`** → bouton neutre « Voir le Verdict & Résumé »
3. **`live`** → inchangé (Rejoindre le Live)

### Ajustements cohérents

- **`isReplay`** : restreint à `status === 'replay'` (overlay Play au hover réservé au VOD)
- **`statusVariant`** :
  - `replay` → `ring-1 ring-cyan-500/40`
  - `ended` / `completed` / `cancelled` → opacité réduite (traitement / terminé)

---

## C1.2 — ArenaPage : lecteur VOD natif

### État `beefEndedInfo` étendu

```typescript
{
  title: string;
  host_name: string;
  status: string;
  video_url?: string | null;
  started_at?: string;
  ended_at?: string;
}
```

### Amorçage (`useEffect`)

Déclenchement pour `ended`, `cancelled`, `replay`, **`completed`** — avec propagation de `status` et `video_url`.

### Rendu conditionnel

```
beefEndedInfo
├── status === 'replay' && video_url
│   └── Lecteur <video controls autoPlay playsInline> (Premium Glass)
│       + barre meta (titre, host, Verdict & Résumé, Fermer)
└── sinon
    └── Écran « En cours de traitement » / « Beef annulé »
        + lien résumé + retour feed
```

**Message ended/completed :** *« Le direct est terminé. Le replay sera disponible d'ici quelques minutes. »*

---

## Matrice statuts → UI

| Statut | BeefCard badge | BeefCard CTA | ArenaPage |
|--------|----------------|--------------|-----------|
| `live` | LIVE (rouge) | Rejoindre le Live | Arène live |
| `ended` | TERMINÉ (gris) | Verdict & Résumé | Traitement en cours |
| `completed` | TERMINÉ (gris) | Verdict & Résumé | Traitement en cours |
| `replay` | REPLAY (cyan) | Regarder le Replay | Lecteur VOD si `video_url` |
| `cancelled` | (existant) | Verdict & Résumé | Beef annulé |

---

## Validation TypeScript

```bash
npx tsc --noEmit
```

**Résultat :** ✅ exit code 0 — aucune erreur de typage.

---

## Risques / points d'attention

1. **`replay` sans `video_url`** — fallback sur l'écran « En cours de traitement » (comportement défensif).
2. **Realtime post-live** — si le statut passe de `ended` → `replay` en session, l'utilisateur doit recharger ou quitter/rentrer (pas de subscription Realtime sur cet écran statique).
3. **Autoplay navigateur** — `autoPlay` sur `<video>` peut être bloqué sans interaction utilisateur selon la politique du navigateur ; `controls` reste disponible.

---

## Prochaines étapes suggérées (hors scope C1)

- Subscription Realtime sur ArenaPage post-live pour basculer automatiquement vers le lecteur quand `video_url` devient disponible.
- Tests E2E : parcours feed → replay → lecture VOD.
- Commit + merge `main` avant déploiement Vercel prod.
