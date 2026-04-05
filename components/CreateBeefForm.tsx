'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Calendar, AlertTriangle, FileText, X, ArrowRight, Search, UserPlus, Check, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';

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
  scheduled_at: string; // Empty = start now, filled = scheduled
  is_scheduled: boolean;
  participants: BeefParticipant[];
}

interface CreateBeefFormProps {
  onSubmit: (data: BeefData) => Promise<void>;
  onCancel: () => void;
}

export function CreateBeefForm({ onSubmit, onCancel }: CreateBeefFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  
  const [beefData, setBeefData] = useState<BeefData>({
    title: '',
    description: '',
    tags: [],
    scheduled_at: '',
    is_scheduled: false,
    participants: [],
  });

  const [estimatedSuitePrice, setEstimatedSuitePrice] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { count } = await supabase
        .from('beefs')
        .select('*', { count: 'exact', head: true })
        .eq('mediator_id', user.id)
        .eq('resolution_status', 'resolved');
      setEstimatedSuitePrice(continuationPriceFromResolvedCount(count ?? 0));
    })();
  }, [user?.id]);

  const updateData = (field: keyof BeefData, value: any) => {
    setBeefData({ ...beefData, [field]: value });
  };

  // Trending/Popular tags for suggestions
  const POPULAR_TAGS = [
    'tech', 'startup', 'argent', 'respect', 'business', 'crypto',
    'politique', 'sport', 'gaming', 'culture', 'justice', 'amitié',
    'famille', 'travail', 'collab', 'contrat', 'idée', 'crédit'
  ];

  // Add tag
  const addTag = (tag: string) => {
    const cleanTag = tag.replace(/^[#$]/, '').trim().toLowerCase();
    
    if (!cleanTag) return;
    if (beefData.tags.length >= 10) {
      toast('Maximum 10 tags par beef', 'info');
      return;
    }
    if (beefData.tags.includes(cleanTag)) return;

    setBeefData({
      ...beefData,
      tags: [...beefData.tags, cleanTag],
    });
    setTagInput('');
    setSuggestedTags([]);
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setBeefData({
      ...beefData,
      tags: beefData.tags.filter(t => t !== tag),
    });
  };

  // Handle tag input change — show popular as default + filter on type
  const handleTagInput = (value: string) => {
    setTagInput(value);
    const searchTerm = value.replace(/^[#$]/, '').toLowerCase();
    const available = POPULAR_TAGS.filter(t => !beefData.tags.includes(t));
    if (searchTerm.length > 0) {
      // Filter matching tags + keep non-matching at end for discovery
      const matched = available.filter(t => t.includes(searchTerm));
      setSuggestedTags(matched.slice(0, 6));
    } else {
      // Show all popular tags on focus (no text typed)
      setSuggestedTags(available.slice(0, 6));
    }
  };

  const handleTagFocus = () => {
    if (!tagInput) {
      setSuggestedTags(POPULAR_TAGS.filter(t => !beefData.tags.includes(t)).slice(0, 6));
    }
  };

  const handleTagBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => setSuggestedTags([]), 150);
  };

  // Handle tag input keydown
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
      }
    } else if (e.key === 'Backspace' && !tagInput && beefData.tags.length > 0) {
      // Remove last tag if backspace on empty input
      removeTag(beefData.tags[beefData.tags.length - 1]);
    }
  };

  // Search users to invite
  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id) // Don't show current user (mediator)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  // Add participant
  const addParticipant = (userData: any, isMain: boolean) => {
    const isAlreadyAdded = beefData.participants.some(p => p.user_id === userData.id);
    if (isAlreadyAdded) return;

    const newParticipant: BeefParticipant = {
      user_id: userData.id,
      username: userData.username,
      display_name: userData.display_name || userData.username,
      is_main: isMain,
      role: 'participant',
    };

    setBeefData({
      ...beefData,
      participants: [...beefData.participants, newParticipant],
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  // Remove participant
  const removeParticipant = (userId: string) => {
    setBeefData({
      ...beefData,
      participants: beefData.participants.filter(p => p.user_id !== userId),
    });
  };

  // Toggle main participant
  const toggleMainParticipant = (userId: string) => {
    setBeefData({
      ...beefData,
      participants: beefData.participants.map(p =>
        p.user_id === userId ? { ...p, is_main: !p.is_main } : p
      ),
    });
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateStep = (s: number): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (s === 1) {
      if (!beefData.title.trim()) errors.title = 'Le titre est obligatoire.';
      else if (beefData.title.trim().length <= 3) errors.title = 'Le titre doit faire au moins 4 caractères.';
      if (beefData.tags.length === 0) errors.tags = 'Ajoute au moins 1 tag (#motclé).';
    }
    if (s === 3) {
      if (!beefData.description.trim()) errors.description = 'La description est obligatoire.';
      else if (beefData.description.trim().length < 50)
        errors.description = `Description trop courte (${beefData.description.trim().length}/50 caractères minimum).`;
      if (beefData.is_scheduled && !beefData.scheduled_at)
        errors.scheduled_at = 'Sélectionne une date et heure de programmation.';
    }
    return errors;
  };

  const handleNext = () => {
    const errors = validateStep(step);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setStep(step + 1);
  };

  const handleSubmit = async () => {
    const errors = validateStep(step);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await onSubmit(beefData);
    } catch (error: any) {
      console.error('Error creating beef:', error);
      setFieldErrors({ submit: error?.message || 'Erreur inconnue. Réessaie.' });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    const errors = validateStep(step);
    return Object.keys(errors).length === 0;
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'low': return '🟢 Désaccord léger';
      case 'medium': return '🟡 Conflit modéré';
      case 'high': return '🟠 Conflit sérieux';
      case 'critical': return '🔴 Conflit critique';
      default: return '';
    }
  };

  const mainParticipants = beefData.participants.filter(p => p.is_main);

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-beef-dialog-title"
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-surface-2 rounded-2xl p-6 w-full border-2 border-brand-500/50 shadow-2xl"
        >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 brand-gradient rounded-full flex items-center justify-center text-xl" aria-hidden>
              🎭
            </div>
            <div>
              <h2 id="create-beef-dialog-title" className="text-xl font-black text-white">
                Organiser un beef
              </h2>
              <p className="text-gray-400 text-xs" id="create-beef-step-status">
                Étape {step}/3 - Médiateur
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Fermer la fenêtre Organiser un beef"
          >
            <X className="w-5 h-5 text-gray-400" aria-hidden />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step
                  ? 'brand-gradient'
                  : 'bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Beef Info - SIMPLIFIED */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="create-beef-title" className="block text-white font-semibold mb-2 text-sm">
                Titre du beef
              </label>
              <input
                id="create-beef-title"
                type="text"
                value={beefData.title}
                onChange={(e) => { updateData('title', e.target.value); setFieldErrors(p => { const n = {...p}; delete n.title; return n; }); }}
                placeholder="Ex: Idée de startup volée, Conflit d'associés, Argent non remboursé..."
                className={`w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors ${fieldErrors.title ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'}`}
                maxLength={100}
              />
              {fieldErrors.title
                ? <p className="text-red-400 text-xs mt-1">⚠️ {fieldErrors.title}</p>
                : <p className="text-gray-500 text-xs mt-1">Décrivez clairement le conflit</p>}
            </div>

            <div>
              <label className="block text-white font-semibold mb-2 text-sm flex items-center gap-2">
                <span className="text-brand-400 text-lg">#</span>
                Tags (maximum 10)
              </label>
              <p className="text-gray-400 text-xs mb-2">
                Ajoutez des tags pour aider les utilisateurs à trouver votre beef
              </p>
              
              {/* Tag Input */}
              <div className="relative">
                <div className="flex gap-2">
                    <div className="flex flex-wrap gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl p-2 min-h-[44px] flex-1">
                    {/* Display added tags */}
                    {beefData.tags.map((tag) => (
                      <motion.div
                        key={tag}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1 brand-gradient text-black px-2 py-1 rounded-full text-xs font-bold"
                      >
                        <span>#{tag}</span>
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:bg-black/20 rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                    
                    {/* Input field with ghost text */}
                    {beefData.tags.length < 10 && (
                      <div className="flex-1 min-w-[120px] relative">
                        {/* Ghost text overlay — shows predicted completion */}
                        {suggestedTags[0] && tagInput && (
                          <span className="absolute inset-0 flex items-center text-sm pointer-events-none select-none">
                            <span className="invisible">{tagInput.replace(/^[#$]/, '')}</span>
                            <span className="text-gray-600">{suggestedTags[0].slice(tagInput.replace(/^[#$]/, '').length)}</span>
                          </span>
                        )}
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => handleTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            // Tab or ArrowRight accepts ghost prediction
                            if ((e.key === 'Tab' || e.key === 'ArrowRight') && suggestedTags[0] && tagInput) {
                              e.preventDefault();
                              addTag(suggestedTags[0]);
                              return;
                            }
                            handleTagKeyDown(e);
                          }}
                          onFocus={handleTagFocus}
                          onBlur={handleTagBlur}
                          placeholder={beefData.tags.length === 0 ? "Tape un mot..." : "Ajouter..."}
                          className="w-full bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none relative z-10"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* SMS-style prediction row — horizontal pills, no dropdown */}
                {suggestedTags.length > 0 && beefData.tags.length < 10 && (
                  <div className="flex items-center gap-1.5 mt-2 overflow-x-auto hide-scrollbar pb-0.5">
                    {suggestedTags.map((tag, i) => (
                      <button
                        key={tag}
                        onMouseDown={() => addTag(tag)}
                        className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all
                          ${i === 0 && tagInput
                            ? 'bg-brand-500/25 border border-brand-500/50 text-brand-300'
                            : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-brand-500/40 hover:text-brand-300'
                          }`}
                      >
                        <span className="text-brand-400/70">#</span>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

              <p className="text-gray-500 text-xs mt-2">
                {beefData.tags.length}/10 tags{suggestedTags[0] && tagInput ? ' · Tab pour accepter' : ''}
              </p>
              </div>{/* closes relative */}
            </div>{/* closes tag section */}

            {/* Date de démarrage (optionnel = maintenant, rempli = programmé) */}
            <div>
              <label className="block text-white font-semibold mb-2 flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-blue-400" />
                Date de démarrage (optionnelle)
              </label>
              <input
                type="datetime-local"
                value={beefData.scheduled_at}
                onChange={(e) => updateData('scheduled_at', e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-gray-400 text-xs mt-1">
                {beefData.scheduled_at ? '📅 Le beef sera programmé' : '🔴 Le beef démarre après validation'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Step 2: Add Participants */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-white font-semibold mb-2 text-sm">
                Inviter les participants
              </label>
              <p className="text-gray-400 text-xs mb-3">
                Cherche et invite les personnes concernées par ce beef
              </p>
              
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    searchUsers(e.target.value);
                  }}
                  placeholder="Rechercher un utilisateur..."
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 bg-black/60 border border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => addParticipant(result, beefData.participants.length < 2)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-white font-bold text-sm">
                        {result.display_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{result.display_name || result.username}</p>
                        <p className="text-gray-400 text-xs truncate">@{result.username}</p>
                      </div>
                      <UserPlus className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Added Participants */}
            {beefData.participants.length > 0 && (
              <div>
                <label className="block text-white font-semibold mb-2 text-sm">
                  Participants invités ({beefData.participants.length})
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {beefData.participants.map((participant) => (
                    <div
                      key={participant.user_id}
                      className="flex items-center gap-2 p-2 bg-black/40 border border-gray-700 rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-white font-bold text-sm">
                        {participant.display_name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{participant.display_name}</p>
                        <p className="text-gray-400 text-xs truncate">@{participant.username}</p>
                      </div>
                      <button
                        onClick={() => toggleMainParticipant(participant.user_id)}
                        className={`px-2 py-1 rounded-full text-xs font-bold transition-all flex-shrink-0 ${
                          participant.is_main
                            ? 'bg-brand-500 text-black'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {participant.is_main ? '🔥 Principal' : 'Témoin'}
                      </button>
                      <button
                        onClick={() => removeParticipant(participant.user_id)}
                        className="p-1 hover:bg-red-500/20 rounded-lg transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>

                {mainParticipants.length < 2 && (
                  <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Il faut au moins 2 participants principaux
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3: Description & Summary */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="create-beef-description" className="block text-white font-semibold mb-2 flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-purple-400" aria-hidden />
                Contexte du conflit
              </label>
              <p className="text-gray-400 text-xs mb-2">
                Expliquez la situation pour que le médiateur puisse aider efficacement.
              </p>
              <textarea
                id="create-beef-description"
                value={beefData.description}
                onChange={(e) => { updateData('description', e.target.value); setFieldErrors(p => { const n = {...p}; delete n.description; return n; }); }}
                placeholder="Décrivez le conflit : Que s'est-il passé ? Quels sont les enjeux ? Qu'attendez-vous de cette médiation ?"
                rows={10}
                className={`w-full bg-white/[0.04] border rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none transition-colors resize-y ${fieldErrors.description ? 'border-red-500' : 'border-white/[0.06] focus:border-brand-500'}`}
                maxLength={1000}
              />
              <div className="flex items-center justify-between mt-2">
                <p className={`text-xs font-semibold ${
                  beefData.description.length < 50 
                    ? 'text-red-400' 
                    : beefData.description.length < 100 
                    ? 'text-yellow-400' 
                    : 'text-green-400'
                }`}>
                  {beefData.description.length < 50 
                    ? `⚠️ Minimum 50 caractères (${50 - beefData.description.length} restants)`
                    : `✓ ${beefData.description.length} caractères`}
                </p>
                <p className="text-gray-500 text-xs">
                  {beefData.description.length}/1000 max
                </p>
              </div>
            </div>

            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
              <p className="text-gray-300 text-sm leading-relaxed">
                Après les premières minutes gratuites en direct, les spectateurs peuvent débloquer la suite avec des points.
                Ton palier actuel pour ce beef :{' '}
                <span className="text-brand-400 font-bold">
                  {estimatedSuitePrice === null ? '…' : `${estimatedSuitePrice} pts`}
                </span>
                {' '}(fixé au lancement du chrono ; il augmente avec tes beefs résolus).
              </p>
            </div>

            {/* Scheduled Option - Only show if not already scheduled */}
            {!beefData.scheduled_at && (
              <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={beefData.is_scheduled}
                    onChange={(e) => updateData('is_scheduled', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-white font-semibold flex items-center gap-2 text-sm">
                      <span>📅</span>
                      Programmer pour plus tard
                    </span>
                    <p className="text-gray-400 text-xs">Comme Twitter Spaces - programmez une date/heure</p>
                  </div>
                </label>
                {beefData.is_scheduled && (
                  <div className="mt-2">
                    <label className="block text-white font-semibold mb-1 text-xs">Date et heure de démarrage</label>
                    <input
                      type="datetime-local"
                      value={beefData.scheduled_at}
                      onChange={(e) => updateData('scheduled_at', e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3">
              <p className="text-brand-400 font-bold mb-2 text-sm">📋 Récapitulatif</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Titre:</span>
                  <span className="text-white font-semibold truncate ml-2 max-w-[60%]">{beefData.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tags:</span>
                  <span className="text-white font-semibold">{beefData.tags.length}</span>
                </div>
                {beefData.scheduled_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Démarrage:</span>
                    <span className="text-blue-400 font-semibold">
                      {new Date(beefData.scheduled_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Participants:</span>
                  <span className="text-white font-semibold">{beefData.participants.length}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Field errors summary — only show non-empty errors */}
        {Object.values(fieldErrors).some(e => e) && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/40 rounded-xl space-y-1">
            {Object.values(fieldErrors).filter(e => e).map((err, i) => (
              <p key={i} className="text-red-400 text-xs flex items-start gap-1.5">
                <span className="mt-0.5">⚠️</span>
                <span>{err}</span>
              </p>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          {step > 1 && (
            <button
              onClick={() => { setStep(step - 1); setFieldErrors({}); }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              ← Retour
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={handleNext}
              className="flex-1 brand-gradient hover:opacity-90 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
            >
              Continuer
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 brand-gradient hover:opacity-90 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Création en cours...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>🔥 Créer &amp; Envoyer les invitations</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-400 text-xs">
            💡 <strong>Champs obligatoires:</strong> Titre (étape 1), Tags (étape 1), Description 50+ caractères (étape 3).
          </p>
        </div>
        </motion.div>
      </div>
    </div>
  );
}
