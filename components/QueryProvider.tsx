'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // L'instanciation dans un useState garantit que le client est unique par session utilisateur
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // Les données sont fraîches pendant 1 minute par défaut
            refetchOnWindowFocus: false, // Évite les requêtes inutiles au changement d'onglet
            retry: 1, // 1 seule tentative de retry en cas d'échec réseau
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
