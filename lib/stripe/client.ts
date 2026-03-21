import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// Point pack configurations
export const POINT_PACKS = [
  {
    id: 'starter',
    name: 'Starter',
    emoji: '🔥',
    points: 500,
    price: 4.99,
    bonus: 5,
    priceId: process.env.STRIPE_PRICE_STARTER,
    popular: false,
  },
  {
    id: 'popular',
    name: 'Popular',
    emoji: '💎',
    points: 1200,
    price: 9.99,
    bonus: 20,
    priceId: process.env.STRIPE_PRICE_POPULAR,
    popular: true, // Best value
  },
  {
    id: 'premium',
    name: 'Premium',
    emoji: '👑',
    points: 3000,
    price: 19.99,
    bonus: 50,
    priceId: process.env.STRIPE_PRICE_PREMIUM,
    popular: false,
  },
  {
    id: 'vip',
    name: 'VIP',
    emoji: '🚀',
    points: 10000,
    price: 49.99,
    bonus: 100,
    priceId: process.env.STRIPE_PRICE_VIP,
    popular: false,
  },
] as const;

export type PointPackId = typeof POINT_PACKS[number]['id'];
