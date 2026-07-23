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
    popular: false,
  },
  {
    id: 'popular',
    name: 'Popular',
    emoji: '💎',
    points: 1200,
    price: 9.99,
    bonus: 20,
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    emoji: '👑',
    points: 3000,
    price: 19.99,
    bonus: 50,
    popular: false,
  },
  {
    id: 'vip',
    name: 'VIP',
    emoji: '🚀',
    points: 10000,
    price: 49.99,
    bonus: 100,
    popular: false,
  },
] as const;

export type PointPackId = typeof POINT_PACKS[number]['id'];
