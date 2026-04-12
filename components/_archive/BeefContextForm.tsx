import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Calendar, AlertTriangle, FileText, X, ArrowRight } from 'lucide-react';

interface BeefContext {
  subject: string;
  origin: string;
  date: string;
  severity: number; // 1-10
  description: string;
  opponent: string;
  opponentAccepted: boolean;
}

interface BeefContextFormProps {
  onSubmit: (context: BeefContext) => void;
  onCancel: () => void;
}

export function BeefContextForm({ onSubmit, onCancel }: BeefContextFormProps) {
  const [step, setStep] = useState(1);
  const [context, setContext] = useState<BeefContext>({
    subject: '',
    origin: '',
    date: '',
    severity: 5,
    description: '',
    opponent: '',
    opponentAccepted: false,
  });

  const updateContext = (field: keyof BeefContext, value: any) => {
    setContext({ ...context, [field]: value });
  };

  const handleSubmit = () => {
    if (context.subject && context.origin && context.opponent) {
      onSubmit(context);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return context.subject.trim().length > 3;
      case 2:
        return context.opponent.trim().length > 1 && context.origin.trim().length > 3;
      case 3:
        return context.description.trim().length > 10;
      default:
        return false;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-2xl w-full border-2 border-brand-500/50 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 brand-gradient rounded-full flex items-center justify-center">
              🔥
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Expose ton beef</h2>
              <p className="text-gray-400 text-sm">Étape {step}/3</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
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

        {/* Step 1: Le conflit */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <label className="block text-white font-bold mb-2 flex items-center gap-2">
                <Flame className="w-5 h-5 text-red-500" />
                C'est quoi le sujet du conflit ?
              </label>
              <input
                type="text"
                value={context.subject}
                onChange={(e) => updateContext('subject', e.target.value)}
                placeholder="Ex: Il a volé mon idée de business"
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                maxLength={100}
              />
              <p className="text-gray-500 text-xs mt-1">
                {context.subject.length}/100 caractères
              </p>
            </div>

            <div>
              <label className="block text-white font-bold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Gravité du conflit
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={context.severity}
                  onChange={(e) => updateContext('severity', Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #E83A14 0%, #FF6B2C ${context.severity * 10}%, #374151 ${context.severity * 10}%, #374151 100%)`
                  }}
                />
                <span className="text-white font-black text-2xl w-12 text-center">
                  {context.severity}
                </span>
              </div>
              <p className="text-gray-400 text-sm mt-2">
                {context.severity <= 3 && '🟢 Désaccord léger'}
                {context.severity > 3 && context.severity <= 6 && '🟡 Conflit modéré'}
                {context.severity > 6 && context.severity <= 8 && '🟠 Conflit sérieux'}
                {context.severity > 8 && '🔴 Conflit grave'}
              </p>
            </div>
          </motion.div>
        )}

        {/* Step 2: Les personnes */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <label className="block text-white font-bold mb-2">
                Avec qui tu es en conflit ?
              </label>
              <input
                type="text"
                value={context.opponent}
                onChange={(e) => updateContext('opponent', e.target.value)}
                placeholder="@username ou nom complet"
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
              <p className="text-gray-500 text-xs mt-1">
                💡 Si la personne a un compte Beefs, elle recevra une notification
              </p>
            </div>

            <div>
              <label className="block text-white font-bold mb-2 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                Ça a commencé quand ?
              </label>
              <input
                type="text"
                value={context.origin}
                onChange={(e) => updateContext('origin', e.target.value)}
                placeholder="Ex: Début janvier 2026, après notre réunion"
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-white font-bold mb-2">
                Date exacte (optionnel)
              </label>
              <input
                type="date"
                value={context.date}
                onChange={(e) => updateContext('date', e.target.value)}
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </motion.div>
        )}

        {/* Step 3: Les détails */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div>
              <label className="block text-white font-bold mb-2 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                Raconte ta version des faits
              </label>
              <textarea
                value={context.description}
                onChange={(e) => updateContext('description', e.target.value)}
                placeholder="Explique en détails ce qui s'est passé, ta version, pourquoi tu veux régler ce conflit..."
                rows={6}
                className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
                maxLength={1000}
              />
              <p className="text-gray-500 text-xs mt-1">
                {context.description.length}/1000 caractères
              </p>
            </div>

            {/* Summary */}
            <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
              <p className="text-brand-400 font-bold mb-3">📋 Récapitulatif</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Sujet:</span>
                  <span className="text-white font-semibold">{context.subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Adversaire:</span>
                  <span className="text-white font-semibold">{context.opponent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Gravité:</span>
                  <span className="text-white font-semibold">{context.severity}/10</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Origine:</span>
                  <span className="text-white font-semibold">{context.origin}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Retour
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1 brand-gradient hover:opacity-90 text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              Continuer
              <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed()}
              className="flex-1 brand-gradient hover:opacity-90 text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              Créer la session
              <Flame className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-400 text-xs">
            💡 <strong>Prochaine étape:</strong> {context.opponent} recevra une notification pour accepter/refuser la session. Si accepté, un médiateur sera assigné automatiquement.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
