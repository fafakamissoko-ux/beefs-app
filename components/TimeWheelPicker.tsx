'use client';

import { useCallback, useEffect, useRef } from 'react';

const ROW_H = 40;
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);
const TOP_PAD = PAD_ROWS * ROW_H;

function clampSec(n: number, minSec: number, maxSec: number): number {
  return Math.max(minSec, Math.min(maxSec, Math.round(n)));
}

function minuteBounds(minSec: number, maxSec: number): { minuteMin: number; minuteMax: number } {
  return {
    minuteMin: Math.floor(minSec / 60),
    minuteMax: Math.floor(maxSec / 60),
  };
}

function secLow(m: number, minuteMin: number, minSec: number): number {
  return m <= minuteMin ? Math.max(0, minSec - m * 60) : 0;
}

function secHigh(m: number, minuteMax: number, maxSec: number): number {
  return m >= minuteMax ? Math.max(0, maxSec - m * 60) : 59;
}

type WheelColumnProps = {
  values: readonly number[];
  value: number;
  onChange: (v: number) => void;
  format: (n: number) => string;
  ariaLabel: string;
};

function WheelColumn({ values, value, onChange, format, ariaLabel }: WheelColumnProps) {
  const idx = Math.max(0, values.indexOf(value));
  const scrollerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior = 'auto') => {
      const el = scrollerRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(values.length - 1, i));
      el.scrollTo({ top: clamped * ROW_H, behavior });
    },
    [values.length],
  );

  useEffect(() => {
    scrollToIndex(idx, 'auto');
  }, [idx, scrollToIndex]);

  const flushSelection = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || values.length === 0) return;
    const raw = el.scrollTop / ROW_H;
    const i = Math.max(0, Math.min(values.length - 1, Math.round(raw)));
    scrollToIndex(i, 'smooth');
    const v = values[i];
    if (v !== undefined && v !== value) {
      onChange(v);
    }
  }, [onChange, scrollToIndex, value, values]);

  const scheduleFlush = useCallback(() => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      scrollEndTimerRef.current = null;
      if (!draggingRef.current) {
        flushSelection();
      }
    }, 100);
  }, [flushSelection]);

  useEffect(
    () => () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    },
    [],
  );

  return (
    <div
      className="relative w-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-black/40"
      style={{ height: VISIBLE_ROWS * ROW_H }}
    >
      <div
        className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-lg bg-white/[0.14] backdrop-blur-sm"
        aria-hidden
      />
      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={ariaLabel}
        className="hide-scrollbar h-full overflow-y-auto overscroll-contain"
        onScroll={scheduleFlush}
        onPointerDown={() => {
          draggingRef.current = true;
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          flushSelection();
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
      >
        <div style={{ height: TOP_PAD }} className="shrink-0" aria-hidden />
        {values.map((v) => {
          const selected = v === value;
          return (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(v);
                const j = values.indexOf(v);
                if (j >= 0) scrollToIndex(j, 'smooth');
              }}
              className={`flex h-10 w-full shrink-0 items-center justify-center font-mono text-sm tabular-nums transition-[opacity,transform,font-weight] ${
                selected
                  ? 'scale-105 text-base font-bold text-white'
                  : 'text-[13px] font-medium text-white/30'
              }`}
            >
              {format(v)}
            </button>
          );
        })}
        <div style={{ height: TOP_PAD }} className="shrink-0" aria-hidden />
      </div>
    </div>
  );
}

export type TimeWheelPickerProps = {
  valueSec: number;
  onChange: (sec: number) => void;
  minSec: number;
  maxSec: number;
  ariaLabel?: string;
  className?: string;
};

/**
 * Roulette double colonne (style iOS) pour MM:SS, bornée par minSec / maxSec.
 */
export function TimeWheelPicker({
  valueSec,
  onChange,
  minSec,
  maxSec,
  ariaLabel = 'Réglage du temps',
  className = '',
}: TimeWheelPickerProps) {
  const safe = clampSec(valueSec, minSec, maxSec);
  const { minuteMin, minuteMax } = minuteBounds(minSec, maxSec);
  const minutes = Array.from({ length: minuteMax - minuteMin + 1 }, (_, i) => minuteMin + i);

  const mm = Math.floor(safe / 60);
  const ss = safe - mm * 60;

  const lo = secLow(mm, minuteMin, minSec);
  const hi = secHigh(mm, minuteMax, maxSec);
  const seconds = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  const pad2 = (n: number) => n.toString().padStart(2, '0');

  const onMinuteChange = (newM: number) => {
    const sLo = secLow(newM, minuteMin, minSec);
    const sHi = secHigh(newM, minuteMax, maxSec);
    const nextS = Math.min(sHi, Math.max(sLo, ss));
    onChange(clampSec(newM * 60 + nextS, minSec, maxSec));
  };

  const onSecondChange = (newS: number) => {
    onChange(clampSec(mm * 60 + newS, minSec, maxSec));
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-center gap-1" aria-label={ariaLabel}>
        <WheelColumn
          values={minutes}
          value={mm}
          onChange={onMinuteChange}
          format={pad2}
          ariaLabel="Minutes"
        />
        <span className="pb-1 font-mono text-lg font-bold text-white/40" aria-hidden>
          :
        </span>
        <WheelColumn values={seconds} value={ss} onChange={onSecondChange} format={pad2} ariaLabel="Secondes" />
      </div>
      <div
        className="pointer-events-none text-center font-mono text-[9px] font-bold uppercase tracking-widest text-white/35"
        aria-hidden
      >
        min · sec
      </div>
    </div>
  );
}
