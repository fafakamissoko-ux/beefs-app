'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  AlertTriangle,
  FileText,
  X,
  Check,
  Search,
  UserPlus,
  ImagePlus,
  Film,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import {
  minDateTimeLocalValue,
  scheduledLocalInputToIso,
  isScheduledTimeValid,
} from '@/lib/beef-schedule';
import type { BeefCreationIntent, BeefEventType, SubmitBeefPayload } from '@/lib/submitNewBeef';

interface BeefParticipant {
  user_id: string;
  username: string;
  display_name: string;
  is_main: boolean;
  role: 'participant' | 'witness';
}

interface BeefData {
  title: string;
  description: string;
  tags: string[];
  scheduled_at: string;
  is_scheduled: boolean;
  participants: BeefParticipant[];
  event_type: BeefEventType;
}

interface CreateBeefFormProps {
  onSubmit: (data: SubmitBeefPayload) => Promise<void>;
  onCancel: () => void;
}

const initialBeefData = (): BeefData => ({
  title: '',
  description: '',
  tags: [],
  scheduled_at: '',
  is_scheduled: false,
  participants: [],
  event_type: 'standard',
});

const getQuickDate = (hoursToAdd: number) => {
  const d = new Date();
  d.setHours(d.getHours() + hoursToAdd);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const getTonight = () => {
  const d = new Date();
  d.setHours(21, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const getTomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function CreateBeefForm({ onSubmit, onCancel }: CreateBeefFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [intent, setIntent] = useState<BeefCreationIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  const [beefData, setBeefData] = useState<BeefData>(initialBeefData);
  const [teaserFile, setTeaserFile] = useState<File | null>(null);
  const [teaserPreview, setTeaserPreview] = useState<string | null>(null);
  const teaserPreviewUrlRef = useRef<string | null>(null);

  const [estimatedSuitePrice, setEstimatedSuitePrice] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { count } = await supabase
        .from('beefs')
        .select('*', { count: 'exact', head: true })
        .eq('mediator_id', user.id)
        .eq('resolution_status', 'resolved');
      setEstimatedSuitePrice(continuationPriceFromResolvedCount(count ?? 0));
    })();
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setTeaserFile(null);
      if (teaserPreviewUrlRef.current) {
        URL.revokeObjectURL(teaserPreviewUrlRef.current);
        teaserPreviewUrlRef.current = null;
      }
      setTeaserPreview(null);
      return;
    }
    setTeaserFile(file);
    if (teaserPreviewUrlRef.current) {
      URL.revokeObjectURL(teaserPreviewUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    teaserPreviewUrlRef.current = url;
    setTeaserPreview(url);
  };

  const updateData = (field: keyof BeefData, value: unknown) => {
    setBeefData((prev) => ({ ...prev, [field]: value }));
  };

  const POPULAR_TAGS = [
    'tech', 'startup', 'argent', 'respect', 'business', 'crypto',
    'politique', 'sport', 'gaming', 'culture', 'justice', 'amitié',
    'famille', 'travail', 'collab', 'contrat', 'idée', 'crédit',
  ];

  const addTag = (tag: string) => {
    const cleanTag = tag.replace(/^[#$]/, '').trim().toLowerCase();
    if (!cleanTag) return;
    if (beefData.tags.length >= 10) {
      toast('Maximum 10 tags par beef', 'info');
      return;
    }
    if (beefData.tags.includes(cleanTag)) return;
    setBeefData((prev) => ({
      ...prev,
      tags: [...prev.tags, cleanTag],
    }));
    setTagInput('');
    setSuggestedTags([]);
  };

  const removeTag = (tag: string) => {
    setBeefData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleTagInput = (value: string) => {
    setTagInput(value);
    const searchTerm = value.replace(/^[#$]/, '').toLowerCase();
    const available = POPULAR_TAGS.filter((t) => !beefData.tags.includes(t));
    if (searchTerm.length > 0) {
      const matched = available.filter((t) => t.includes(searchTerm));
      setSuggestedTags(matched.slice(0, 6));
    } else {
      setSuggestedTags(available.slice(0, 6));
    }
  };

  const handleTagFocus = () => {
    if (!tagInput) {
      setSuggestedTags(POPULAR_TAGS.filter((t) => !beefData.tags.includes(t)).slice(0, 6));
    }
  };

  const handleTagBlur = () => {
    setTimeout(() => setSuggestedTags([]), 150);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && beefData.tags.length > 0) {
      removeTag(beefData.tags[beefData.tags.length - 1]);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id)
        .limit(5);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = (userData: Record<string, unknown>, isMain: boolean) => {
    const id = String(userData.id);
    if (beefData.participants.some((p) => p.user_id === id)) return;
    const newParticipant: BeefParticipant = {
      user_id: id,
      username: String(userData.username ?? ''),
      display_name: String(userData.display_name || userData.username || ''),
      is_main: isMain,
      role: 'participant',
    };
    setBeefData((prev) => ({
      ...prev,
      participants: [...prev.participants, newParticipant],
    }));
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeParticipant = (userId: string) => {
    setBeefData((prev) => ({
      ...prev,
      participants: prev.participants.filter((p) => p.user_id !== userId),
    }));
  };

  const toggleMainParticipant = (userId: string) => {
    setBeefData((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.user_id === userId ? { ...p, is_main: !p.is_main } : p
      ),
    }));
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mainParticipants = beefData.participants.filter((p) => p.is_main);

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!beefData.title.trim()) errors.title = 'Le titre est obligatoire.';
    else if (beefData.title.trim().length <= 3) errors.title = 'Le titre doit faire au moins 4 caractères.';
    if (beefData.tags.length === 0) errors.tags = 'Ajoute au moins 1 tag (#motclé).';
    if (!beefData.description.trim()) errors.description = 'La description est obligatoire.';
    else if (beefData.description.trim().length < 50)
      errors.description = `Description trop courte (${beefData.description.trim().length}/50 caractères minimum).`;

    if (intent === 'mediation') {
      if (mainParticipants.length !== 2) {
        errors.participants = 'Convoque exactement 2 participants principaux.';
      }
      if (beefData.is_scheduled) {
        if (!beefData.scheduled_at?.trim()) {
          errors.scheduled_at = 'Sélectionne une date et heure de programmation.';
        } else {
          const iso = scheduledLocalInputToIso(beefData.scheduled_at);
          if (!iso || !isScheduledTimeValid(iso)) {
            errors.scheduled_at =
              'Choisis une date et heure au moins ~2 minutes dans le futur (fuseau horaire de l’appareil).';
          }
        }
      }
    }

    if (intent === 'manifesto' && beefData.is_scheduled) {
      if (!beefData.scheduled_at?.trim()) {
        errors.scheduled_at = 'Sélectionne une date et heure ou désactive la programmation.';
      } else {
        const iso = scheduledLocalInputToIso(beefData.scheduled_at);
        if (!iso || !isScheduledTimeValid(iso)) {
          errors.scheduled_at =
            'Choisis une date et heure au moins ~2 minutes dans le futur (fuseau horaire de l’appareil).';
        }
      }
    }

    return errors;
  };

  const handleBackToChoice = () => {
    setIntent(null);
    setBeefData(initialBeefData());
    setTeaserFile(null);
    if (teaserPreviewUrlRef.current) {
      URL.revokeObjectURL(teaserPreviewUrlRef.current);
      teaserPreviewUrlRef.current = null;
    }
    setTeaserPreview(null);
    setFieldErrors({});
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    if (!intent) return;
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const payload: SubmitBeefPayload = {
        intent,
        event_type: beefData.event_type,
        title: beefData.title.trim(),
        description: beefData.description.trim(),
        tags: beefData.tags,
        scheduled_at: beefData.is_scheduled ? beefData.scheduled_at : '',
        participants: [
          ...beefData.participants.map((p) => ({
            user_id: p.user_id,
            role: p.role,
            is_main: p.is_main,
          })),
          ...(intent === 'manifesto' &&
          !beefData.participants.some((p) => p.user_id === user?.id) &&
          user?.id
            ? [{ user_id: user.id, role: 'participant' as const, is_main: true }]
            : []),
        ],
        teaser_file: teaserFile,
      };
      await onSubmit(payload);
    } catch (error: unknown) {
      console.error('Error creating beef:', error);
      const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message?: string }).message) : 'Erreur inconnue. Réessaie.';
      setFieldErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  };

  const splitCardClass =
    'glass-prestige flex flex-col gap-3 rounded-[1.25rem] border border-white/10 p-6 text-left transition-all hover:border-brand-500 cursor-pointer min-h-[160px] flex-1';

  return (
    <div
      className="fixed inset-0 z-modal overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm [scrollbar-gutter:stable]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-beef-dialog-title"
    >
      {/* Centrage si la modale est courte ; scroll sur l’overlay si elle est plus haute que le viewport */}
      <div className="flex min-h-[100dvh] w-full items-start justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:py-8">
        <div className="my-auto w-full max-w-2xl">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-brand-500/50 bg-surface-2 p-5 shadow-modal sm:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full brand-gradient text-xl" aria-hidden>
                🎭
              </div>
              <div>
                <h2 id="create-beef-dialog-title" className="text-xl font-black text-white">
                  {intent === null ? 'Nouvelle affaire' : intent === 'manifesto' ? 'Manifeste' : 'Médiation'}
                </h2>
                <p className="text-xs text-gray-400" id="create-beef-step-status">
                  {intent === null
                    ? 'Choisis ton intention'
                    : intent === 'manifesto'
                      ? 'Partie impliquée — expose ton dossier'
                      : 'Haute juridiction — convoque et arbitre'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-2 transition-colors hover:bg-white/10"
              aria-label="Fermer la fenêtre Organiser un beef"
            >
              <X className="h-5 w-5 text-gray-400" aria-hidden />
            </button>
          </div>

          {/* Étape 0 — choix d’intention */}
          {intent === null && (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
              <button type="button" className={splitCardClass} onClick={() => setIntent('manifesto')}>
                <span className="text-2xl" aria-hidden>
                  ⚔️
                </span>
                <span className="text-lg font-black text-white">PARTIE IMPLIQUÉE</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Publier un Manifeste</span>
                <p className="text-sm text-gray-400">
                  Exposez vos griefs et attendez qu&apos;un médiateur s&apos;empare du dossier.
                </p>
              </button>
              <button type="button" className={splitCardClass} onClick={() => setIntent('mediation')}>
                <span className="text-2xl" aria-hidden>
                  ⚖️
                </span>
                <span className="text-lg font-black text-white">HAUTE JURIDICTION</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-400">Organiser une Médiation</span>
                <p className="text-sm text-gray-400">
                  Convoquez deux parties et arbitrez leur conflit.
                </p>
              </button>
            </div>
          )}

          {/* Formulaire unifié — tout défile dans la carte (plus de 75vh + footer hors écran) */}
          {intent !== null && (
            <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03]">
              <div className="shrink-0 border-b border-white/[0.06] px-4 py-2">
                <button
                  type="button"
                  onClick={handleBackToChoice}
                  className="text-sm text-gray-500 transition-colors hover:text-white"
                >
                  ← Retour
                </button>
              </div>
              <div className="hide-scrollbar space-y-5 px-4 py-4">
                <div>
                  <label htmlFor="create-beef-title" className="mb-2 block text-sm font-semibold text-white">
                    Motif du litige
                  </label>
                  <input
                    id="create-beef-title"
                    type="text"
                    value={beefData.title}
                    onChange={(e) => {
                      updateData('title', e.target.value);
                      setFieldErrors((p) => {
                        const n = { ...p };
                        delete n.title;
                        return n;
                      });
                    }}
                    placeholder="Ex : Idée volée, conflit d’associés, créance…"
                    className={`w-full rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                      fieldErrors.title ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                    }`}
                    maxLength={100}
                  />
                  {fieldErrors.title ? (
                    <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.title}</p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">Titre clair du litige</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
                    <Film className="h-3.5 w-3.5 shrink-0 text-brand-400" aria-hidden />
                    Teaser (Vidéo ou Image)
                  </label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => document.getElementById('teaser-upload')?.click()}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        document.getElementById('teaser-upload')?.click();
                      }
                    }}
                    className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.5rem] border-2 border-dashed border-white/10 bg-white/5 transition-all hover:border-brand-500/50 hover:bg-white/10"
                  >
                    {teaserPreview ? (
                      teaserFile?.type.startsWith('video/') ? (
                        <div className="relative h-full w-full">
                          <video
                            src={teaserPreview}
                            className="h-full w-full object-contain bg-black"
                            muted
                            loop
                            autoPlay
                            playsInline
                          />
                          <div className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                            <Film className="h-3.5 w-3.5 text-brand-400" aria-hidden />
                          </div>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob)
                        <img src={teaserPreview} className="h-full w-full object-contain bg-black" alt="Aperçu teaser" />
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-white/40">
                        <div className="flex items-center gap-5">
                          <ImagePlus className="h-6 w-6" aria-hidden />
                          <Film className="h-6 w-6 text-brand-400" aria-hidden />
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-tighter">Photo ou vidéo</span>
                      </div>
                    )}
                    <input
                      id="teaser-upload"
                      type="file"
                      accept="video/*,image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="create-beef-description" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <FileText className="h-4 w-4 text-purple-400" aria-hidden />
                    Description
                  </label>
                  <textarea
                    id="create-beef-description"
                    value={beefData.description}
                    onChange={(e) => {
                      updateData('description', e.target.value);
                      setFieldErrors((p) => {
                        const n = { ...p };
                        delete n.description;
                        return n;
                      });
                    }}
                    placeholder={
                      intent === 'manifesto'
                        ? 'Expose les faits, les enjeux, ce que tu attends…'
                        : 'Contexte pour les parties et le déroulé souhaité…'
                    }
                    rows={5}
                    className={`w-full resize-y rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                      fieldErrors.description ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                    }`}
                    maxLength={1000}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p
                      className={`text-xs font-semibold ${
                        beefData.description.length < 50
                          ? 'text-red-400'
                          : beefData.description.length < 100
                            ? 'text-yellow-400'
                            : 'text-green-400'
                      }`}
                    >
                      {beefData.description.length < 50
                        ? `⚠️ Minimum 50 caractères (${50 - beefData.description.length} restants)`
                        : `✓ ${beefData.description.length} caractères`}
                    </p>
                    <p className="text-xs text-gray-500">{beefData.description.length}/1000</p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="text-lg text-brand-400">#</span>
                    Tags (max 10)
                  </label>
                  <p className="mb-2 text-xs text-gray-400">Mots-clés pour le fil et la découverte</p>
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="flex min-h-[44px] flex-1 flex-wrap gap-2 rounded-[2rem] border border-white/[0.06] bg-white/[0.04] p-2">
                        {beefData.tags.map((tag) => (
                          <motion.div
                            key={tag}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="flex items-center gap-1 rounded-full brand-gradient px-2 py-1 text-xs font-bold text-black"
                          >
                            <span>#{tag}</span>
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="rounded-full p-0.5 transition-colors hover:bg-black/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.div>
                        ))}
                        {beefData.tags.length < 10 && (
                          <div className="relative min-w-[120px] flex-1">
                            {suggestedTags[0] && tagInput && (
                              <span className="pointer-events-none absolute inset-0 flex select-none items-center text-sm">
                                <span className="invisible">{tagInput.replace(/^[#$]/, '')}</span>
                                <span className="text-gray-600">
                                  {suggestedTags[0].slice(tagInput.replace(/^[#$]/, '').length)}
                                </span>
                              </span>
                            )}
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => handleTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestedTags[0] && tagInput) {
                                  e.preventDefault();
                                  addTag(suggestedTags[0]);
                                  return;
                                }
                                handleTagKeyDown(e);
                              }}
                              onFocus={handleTagFocus}
                              onBlur={handleTagBlur}
                              placeholder={beefData.tags.length === 0 ? 'Tape un mot…' : 'Ajouter…'}
                              className="relative z-10 w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {suggestedTags.length > 0 && beefData.tags.length < 10 && (
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                        {suggestedTags.map((tag, i) => (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={() => addTag(tag)}
                            className={`flex flex-shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all ${
                              i === 0 && tagInput
                                ? 'border border-brand-500/50 bg-brand-500/25 text-brand-300'
                                : 'border border-gray-700 bg-gray-800 text-gray-300 hover:border-brand-500/40 hover:text-brand-300'
                            }`}
                          >
                            <span className="text-brand-400/70">#</span>
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500">
                      {beefData.tags.length}/10 · Entrée ou Espace pour valider
                      {suggestedTags[0] && tagInput ? ' · Tab pour l’auto-complétion' : ''}
                    </p>
                    {fieldErrors.tags && <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.tags}</p>}
                  </div>
                </div>

                {/* Participants — recherche conservée */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-white">
                    {intent === 'manifesto' ? 'Adversaires ou cibles (optionnel)' : 'Convoquer les parties'}
                  </label>
                  <p className="mb-3 text-xs text-gray-400">
                    {intent === 'manifesto'
                      ? 'Tu peux publier sans inviter, ou taguer des comptes.'
                      : 'Exactement 2 participants principaux requis.'}
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        void searchUsers(e.target.value);
                      }}
                      placeholder="Rechercher un utilisateur…"
                      className="w-full rounded-[2rem] border border-white/[0.06] bg-white/[0.04] py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none"
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                      </div>
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto overflow-hidden rounded-[2rem] border border-gray-700 bg-black/60">
                      {searchResults.map((result) => (
                        <button
                          key={String(result.id)}
                          type="button"
                          onClick={() => addParticipant(result, beefData.participants.length < 2)}
                          className="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-white/5"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                            {String(result.display_name || result.username || '?')[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                              {String(result.display_name || result.username)}
                            </p>
                            <p className="truncate text-xs text-gray-400">@{String(result.username)}</p>
                          </div>
                          <UserPlus className="h-4 w-4 flex-shrink-0 text-brand-400" />
                        </button>
                      ))}
                    </div>
                  )}
                  {beefData.participants.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {beefData.participants.map((participant) => (
                        <div
                          key={participant.user_id}
                          className="flex items-center gap-2 rounded-[2rem] border border-gray-700 bg-black/40 p-2"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                            {participant.display_name[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{participant.display_name}</p>
                            <p className="truncate text-xs text-gray-400">@{participant.username}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleMainParticipant(participant.user_id)}
                            className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-bold transition-all ${
                              participant.is_main ? 'bg-brand-500 text-black' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            }`}
                          >
                            {participant.is_main ? '🔥 Principal' : 'Témoin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeParticipant(participant.user_id)}
                            className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-red-500/20"
                          >
                            <X className="h-4 w-4 text-red-400" />
                          </button>
                        </div>
                      ))}
                      {intent === 'mediation' && mainParticipants.length !== 2 && (
                        <p className="flex items-center gap-1 text-xs text-yellow-400">
                          <AlertTriangle className="h-3 w-3" />
                          Il faut exactement 2 participants principaux.
                        </p>
                      )}
                      {fieldErrors.participants && (
                        <p className="text-xs text-red-400">⚠️ {fieldErrors.participants}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-[2rem] border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Calendar className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
                    Démarrage du beef
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      <input
                        type="radio"
                        name="beef-schedule-mode"
                        checked={!beefData.is_scheduled}
                        onChange={() => {
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.scheduled_at;
                            return n;
                          });
                          setBeefData((prev) => ({ ...prev, is_scheduled: false, scheduled_at: '' }));
                        }}
                        className="mt-1 h-4 w-4 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-white">Dès que c’est prêt</span>
                        <span className="block text-xs text-gray-400">Pas de date fixée.</span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-white/5">
                      <input
                        type="radio"
                        name="beef-schedule-mode"
                        checked={beefData.is_scheduled}
                        onChange={() => {
                          setFieldErrors((p) => {
                            const n = { ...p };
                            delete n.scheduled_at;
                            return n;
                          });
                          setBeefData((prev) => ({ ...prev, is_scheduled: true, scheduled_at: getQuickDate(2) }));
                        }}
                        className="mt-1 h-4 w-4 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className="block text-sm font-semibold text-white">Programmer</span>
                    </label>
                  </div>
                  {beefData.is_scheduled && (
                    <div className="flex flex-col gap-2 pl-8">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getQuickDate(2))}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Dans 2h
                        </button>
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getTonight())}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Ce soir 21h
                        </button>
                        <button
                          type="button"
                          onClick={() => updateData('scheduled_at', getTomorrow())}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-white transition hover:bg-white/20"
                        >
                          Demain 20h
                        </button>
                      </div>
                      <div className="relative mt-2">
                        <input
                          type="datetime-local"
                          value={beefData.scheduled_at}
                          min={minDateTimeLocalValue()}
                          onChange={(e) => {
                            updateData('scheduled_at', e.target.value);
                            setFieldErrors((p) => {
                              const n = { ...p };
                              delete n.scheduled_at;
                              return n;
                            });
                          }}
                          style={{ colorScheme: 'dark' }}
                          className="w-full cursor-pointer rounded-xl border border-white/20 bg-black/60 px-4 py-2.5 text-sm text-white transition-colors focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {fieldErrors.scheduled_at && (
                    <p className="pl-8 text-xs text-red-400">⚠️ {fieldErrors.scheduled_at}</p>
                  )}
                </div>

                <div className="rounded-[2rem] border border-brand-500/30 bg-brand-500/10 p-3">
                  <p className="mb-2 text-sm font-bold text-brand-400">📋 Récap</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-400">Intention</span>
                      <span className="max-w-[58%] truncate text-right font-semibold text-white">
                        {intent === 'manifesto' ? 'Manifeste' : 'Médiation'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-400">Tags</span>
                      <span className="font-semibold text-white">{beefData.tags.length}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-400">Participants</span>
                      <span className="font-semibold text-white">{beefData.participants.length}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.04] p-3">
                  <p className="text-sm leading-relaxed text-gray-300">
                    Après les premières minutes gratuites en direct, les spectateurs peuvent débloquer la suite avec des
                    points. Palier estimé pour ce beef :{' '}
                    <span className="font-bold text-brand-400">
                      {estimatedSuitePrice === null ? '…' : `${estimatedSuitePrice} pts`}
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}

          {Object.values(fieldErrors).some(Boolean) && (
            <div className="mt-4 space-y-1 rounded-[2rem] border border-red-500/40 bg-red-500/10 p-3">
              {Object.values(fieldErrors)
                .filter(Boolean)
                .map((err, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-red-400">
                    <span className="mt-0.5">⚠️</span>
                    <span>{err}</span>
                  </p>
                ))}
            </div>
          )}

          {intent !== null && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-[2rem] py-3 text-sm font-bold text-white shadow-glow transition-all brand-gradient hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Création…</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{intent === 'manifesto' ? 'Publier le Manifeste' : 'Convoquer le Tribunal'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="mt-3 rounded-[2rem] border border-blue-500/20 bg-blue-500/10 p-2">
            <p className="text-xs text-blue-400">
              <strong>Obligatoire :</strong> titre, tags, description (50+ caractères).{' '}
              {intent === 'mediation' && 'Médiation : 2 participants principaux.'}
            </p>
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
}
