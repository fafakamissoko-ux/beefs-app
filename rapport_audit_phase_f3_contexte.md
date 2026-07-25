# CONTEXTE — Audit Tunnel Création Beef & Édition (Phase F.3)

**Date** : 26 juillet 2026
**Périmètre** : Tunnel de création Beef, upload teaser, édition
**Objectif** : Fournir à l'Architecte l'état exact du code pour émettre des ORDRES DE FRAPPE

---

## Fichiers cibles et tailles

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `components/CreateBeefForm.tsx` | 999 | Formulaire principal (Radix Dialog) — choix intent, tags, participants, teaser, crop |
| `lib/submitNewBeef.ts` | 195 | Upload Storage + insert `beefs` + participants + invitations |
| `app/create/page.tsx` | 61 | Page `/create` — auth guard + délégation `submitNewBeef` |
| `components/EditBeefModal.tsx` | 1068 | Modal d'édition — chargement beef existant, remplacement teaser |

---

## Problèmes identifiés

### 🔴 P0 — Sécurité

#### F3-01 — Aucune sanitisation des inputs texte avant insertion DB
**Fichiers** : `components/CreateBeefForm.tsx` L.386-407, `lib/submitNewBeef.ts` L.96-108
**État** : `beefData.title.trim()` et `beefData.description.trim()` sont envoyés tels quels. Aucun appel à `sanitize()` ou `sanitizeMessage()`. Un attaquant peut injecter du contenu XSS dans le titre ou la description, qui sera affiché dans le feed, les notifications et les profils.

#### F3-02 — Injection PostgREST sur la recherche de participants
**Fichier** : `components/CreateBeefForm.tsx` L.264-283
**État** :
```typescript
.or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
```
Le `query` n'est **pas échappé** (pas de `.replace(/[%_\\]/g, '\\$&')`). Même vulnérabilité que E-02 (corrigée dans MessagesUI mais pas ici).

#### F3-03 — Aucune validation de taille/type fichier teaser
**Fichier** : `components/CreateBeefForm.tsx` L.119-145
**État** : `accept="video/*,image/*"` sur l'input mais **aucune validation programmatique**. Un utilisateur peut :
- Uploader un fichier de 500MB (pas de `maxSize`)
- Uploader un type MIME non supporté via DevTools
- Uploader un fichier malveillant renommé en .jpg

**`lib/submitNewBeef.ts`** L.113-126 : aucune validation de taille/type côté lib non plus.

#### F3-04 — Upload silencieusement ignoré en cas d'erreur
**Fichier** : `lib/submitNewBeef.ts` L.120
**État** :
```typescript
if (!uploadError && uploadData) {
  // ... set video_url or thumbnail
}
// Aucun else → le beef est créé SANS teaser, sans feedback à l'utilisateur
```
L'erreur d'upload est avalée. Le beef est inséré sans teaser et l'utilisateur n'est pas prévenu.

### 🟠 P1 — UX / Performance

#### F3-05 — Pas de debounce sur la recherche de participants
**Fichier** : `components/CreateBeefForm.tsx` L.264-283
**État** : `searchUsers(query)` est déclenché à chaque frappe (pas de debounce), identique au bug E-12 corrigé dans MessagesUI.

#### F3-06 — Preview teaser en `object-contain` (bandes noires)
**Fichier** : `components/CreateBeefForm.tsx` L.547, L.559
**État** : `className="h-full w-full object-contain bg-black"` pour vidéo et image.
Le feed utilise `object-cover` depuis F.2. L'aperçu ne représente pas le rendu final.

#### F3-07 — Pas de validation de la longueur des tags individuels
**Fichier** : `components/CreateBeefForm.tsx` — `addTag` function
**État** : La constante `MAX_TAGS = 5` limite le nombre mais **pas la longueur individuelle** d'un tag. Un utilisateur peut créer un tag de 500 caractères.

#### F3-08 — `select('*')` sur la requête de comptage
**Fichier** : `lib/submitNewBeef.ts` L.44-48
**État** :
```typescript
const { count } = await supabase
  .from('beefs')
  .select('*', { count: 'exact', head: true })
```
`select('*')` renvoie toutes les colonnes même avec `head: true`. Devrait être `select('id', ...)`.

#### F3-09 — Anti-double-clic insuffisant
**Fichier** : `components/CreateBeefForm.tsx` L.379-416
**État** : Le bouton est `disabled={loading}` mais `loading` est un `useState`. Un double-tap rapide peut passer avant le re-render. Devrait utiliser un `useRef` (pattern `isSendingRef`).

#### F3-10 — `eslint-disable` pour img natif
**Fichier** : `components/CreateBeefForm.tsx` L.558
**État** : `// eslint-disable-next-line @next/next/no-img-element` — utilise `<img>` natif pour l'aperçu blob. Acceptable pour un blob local mais à noter.

### 🟡 P2 — Cohérence

#### F3-11 — `insertData` typé `Record<string, unknown>` 
**Fichier** : `lib/submitNewBeef.ts` L.96
**État** : Perd tout bénéfice TypeScript. Devrait être une interface stricte.

#### F3-12 — Notification notification `body` non échappée
**Fichier** : `lib/submitNewBeef.ts` L.183-184
**État** : `beefData.title` injecté dans le corps de notification sans sanitisation. Si le titre contient du HTML, il sera stocké tel quel.

---

## Attente de l'Architecte

L'exécutant attend des **ORDRES DE FRAPPE** concrets pour les correctifs F.3, classés par phase d'exécution (P0 sécurité d'abord, puis P1 UX, puis P2 cohérence). Chaque ordre doit préciser le fichier cible, les lignes, et le code exact à modifier.

L'exécutant commitra entre chaque phase de priorité et vérifiera TypeScript (`tsc --noEmit`) à chaque étape.
