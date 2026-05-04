'use client';

import { Suspense } from 'react';
import { MessagesUI } from '@/components/MessagesUI';

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-plasma-500 border-t-transparent" />
        </div>
      }
    >
      <MessagesUI />
    </Suspense>
  );
}
