'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, ArrowLeft, Globe } from 'lucide-react';
import Link from 'next/link';
import { getStripe, POINT_PACKS } from '@/lib/stripe/client';
import { supabase } from '@/lib/supabase/client';
import { useCountryDetection } from '@/hooks/useCountryDetection';
import { calculatePrice } from '@/lib/geo';

export default function BuyPointsPage() {
  const router = useRouter();
  const [selectedPack, setSelectedPack] = useState<string>(POINT_PACKS[1].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { country, loading: countryLoading, testMode } = useCountryDetection();

  const handlePurchase = async () => {
    setLoading(true);
    setError('');

    try {
      // Get user session for userId
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packId: selectedPack,
          userId: session?.user?.id || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout (modern method)
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Une erreur est survenue');
      setLoading(false);
    }
  };

  const selectedPackData = POINT_PACKS.find(p => p.id === selectedPack);

  return (
    <div className="min-h-screen bg-black">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-orange-500/10 via-black to-red-500/10"></div>
      
      <div className="relative max-w-md mx-auto px-4 py-8">
        {/* Back Button */}
        <Link
          href="/live"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-semibold">Retour</span>
        </Link>

        {/* Header - Épuré */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-orange-500/50"
          >
            <Sparkles className="w-12 h-12 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-white mb-3">Acheter des Points</h1>
          <p className="text-gray-400 text-lg">Choisis ton pack</p>
          
          {/* Country Detection Badge */}
          {!countryLoading && (
            <>
              {testMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 inline-flex items-center gap-2 bg-yellow-500/20 border border-yellow-500/30 rounded-full px-4 py-2"
                >
                  <span className="text-2xl">🧪</span>
                  <span className="text-yellow-400 text-sm font-bold">
                    MODE TEST: {country.name}
                  </span>
                </motion.div>
              )}
              {!testMode && country.code !== 'FR' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 rounded-full px-4 py-2"
                >
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-400 text-sm font-semibold">
                    Prix adaptés pour {country.name}
                  </span>
                </motion.div>
              )}
            </>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-2xl text-red-400 text-center"
          >
            {error}
          </motion.div>
        )}

        {/* Point Packs - Style TikTok Coins */}
        <div className="space-y-4 mb-8">
          {POINT_PACKS.map((pack, index) => {
            const isSelected = selectedPack === pack.id;
            const pointsWithBonus = Math.floor(pack.points * (1 + pack.bonus / 100));
            
            // Calculate adapted price
            const adaptedPrice = countryLoading ? null : calculatePrice(pack.price, country);

            return (
              <motion.button
                key={pack.id}
                onClick={() => setSelectedPack(pack.id)}
                disabled={loading || countryLoading}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative w-full p-6 rounded-3xl transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 shadow-2xl shadow-orange-500/50'
                    : 'bg-gray-900 border-2 border-gray-800 hover:border-gray-700'
                } ${loading || countryLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {/* Popular Badge */}
                {pack.popular && (
                  <div className="absolute -top-2 -right-2 bg-yellow-400 text-black text-xs font-black px-3 py-1 rounded-full flex items-center gap-1 shadow-lg">
                    <Zap className="w-3 h-3" />
                    BEST
                  </div>
                )}

                <div className="flex items-center justify-between">
                  {/* Left: Icon + Points */}
                  <div className="flex items-center gap-4">
                    <div className={`text-5xl ${isSelected ? '' : 'opacity-70'}`}>
                      {pack.emoji}
                    </div>
                    <div>
                      <div className={`text-sm font-bold uppercase tracking-wide ${isSelected ? 'text-white/90' : 'text-gray-400'}`}>
                        {pack.name}
                      </div>
                      <div className={`text-3xl font-black ${isSelected ? 'text-white' : 'text-white'}`}>
                        {pack.points.toLocaleString()}
                      </div>
                      {pack.bonus > 0 && (
                        <div className={`text-sm font-bold ${isSelected ? 'text-black/80' : 'text-green-400'}`}>
                          +{pack.bonus}% bonus
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Price + Check */}
                  <div className="text-right">
                    <div className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-orange-400'}`}>
                      {countryLoading ? (
                        <div className="animate-pulse">...</div>
                      ) : adaptedPrice ? (
                        adaptedPrice.formatted
                      ) : (
                        `${pack.price.toFixed(2)}€`
                      )}
                    </div>
                    {/* Show original price if different */}
                    {!countryLoading && adaptedPrice && adaptedPrice.currency !== 'EUR' && (
                      <div className={`text-xs ${isSelected ? 'text-black/60' : 'text-gray-500'} line-through`}>
                        {pack.price.toFixed(2)}€
                      </div>
                    )}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="mt-2 w-8 h-8 bg-white rounded-full flex items-center justify-center mx-auto"
                      >
                        <Check className="w-5 h-5 text-orange-500" />
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Purchase Button - Gros et attractif */}
        <motion.button
          onClick={handlePurchase}
          disabled={loading || countryLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-6 rounded-3xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xl shadow-orange-500/50 text-xl"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Chargement...</span>
            </div>
          ) : countryLoading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Détection du pays...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="w-6 h-6" />
              <span>
                Acheter {selectedPackData && calculatePrice(selectedPackData.price, country).formatted}
              </span>
            </div>
          )}
        </motion.button>

        {/* Security - Minimaliste */}
        <p className="text-center text-gray-600 text-sm mt-6">
          🔒 Paiement sécurisé
        </p>
      </div>
    </div>
  );
}
