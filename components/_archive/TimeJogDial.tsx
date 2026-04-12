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
  className?: string;
  dialClassName?: string;
  displayClassName?: string;
};

/**
 * Molette virtuelle Frosted Titanium — indicateur Ember sur l’anneau.
 */
export function TimeJogDial({
  display,
  subtitle = '',
  stepSec,
  onDelta,
  quickJumps = [],
  ariaLabel = 'Réglage du temps',
  className = '',
  dialClassName = '',
  displayClassName = '',
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
    <div className={`flex flex-col items-center gap-2 ${className}`.trim()}>
      {subtitle ? (
        <p className="max-lg:block font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white lg:hidden">
          {subtitle}
        </p>
      ) : null}
      <div
        ref={wrapRef}
        role="group"
        aria-label={`${ariaLabel} — ${display}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative flex h-[7.25rem] w-[7.25rem] cursor-grab touch-none select-none items-center justify-center rounded-full border border-white/[0.18] bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md active:cursor-grabbing lg:border-white/12 lg:bg-white/[0.07] ${dialClassName}`.trim()}
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
          <div className="absolute inset-[5px] rounded-full border border-[#FF4D00]/40 lg:inset-[6px] lg:border-[#FF4D00]/32" />
          <div className="absolute left-1/2 top-[10px] h-2 w-2 -translate-x-1/2 rounded-full bg-[#FF4D00] shadow-[0_0_14px_rgba(255,77,0,0.95)] lg:top-[9px] lg:h-[7px] lg:w-[7px]" />
        </div>
        <div className="pointer-events-none flex flex-col items-center px-1 text-center">
          <span
            className={`font-mono text-[1.35rem] font-black tabular-nums leading-none tracking-tight text-white [text-shadow:0_1px_0_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.45)] sm:text-[1.5rem] lg:text-[1.28rem] ${displayClassName}`.trim()}
          >
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
              onClick={(e) => {
                e.stopPropagation();
                onDelta(q.delta);
              }}
              className="rounded-2xl bg-ember-500/18 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-ember-100 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:bg-ember-500/30 lg:px-1.5 lg:py-0.5 lg:text-[8px]"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
