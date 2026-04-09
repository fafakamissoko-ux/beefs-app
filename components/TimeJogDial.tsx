'use client';

import { useCallback, useRef, useState } from 'react';

type TimeJogDialProps = {
  /** Grand affichage (ex. mm:ss ou durée parole) */
  display: string;
  subtitle?: string;
  /** Incrément par « cran » de rotation */
  stepSec: 5 | 10;
  /** Ajuste le temps (+/- secondes) */
  onDelta: (deltaSec: number) => void;
  /** Accès rapides (ex. −30 / +30 / +60 pour le chrono global) */
  quickJumps?: { label: string; delta: number }[];
  /** id pour a11y */
  ariaLabel?: string;
};

/**
 * Molette virtuelle Frosted Titanium — indicateur Ember sur l’anneau.
 */
export function TimeJogDial({
  display,
  subtitle = 'Glisser pour ajuster',
  stepSec,
  onDelta,
  quickJumps = [],
  ariaLabel = 'Réglage du temps',
}: TimeJogDialProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastAngleRef = useRef<number | null>(null);
  const accRef = useRef(0);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [emberDeg, setEmberDeg] = useState(0);

  const pointerToAngle = useCallback((clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return Math.atan2(clientY - cy, clientX - cx);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    lastAngleRef.current = pointerToAngle(e.clientX, e.clientY);
    accRef.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    if (lastAngleRef.current === null) return;
    const a = pointerToAngle(e.clientX, e.clientY);
    let d = a - lastAngleRef.current;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    lastAngleRef.current = a;
    setEmberDeg((prev) => prev + (d * 180) / Math.PI);
    accRef.current += d;
    const threshold = 0.12;
    while (accRef.current >= threshold) {
      onDelta(stepSec);
      accRef.current -= threshold;
    }
    while (accRef.current <= -threshold) {
      onDelta(-stepSec);
      accRef.current += threshold;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draggingRef.current = false;
    setDragging(false);
    lastAngleRef.current = null;
    accRef.current = 0;
  };

  const indicatorDeg = emberDeg;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/90">{subtitle}</p>
      <div
        ref={wrapRef}
        role="group"
        aria-label={`${ariaLabel} — ${display}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative flex h-[7.25rem] w-[7.25rem] cursor-grab touch-none select-none items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md active:cursor-grabbing"
        style={{
          boxShadow: dragging
            ? 'inset 0 0 24px rgba(255,77,0,0.15), 0 0 20px rgba(255,77,0,0.12)'
            : 'inset 0 0 20px rgba(0,0,0,0.35)',
        }}
        onPointerCancel={onPointerUp}
      >
        {/* Anneau + pastille Ember (rotation commune) */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{
            transform: `rotate(${indicatorDeg}deg)`,
            transition: dragging ? 'none' : 'transform 0.35s ease-out',
          }}
        >
          <div className="absolute inset-[5px] rounded-full border border-[#FF4D00]/40" />
          <div className="absolute left-1/2 top-[10px] h-2 w-2 -translate-x-1/2 rounded-full bg-[#FF4D00] shadow-[0_0_14px_rgba(255,77,0,0.95)]" />
        </div>
        <div className="pointer-events-none flex flex-col items-center px-1 text-center">
          <span className="font-mono text-[1.35rem] font-black tabular-nums leading-none tracking-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.65)] sm:text-[1.5rem]">
            {display}
          </span>
        </div>
      </div>
      {quickJumps.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {quickJumps.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onDelta(q.delta)}
              className="rounded-[2px] border border-ember-500/40 bg-ember-500/15 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-ember-100 transition-colors hover:bg-ember-500/30"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
