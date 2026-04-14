'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, Globe } from 'lucide-react';
import Link from 'next/link';
import { AppBackButton } from '@/components/AppBackButton';
import { useToast } from '@/components/Toast';
import { POINT_PACKS } from '@/lib/stripe/client';
import { supabase } from '@/lib/supabase/client';
import { useCountryDetection } from '@/hooks/useCountryDetection';
import { calculatePrice } from '@/lib/geo';
import { isProductionBeefsHostname } from '@/lib/stripe-public-ui';

export default function BuyPointsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedPack, setSelectedPack] = useState<string>(POINT_PACKS[1].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Bandeaux techniques Stripe : jamais sur www.beefs.live (utilisateurs finaux). */
  const [showStripeTestHint, setShowStripeTestHint] = useState(false);
  const [showStripeLiveDevHint, setShowStripeLiveDevHint] = useState(false);
  const { country, loading: countryLoading, testMode } = useCountryDetection();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
    const prodHost = isProductionBeefsHostname(window.location.hostname);
    setShowStripeTestHint(key.startsWith('pk_test') && !prodHost);
    setShowStripeLiveDevHint(key.startsWith('pk_live') && !prodHost);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('purchase') !== 'cancelled') return;
    toast('Paiement annulé. Tu peux réessayer quand tu veux.', 'info');
    router.replace('/buy-points', { scroll: false });
  }, [router, toast]);

  const handlePurchase = async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login?redirect=/buy-points');
        return;
      }
      
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          packId: selectedPack,
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
    <div className="min-h-screen">
      <div className="page-ambient-gradient" aria-hidden />

      <div className="relative z-[1] max-w-md mx-auto px-4 py-8">
        <AppBackButton className="mb-8" />

        {/* Header - Épuré */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 brand-gradient rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-glow"
          >
            <Sparkles className="w-12 h-12 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-white mb-3">Acheter des Points</h1>
          <p className="text-gray-400 text-lg">Choisis ton pack</p>
          <p className="text-gray-500 text-xs mt-4 px-2 leading-relaxed max-w-sm mx-auto">
            Paiement sécurisé par Stripe : carte, Link ; Apple Pay / Google Pay peuvent s’afficher sur la page de paiement selon l’appareil et la config du compte Stripe.
          </p>

          {showStripeLiveDevHint && (
              <p className="text-ember-200/90 text-xs mt-3 px-3 py-2 rounded-2xl glass-prestige border border-ember-500/25 max-w-sm mx-auto text-center leading-snug">
                <strong className="text-ember-100">Clés Live :</strong> utilise une carte bancaire réelle.
                La carte de test 4242… ne fonctionne qu’avec des clés <strong>test</strong> (pk_test / sk_test).
              </p>
            )}
          {showStripeTestHint && (
              <p className="text-cobalt-200/90 text-xs mt-3 px-3 py-2 rounded-2xl glass-prestige border border-cobalt-500/25 max-w-sm mx-auto text-center">
                Mode test Stripe : carte 4242 4242 4242 4242, date future, CVC au choix.
              </p>
            )}
          
          {/* Country Detection Badge */}
          {!countryLoading && (
            <>
              {testMode && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 inline-flex items-center gap-2 glass-prestige border border-prestige-gold/35 rounded-full px-4 py-2"
                >
                  <span className="text-2xl">🧪</span>
                  <span className="text-prestige-gold text-sm font-bold">
                    MODE TEST: {country.name}
                  </span>
                </motion.div>
              )}
              {!testMode && country.code !== 'FR' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 inline-flex items-center gap-2 glass-prestige border border-cobalt-500/30 rounded-full px-4 py-2"
                >
                  <Globe className="w-4 h-4 text-cobalt-400" />
                  <span className="text-cobalt-300 text-sm font-semibold">
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
            className="mb-6 p-4 glass-prestige border border-ember-500/40 rounded-2xl text-ember-300 text-center"
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
                    ? 'brand-gradient shadow-2xl shadow-glow'
                    : 'glass-prestige border-2 border-white/10 hover:border-cobalt-500/25'
                } ${loading || countryLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {/* Popular Badge */}
                {pack.popular && (
                  <div className="absolute -top-2 -right-2 bg-prestige-gold text-black text-xs font-black px-3 py-1 rounded-full flex items-center gap-1 shadow-prestige-ring">
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
                        <div className={`text-sm font-bold ${isSelected ? 'text-black/80' : 'text-prestige-gold'}`}>
                          +{pack.bonus}% bonus
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Price + Check */}
                  <div className="text-right">
                    <div className={`text-2xl font-black ${isSelected ? 'text-white' : 'text-cobalt-400'}`}>
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
                        className="mt-2 w-8 h-8 bg-white rounded-full flex items-center justify-center mx-auto shadow-prestige-ring"
                      >
                        <Check className="w-5 h-5 text-cobalt-600" />
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
          className="w-full brand-gradient hover:opacity-90 text-white font-black py-6 rounded-3xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2xl shadow-glow text-xl"
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
