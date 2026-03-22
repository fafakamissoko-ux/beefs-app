'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Users, Search, TrendingUp, Clock } from 'lucide-react';

export default function BrowsePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Mock data - would come from database
  const rooms = [
    {
      id: 'demo',
      title: 'IA vs Humains: Qui dominera en 2030?',
      host: 'TechDebater',
      hostAvatar: '🤖',
      viewers: 234,
      tension: 78,
      category: 'Tech',
      isLive: true,
      duration: '1h 23min',
    },
    {
      id: 'room1',
      title: 'Bitcoin: Bulle spéculative ou Révolution financière?',
      host: 'CryptoKing',
      hostAvatar: '₿',
      viewers: 189,
      tension: 92,
      category: 'Finance',
      isLive: true,
      duration: '45min',
    },
    {
      id: 'room2',
      title: 'Voitures Électriques: Solution ou Problème?',
      host: 'EcoWarrior',
      hostAvatar: '🌱',
      viewers: 156,
      tension: 45,
      category: 'Environnement',
      isLive: true,
      duration: '2h 10min',
    },
    {
      id: 'room3',
      title: 'Réseaux Sociaux: Addiction ou Connexion?',
      host: 'SocialGuru',
      hostAvatar: '📱',
      viewers: 423,
      tension: 67,
      category: 'Société',
      isLive: true,
      duration: '30min',
    },
    {
      id: 'room4',
      title: 'Gaming Compétitif: Sport ou Divertissement?',
      host: 'ProGamer',
      hostAvatar: '🎮',
      viewers: 512,
      tension: 83,
      category: 'Gaming',
      isLive: true,
      duration: '1h 05min',
    },
    {
      id: 'room5',
      title: 'Changement Climatique: Agir maintenant ou trop tard?',
      host: 'ClimateActivist',
      hostAvatar: '🌍',
      viewers: 298,
      tension: 71,
      category: 'Environnement',
      isLive: true,
      duration: '55min',
    },
  ];

  const categories = [
    { id: 'all', label: 'Tout', icon: '🌐' },
    { id: 'Tech', label: 'Tech', icon: '💻' },
    { id: 'Finance', label: 'Finance', icon: '💰' },
    { id: 'Environnement', label: 'Environnement', icon: '🌱' },
    { id: 'Société', label: 'Société', icon: '👥' },
    { id: 'Gaming', label: 'Gaming', icon: '🎮' },
  ];

  const filteredRooms = rooms.filter((room) => {
    const matchesSearch = room.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || room.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-arena-darker via-arena-dark to-black">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8 text-arena-blue" />
            <h1 className="text-5xl font-black">
              <span className="text-white">Explorer les </span>
              <span className="bg-gradient-to-r from-arena-blue to-arena-purple bg-clip-text text-transparent">
                Arènes
              </span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            {rooms.length} débats en direct • {rooms.reduce((sum, r) => sum + r.viewers, 0)} spectateurs connectés
          </p>
        </motion.div>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher un débat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-arena-blue focus:outline-none transition-colors text-white placeholder-gray-500"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === category.id
                    ? 'bg-arena-blue text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Rooms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRooms.map((room, index) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link
                href={`/arena/${room.id}`}
                className="group block bg-white/5 border border-white/10 hover:border-arena-blue rounded-xl overflow-hidden transition-all hover:scale-105 hover:shadow-xl hover:shadow-arena-blue/20"
              >
                {/* Header */}
                <div className="p-4 bg-gradient-to-br from-arena-blue/10 to-arena-purple/10 border-b border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    {/* Live Badge */}
                    {room.isLive && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold text-red-400">EN DIRECT</span>
                      </div>
                    )}

                    {/* Duration */}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{room.duration}</span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold line-clamp-2 group-hover:text-arena-blue transition-colors leading-tight">
                    {room.title}
                  </h3>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  {/* Host */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-lg">
                      {room.hostAvatar}
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Host</div>
                      <div className="font-semibold text-sm">{room.host}</div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Users className="w-4 h-4" />
                      <span>{room.viewers}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Flame className={`w-4 h-4 ${room.tension > 70 ? 'text-red-400' : 'text-yellow-400'}`} />
                      <span className={room.tension > 70 ? 'text-red-400' : 'text-yellow-400'}>
                        {room.tension}%
                      </span>
                    </div>
                  </div>

                  {/* Tension Bar */}
                  <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${room.tension}%` }}
                      transition={{ duration: 1, delay: index * 0.1 }}
                      className={`absolute inset-y-0 left-0 ${
                        room.tension > 70
                          ? 'bg-gradient-to-r from-brand-400 to-red-500'
                          : 'bg-gradient-to-r from-yellow-500 to-brand-400'
                      }`}
                    />
                  </div>

                  {/* Category Badge */}
                  <div className="flex justify-between items-center">
                    <span className="px-3 py-1 bg-arena-dark rounded-full text-xs font-bold">
                      {room.category}
                    </span>
                    <span className="text-xs text-arena-blue group-hover:translate-x-1 transition-transform inline-block">
                      Rejoindre →
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* No Results */}
        {filteredRooms.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold mb-2">Aucun débat trouvé</h3>
            <p className="text-gray-400">
              Essayez de modifier votre recherche ou vos filtres
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
