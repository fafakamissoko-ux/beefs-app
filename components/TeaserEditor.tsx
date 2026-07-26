'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, Type, Smile, SlidersHorizontal, Check, Trash2,
  Move, RotateCw, ZoomIn, ZoomOut, Crop, Pencil,
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

type ToolMode = 'none' | 'text' | 'sticker' | 'filter';

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

export default function TeaserEditor({ rawImageUrl, onSave, onCancel }: TeaserEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const bgImageRef = useRef<FabricObject | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [activeFilter, setActiveFilter] = useState(0);
  const [stickerCat, setStickerCat] = useState(0);
  const [bgLocked, setBgLocked] = useState(true);
  const [editText, setEditText] = useState('');
  const [hasTextSelected, setHasTextSelected] = useState(false);
  const selectedTextRef = useRef<FabricObject | null>(null);
  const canvasSizeRef = useRef(computeCanvasSize());

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
        if (obj && 'text' in obj && (obj as { editable?: boolean }).editable !== false) {
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
        if (obj && 'text' in obj && (obj as { editable?: boolean }).editable !== false) {
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

      fabric.FabricImage.fromURL(rawImageUrl, { crossOrigin: 'anonymous' }).then((img) => {
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
  }, [rawImageUrl]);

  const toggleBgLock = useCallback(() => {
    const img = bgImageRef.current;
    if (!img) return;
    const next = !bgLocked;
    setBgLocked(next);
    img.set({
      selectable: !next,
      evented: !next,
    });
    fabricRef.current?.renderAll();
  }, [bgLocked]);

  const rotateBg = useCallback(() => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    const { w, h } = canvasSizeRef.current;
    img.set({ angle: ((img.angle ?? 0) + 90) % 360 });
    const scale = Math.max(w / (img.width ?? 1), h / (img.height ?? 1));
    img.set({ scaleX: scale * 1.5, scaleY: scale * 1.5, left: w / 2, top: h / 2 });
    canvas.renderAll();
  }, []);

  const scaleBg = useCallback((factor: number) => {
    const img = bgImageRef.current;
    const canvas = fabricRef.current;
    if (!img || !canvas) return;
    img.set({
      scaleX: (img.scaleX ?? 1) * factor,
      scaleY: (img.scaleY ?? 1) * factor,
    });
    canvas.renderAll();
  }, []);

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
      setActiveTool('text');
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
    if (obj && obj !== bgImageRef.current) {
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
      canvas.discardActiveObject();
      canvas.renderAll();

      const fabricCanvas = (canvas as unknown as { lowerCanvasEl: HTMLCanvasElement }).lowerCanvasEl;
      const w = fabricCanvas.width;
      const h = fabricCanvas.height;

      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      const filterCss = FILTERS[activeFilter].css;
      if (filterCss) ctx.filter = filterCss;

      ctx.drawImage(fabricCanvas, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        offscreen.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) return;

      const file = new File([blob], 'teaser-rich.jpg', { type: 'image/jpeg' });
      onSave(file);
    } finally {
      setIsExporting(false);
    }
  }, [onSave, activeFilter]);

  const toggleTool = useCallback((tool: ToolMode) => {
    setActiveTool((prev) => (prev === tool ? 'none' : tool));
  }, []);

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

          {/* HUD */}
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
            <button type="button" onClick={() => toggleTool('text')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'text' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Type className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => toggleTool('sticker')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'sticker' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Smile className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => toggleTool('filter')} className={`flex items-center justify-center w-10 h-10 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${activeTool === 'filter' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            <div className="my-0.5 h-px bg-white/10" />
            <button type="button" onClick={toggleBgLock} title={bgLocked ? 'Recadrer / repositionner le fond' : 'Terminer le recadrage'} className={`flex items-center justify-center rounded-full backdrop-blur-sm border shadow-lg transition-all ${!bgLocked ? 'w-auto h-10 gap-1.5 px-3 bg-amber-500/30 border-amber-500/40 text-amber-300' : 'w-10 h-10 bg-black/60 border-white/20 text-white hover:bg-white/20'}`}>
              <Crop className="h-4 w-4" />
              {!bgLocked && <span className="text-[10px] font-bold">OK</span>}
            </button>
            {!bgLocked && (
              <>
                <button type="button" onClick={rotateBg} title="Pivoter" className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 shadow-lg text-white/70 hover:bg-white/20 transition-colors">
                  <RotateCw className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => scaleBg(1.15)} title="Zoom +" className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 shadow-lg text-white/70 hover:bg-white/20 transition-colors">
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => scaleBg(0.87)} title="Zoom -" className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 shadow-lg text-white/70 hover:bg-white/20 transition-colors">
                  <ZoomOut className="h-4 w-4" />
                </button>
              </>
            )}
            <div className="my-0.5 h-px bg-white/10" />
            <button type="button" onClick={deleteSelected} className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30 shadow-lg text-red-400 hover:bg-red-500/40 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {!bgLocked && (
            <div className="absolute bottom-2 left-2 right-14 z-10 flex items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-2">
              <Move className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="text-[11px] font-medium text-amber-200">Mode recadrage : d{'\u00e9'}place et redimensionne l{'\u0027'}image avec tes doigts, puis appuie sur OK</span>
            </div>
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

        {activeTool === 'none' && (
          <p className="text-center text-[10px] text-white/20 py-1">
            S{'\u00e9'}lectionne un outil pour commencer
          </p>
        )}
      </div>
    </div>
  );
}
