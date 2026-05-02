'use client';

import { useState, useCallback, useEffect } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { getCroppedImg } from '@/lib/cropImage';

export type ImageCropModalProps = {
  imageSrc: string;
  cropShape: 'round' | 'rect';
  aspect: number;
  onCropComplete: (blob: Blob) => void;
  onCancel: () => void;
};

export function ImageCropModal({
  imageSrc,
  cropShape,
  aspect,
  onCropComplete,
  onCancel,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropCompleteInternal = useCallback((_croppedArea: Area, croppedAreaPixelsInner: Area) => {
    setCroppedAreaPixels(croppedAreaPixelsInner);
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(blob);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Recadrer l'image"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-white/10 bg-obsidian-900/95 p-4 shadow-2xl">
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-black sm:h-72 md:h-80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteInternal}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-sans text-xs font-bold uppercase tracking-wider text-white/50">
            Zoom
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-plasma-500"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={processing}
            className="rounded-[2px] border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing || !croppedAreaPixels}
            className="rounded-[2px] px-5 py-2.5 text-sm font-bold text-black transition-opacity brand-gradient hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? 'Traitement…' : 'Valider le recadrage'}
          </button>
        </div>
      </div>
    </div>
  );
}
