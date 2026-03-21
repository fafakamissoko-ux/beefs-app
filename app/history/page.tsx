'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Search,
  Filter,
  Clock,
  Users,
  TrendingUp,
  Bookmark,
  Share2,
  Quote,
  Zap,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';

interface DebateReplay {
  id: string;
  title: string;
  host: string;
  challenger: string;
  date: Date;
  duration: string;
  viewers: number;
  thumbnail: string;
  category: string;
  // INNOVATION: AI-powered highlights
  highlights: {
    timestamp: string;
    description: string;
    type: 'argument' | 'comeback' | 'fact' | 'emotional';
  }[];
  // INNOVATION: Searchable quotes
  topQuotes: {
    text: string;
    speaker: string;
    timestamp: string;
    reactions: number;
  }[];
  winner?: string;
  saved: boolean;
}

export default function HistoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'saved' | 'recent' | 'trending'>(
    'all'
  );
  const [showFilters, setShowFilters] = useState(false);

  // Mock debate replays
  const debates: DebateReplay[] = [
    {
      id: '1',
      title: 'IA vs Emploi: Le grand débat',
      host: 'TechExpert',
      challenger: 'EcoActivist',
      date: new Date(Date.now() - 86400000 * 2),
      duration: '48:32',
      viewers: 3240,
      thumbnail: '🤖',
      category: 'Tech',
      highlights: [
        {
          timestamp: '08:15',
          description: 'Argument clé: 47% des emplois menacés par l\'automatisation',
          type: 'fact',
        },
        {
          timestamp: '23:40',
          description: 'Comeback puissant sur les nouvelles opportunités créées',
          type: 'comeback',
        },
        {
          timestamp: '41:22',
          description: 'Moment émotionnel sur l\'avenir des travailleurs',
          type: 'emotional',
        },
      ],
      topQuotes: [
        {
          text: 'L\'IA ne remplace pas les humains, elle les augmente',
          speaker: 'TechExpert',
          timestamp: '15:32',
          reactions: 234,
        },
        {
          text: 'Mais qui paiera les factures pendant la transition ?',
          speaker: 'EcoActivist',
          timestamp: '28:45',
          reactions: 189,
        },
      ],
      winner: 'TechExpert',
      saved: true,
    },
    {
      id: '2',
      title: 'Crypto: Avenir ou Arnaque?',
      host: 'CryptoKing',
      challenger: 'FinanceExpert',
      date: new Date(Date.now() - 86400000 * 5),
      duration: '56:18',
      viewers: 2890,
      thumbnail: '₿',
      category: 'Finance',
      highlights: [
        {
          timestamp: '12:30',
          description: 'Analyse technique de la blockchain',
          type: 'argument',
        },
        {
          timestamp: '34:12',
          description: 'Révélation sur les cas d\'usage réels',
          type: 'fact',
        },
      ],
      topQuotes: [
        {
          text: 'Le Bitcoin c\'est la liberté financière',
          speaker: 'CryptoKing',
          timestamp: '19:23',
          reactions: 312,
        },
      ],
      winner: 'CryptoKing',
      saved: false,
    },
    {
      id: '3',
      title: 'Réseaux Sociaux: Addiction ou Connexion?',
      host: 'SocialGuru',
      challenger: 'PsychoDoc',
      date: new Date(Date.now() - 86400000 * 7),
      duration: '42:15',
      viewers: 4120,
      thumbnail: '📱',
      category: 'Société',
      highlights: [
        {
          timestamp: '05:45',
          description: 'Statistiques choc sur le temps d\'écran',
          type: 'fact',
        },
        {
          timestamp: '28:30',
          description: 'Témoignage personnel bouleversant',
          type: 'emotional',
        },
      ],
      topQuotes: [
        {
          text: 'Nous sommes devenus des produits, pas des utilisateurs',
          speaker: 'PsychoDoc',
          timestamp: '22:10',
          reactions: 456,
        },
      ],
      saved: true,
    },
  ];

  // INNOVATION: Search in quotes and timestamps
  const filteredDebates = debates.filter((debate) => {
    const matchesSearch =
      searchQuery === '' ||
      debate.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      debate.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      debate.challenger.toLowerCase().includes(searchQuery.toLowerCase()) ||
      debate.topQuotes.some((quote) =>
        quote.text.toLowerCase().includes(searchQuery.toLowerCase())
      );

    const matchesFilter =
      filterCategory === 'all' ||
      (filterCategory === 'saved' && debate.saved) ||
      (filterCategory === 'recent' && debate.date.getTime() > Date.now() - 86400000 * 7) ||
      (filterCategory === 'trending' && debate.viewers > 3000);

    return matchesSearch && matchesFilter;
  });

  const toggleSaved = (id: string) => {
    // In real app, this would update the database
    console.log('Toggle saved:', id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white mb-2">📺 Historique & Rediffusions</h1>
          <p className="text-gray-400">
            Revivez les meilleurs moments et découvrez les débats que vous avez manqués
          </p>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          {/* INNOVATION: Search in quotes */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, débatteur ou citation..."
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
            />
            {searchQuery && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs bg-pink-500/20 text-pink-400 px-2 py-1 rounded-full">
                Recherche intelligente activée
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'Tous', icon: Play },
              { id: 'saved', label: 'Sauvegardés', icon: Bookmark },
              { id: 'recent', label: 'Récents', icon: Clock },
              { id: 'trending', label: 'Populaires', icon: TrendingUp },
            ].map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  key={filter.id}
                  onClick={() => setFilterCategory(filter.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${
                    filterCategory === filter.id
                      ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{filter.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Debates Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredDebates.map((debate, index) => (
            <motion.div
              key={debate.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl overflow-hidden border border-gray-700 hover:border-pink-500 transition-all group"
            >
              {/* Thumbnail */}
              <div className="relative h-48 bg-gradient-to-br from-purple-900 to-pink-900 flex items-center justify-center">
                <div className="text-7xl">{debate.thumbnail}</div>
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all flex items-center justify-center">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </div>
                {/* Duration badge */}
                <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-sm px-2 py-1 rounded text-white text-sm font-semibold">
                  {debate.duration}
                </div>
                {/* Category badge */}
                <div className="absolute top-3 left-3 bg-purple-500/80 backdrop-blur-sm px-3 py-1 rounded-full text-white text-xs font-semibold">
                  {debate.category}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Title */}
                <h3 className="text-xl font-black text-white mb-2 group-hover:text-pink-400 transition-colors">
                  {debate.title}
                </h3>

                {/* Debaters */}
                <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                  <span className="font-semibold text-blue-400">{debate.host}</span>
                  <span>vs</span>
                  <span className="font-semibold text-red-400">{debate.challenger}</span>
                  {debate.winner && (
                    <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                      Gagnant: {debate.winner}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {debate.viewers.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {debate.date.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>

                {/* INNOVATION: AI Highlights */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Moments clés (IA)
                  </h4>
                  <div className="space-y-1">
                    {debate.highlights.slice(0, 2).map((highlight, i) => (
                      <button
                        key={i}
                        className="w-full text-left bg-white/5 hover:bg-white/10 rounded px-3 py-2 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-pink-400">{highlight.timestamp}</span>
                          <span className="text-xs text-gray-300">{highlight.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* INNOVATION: Top Quote */}
                {debate.topQuotes.length > 0 && (
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                      <Quote className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-300 italic mb-1">
                          "{debate.topQuotes[0].text}"
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">- {debate.topQuotes[0].speaker}</span>
                          <span className="text-xs text-pink-400">
                            {debate.topQuotes[0].reactions} réactions
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/replay/${debate.id}`}
                    className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:opacity-80 text-white font-bold py-2 rounded-lg text-center transition-opacity"
                  >
                    Regarder
                  </Link>
                  <button
                    onClick={() => toggleSaved(debate.id)}
                    className={`p-2 rounded-lg transition-all ${
                      debate.saved
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    <Bookmark className={`w-5 h-5 ${debate.saved ? 'fill-current' : ''}`} />
                  </button>
                  <button className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors">
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Empty state */}
        {filteredDebates.length === 0 && (
          <div className="text-center py-20">
            <Play className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-bold text-white mb-2">Aucun débat trouvé</h3>
            <p className="text-gray-400">Essayez de modifier vos filtres ou votre recherche</p>
          </div>
        )}
      </div>
    </div>
  );
}
