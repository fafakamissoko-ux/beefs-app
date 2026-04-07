'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { RESOLUTION_STATUS_OPTIONS } from '@/lib/mediation-outcome-labels';

const SUMMARY_MAX = 800;

type Patch = { resolution_status?: string; mediation_summary?: string | null };

type Props = {
  beefId: string;
  resolutionStatus?: string | null;
  mediationSummary: string;
  onSaved: (patch: Patch) => void;
};

export function MediationBeefEditorPanel({
  beefId,
  resolutionStatus,
  mediationSummary,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(resolutionStatus || 'in_progress');
  const [summary, setSummary] = useState(mediationSummary || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(resolutionStatus || 'in_progress');
    setSummary(mediationSummary || '');
  }, [beefId, resolutionStatus, mediationSummary]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        resolution_status: status,
        mediation_summary: summary.trim() || null,
      };
      const { error } = await supabase.from('beefs').update(payload).eq('id', beefId);
      if (error) throw error;
      onSaved(payload);
      toast('Résultat et résumé enregistrés', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }, [beefId, status, summary, onSaved, toast]);

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/30 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-gray-300 hover:bg-white/5 transition-colors"
      >
        <span>Résultat & résumé (visible sur ton profil public)</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-gray-500" /> : <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-white/5">
          <div>
            <label htmlFor={`res-${beefId}`} className="block text-xs font-semibold text-gray-500 mb-1.5">
              Statut de la médiation
            </label>
            <select
              id={`res-${beefId}`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {RESOLUTION_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-gray-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`sum-${beefId}`} className="block text-xs font-semibold text-gray-500 mb-1.5">
              Résumé public ({summary.length}/{SUMMARY_MAX})
            </label>
            <textarea
              id={`sum-${beefId}`}
              value={summary}
              onChange={(e) => setSummary(e.target.value.slice(0, SUMMARY_MAX))}
              rows={4}
              placeholder="Ex. : Accord trouvé sur le remboursement partiel ; les parties ont convenu d’un échéancier."
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y min-h-[96px]"
            />
            <p className="text-[11px] text-gray-600 mt-1">
              Affiché sous ce beef sur ton profil public. Reste factuel et respectueux.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-black text-sm font-bold transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}
