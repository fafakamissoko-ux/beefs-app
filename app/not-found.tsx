import Link from 'next/link';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-arena-darker flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* 404 Animation */}
        <div className="mb-8">
          <h1 className="text-9xl font-black mb-4">
            <span className="neon-blue">4</span>
            <span className="neon-red">0</span>
            <span className="neon-purple">4</span>
          </h1>
          <div className="text-2xl font-bold text-gray-400 mb-2">
            Arena Introuvable
          </div>
          <p className="text-gray-500">
            Cette page a été éliminée du débat
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-arena-blue hover:bg-arena-blue/80 text-arena-dark font-bold rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Accueil
          </Link>
          
          <Link
            href="/browse"
            className="px-6 py-3 bg-arena-gray hover:bg-arena-dark text-white font-bold rounded-lg transition-all border-2 border-arena-blue flex items-center justify-center gap-2"
          >
            <Search className="w-5 h-5" />
            Explorer
          </Link>
        </div>

        {/* Fun Quote */}
        <div className="mt-12 text-sm text-gray-600 italic">
          "Dans cette arène, seuls les débats les plus intenses survivent."
        </div>
      </div>
    </div>
  );
}
