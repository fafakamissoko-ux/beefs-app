'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

export type ToastOptions = {
  /** Bouton secondaire (ex. aller acheter des points). */
  action?: { label: string; onClick: () => void };
  /** Durée avant fermeture auto (défaut 4 s, 10 s si `action`). */
  durationMs?: number;
  /** Accent visuel (ex. notifications tour de parole). */
  tone?: 'default' | 'ember';
};

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastOptions['action'];
  durationMs: number;
  tone?: 'default' | 'ember';
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const toastVariants: Record<ToastType, string> = {
  success: 'bg-green-500/[0.12] border border-green-500/25 text-green-400',
  error: 'bg-red-500/[0.12] border border-red-500/25 text-red-400',
  info: 'bg-cyan-400/10 border border-cyan-400/20 text-cyan-300',
};
const emberVariant = 'bg-ember-500/[0.12] border border-ember-500/35 text-amber-200';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = Date.now().toString();
    const durationMs =
      options?.durationMs ??
      (options?.action ? 10_000 : 4000);
    setToasts(prev => [
      ...prev,
      {
        id,
        type,
        message,
        action: options?.action,
        durationMs,
        tone: options?.tone === 'ember' ? 'ember' : 'default',
      },
    ]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = {
    success: <Check className="w-4 h-4" strokeWidth={1} />,
    error: <AlertCircle className="w-4 h-4" strokeWidth={1} />,
    info: <Info className="w-4 h-4" strokeWidth={1} />,
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-16 right-4 z-[99999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(t => {
            const variant = t.tone === 'ember' ? emberVariant : toastVariants[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex items-center gap-3 px-5 py-4 rounded-[2rem] backdrop-blur-2xl shadow-2xl border border-white/5 ${variant}`}
              >
                <span>{icons[t.type]}</span>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <p
                    className={`text-sm font-medium ${t.tone === 'ember' ? 'text-amber-50/95' : 'text-white'}`}
                  >
                    {t.message}
                  </p>
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        removeToast(t.id);
                      }}
                      className="self-start px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => removeToast(t.id)} className="text-gray-500 hover:text-white transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" strokeWidth={1} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
