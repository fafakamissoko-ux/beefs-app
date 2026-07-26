'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, Type, Smile, SlidersHorizontal, Check, Trash2,
  RotateCw, ZoomIn, ZoomOut, Crop, Maximize, Minimize,
} from 'lucide-react';

export interface TeaserEditorProps {
  rawImageUrl: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

type FabricCanvas = import('fabric').Canvas;
type FabricObject = import('fabric').FabricObject;

interface FilterDef {
  label: string;
  css: string;
  emoji: string;
}

const FILTERS: FilterDef[] = [
  { label: 'Original', css: '', emoji: '\u{1F304}' },
  { label: 'N&B', css: 'grayscale(100%)', emoji: '\u2B1B' },
  { label: 'S\u00e9pia', css: 'sepia(80%)', emoji: '\u{1F7E4}' },
  { label: 'Chaud', css: 'saturate(140%) hue-rotate(-10deg)', emoji: '\u{1F525}' },
  { label: 'Froid', css: 'saturate(110%) hue-rotate(20deg) brightness(105%)', emoji: '\u2744\uFE0F' },
  { label: 'Contraste', css: 'contrast(130%) brightness(105%)', emoji: '\u26A1' },
  { label: 'Doux', css: 'brightness(110%) contrast(90%) saturate(85%)', emoji: '\u2601\uFE0F' },
  { label: 'Vivid', css: 'saturate(180%) contrast(110%)', emoji: '\u{1F308}' },
  { label: 'Drama', css: 'contrast(150%) saturate(50%) brightness(90%)', emoji: '\u{1F3AD}' },
  { label: 'R\u00e9tro', css: 'sepia(40%) saturate(130%) brightness(95%)', emoji: '\u{1F4F7}' },
];

const FONT_FAMILIES = [
  { id: 'sans-serif', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'monospace', label: 'Mono' },
  { id: 'cursive', label: 'Cursive' },
  { id: 'Impact', label: 'Impact' },
  { id: 'Georgia', label: 'Georgia' },
] as const;

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#FF6B00', '#FFFF00',
  '#00FF00', '#00FFFF', '#0000FF', '#8B5CF6', '#FF00FF',
  '#F472B6', '#A78BFA',
] as const;

const STICKER_CATEGORIES = [
  {
    label: 'Populaires',
    items: ['\u{1F525}', '\u{1F480}', '\u{1F602}', '\u{1F4AF}', '\u{1F3C6}', '\u26A1', '\u{1F451}', '\u{1F3AF}', '\u{1F4AA}', '\u{1F5E3}\uFE0F', '\u{1F624}', '\u{1F921}', '\u{1F4B0}', '\u{1F3B5}', '\u2764\uFE0F', '\u{1F440}'],
  },
  {
    label: 'Expressions',
    items: ['\u{1F608}', '\u{1F976}', '\u{1F92F}', '\u{1F60E}', '\u{1F971}', '\u{1F92E}', '\u{1F485}', '\u{1F644}', '\u{1F60F}', '\u{1F913}', '\u{1F47B}', '\u{1FAE0}', '\u{1F62D}', '\u{1F91D}', '\u{1FAE1}', '\u{1F92B}'],
  },
  {
    label: 'D\u00e9co',
    items: ['\u2B50', '\u2728', '\u{1F4AB}', '\u{1F31F}', '\u{1F4A5}', '\u{1F3AA}', '\u{1F3A8}', '\u{1F3AC}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F4E2}', '\u{1F4A3}', '\u{1F6E1}\uFE0F', '\u2694\uFE0F', '\u{1F3F4}', '\u{1F6A8}'],
  },
  {
    label: 'Symboles',
    items: ['\u274C', '\u2705', '\u26A0\uFE0F', '\u{1F6AB}', '\u{1F4A2}', '\u2753', '\u203C\uFE0F', '\u{1F534}', '\u{1F7E2}', '\u{1F535}', '\u{1F7E1}', '\u2B1C', '\u{1F536}', '\u{1F4A0}', '\u267E\uFE0F', '\u{1F3C1}'],
  },
];

type ToolMode = 'none' | 'text' | 'sticker' | 'filter' | 'crop';

function computeCanvasSize() {
  const pad = 24;
  const headerH = 48;
  const footerH = 140;
  const maxW = Math.min((typeof window !== 'undefined' ? window.innerWidth : 600) - pad * 2, 600);
  const maxH = (typeof window !== 'undefined' ? window.innerHeight : 900) - headerH - footerH;
  const ratio = 3 / 4;
  let w: number, h: number;
  if (maxW / maxH > ratio) {
    h = Math.floor(maxH);
    w = Math.floor(h * ratio);
  } else {
    w = Math.floor(maxW);
    h = Math.floor(w / ratio);
  }
  return { w: Math.max(w, 200), h: Math.max(h, 260) };
}

function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

export default function TeaserEditor({ rawImageUrl, onSave, onCancel }: TeaserEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const bgImageRef = useRef<FabricObject | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [activeFilter, setActiveFilter] = useState(0);
  const [stickerCat, setStickerCat] = useState(0);
  const [editText, setEditText] = useState('');
  const [hasTextSelected, setHasTextSelected] = useState(false);
  const selectedTextRef = useRef<FabricObject | null>(null);
  const canvasSizeRef = useRef(computeCanvasSize());
  const gridLinesRef = useRef<FabricObject[]>([]);

  const constrainBgImage = useCallback((obj: FabricObject) => {
    const { w, h } = canvasSizeRef.current;
    const imgW = (obj.width ?? 1) * (obj.scaleX ?? 1);
    const imgH = (obj.height ?? 1) * (obj.scaleY ?? 1);
    const minScale = Math.max(w / (obj.width ?? 1), h / (obj.height ?? 1));

    if ((obj.scaleX ?? 1) < minScale) {
      obj.set({ scaleX: minScale, scaleY: minScale });
    }

    const currentW = (obj.width ?? 1) * (obj.scaleX ?? 1);
    const currentH = (obj.height ?? 1) * (obj.scaleY ?? 1);
    const halfW = currentW / 2;
    const halfH = currentH / 2;
    const left = obj.left ?? w / 2;
    const top = obj.top ?? h / 2;

    let newLeft = left;
    let newTop = top;

    if (newLeft - halfW > 0) newLeft = halfW;
    if (newLeft + halfW < w) newLeft = w - halfW;
    if (newTop - halfH > 0) newTop = halfH;
    if (newTop + halfH < h) newTop = h - halfH;

    if (newLeft !== left || newTop !== top) {
      obj.set({ left: newLeft, top: newTop });
    }
  }, []);

  useEffect(() => {
    if (!canvasElRef.current) return;
    let disposed = false;

    import('fabric').then((fabric) => {
      if (disposed || !canvasElRef.current) return;

      const { w: CANVAS_W, h: CANVAS_H } = canvasSizeRef.current;

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: '#000000',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      canvas.on('selection:created', (e) => {
        const obj = e.selected?.[0];
        if (obj && 'text' in obj && obj !== bgImageRef.current && !gridLinesRef.current.includes(obj)) {
          selectedTextRef.current = obj;
          setEditText((obj as { text: string }).text);
          setHasTextSelected(true);
        } else {
          selectedTextRef.current = null;
          setHasTextSelected(false);
        }
      });

      canvas.on('selection:updated', (e) => {
        const obj = e.selected?.[0];
        if (obj && 'text' in obj && obj !== bgImageRef.current && !gridLinesRef.current.includes(obj)) {
          selectedTextRef.current = obj;
          setEditText((obj as { text: string }).text);
          setHasTextSelected(true);
        } else {
          selectedTextRef.current = null;
          setHasTextSelected(false);
        }
      });

      canvas.on('selection:cleared', () => {
        selectedTextRef.current = null;
        setHasTextSelected(false);
        setEditText('');
      });

      canvas.on('object:moving', (e) => {
        if (e.target === bgImageRef.current) constrainBgImage(e.target);
      });

      canvas.on('object:scaling', (e) => {
        if (e.target === bgImageRef.current) constrainBgImage(e.target);
      });

      const isBlobUrl = rawImageUrl.startsWith('blob:');
      const loadOpts = isBlobUrl ? undefined : { crossOrigin: 'anonymous' as const };

      fabric.FabricImage.fromURL(rawImageUrl, loadOpts).then((img) => {
        if (disposed) return;
        const scale = Math.max(CANVAS_W / (img.width ?? 1), CANVAS_H / (img.height ?? 1));
        img.set({
          originX: 'center',
          originY: 'center',
          left: CANVAS_W / 2,
          top: CANVAS_H / 2,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          hasControls: true,
          hasBorders: true,
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
        bgImageRef.current = img;
        canvas.renderAll();
        setIsReady(true);
      });
    });

    return () => {
      disposed = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [rawImageUrl, constrainBgImage]);

  const enterCropMode = useCallback(() => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    img.set({ selectable: true, evented: true });
    canvas.setActiveObject(img);

    import('fabric').then((fabric) => {
      const { w, h } = canvasSizeRef.current;
      const lines: FabricObject[] = [];
      const lineProps = {
        stroke: 'rgba(255,255,255,0.35)',
        strokeWidth: 1,
        selectable: false,
        evented: false,
        strokeDashArray: [6, 4],
      };
      lines.push(new fabric.Line([w / 3, 0, w / 3, h], lineProps));
      lines.push(new fabric.Line([(w * 2) / 3, 0, (w * 2) / 3, h], lineProps));
      lines.push(new fabric.Line([0, h / 3, w, h / 3], lineProps));
      lines.push(new fabric.Line([0, (h * 2) / 3, w, (h * 2) / 3], lineProps));
      lines.forEach((l) => canvas.add(l));
      gridLinesRef.current = lines;
      canvas.renderAll();
    });
  }, []);

  const exitCropMode = useCallback(() => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    img.set({ selectable: false, evented: false });
    canvas.discardActiveObject();
    gridLinesRef.current.forEach((l) => canvas.remove(l));
    gridLinesRef.current = [];
    canvas.renderAll();
  }, []);

  const setCropPreset = useCallback((preset: 'fill' | 'fit') => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    const { w, h } = canvasSizeRef.current;
    const imgW = img.width ?? 1;
    const imgH = img.height ?? 1;

    let scale: number;
    if (preset === 'fill') {
      scale = Math.max(w / imgW, h / imgH);
    } else {
      scale = Math.max(w / imgW, h / imgH);
    }
    img.set({
      scaleX: scale,
      scaleY: scale,
      left: w / 2,
      top: h / 2,
      angle: 0,
      originX: 'center',
      originY: 'center',
    });
    canvas.renderAll();
  }, []);

  const rotateBg = useCallback(() => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    const { w, h } = canvasSizeRef.current;
    img.set({ angle: ((img.angle ?? 0) + 90) % 360 });
    const minScale = Math.max(w / (img.width ?? 1), h / (img.height ?? 1)) * 1.5;
    img.set({ scaleX: minScale, scaleY: minScale, left: w / 2, top: h / 2 });
    canvas.renderAll();
  }, []);

  const scaleBg = useCallback((factor: number) => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    const newScaleX = (img.scaleX ?? 1) * factor;
    const newScaleY = (img.scaleY ?? 1) * factor;
    const { w, h } = canvasSizeRef.current;
    const minScale = Math.max(w / (img.width ?? 1), h / (img.height ?? 1));
    if (newScaleX < minScale) return;
    img.set({ scaleX: newScaleX, scaleY: newScaleY });
    constrainBgImage(img);
    canvas.renderAll();
  }, [constrainBgImage]);

  const addText = useCallback(() => {
    import('fabric').then((fabric) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { w, h } = canvasSizeRef.current;
      const text = new fabric.IText('Texte', {
        left: w / 2,
        top: h / 2,
        fontFamily: 'sans-serif',
        fill: '#FFFFFF',
        fontSize: Math.round(w * 0.06),
        fontWeight: 'bold',
        originX: 'center',
        originY: 'center',
        textAlign: 'center',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.9)', blur: 8, offsetX: 0, offsetY: 2 }),
        editable: false,
        padding: 8,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      selectedTextRef.current = text;
      setEditText('Texte');
      setHasTextSelected(true);
      canvas.renderAll();
    });
  }, []);

  const handleTextInput = useCallback((value: string) => {
    setEditText(value);
    const obj = selectedTextRef.current;
    const canvas = fabricRef.current;
    if (!obj || !canvas || !('text' in obj)) return;
    (obj as { set: (k: string, v: string) => void }).set('text', value || ' ');
    canvas.renderAll();
  }, []);

  const addSticker = useCallback((emoji: string) => {
    import('fabric').then((fabric) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { w, h } = canvasSizeRef.current;
      const sticker = new fabric.IText(emoji, {
        left: w / 2 + (Math.random() - 0.5) * w * 0.3,
        top: h / 2 + (Math.random() - 0.5) * h * 0.3,
        fontSize: Math.round(w * 0.12),
        originX: 'center',
        originY: 'center',
        editable: false,
      });
      canvas.add(sticker);
      canvas.setActiveObject(sticker);
      canvas.renderAll();
    });
  }, []);

  const updateSelectedTextFont = useCallback((fontFamily: string) => {
    const canvas = fabricRef.current;
    const obj = selectedTextRef.current;
    if (!canvas || !obj || !('fontFamily' in obj)) return;
    (obj as { set: (k: string, v: string) => void }).set('fontFamily', fontFamily);
    canvas.renderAll();
  }, []);

  const updateSelectedTextColor = useCallback((color: string) => {
    const canvas = fabricRef.current;
    const obj = selectedTextRef.current;
    if (!canvas || !obj || !('fill' in obj)) return;
    (obj as { set: (k: string, v: string) => void }).set('fill', color);
    canvas.renderAll();
  }, []);

  const updateSelectedTextSize = useCallback((delta: number) => {
    const canvas = fabricRef.current;
    const obj = selectedTextRef.current;
    if (!canvas || !obj || !('fontSize' in obj)) return;
    const current = (obj as { fontSize?: number }).fontSize ?? 36;
    (obj as { set: (k: string, v: number) => void }).set('fontSize', Math.max(12, Math.min(120, current + delta)));
    canvas.renderAll();
  }, []);

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj && obj !== bgImageRef.current && !gridLinesRef.current.includes(obj)) {
      canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.renderAll();
      setHasTextSelected(false);
      selectedTextRef.current = null;
    }
  }, []);

  const handleExport = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setIsExporting(true);
    try {
      gridLinesRef.current.forEach((l) => canvas.remove(l));
      gridLinesRef.current = [];

      const bg = bgImageRef.current;
      if (bg) bg.set({ selectable: false, evented: false });

      canvas.discardActiveObject();
      canvas.renderAll();

      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const { w, h } = canvasSizeRef.current;
      const dataURL = canvas.toDataURL({
        format: 'jpeg',
        quality: 0.92,
        width: w,
        height: h,
        left: 0,
        top: 0,
        multiplier: 1,
      } as Parameters<typeof canvas.toDataURL>[0]);

      const filterCss = FILTERS[activeFilter].css;

      if (!filterCss) {
        const blob = dataURLtoBlob(dataURL);
        onSave(new File([blob], 'teaser-rich.jpg', { type: 'image/jpeg' }));
        return;
      }

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = dataURL;
      });

      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.filter = filterCss;
      ctx.drawImage(img, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        offscreen.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) return;

      onSave(new File([blob], 'teaser-rich.jpg', { type: 'image/jpeg' }));
    } finally {
      setIsExporting(false);
    }
  }, [onSave, activeFilter]);

  const switchTool = useCallback((tool: ToolMode) => {
    setActiveTool((prev) => {
      if (prev === 'crop') exitCropMode();
      const next = prev === tool ? 'none' : tool;
      if (next === 'crop') enterCropMode();
      return next;
    });
  }, [enterCropMode, exitCropMode]);

  return (
    <div className="absolute inset-0 z-[10005] flex flex-col bg-black">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors">
          <X className="h-4 w-4" />
          Annuler
        </button>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">{'\u00c9'}diteur</span>
        <button type="button" onClick={() => void handleExport()} disabled={!isReady || isExporting} className="flex items-center gap-1.5 rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:bg-cyan-400 transition-colors disabled:opacity-50">
          <Check className="h-4 w-4" />
          {isExporting ? 'Export...' : 'Valider'}
        </button>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <div className="relative">
          <canvas
            ref={canvasElRef}
            style={{ filter: FILTERS[activeFilter].css || undefined }}
          />

          {/* HUD tools */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
            <button type="button" onClick={() => switchTool('text')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'text' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Type className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => switchTool('sticker')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'sticker' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Smile className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => switchTool('filter')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'filter' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => switchTool('crop')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'crop' ? 'bg-amber-500/40 border-amber-500/50 text-amber-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Crop className="h-4 w-4" />
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button type="button" onClick={deleteSelected} className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30 shadow-lg text-red-400 hover:bg-red-500/40 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {activeTool === 'crop' && (
            <div className="pointer-events-none absolute inset-0 z-[5] border-2 border-amber-400/60 rounded-sm" />
          )}
        </div>
      </div>

      {/* Bottom panel */}
      <div className="shrink-0 w-full px-3 pb-3 pt-1">
        {activeTool === 'text' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2.5">
            {hasTextSelected && (
              <input
                type="text"
                value={editText}
                onChange={(e) => handleTextInput(e.target.value)}
                placeholder="Tape ton texte..."
                autoFocus
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
              />
            )}
            <button type="button" onClick={addText} className="w-full rounded-xl bg-cyan-500/20 border border-cyan-500/30 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30 transition-colors">
              + Ajouter un texte
            </button>
            {hasTextSelected && (
              <>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => updateSelectedTextSize(-4)} className="w-8 h-8 rounded-lg bg-white/10 text-white/70 text-base font-bold hover:bg-white/20">-</button>
                  <span className="text-[10px] text-white/40 uppercase tracking-wider">Taille</span>
                  <button type="button" onClick={() => updateSelectedTextSize(4)} className="w-8 h-8 rounded-lg bg-white/10 text-white/70 text-base font-bold hover:bg-white/20">+</button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {FONT_FAMILIES.map((font) => (
                    <button key={font.id} type="button" onClick={() => updateSelectedTextFont(font.id)} className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/15 transition-colors" style={{ fontFamily: font.id }}>
                      {font.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {TEXT_COLORS.map((color) => (
                    <button key={color} type="button" onClick={() => updateSelectedTextColor(color)} className="w-6 h-6 rounded-full border-2 border-white/20 hover:border-white/60 transition-all hover:scale-110" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {activeTool === 'sticker' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {STICKER_CATEGORIES.map((cat, i) => (
                <button key={cat.label} type="button" onClick={() => setStickerCat(i)} className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium transition-colors ${stickerCat === i ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {STICKER_CATEGORIES[stickerCat].items.map((emoji) => (
                <button key={emoji} type="button" onClick={() => addSticker(emoji)} className="flex items-center justify-center h-10 rounded-xl bg-white/5 hover:bg-white/15 transition-all hover:scale-110 text-xl">
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'filter' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {FILTERS.map((f, i) => (
                <button key={f.label} type="button" onClick={() => setActiveFilter(i)} className={`shrink-0 flex flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-medium transition-all ${activeFilter === i ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 scale-105' : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}>
                  <span className="text-base">{f.emoji}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'crop' && (
          <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-3">
            <p className="text-[11px] text-amber-200/80 text-center">
              D{'\u00e9'}place l{'\u0027'}image pour choisir le cadrage. Elle remplit toujours le cadre.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => setCropPreset('fill')} className="flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[11px] font-medium text-white/70 hover:bg-white/20 transition-colors">
                <Maximize className="h-3.5 w-3.5" />
                Recentrer
              </button>
              <button type="button" onClick={rotateBg} className="flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[11px] font-medium text-white/70 hover:bg-white/20 transition-colors">
                <RotateCw className="h-3.5 w-3.5" />
                Pivoter
              </button>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => scaleBg(0.9)} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/20 transition-colors">
                <ZoomOut className="h-3.5 w-3.5" /> Zoom -
              </button>
              <button type="button" onClick={() => scaleBg(1.12)} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/20 transition-colors">
                <ZoomIn className="h-3.5 w-3.5" /> Zoom +
              </button>
            </div>
          </div>
        )}

        {activeTool === 'none' && (
          <p className="text-center text-[10px] text-white/20 py-1">
            S{'\u00e9'}lectionne un outil pour commencer
          </p>
        )}
      </div>
    </div>
  );
}
