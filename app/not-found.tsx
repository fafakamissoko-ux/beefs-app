import Link from 'next/link';
import { Home, Search, Flame } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="relative inline-block mb-6">
            <h1 className="text-[120px] font-black leading-none tracking-tighter text-gradient">
              404
            </h1>
            <Flame className="absolute -top-2 -right-4 w-10 h-10 text-brand-400 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Page introuvable
          </h2>
          <p className="text-gray-500 text-sm">
            Ce beef a été résolu ou n'existe pas encore.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/feed"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white rounded-xl transition-all active:scale-[0.97] brand-gradient hover:shadow-glow"
          >
            <Home className="w-4 h-4" />
            Accueil
          </Link>
          <Link
            href="/feed"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-gray-300 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Search className="w-4 h-4" />
            Explorer
          </Link>
        </div>
      </div>
    </div>
  );
}
