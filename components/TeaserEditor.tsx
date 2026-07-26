'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Type, Smile, SlidersHorizontal, Check, Trash2 } from 'lucide-react';

export interface TeaserEditorProps {
  rawImageUrl: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

type FabricCanvas = import('fabric').Canvas;
type FabricIText = import('fabric').IText;

interface FilterDef {
  label: string;
  css: string;
  emoji: string;
}

const FILTERS: FilterDef[] = [
  { label: 'Original', css: '', emoji: '🌄' },
  { label: 'N&B', css: 'grayscale(100%)', emoji: '⬛' },
  { label: 'S\u00e9pia', css: 'sepia(80%)', emoji: '🟤' },
  { label: 'Chaud', css: 'saturate(140%) hue-rotate(-10deg)', emoji: '🔥' },
  { label: 'Froid', css: 'saturate(110%) hue-rotate(20deg) brightness(105%)', emoji: '❄️' },
  { label: 'Contraste', css: 'contrast(130%) brightness(105%)', emoji: '⚡' },
  { label: 'Doux', css: 'brightness(110%) contrast(90%) saturate(85%)', emoji: '☁️' },
  { label: 'Vivid', css: 'saturate(180%) contrast(110%)', emoji: '🌈' },
  { label: 'Drama', css: 'contrast(150%) saturate(50%) brightness(90%)', emoji: '🎭' },
  { label: 'R\u00e9tro', css: 'sepia(40%) saturate(130%) brightness(95%)', emoji: '📷' },
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
    items: ['🔥', '💀', '😂', '💯', '🏆', '⚡', '👑', '🎯', '💪', '🗣️', '😤', '🤡', '💰', '🎵', '❤️', '👀'],
  },
  {
    label: 'Expressions',
    items: ['😈', '🥶', '🤯', '😎', '🥱', '🤮', '💅', '🙄', '😏', '🤓', '👻', '🫠', '😭', '🤝', '🫡', '🤫'],
  },
  {
    label: 'D\u00e9co',
    items: ['⭐', '✨', '💫', '🌟', '💥', '🎪', '🎨', '🎬', '🎤', '🎧', '📢', '💣', '🛡️', '⚔️', '🏴', '🚨'],
  },
  {
    label: 'Symboles',
    items: ['❌', '✅', '⚠️', '🚫', '💢', '❓', '‼️', '🔴', '🟢', '🔵', '🟡', '⬜', '🔶', '💠', '♾️', '🏁'],
  },
] as const;

type ToolMode = 'none' | 'text' | 'sticker' | 'filter';

export default function TeaserEditor({ rawImageUrl, onSave, onCancel }: TeaserEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [activeFilter, setActiveFilter] = useState(0);
  const [stickerCat, setStickerCat] = useState(0);

  useEffect(() => {
    if (!canvasElRef.current) return;
    let disposed = false;

    import('fabric').then((fabric) => {
      if (disposed || !canvasElRef.current) return;

      const CANVAS_W = 600;
      const CANVAS_H = 800;

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: '#000000',
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;

      canvas.on('mouse:down', (e) => {
        const target = e.target;
        if (target && 'enterEditing' in target && (target as InstanceType<typeof fabric.IText>).editable) {
          if (canvas.getActiveObject() === target) {
            (target as InstanceType<typeof fabric.IText>).enterEditing();
            canvas.requestRenderAll();
          }
        }
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
        });
        canvas.add(img);
        canvas.sendObjectToBack(img);
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

  const addText = useCallback(() => {
    import('fabric').then((fabric) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const text = new fabric.IText('Tape ici', {
        left: 300,
        top: 400,
        fontFamily: 'sans-serif',
        fill: '#FFFFFF',
        fontSize: 36,
        fontWeight: 'bold',
        originX: 'center',
        originY: 'center',
        textAlign: 'center',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.9)', blur: 8, offsetX: 0, offsetY: 2 }),
        editable: true,
        padding: 8,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.renderAll();
      setTimeout(() => {
        text.enterEditing();
        text.selectAll();
        canvas.renderAll();
      }, 100);
    });
  }, []);

  const addSticker = useCallback((emoji: string) => {
    import('fabric').then((fabric) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const sticker = new fabric.IText(emoji, {
        left: 250 + Math.random() * 100,
        top: 350 + Math.random() * 100,
        fontSize: 72,
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
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj && 'fontFamily' in obj) {
      (obj as FabricIText).set('fontFamily', fontFamily);
      canvas.renderAll();
    }
  }, []);

  const updateSelectedTextColor = useCallback((color: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj && 'fill' in obj) {
      (obj as FabricIText).set('fill', color);
      canvas.renderAll();
    }
  }, []);

  const updateSelectedTextSize = useCallback((delta: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj && 'fontSize' in obj) {
      const t = obj as FabricIText;
      const current = (t.fontSize ?? 36);
      t.set('fontSize', Math.max(12, Math.min(120, current + delta)));
      canvas.renderAll();
    }
  }, []);

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj) {
      canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.renderAll();
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
      <div className="flex shrink-0 items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-sm">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/20 transition-colors"
        >
          <X className="h-4 w-4" />
          Annuler
        </button>
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">
          \u00c9diteur
        </span>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={!isReady || isExporting}
          className="flex items-center gap-1.5 rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:bg-cyan-400 transition-colors disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {isExporting ? 'Export...' : 'Valider'}
        </button>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <div className="relative" style={{ maxWidth: '100%', maxHeight: '100%' }}>
          <canvas
            ref={canvasElRef}
            className="block"
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100dvh - 180px)',
              objectFit: 'contain',
              filter: FILTERS[activeFilter].css || undefined,
            }}
          />

          {/* Barre d'outils HUD */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
            <button
              type="button"
              onClick={() => toggleTool('text')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${
                activeTool === 'text' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/50 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <Type className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTool('sticker')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${
                activeTool === 'sticker' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/50 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <Smile className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTool('filter')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border shadow-lg transition-colors ${
                activeTool === 'filter' ? 'bg-cyan-500/40 border-cyan-500/50 text-cyan-300' : 'bg-black/50 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30 shadow-lg text-red-400 hover:bg-red-500/40 transition-colors"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Panneau d'outils contextuel */}
      <div className="shrink-0 w-full px-3 pb-3 pt-1 bg-black/80 backdrop-blur-sm">
        {activeTool === 'text' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-3">
            <button
              type="button"
              onClick={addText}
              className="w-full rounded-xl bg-cyan-500/20 border border-cyan-500/30 py-2.5 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              + Ajouter un texte
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => updateSelectedTextSize(-4)} className="w-8 h-8 rounded-lg bg-white/10 text-white/70 text-lg font-bold hover:bg-white/20">-</button>
              <span className="text-xs text-white/50">Taille</span>
              <button type="button" onClick={() => updateSelectedTextSize(4)} className="w-8 h-8 rounded-lg bg-white/10 text-white/70 text-lg font-bold hover:bg-white/20">+</button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => updateSelectedTextFont(font.id)}
                  className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/15 transition-colors"
                  style={{ fontFamily: font.id }}
                >
                  {font.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSelectedTextColor(color)}
                  className="w-7 h-7 rounded-full border-2 border-white/20 hover:border-white/60 transition-colors hover:scale-110"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTool === 'sticker' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {STICKER_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setStickerCat(i)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    stickerCat === i ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {STICKER_CATEGORIES[stickerCat].items.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => addSticker(emoji)}
                  className="flex items-center justify-center h-11 rounded-xl bg-white/5 hover:bg-white/15 transition-all hover:scale-110 text-2xl"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'filter' && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((f, i) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setActiveFilter(i)}
                  className={`shrink-0 flex flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[10px] font-medium transition-all ${
                    activeFilter === i
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 scale-105'
                      : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                  }`}
                >
                  <span className="text-lg">{f.emoji}</span>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'none' && (
          <p className="text-center text-[11px] text-white/25 py-1">
            Double-tape sur un texte pour le modifier
          </p>
        )}
      </div>
    </div>
  );
}
