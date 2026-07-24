'use client';

import { createContext, useContext, useCallback } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';
import { Check, X, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export type ToastOptions = {
  /** Identifiant unique pour éviter le spam (déduplication). */
  id?: string | number;
  /** Bouton secondaire (ex. aller acheter des points). */
  action?: { label: string; onClick: () => void };
  /** Durée avant fermeture auto (défaut 4 s, 10 s si action). */
  durationMs?: number;
  /** Accent visuel (ex. notifications tour de parole). */
  tone?: 'default' | 'ember';
};

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
  const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions) => {
    const isEmber = options?.tone === 'ember';
    const variantClass = isEmber ? emberVariant : toastVariants[type];
    const durationMs = options?.durationMs ?? (options?.action ? 10_000 : 4000);

    const icons = {
      success: <Check className="w-4 h-4" strokeWidth={1.5} />,
      error: <AlertCircle className="w-4 h-4" strokeWidth={1.5} />,
      info: <Info className="w-4 h-4" strokeWidth={1.5} />,
    };

    // Injection custom pour préserver le design system Premium Glass
    sonnerToast.custom(
      (id) => (
        <div className={`pointer-events-auto flex items-center gap-3 w-full sm:w-[384px] rounded-[2.5rem] px-5 py-4 backdrop-blur-3xl ${variantClass}`}>
          <span>{icons[type]}</span>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className={`text-sm font-medium ${isEmber ? 'text-amber-50/95' : 'text-white'}`}>
              {message}
            </p>
            {options?.action && (
              <button
                type="button"
                onClick={() => {
                  options.action?.onClick();
                  sonnerToast.dismiss(id);
                }}
                className="self-start px-3 py-1.5 rounded-lg text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors"
              >
                {options.action.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => sonnerToast.dismiss(id)}
            className="text-gray-500 hover:text-white transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ),
      { duration: durationMs, id: options?.id }
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Moteur Sonner invisible avec gestion de queue native */}
      <Toaster position="top-right" expand={false} visibleToasts={3} offset="4rem" />
    </ToastContext.Provider>
  );
}
