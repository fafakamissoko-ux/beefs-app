'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Check, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';

export interface Applicant {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  pitch: string;
  rating: number;
  appliedAt: string;
}

interface ApplicantDashboardProps {
  applicants: Applicant[];
  onSelect: (applicant: Applicant) => void;
  selectedId?: string | null;
}

export function ApplicantDashboard({
  applicants,
  onSelect,
  selectedId,
}: ApplicantDashboardProps) {
  const [expanded, setExpanded] = useState(true);

  if (applicants.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-5 py-6 text-center">
        <p className="font-sans text-sm text-white/30">Aucune candidature pour le moment</p>
        <p className="font-mono text-[10px] text-white/20 mt-1 tracking-wider">Les candidats apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="font-sans text-sm font-bold text-white">Candidatures</p>
          <span className="font-mono text-[10px] font-bold text-prestige-gold bg-prestige-gold/10 border border-prestige-gold/20 px-2 py-0.5 rounded-full tracking-wider">
            {applicants.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-white/30" />
        ) : (
          <ChevronDown className="w-4 h-4 text-white/30" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06]">
              {applicants.map((applicant, idx) => {
                const isSelected = selectedId === applicant.id;
                return (
                  <motion.div
                    key={applicant.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-start gap-3 px-5 py-4 border-b border-white/[0.04] last:border-b-0 transition-colors ${
                      isSelected ? 'bg-prestige-gold/[0.06]' : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="relative w-10 h-10 rounded-[1rem] bg-gradient-to-br from-brand-500/60 to-brand-600/60 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {applicant.avatarUrl ? (
                        <Image src={applicant.avatarUrl} alt="" fill className="object-cover" sizes="40px" />
                      ) : (
                        <span className="text-white font-bold text-sm">{applicant.displayName[0]?.toUpperCase()}</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-sans text-sm font-bold text-white truncate">{applicant.displayName}</p>
                        {applicant.rating > 0 && (
                          <span className="flex items-center gap-0.5 font-mono text-[10px] font-bold text-prestige-gold tracking-wider">
                            <Star className="w-3 h-3 fill-prestige-gold text-prestige-gold" />
                            {applicant.rating.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="font-sans text-xs text-white/60 italic leading-relaxed line-clamp-2">
                        &ldquo;{applicant.pitch}&rdquo;
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelect(applicant)}
                      disabled={isSelected}
                      className={`flex-shrink-0 mt-1 rounded-full px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                        isSelected
                          ? 'bg-prestige-gold/20 text-prestige-gold border border-prestige-gold/30 cursor-default'
                          : 'bg-white/[0.06] text-white/60 border border-white/[0.1] hover:bg-prestige-gold/10 hover:text-prestige-gold hover:border-prestige-gold/25'
                      }`}
                    >
                      {isSelected ? (
                        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Sélectionné</span>
                      ) : (
                        'Sélectionner'
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
