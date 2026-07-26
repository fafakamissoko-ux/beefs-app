'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Type, Smile, SlidersHorizontal, Check, RotateCcw } from 'lucide-react';

export interface TeaserEditorProps {
  rawImageUrl: string;
  onSave: (file: File) => void;
  onCancel: () => void;
}

type FabricCanvas = import('fabric').Canvas;
type FabricIText = import('fabric').IText;

const FILTERS = [
  { label: 'Normal', css: '' },
  { label: 'N&B', css: 'grayscale(100%)' },
  { label: 'Sépia', css: 'sepia(80%)' },
  { label: 'Chaud', css: 'saturate(140%) hue-rotate(-10deg)' },
  { label: 'Froid', css: 'saturate(110%) hue-rotate(20deg) brightness(105%)' },
  { label: 'Contraste', css: 'contrast(130%) brightness(105%)' },
  { label: 'Doux', css: 'brightness(110%) contrast(90%) saturate(85%)' },
  { label: 'Vivid', css: 'saturate(180%) contrast(110%)' },
] as const;

const FONT_FAMILIES = [
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'Impact',
  'Georgia',
] as const;

const TEXT_COLORS = [
  '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FF6B00', '#8B5CF6',
] as const;

const STICKERS = [
  '🔥', '💀', '😂', '💯', '🏆', '⚡', '👑', '🎯',
  '💪', '🗣️', '😤', '🤡', '💰', '🎵', '❤️', '👀',
] as const;

type ToolMode = 'none' | 'text' | 'sticker' | 'filter';

export default function TeaserEditor({ rawImageUrl, onSave, onCancel }: TeaserEditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolMode>('none');
  const [activeFilter, setActiveFilter] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const text = new fabric.IText('Texte', {
        left: 300,
        top: 400,
        fontFamily: 'sans-serif',
        fill: '#FFFFFF',
        fontSize: 40,
        originX: 'center',
        originY: 'center',
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.8)', blur: 10, offsetX: 0, offsetY: 0 }),
        editable: true,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.renderAll();
    });
  }, []);

  const addSticker = useCallback((emoji: string) => {
    import('fabric').then((fabric) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const text = new fabric.IText(emoji, {
        left: 300,
        top: 400,
        fontSize: 60,
        originX: 'center',
        originY: 'center',
        editable: false,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
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

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (obj) {
      canvas.remove(obj);
      canvas.renderAll();
    }
  }, []);

  const applyFilter = useCallback((filterIndex: number) => {
    setActiveFilter(filterIndex);
    const canvas = fabricRef.current;
    if (!canvas) return;
    const bg = canvas.getObjects()[0];
    if (!bg) return;
    const filterCss = FILTERS[filterIndex].css;
    if (!filterCss) {
      bg.set('filter' as string, undefined);
    }
    canvas.renderAll();
  }, []);

  const handleExport = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    setIsExporting(true);
    try {
      canvas.discardActiveObject();
      canvas.renderAll();
      const dataURL = canvas.toDataURL({ format: 'jpeg', quality: 0.9, multiplier: 1 });
      const res = await fetch(dataURL);
      const blob = await res.blob();
      const file = new File([blob], 'teaser-rich.jpg', { type: 'image/jpeg' });
      onSave(file);
    } finally {
      setIsExporting(false);
    }
  }, [onSave]);

  const toggleTool = useCallback((tool: ToolMode) => {
    setActiveTool((prev) => (prev === tool ? 'none' : tool));
  }, []);

  return (
    <div className="absolute inset-0 z-[10005] flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl">
      {/* Header */}
      <div className="flex w-full items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
          Annuler
        </button>
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
      <div ref={containerRef} className="relative flex-1 flex items-center justify-center w-full overflow-hidden px-4">
        <div className="relative" style={{ maxWidth: '100%', maxHeight: '100%' }}>
          <canvas
            ref={canvasElRef}
            className="rounded-2xl shadow-2xl border border-white/10"
            style={{
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 220px)',
              objectFit: 'contain',
              filter: FILTERS[activeFilter].css || undefined,
            }}
          />

          {/* Barre d'outils HUD */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
            <button
              type="button"
              onClick={() => toggleTool('text')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border border-white/10 shadow-lg transition-colors ${
                activeTool === 'text' ? 'bg-cyan-500/40 text-cyan-300' : 'bg-slate-900/40 text-white hover:bg-white/20'
              }`}
              title="Ajouter du texte"
            >
              <Type className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTool('sticker')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border border-white/10 shadow-lg transition-colors ${
                activeTool === 'sticker' ? 'bg-cyan-500/40 text-cyan-300' : 'bg-slate-900/40 text-white hover:bg-white/20'
              }`}
              title="Ajouter un sticker"
            >
              <Smile className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTool('filter')}
              className={`flex items-center justify-center w-11 h-11 rounded-full backdrop-blur-sm border border-white/10 shadow-lg transition-colors ${
                activeTool === 'filter' ? 'bg-cyan-500/40 text-cyan-300' : 'bg-slate-900/40 text-white hover:bg-white/20'
              }`}
              title="Filtres"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-red-900/40 backdrop-blur-sm border border-red-500/20 shadow-lg text-red-400 hover:bg-red-500/30 transition-colors"
              title="Supprimer l'élément sélectionné"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Panneau d'outils contextuel */}
      <div className="w-full px-4 pb-4 pt-2">
        {activeTool === 'text' && (
          <div className="rounded-2xl bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-4 space-y-3">
            <button
              type="button"
              onClick={addText}
              className="w-full rounded-xl bg-cyan-500/20 border border-cyan-500/30 py-2.5 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30 transition-colors"
            >
              + Ajouter un texte
            </button>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => updateSelectedTextFont(font)}
                  className="shrink-0 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 transition-colors"
                  style={{ fontFamily: font }}
                >
                  {font === 'sans-serif' ? 'Sans' : font === 'monospace' ? 'Mono' : font}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateSelectedTextColor(color)}
                  className="w-7 h-7 rounded-full border-2 border-white/20 hover:border-white/60 transition-colors"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTool === 'sticker' && (
          <div className="rounded-2xl bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-4">
            <div className="grid grid-cols-8 gap-2">
              {STICKERS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => addSticker(emoji)}
                  className="flex items-center justify-center h-10 rounded-lg bg-white/5 hover:bg-white/15 transition-colors text-xl"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'filter' && (
          <div className="rounded-2xl bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-4">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {FILTERS.map((f, i) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => applyFilter(i)}
                  className={`shrink-0 flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-colors ${
                    activeFilter === i
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                      : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-red-500"
                    style={{ filter: f.css || undefined }}
                  />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTool === 'none' && (
          <p className="text-center text-xs text-white/30">
            Touche un outil pour ajouter du texte, des stickers ou un filtre
          </p>
        )}
      </div>
    </div>
  );
}
