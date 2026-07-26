# CONTEXTE — Éditeur Riche de Teasers (Phase F.5)

**Date :** 26 juillet 2026
**Périmètre :** Éditeur multimédia de teasers (images + vidéos), tunnels de création et d'édition
**Objectif :** Fournir à l'Architecte l'état exact du code et les spécifications fonctionnelles pour qu'il émette des **ORDRES DE FRAPPE** concrets

---

## MISSION DE L'ARCHITECTE

Tu es l'Architecte. Ton rôle est de produire une **ANALYSE TACTIQUE** contenant des **🟢 ORDRES DE FRAPPE** que l'IA locale (Exécutant) appliquera de manière chirurgicale.

**Tu ne dois PAS :**
- Écrire de code applicatif toi-même
- Générer un audit ou un rapport

**Tu DOIS :**
- Analyser le contexte ci-dessous
- Prendre des décisions architecturales (choix de lib, structure composants, flux de données)
- Produire des ordres de frappe numérotés (F5-01, F5-02, etc.) avec :
  - Fichier(s) cible(s)
  - Action exacte (créer, modifier, supprimer)
  - Code cible strict ou pseudo-code détaillé
- Organiser les ordres en phases chronologiques (Phase 1 d'abord, Phase 2 ensuite)
- L'exécutant vérifiera TypeScript (`tsc --noEmit`) et commitera entre chaque phase

---

## Spécifications fonctionnelles

L'utilisateur veut un éditeur de teasers avec des capacités proches de TikTok/Snapchat/Instagram :
- **Texte** : ajout, déplacement, rotation, redimensionnement, choix police/couleur/taille
- **Filtres** : brightness, contrast, saturation, blur, grayscale, sepia, hue-rotate
- **Stickers/Emoji** : overlay draggable, redimensionnable, rotatif
- **Musique** (vidéos) : ajout de piste audio
- **Trim vidéo** : couper début/fin
- L'éditeur remplace le crop modal actuel (`react-easy-crop`) pour les images
- L'éditeur doit fonctionner sur mobile (gestes tactiles) et desktop

**Contrainte budgétaire :** Zéro coût récurrent. Solution 100% open-source.

---

## Stack technique actuelle

- **Framework :** Next.js 14.1.0, React 18.2, TypeScript strict
- **Styling :** Tailwind CSS, Framer Motion
- **Crop existant :** `react-easy-crop` v5.5.7 (recadrage 3:4 avec `objectFit="contain"`)
- **Utilitaire crop :** `utils/cropImage.ts` (canvas 2D → export JPEG)
- **Upload :** Supabase Storage bucket `teasers` (max 50 Mo)
- **Design System :** Verre Lourd (`bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl`)

---

## Flux actuel (images)

```
User sélectionne fichier
  → handleFileChange()
  → Si image : ouvre Cropper (react-easy-crop)
  → User valide le crop
  → handleCropSave() → getCroppedImg() → canvas → File JPEG
  → teaserFile = croppedFile, teaserPreview = blobURL
  → Upload dans submitNewBeef() ou handleSave()
```

## Flux actuel (vidéos)

```
User sélectionne fichier
  → handleFileChange()
  → teaserFile = file, teaserPreview = blobURL (preview directe)
  → Upload dans submitNewBeef() ou handleSave()
```

---

## Architecture cible proposée

### Phase 1 : Éditeur Image (fabric.js)

**Dépendance :** `fabric` (v6.x, MIT, ~300 Ko gzip)

**Capacités visées :**
- Texte : ajout, drag, resize, rotate, police, couleur, ombre
- Filtres : brightness, contrast, saturation, blur, grayscale, sepia, hue-rotate
- Stickers/Emoji : overlay draggable, resize, rotate
- Dessin : pinceau libre (optionnel)
- Export : canvas → File JPEG/PNG pour upload

**Composant :** `components/TeaserEditor.tsx` (nouveau)

**Intégration :**
- Remplace le Cropper `react-easy-crop` pour les images
- Après sélection d'image, ouvre `TeaserEditor` au lieu du crop modal
- Le Cropper 3:4 est intégré DANS l'éditeur comme première étape (ou l'éditeur travaille directement sur l'image complète)
- L'export final produit un `File` JPEG qui remplace `teaserFile`

### Phase 2 : Éditeur Vidéo (ffmpeg.wasm)

**Dépendance :** `@ffmpeg/ffmpeg` + `@ffmpeg/util` (MIT, ~25 Mo WASM core téléchargé à la demande)

**Capacités visées :**
- Trim : couper début/fin de la vidéo
- Texte sur vidéo : overlay avec position et timing
- Musique : mixer une piste audio (bibliothèque locale ou upload)
- Filtres couleur : équivalent CSS filters sur chaque frame
- Export : vidéo MP4 finale

**Contraintes :**
- ffmpeg.wasm nécessite SharedArrayBuffer → headers COOP/COEP sur Next.js
- Le traitement est côté client, CPU-intensif (worker thread)
- Fichier WASM de ~25 Mo à charger au premier usage (lazy load obligatoire)

---

## Fichiers impactés

| Fichier | Impact |
|---|---|
| `components/TeaserEditor.tsx` | **NOUVEAU** — Composant éditeur principal |
| `components/CreateBeefForm.tsx` | Remplacer le crop modal par l'éditeur |
| `components/EditBeefModal.tsx` | Remplacer le crop modal par l'éditeur |
| `utils/cropImage.ts` | Potentiellement absorbé par l'éditeur |
| `package.json` | Ajout `fabric` (Phase 1), `@ffmpeg/ffmpeg` (Phase 2) |
| `next.config.js` | Headers COOP/COEP pour Phase 2 |

---

## Risques identifiés

1. **Taille bundle (Phase 1)** : fabric.js ~300 Ko gzip. Import dynamique obligatoire (`next/dynamic`).
2. **Taille WASM (Phase 2)** : ffmpeg.wasm ~25 Mo. CDN externe ou self-hosted. Lazy load obligatoire.
3. **Performance mobile** : canvas fabric.js sur mobile low-end peut laguer avec beaucoup d'objets.
4. **SharedArrayBuffer (Phase 2)** : nécessite les headers `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp`. Peut casser les iframes tierces (Stripe, Supabase Auth redirect).
5. **UX complexité** : l'éditeur doit rester intuitif (gestes tactiles, pinch-to-zoom sur mobile).

---

## Décisions à prendre par l'Architecte

1. **Scope Phase 1 vs Phase 2 :** Quels outils dans chaque phase ? (texte, filtres, stickers, dessin pour Phase 1 images ? trim, musique pour Phase 2 vidéos ?)
2. **Aspect ratio :** Garder le 3:4 imposé ou laisser l'utilisateur libre ?
3. **Librairie images :** `fabric` v6 (recommandé, MIT, ~300 Ko gzip) ou `konva` (alternative) ?
4. **Librairie vidéos :** `@ffmpeg/ffmpeg` + `@ffmpeg/util` (MIT, ~25 Mo WASM lazy) — confirmer ou proposer alternative
5. **Architecture composant :** Composant autonome `TeaserEditor.tsx` ou éclaté en sous-composants ?
6. **Musique :** Bibliothèque royalty-free intégrée ou upload utilisateur uniquement ?
7. **Mobile-first :** Gestes tactiles (pinch, drag) prioritaires ?
8. **Headers COOP/COEP :** Phase 2 ffmpeg.wasm nécessite SharedArrayBuffer. Impact sur Stripe/Supabase Auth iframes ?

---

## Code existant pertinent

### CreateBeefForm.tsx — États crop actuels (L.95-102)
```tsx
const [teaserFile, setTeaserFile] = useState<File | null>(null);
const [teaserPreview, setTeaserPreview] = useState<string | null>(null);
const teaserPreviewUrlRef = useRef<string | null>(null);
const [isCropping, setIsCropping] = useState(false);
const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
const [crop, setCrop] = useState({ x: 0, y: 0 });
const [zoom, setZoom] = useState(1);
const [croppedAreaPixels, setCroppedAreaPixels] = useState<...>(null);
const [isProcessingCrop, setIsProcessingCrop] = useState(false);
```

### CreateBeefForm.tsx — handleFileChange (L.121-154)
```tsx
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) { /* cleanup */ return; }
  if (file.size > 50 * 1024 * 1024) { toast('Fichier trop lourd'); return; }
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    setRawImageUrl(url);
    setIsCropping(true);  // ← OUVRE LE CROP MODAL (à remplacer par l'éditeur)
    e.target.value = '';
    return;
  }
  // Vidéo : preview directe
  setTeaserFile(file);
  setTeaserPreview(URL.createObjectURL(file));
};
```

### CreateBeefForm.tsx — Crop modal JSX (L.960-1010)
```tsx
{isCropping && rawImageUrl && (
  <div className="absolute inset-0 z-[10005] flex flex-col items-center justify-center rounded-[2rem] bg-slate-950/95 backdrop-blur-xl p-4 sm:p-6">
    <div className="relative w-full flex-1 max-h-[70vh] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
      <Cropper image={rawImageUrl} crop={crop} zoom={zoom} aspect={3/4}
        objectFit="contain" onCropChange={setCrop} onZoomChange={setZoom}
        onCropComplete={onCropComplete} />
    </div>
    {/* Zoom slider + boutons Annuler/Valider */}
  </div>
)}
```

### EditBeefModal.tsx — Même structure crop modal (L.1029-1075)
Identique à CreateBeefForm : `isCropping && rawImageUrl` → `<Cropper />` → `handleCropSave()`.
Le composant `EditBeefModal.tsx` a le même flux : `handleFileChange` → crop modal → `getCroppedImg` → `teaserFile`.

### utils/cropImage.ts — Export canvas (48 lignes)
```ts
export default async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
  fileName: string = 'teaser-crop.jpg'
): Promise<File> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  // canvas 2D drawImage → toBlob → File(blob, 'image/jpeg', 0.9)
}
```

### Design System — Classes de verre autorisées
- Modales/Tiroirs : `bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl`
- HUD/Boutons : `bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg`

---

## Attente de l'Architecte

L'exécutant attend des **🟢 ORDRES DE FRAPPE** concrets, organisés en phases chronologiques.

Chaque ordre doit spécifier :
- Le fichier cible
- L'action exacte (créer, modifier, supprimer)
- Le code cible strict ou le pseudo-code détaillé
- Les dépendances npm à installer

L'exécutant commitera entre chaque phase et vérifiera TypeScript (`tsc --noEmit`) à chaque étape.
