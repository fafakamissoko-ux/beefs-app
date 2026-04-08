'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

const MAX_PREVIEW_LINES = 2;

type Props = {
  text: string;
  className?: string;
};

/**
 * Résumé médiateur sur profil public : aperçu court + « Voir plus ».
 */
export function MediationSummaryPublic({ text, className = '' }: Props) {
  const trimmed = text.trim();
  const [open, setOpen] = useState(false);
  if (!trimmed) return null;
  const lines = trimmed.split(/\r?\n/);
  const isLong = trimmed.length > 180 || lines.length > MAX_PREVIEW_LINES;

  return (
    <div
      className={`rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 text-brand-400/90 mb-1.5">
        <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide">Résumé du médiateur</span>
      </div>
      <p
        className={`text-gray-300 text-sm leading-relaxed whitespace-pre-wrap ${
          !open && isLong ? 'line-clamp-2' : ''
        }`}
      >
        {trimmed}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
        >
          {open ? (
            <>
              Voir moins <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              Voir plus <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
