import type { Area } from 'react-easy-crop';

function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (err) => reject(err));
    if (!imageSrc.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.src = imageSrc;
  });
}

/** Découpe une zone (coordonnées image source) puis exporte en JPEG qualité 0.9 */
export async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error("Impossible d'obtenir le contexte 2d du canvas.");
  }

  canvas.width = Math.max(1, Math.round(pixelCrop.width));
  canvas.height = Math.max(1, Math.round(pixelCrop.height));

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Export JPEG vide'));
      },
      'image/jpeg',
      0.9,
    );
  });
}
