'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CountryData, COUNTRIES } from '@/lib/geo';

export function useCountryDetection() {
  const [country, setCountry] = useState<CountryData>(COUNTRIES.DEFAULT);
  const [loading, setLoading] = useState(true);
  const [testMode, setTestMode] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    async function detectCountry() {
      try {
        // 🧪 TEST MODE: Check for ?test-country=XX parameter
        const testCountry = searchParams.get('test-country');
        if (testCountry && COUNTRIES[testCountry.toUpperCase()]) {
          const testCountryData = COUNTRIES[testCountry.toUpperCase()];
          setCountry(testCountryData);
          setTestMode(true);
          setLoading(false);
          return;
        }

        // Normal detection via API
        const response = await fetch('/api/geo');
        const data = await response.json();
        
        if (data.country && COUNTRIES[data.country]) {
          setCountry(COUNTRIES[data.country]);
        } else {
          setCountry(COUNTRIES.DEFAULT);
        }
      } catch {
        console.warn('Failed to detect country, using default');
        setCountry(COUNTRIES.DEFAULT);
      } finally {
        setLoading(false);
      }
    }

    detectCountry();
  }, [searchParams]);

  return { country, loading, testMode };
}
