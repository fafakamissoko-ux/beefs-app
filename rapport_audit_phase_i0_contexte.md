# MISSION ARCHITECTE — Phase I : Bug P0 Identité Challenger → Spectateur

## TON RÔLE

Tu es l'Architecte. Tu reçois un rapport d'audit technique (`rapport_audit_phase_i0.md`).
Tu ne dois **PAS** produire un nouveau rapport d'audit.
Tu dois **UNIQUEMENT** produire une **ANALYSE TACTIQUE** contenant :

1. **Tes décisions d'architecture** sur les points à trancher (format : "Décision I-XX : [ta décision]")
2. **Des 🟢 ORDRES DE FRAPPE** — des instructions chirurgicales pour l'IA locale (Cursor Composer), avec :
   - Le(s) fichier(s) cible(s) (ex: `@app/arena/[roomId]/page.tsx`)
   - L'action exacte à effectuer (supprimer, remplacer, ajouter)
   - Le code cible strict si nécessaire (bloc TypeScript à injecter)

**Ne génère AUCUN prompt d'audit. Ne demande pas d'exploration. Ne propose pas d'analyser le code.**
**Génère DIRECTEMENT tes décisions + ordres de frappe.**

---

## FORMAT DE SORTIE ATTENDU (exemple)

```
ANALYSE TACTIQUE : [TITRE]
Rapport d'audit I.0 reçu et analysé. [Contexte 2-3 lignes]

Décision I-XX : [description de ta décision]

🟢 ORDRE DE FRAPPE I-01 — [TITRE]
Fichier(s) cible : @chemin/fichier.ts
Action : [description précise]
Code cible strict :
[bloc TypeScript]

🟢 ORDRE DE FRAPPE I-02 — [TITRE]
...

DIRECTIVE À L'EXÉCUTANT : Applique ces ordres de frappe...
```

---

## CONTEXTE TECHNIQUE (CE QUE TU DOIS ANALYSER)

### Le bug

Un utilisateur **Challenger** (`beef_participants.invite_status = 'accepted'`) entre dans l'arène en direct mais est traité comme **Spectateur** : flux vidéo bloqué, pseudonyme absent de la grille, micro/caméra désactivés.

### Chaîne de dégradation

```
1. Page parente ou API ticket retourne userRole = 'viewer'
2. TikTokStyleArena calcule isViewer = true
3. useDailyCall en mode spectateur (pas de cam/micro)
4. Grille : flux local non affiché comme challenger
5. reconcilePeers ne place pas le peer dans un slot
```

### Les 5 hypothèses identifiées dans l'audit

| # | Hypothèse | Fichier |
|---|-----------|---------|
| 1 | **Écrasement ticket spectateur** — L'API `/api/beef/access` ne trouve pas la ligne `beef_participants` → retourne `spectator` → écrase le `challenger` résolu côté client | `app/api/beef/access/route.ts` |
| 2 | **Filtre `is_main` divergent** — La page parente exige `.eq('is_main', true)` pour reconnaître un challenger. L'API ne filtre PAS sur `is_main`. Un challenger invité (`is_main = false`, `accepted`) → `viewer` côté page | `app/arena/[roomId]/page.tsx` L.184 |
| 3 | **`isViewer` cascade** — Une fois `isViewer = true`, tout le pipeline est en mode spectateur | `components/TikTokStyleArena.tsx` L.265 |
| 4 | **Race `participantRoles` vide** — Flux local orphelin si `loadParticipants` n'a pas peuplé `expectedUids` | `hooks/useParticipantRoles.ts` |
| 5 | **UUID non normalisé** — Comparaison `===` au lieu de `userIdsEqual` dans `loadParticipants` | `hooks/useParticipantRoles.ts` |

### Divergence critique page vs API

```
Page parente (client) :
  .eq('is_main', true)  ← FILTRE is_main
  → challenger uniquement si is_main = true ET accepted

API /api/beef/access (serveur) :
  .eq('invite_status', 'accepted')  ← PAS de filtre is_main
  → participant si accepted (indépendamment de is_main)
```

### Décisions que tu dois prendre

1. **Source de vérité du rôle** : le ticket serveur (API) doit-il être l'unique source de vérité, ou faut-il conserver le double calcul client+serveur ?
2. **Traitement `is_main`** : supprimer le filtre `.eq('is_main', true)` de la page parente pour aligner avec l'API, ou ajouter `is_main` à l'API ?
3. **Normalisation UUID** dans `loadParticipants` : utiliser `userIdsEqual` / `canonicalUserUuid` ?
4. **Race condition** : ajouter un guard ou attendre le ticket avant d'initialiser le rôle ?

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `app/arena/[roomId]/page.tsx` | Résolution rôle (double calcul client + ticket) |
| `app/live/[id]/page.tsx` | Route alternative (mêmes props) |
| `app/api/beef/access/route.ts` | Émission token Daily + rôle serveur |
| `components/TikTokStyleArena.tsx` | Dérivation `isViewer` |
| `hooks/useParticipantRoles.ts` | Chargement rôles DB → `expectedUids` |
| `lib/participant-identity.ts` | UUID matching, reconciliation peers |

---

**RAPPEL : Tu dois produire des ORDRES DE FRAPPE, pas un rapport d'audit.**
