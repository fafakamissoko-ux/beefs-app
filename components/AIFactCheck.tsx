'use client';

import { useState } from 'react';
import { Brain, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'misleading' | 'needs-context';
  explanation: string;
  sources?: string[];
  timestamp: string;
}

interface AIFactCheckProps {
  roomId: string;
  onFactCheckComplete?: (result: FactCheckResult) => void;
}

export function AIFactCheck({ roomId, onFactCheckComplete }: AIFactCheckProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [currentCheck, setCurrentCheck] = useState<FactCheckResult | null>(null);
  const [transcript, setTranscript] = useState('');

  const runFactCheck = async () => {
    if (!transcript.trim()) return;
    
    setIsChecking(true);

    try {
      // Call AI API (OpenAI/Claude)
      const response = await fetch('/api/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          transcript,
        }),
      });

      const result = await response.json();
      
      setCurrentCheck(result);
      setTranscript('');
      
      if (onFactCheckComplete) {
        onFactCheckComplete(result);
      }

      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        setCurrentCheck(null);
      }, 10000);

    } catch (error) {
      console.error('Fact-check error:', error);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Input Simulator (simulating audio transcript) */}
      <div className="bg-arena-dark p-4 rounded-lg border border-arena-gray">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-arena-purple" />
          <h3 className="font-bold">AI FACT-CHECK</h3>
        </div>
        
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Simuler une transcription audio pour le fact-checking..."
          className="w-full bg-arena-darker border border-arena-gray rounded p-3 text-sm mb-3 resize-none focus:outline-none focus:border-arena-purple"
          rows={3}
        />
        
        <button
          onClick={runFactCheck}
          disabled={isChecking || !transcript.trim()}
          className={`w-full py-2 rounded-lg font-bold transition-all ${
            isChecking 
              ? 'bg-arena-gray text-gray-500 cursor-not-allowed' 
              : 'bg-arena-purple hover:bg-arena-purple/80 text-white'
          }`}
        >
          {isChecking ? 'Vérification en cours...' : 'Lancer Fact-Check'}
        </button>
      </div>

      {/* Fact-Check Results */}
      <AnimatePresence>
        {currentCheck && (
          <FactCheckCard result={currentCheck} onDismiss={() => setCurrentCheck(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FactCheckCard({ 
  result, 
  onDismiss 
}: { 
  result: FactCheckResult; 
  onDismiss: () => void;
}) {
  const verdictConfig = {
    true: {
      icon: CheckCircle2,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
      border: 'border-green-400/30',
      label: 'VÉRIFIÉ',
    },
    false: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      border: 'border-red-400/30',
      label: 'FAUX',
    },
    misleading: {
      icon: AlertTriangle,
      color: 'text-yellow-400',
      bg: 'bg-yellow-400/10',
      border: 'border-yellow-400/30',
      label: 'TROMPEUR',
    },
    'needs-context': {
      icon: AlertTriangle,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      border: 'border-blue-400/30',
      label: 'CONTEXTE REQUIS',
    },
  };

  const config = verdictConfig[result.verdict];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className={`${config.bg} ${config.border} border-2 rounded-xl p-4 shadow-lg`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-6 h-6 ${config.color} flex-shrink-0 mt-1`} />
        
        <div className="flex-1">
          <div className={`${config.color} font-black text-sm mb-2`}>
            {config.label}
          </div>
          
          <div className="text-sm mb-2 font-medium">
            "{result.claim}"
          </div>
          
          <div className="text-sm text-gray-300 mb-3">
            {result.explanation}
          </div>

          {result.sources && result.sources.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-500">Sources :</div>
              {result.sources.map((source, i) => (
                <a
                  key={i}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-arena-blue hover:underline block truncate"
                >
                  {source}
                </a>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-white transition-colors"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
