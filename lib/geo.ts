// Geo-location and currency detection utilities

export interface CountryData {
  code: string;
  name: string;
  currency: string;
  language: string;
  priceMultiplier: number;
  exchangeRate: number; // EUR to local currency
}

// Exchange rates (1 EUR = X local currency) - Updated 2026
const EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.86,
  CHF: 0.96,
  CAD: 1.48,
  BRL: 5.74,
  MXN: 18.50,
  INR: 90.50,
  PKR: 300.00,
  BDT: 119.00,
  NGN: 1600.00,
  KES: 140.00,
  GHS: 16.50,
  ZAR: 20.00,
  XOF: 655.957, // West African CFA Franc (fixed rate)
  XAF: 655.957, // Central African CFA Franc (fixed rate)
};

export const COUNTRIES: Record<string, CountryData> = {
  // Europe
  FR: { code: 'FR', name: 'France', currency: 'EUR', language: 'fr', priceMultiplier: 1.0, exchangeRate: 1.0 },
  BE: { code: 'BE', name: 'Belgium', currency: 'EUR', language: 'fr', priceMultiplier: 1.0, exchangeRate: 1.0 },
  CH: { code: 'CH', name: 'Switzerland', currency: 'CHF', language: 'fr', priceMultiplier: 1.1, exchangeRate: 0.96 },
  LU: { code: 'LU', name: 'Luxembourg', currency: 'EUR', language: 'fr', priceMultiplier: 1.0, exchangeRate: 1.0 },
  GB: { code: 'GB', name: 'United Kingdom', currency: 'GBP', language: 'en', priceMultiplier: 0.8, exchangeRate: 0.86 },
  DE: { code: 'DE', name: 'Germany', currency: 'EUR', language: 'de', priceMultiplier: 1.0, exchangeRate: 1.0 },
  ES: { code: 'ES', name: 'Spain', currency: 'EUR', language: 'es', priceMultiplier: 1.0, exchangeRate: 1.0 },
  IT: { code: 'IT', name: 'Italy', currency: 'EUR', language: 'it', priceMultiplier: 1.0, exchangeRate: 1.0 },
  
  // Afrique Francophone (Franc CFA)
  SN: { code: 'SN', name: 'Sénégal', currency: 'XOF', language: 'fr', priceMultiplier: 0.35, exchangeRate: 655.957 },
  CI: { code: 'CI', name: 'Côte d\'Ivoire', currency: 'XOF', language: 'fr', priceMultiplier: 0.35, exchangeRate: 655.957 },
  CM: { code: 'CM', name: 'Cameroun', currency: 'XAF', language: 'fr', priceMultiplier: 0.35, exchangeRate: 655.957 },
  BJ: { code: 'BJ', name: 'Bénin', currency: 'XOF', language: 'fr', priceMultiplier: 0.35, exchangeRate: 655.957 },
  BF: { code: 'BF', name: 'Burkina Faso', currency: 'XOF', language: 'fr', priceMultiplier: 0.30, exchangeRate: 655.957 },
  TG: { code: 'TG', name: 'Togo', currency: 'XOF', language: 'fr', priceMultiplier: 0.30, exchangeRate: 655.957 },
  ML: { code: 'ML', name: 'Mali', currency: 'XOF', language: 'fr', priceMultiplier: 0.30, exchangeRate: 655.957 },
  NE: { code: 'NE', name: 'Niger', currency: 'XOF', language: 'fr', priceMultiplier: 0.30, exchangeRate: 655.957 },
  GA: { code: 'GA', name: 'Gabon', currency: 'XAF', language: 'fr', priceMultiplier: 0.40, exchangeRate: 655.957 },
  CG: { code: 'CG', name: 'Congo', currency: 'XAF', language: 'fr', priceMultiplier: 0.30, exchangeRate: 655.957 },
  TD: { code: 'TD', name: 'Tchad', currency: 'XAF', language: 'fr', priceMultiplier: 0.25, exchangeRate: 655.957 },
  CF: { code: 'CF', name: 'RCA', currency: 'XAF', language: 'fr', priceMultiplier: 0.25, exchangeRate: 655.957 },
  GQ: { code: 'GQ', name: 'Guinée Équatoriale', currency: 'XAF', language: 'fr', priceMultiplier: 0.35, exchangeRate: 655.957 },
  GW: { code: 'GW', name: 'Guinée-Bissau', currency: 'XOF', language: 'fr', priceMultiplier: 0.25, exchangeRate: 655.957 },
  
  // Americas
  US: { code: 'US', name: 'United States', currency: 'USD', language: 'en', priceMultiplier: 1.0, exchangeRate: 1.08 },
  CA: { code: 'CA', name: 'Canada', currency: 'CAD', language: 'en', priceMultiplier: 0.9, exchangeRate: 1.48 },
  BR: { code: 'BR', name: 'Brazil', currency: 'BRL', language: 'pt', priceMultiplier: 0.4, exchangeRate: 5.74 },
  MX: { code: 'MX', name: 'Mexico', currency: 'MXN', language: 'es', priceMultiplier: 0.5, exchangeRate: 18.50 },
  
  // Asia
  IN: { code: 'IN', name: 'India', currency: 'INR', language: 'en', priceMultiplier: 0.2, exchangeRate: 90.50 },
  PK: { code: 'PK', name: 'Pakistan', currency: 'PKR', language: 'en', priceMultiplier: 0.15, exchangeRate: 300.00 },
  BD: { code: 'BD', name: 'Bangladesh', currency: 'BDT', language: 'en', priceMultiplier: 0.15, exchangeRate: 119.00 },
  
  // Africa (Other)
  NG: { code: 'NG', name: 'Nigeria', currency: 'NGN', language: 'en', priceMultiplier: 0.3, exchangeRate: 1600.00 },
  KE: { code: 'KE', name: 'Kenya', currency: 'KES', language: 'en', priceMultiplier: 0.3, exchangeRate: 140.00 },
  GH: { code: 'GH', name: 'Ghana', currency: 'GHS', language: 'en', priceMultiplier: 0.3, exchangeRate: 16.50 },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', language: 'en', priceMultiplier: 0.4, exchangeRate: 20.00 },
  
  // Default (Europe)
  DEFAULT: { code: 'FR', name: 'France', currency: 'EUR', language: 'fr', priceMultiplier: 1.0, exchangeRate: 1.0 },
};

export const PRICING_BASE = {
  starter: 4.99,
  popular: 9.99,
  premium: 19.99,
  vip: 49.99,
};

export async function detectUserCountry(): Promise<CountryData> {
  try {
    // Try Cloudflare headers first (most reliable)
    const response = await fetch('/api/geo');
    const data = await response.json();
    
    if (data.country && COUNTRIES[data.country]) {
      return COUNTRIES[data.country];
    }
  } catch (error) {
    console.warn('Cloudflare geo detection failed:', error);
  }

  // Fallback: Browser language
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.includes('fr')) {
    // Check if it's from Africa
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone.includes('Africa')) {
      return COUNTRIES.SN; // Default to Senegal for Africa
    }
    return COUNTRIES.FR;
  } else if (browserLang.includes('en-gb')) {
    return COUNTRIES.GB;
  } else if (browserLang.includes('en')) {
    return COUNTRIES.US;
  }

  return COUNTRIES.DEFAULT;
}

export function calculatePrice(
  basePrice: number,
  country: CountryData
): { amount: number; currency: string; formatted: string } {
  // Step 1: Apply price multiplier (purchasing power adjustment)
  const adjustedPrice = basePrice * country.priceMultiplier;
  
  // Step 2: Convert to local currency
  const amountInLocalCurrency = adjustedPrice * country.exchangeRate;
  
  // Format based on currency
  const formatted = new Intl.NumberFormat(country.language, {
    style: 'currency',
    currency: country.currency,
    minimumFractionDigits: country.currency === 'XOF' || country.currency === 'XAF' ? 0 : 2,
  }).format(amountInLocalCurrency);

  return {
    amount: Math.round(amountInLocalCurrency * 100) / 100,
    currency: country.currency,
    formatted,
  };
}

export interface FraudScore {
  score: number; // 0-100 (higher = more trustworthy)
  risk: 'low' | 'medium' | 'high' | 'critical';
  factors: {
    ipMatch: number;
    cardMatch: number;
    languageMatch: number;
    timezoneMatch: number;
    historyMatch: number;
  };
  shouldBlock: boolean;
  enforcedCountry?: string; // Force this country if fraud detected
}

export function calculateFraudScore(
  ipCountry: string,
  cardCountry?: string,
  browserLanguage?: string,
  timezone?: string,
  userHistory?: string[]
): FraudScore {
  let score = 100;
  const factors = {
    ipMatch: 30,
    cardMatch: 40,
    languageMatch: 10,
    timezoneMatch: 10,
    historyMatch: 10,
  };

  // IP vs Card country mismatch (critical)
  if (cardCountry && cardCountry !== ipCountry) {
    score -= 40;
    factors.cardMatch = 0;
  }

  // Browser language mismatch
  if (browserLanguage) {
    const ipLang = COUNTRIES[ipCountry]?.language || 'en';
    if (!browserLanguage.includes(ipLang)) {
      score -= 10;
      factors.languageMatch = 0;
    }
  }

  // Timezone mismatch
  if (timezone) {
    const expectedRegion = ipCountry === 'US' ? 'America' : 
                          ipCountry === 'IN' ? 'Asia' :
                          ipCountry === 'FR' ? 'Europe' : 'Unknown';
    if (expectedRegion !== 'Unknown' && !timezone.includes(expectedRegion)) {
      score -= 10;
      factors.timezoneMatch = 0;
    }
  }

  // User history check
  if (userHistory && userHistory.length > 0) {
    const mostCommonCountry = userHistory[0]; // Simplified
    if (mostCommonCountry !== ipCountry) {
      score -= 10;
      factors.historyMatch = 0;
    }
  }

  // Determine risk level
  let risk: 'low' | 'medium' | 'high' | 'critical';
  if (score >= 80) risk = 'low';
  else if (score >= 60) risk = 'medium';
  else if (score >= 40) risk = 'high';
  else risk = 'critical';

  // Should block if score < 50
  const shouldBlock = score < 50;

  // Enforce card country if available and score is low
  const enforcedCountry = shouldBlock && cardCountry ? cardCountry : undefined;

  return {
    score,
    risk,
    factors,
    shouldBlock,
    enforcedCountry,
  };
}
