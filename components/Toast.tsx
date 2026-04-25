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
  success:
    'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.35),0_0_56px_-8px_rgba(16,185,129,0.22),inset_0_0_0_1px_rgba(16,185,129,0.12)]',
  error:
    'border border-ember-500/40 bg-red-950/25 text-red-100 shadow-[0_0_32px_rgba(255,77,0,0.4),0_0_48px_-6px_rgba(239,68,68,0.28),inset_0_0_0_1px_rgba(255,77,0,0.12)]',
  info: 'border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.2)]',
};
const emberVariant =
  'border border-ember-500/40 bg-ember-500/12 text-amber-100 shadow-[0_0_32px_rgba(255,77,0,0.45),0_0_52px_-8px_rgba(255,100,50,0.2),inset_0_0_0_1px_rgba(255,77,0,0.12)]';

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
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className={`pointer-events-auto flex items-center gap-3 rounded-[2.5rem] px-5 py-4 backdrop-blur-3xl ${variant}`}
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
