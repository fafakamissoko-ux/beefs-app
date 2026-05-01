'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Search,
  UserPlus,
  FileText,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

interface EditBeefModalProps {
  beefId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface EditableParticipant {
  user_id: string;
  username: string;
  display_name: string;
  is_main: boolean;
  role: 'participant' | 'witness';
}

const POPULAR_TAGS = [
  'tech', 'startup', 'argent', 'respect', 'business', 'crypto',
  'politique', 'sport', 'gaming', 'culture', 'justice', 'amitié',
  'famille', 'travail', 'collab', 'contrat', 'idée', 'crédit',
];

export function EditBeefModal({ beefId, onClose, onSaved }: EditBeefModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intent, setIntent] = useState<'manifesto' | 'mediation'>('mediation');
  const [createdBy, setCreatedBy] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [participants, setParticipants] = useState<EditableParticipant[]>([]);
  /** Snapshot après chargement — diff synchro **/
  const [initialParticipantSnapshot, setInitialParticipantSnapshot] = useState<Map<string, { is_main: boolean; role: string }>>(
    () => new Map(),
  );

  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!user?.id || !beefId) return;
    setLoading(true);
    try {
      const { data: beef, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, description, tags, intent, created_by, status')
        .eq('id', beefId)
        .single();

      if (beefErr) throw beefErr;
      if (!beef) throw new Error('Affaire introuvable');
      if (beef.created_by !== user.id) {
        toast('Tu ne peux pas modifier cette affaire.', 'error');
        onClose();
        return;
      }
      if (beef.status !== 'pending') {
        toast('Modification possible uniquement tant que l’affaire est en attente.', 'error');
        onClose();
        return;
      }

      const rawIntent = beef.intent as string | null;
      setIntent(rawIntent === 'manifesto' ? 'manifesto' : 'mediation');
      setCreatedBy(beef.created_by ?? null);
      setTitle(beef.title || '');
      setDescription(beef.description || '');
      setTags(Array.isArray(beef.tags) ? [...beef.tags] : []);

      const { data: partRows, error: partErr } = await supabase
        .from('beef_participants')
        .select('user_id, role, is_main, invite_status')
        .eq('beef_id', beefId);

      if (partErr) throw partErr;

      const ids = (partRows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
      const pmap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name, avatar_url');

      const snap = new Map<string, { is_main: boolean; role: string }>();
      const loaded: EditableParticipant[] = (partRows ?? []).map((r: { user_id: string; role: string | null; is_main: boolean | null }) => {
        const pr = pmap.get(r.user_id);
        snap.set(r.user_id, { is_main: !!r.is_main, role: r.role || 'participant' });
        return {
          user_id: r.user_id,
          username: pr?.username ?? '',
          display_name: displayNameFromPublicRow(pr, r.user_id.slice(0, 8)),
          is_main: !!r.is_main,
          role: (r.role === 'witness' ? 'witness' : 'participant') as 'participant' | 'witness',
        };
      });

      setInitialParticipantSnapshot(snap);
      setParticipants(loaded);
    } catch (e: unknown) {
      console.error(e);
      toast(e instanceof Error ? e.message : 'Impossible de charger l’affaire', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [beefId, user?.id, onClose, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const addTag = (tag: string) => {
    const cleanTag = tag.replace(/^[#$]/, '').trim().toLowerCase();
    if (!cleanTag) return;
    if (tags.length >= 10) {
      toast('Maximum 10 tags par beef', 'info');
      return;
    }
    if (tags.includes(cleanTag)) return;
    setTags((prev) => [...prev, cleanTag]);
    setTagInput('');
    setSuggestedTags([]);
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleTagInput = (value: string) => {
    setTagInput(value);
    const searchTerm = value.replace(/^[#$]/, '').toLowerCase();
    const available = POPULAR_TAGS.filter((t) => !tags.includes(t));
    if (searchTerm.length > 0) {
      const matched = available.filter((t) => t.includes(searchTerm));
      setSuggestedTags(matched.slice(0, 6));
    } else {
      setSuggestedTags(available.slice(0, 6));
    }
  };

  const handleTagFocus = () => {
    if (!tagInput) {
      setSuggestedTags(POPULAR_TAGS.filter((t) => !tags.includes(t)).slice(0, 6));
    }
  };

  const handleTagBlur = () => {
    setTimeout(() => setSuggestedTags([]), 150);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
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
        .neq('id', user?.id ?? '')
        .limit(5);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const addParticipant = (userData: Record<string, unknown>, isMainDefault: boolean) => {
    const id = String(userData.id);
    if (participants.some((p) => p.user_id === id)) return;
    const newParticipant: EditableParticipant = {
      user_id: id,
      username: String(userData.username ?? ''),
      display_name: String(userData.display_name || userData.username || ''),
      is_main: isMainDefault,
      role: 'participant',
    };
    setParticipants((prev) => [...prev, newParticipant]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeParticipant = (userId: string) => {
    if (intent === 'manifesto' && userId === user?.id) {
      toast('Tu ne peux pas te retirer en tant que partie du manifeste.', 'info');
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.user_id !== userId));
  };

  const toggleMainParticipant = (userId: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.user_id === userId ? { ...p, is_main: !p.is_main } : p)),
    );
  };

  const mainParticipants = participants.filter((p) => p.is_main);

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = 'Le titre est obligatoire.';
    else if (title.trim().length <= 3) errors.title = 'Le titre doit faire au moins 4 caractères.';
    if (tags.length === 0) errors.tags = 'Ajoute au moins 1 tag.';
    if (!description.trim()) errors.description = 'La description est obligatoire.';
    else if (description.trim().length < 50) {
      errors.description = `Description trop courte (${description.trim().length}/50 minimum).`;
    }
    if (intent === 'mediation' && mainParticipants.length !== 2) {
      errors.participants = 'Médiation : exactement 2 participants principaux requis.';
    }
    return errors;
  };

  const handleSave = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!user?.id) return;

    setSaving(true);
    try {
      const initialIds = new Set(initialParticipantSnapshot.keys());
      const currentIds = new Set(participants.map((p) => p.user_id));
      let removed = [...initialIds].filter((id) => !currentIds.has(id));
      removed = removed.filter((id) => !(intent === 'manifesto' && id === user.id));
      const added = participants.filter((p) => !initialIds.has(p.user_id));

      const { error: upBeefErr } = await supabase
        .from('beefs')
        .update({
          title: title.trim(),
          subject: title.trim(),
          description: description.trim(),
          tags,
        })
        .eq('id', beefId)
        .eq('created_by', user.id)
        .eq('status', 'pending');

      if (upBeefErr) throw upBeefErr;

      if (removed.length > 0) {
        const { error: invDelErr } = await supabase
          .from('beef_invitations')
          .delete()
          .eq('beef_id', beefId)
          .in('invitee_id', removed);
        if (invDelErr) throw invDelErr;

        const { error: bpDelErr } = await supabase
          .from('beef_participants')
          .delete()
          .eq('beef_id', beefId)
          .in('user_id', removed);
        if (bpDelErr) throw bpDelErr;
      }

      for (const p of added) {
        const { error: insP } = await supabase.from('beef_participants').insert({
          beef_id: beefId,
          user_id: p.user_id,
          role: p.role,
          is_main: p.is_main,
          invite_status: 'pending',
        });
        if (insP) throw insP;

        const { error: insI } = await supabase.from('beef_invitations').insert({
          beef_id: beefId,
          inviter_id: user.id,
          invitee_id: p.user_id,
          status: 'sent',
        });
        if (insI) throw insI;
      }

      for (const p of participants) {
        const init = initialParticipantSnapshot.get(p.user_id);
        if (!init) continue;
        if (init.is_main === p.is_main && init.role === p.role) continue;
        const { error: upP } = await supabase
          .from('beef_participants')
          .update({ is_main: p.is_main, role: p.role })
          .eq('beef_id', beefId)
          .eq('user_id', p.user_id);
        if (upP) throw upP;
      }

      onSaved();
    } catch (e: unknown) {
      console.error(e);
      const msg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message?: string }).message) : 'Erreur lors de l’enregistrement.';
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const canRemoveParticipant = (userId: string) => {
    if (intent === 'manifesto' && userId === createdBy) return false;
    return true;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm [scrollbar-gutter:stable]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-beef-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-[100dvh] w-full items-start justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4 sm:py-8">
        <div className="my-auto w-full max-w-2xl">
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-h-[min(92dvh,calc(100dvh-1.5rem))] w-full overflow-y-auto overscroll-contain rounded-[2rem] border-2 border-brand-500/50 bg-surface-2 p-5 shadow-modal sm:p-6"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full brand-gradient text-xl" aria-hidden>
                  ⚖️
                </div>
                <div>
                  <h2 id="edit-beef-title" className="text-xl font-black text-white">
                    Modifier l&apos;affaire
                  </h2>
                  <p className="text-xs text-gray-400">
                    {intent === 'manifesto' ? 'Manifeste · brouillon Agora' : 'Médiation · avant convocation finale'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 transition-colors hover:bg-white/10"
                aria-label="Fermer"
              >
                <X className="h-5 w-5 text-gray-400" aria-hidden />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                <span className="text-sm font-medium">Chargement…</span>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03]">
                <div className="hide-scrollbar space-y-5 px-4 py-4">
                  <div>
                    <label htmlFor="edit-beef-title-input" className="mb-2 block text-sm font-semibold text-white">
                      Motif du litige
                    </label>
                    <input
                      id="edit-beef-title-input"
                      type="text"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.title;
                          return n;
                        });
                      }}
                      placeholder="Ex : Idée volée, conflit d’associés…"
                      maxLength={100}
                      className={`w-full rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                        fieldErrors.title ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                      }`}
                    />
                    {fieldErrors.title && <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.title}</p>}
                  </div>

                  <div>
                    <label htmlFor="edit-beef-description" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <FileText className="h-4 w-4 text-purple-400" aria-hidden />
                      Description
                    </label>
                    <textarea
                      id="edit-beef-description"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setFieldErrors((p) => {
                          const n = { ...p };
                          delete n.description;
                          return n;
                        });
                      }}
                      rows={5}
                      maxLength={1000}
                      className={`w-full resize-y rounded-[2rem] border bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-gray-500 transition-colors focus:outline-none ${
                        fieldErrors.description ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'
                      }`}
                    />
                    <div className="mt-2 flex justify-between text-xs">
                      <span
                        className={
                          description.trim().length < 50 ? 'font-semibold text-red-400' : 'font-semibold text-green-400'
                        }
                      >
                        {description.trim().length < 50
                          ? `⚠️ Minimum 50 caractères (${50 - description.trim().length} restants)`
                          : `✓ ${description.length} caractères`}
                      </span>
                      <span className="text-gray-500">{description.length}/1000</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="text-lg text-brand-400">#</span>
                      Tags (max 10)
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <div className="flex min-h-[44px] flex-1 flex-wrap gap-2 rounded-[2rem] border border-white/[0.06] bg-white/[0.04] p-2">
                          {tags.map((tag) => (
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
                          {tags.length < 10 && (
                            <div className="relative min-w-[120px] flex-1">
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
                                placeholder={tags.length === 0 ? 'Tape un mot…' : 'Ajouter…'}
                                className="relative z-10 w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {suggestedTags.length > 0 && tags.length < 10 && (
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
                      {fieldErrors.tags && <p className="mt-1 text-xs text-red-400">⚠️ {fieldErrors.tags}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-white">
                      {intent === 'manifesto' ? 'Parties convoquées' : 'Convoquer / ajuster les parties'}
                    </label>
                    <p className="mb-3 text-xs text-gray-400">
                      {intent === 'mediation'
                        ? 'Exactement 2 participants avec le badge Principal.'
                        : 'Tu restes partie prenante ; tu peux retirer ou ajouter des adversaires ciblés.'}
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
                            onClick={() => addParticipant(result, participants.length < 2)}
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

                    {participants.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {participants.map((participant) => (
                          <div
                            key={participant.user_id}
                            className="flex items-center gap-2 rounded-[2rem] border border-gray-700 bg-black/40 p-2"
                          >
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                              {(participant.display_name || participant.username || '?')[0]?.toUpperCase() ?? '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{participant.display_name}</p>
                              <p className="truncate text-xs text-gray-400">@{participant.username || '…'}</p>
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
                            {canRemoveParticipant(participant.user_id) ? (
                              <button
                                type="button"
                                onClick={() => removeParticipant(participant.user_id)}
                                className="flex-shrink-0 rounded-lg p-1 transition-colors hover:bg-red-500/20"
                              >
                                <X className="h-4 w-4 text-red-400" />
                              </button>
                            ) : (
                              <span className="flex-shrink-0 px-2 text-[10px] font-bold uppercase text-white/35">Créateur</span>
                            )}
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
                </div>
              </div>
            )}

            {!loading && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-[2rem] border border-white/10 bg-white/[0.06] py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[2rem] py-3 text-sm font-bold text-white shadow-glow transition-all brand-gradient hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Enregistrement…
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
