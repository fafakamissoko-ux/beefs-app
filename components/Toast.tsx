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
};

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastOptions['action'];
  durationMs: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const id = Date.now().toString();
    const durationMs =
      options?.durationMs ??
      (options?.action ? 10_000 : 4000);
    setToasts(prev => [...prev, { id, type, message, action: options?.action, durationMs }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const icons = {
    success: <Check className="w-4 h-4" />,
    error: <AlertCircle className="w-4 h-4" />,
    info: <Info className="w-4 h-4" />,
  };

  const styles = {
    success: { bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.25)', color: '#4ade80' },
    error: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', color: '#f87171' },
    info: { bg: 'rgba(0, 229, 255, 0.1)', border: 'rgba(0, 229, 255, 0.2)', color: '#67e8f9' },
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-16 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl backdrop-blur-xl shadow-modal"
              style={{ background: styles[t.type].bg, border: `1px solid ${styles[t.type].border}` }}
            >
              <span style={{ color: styles[t.type].color }}>{icons[t.type]}</span>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <p className="text-sm font-medium text-white">{t.message}</p>
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
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
