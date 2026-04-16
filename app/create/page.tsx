'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { submitNewBeef } from '@/lib/submitNewBeef';
import type { SubmitBeefPayload } from '@/lib/submitNewBeef';
import { navigateSmartBack } from '@/lib/navigation-return';

const CreateBeefForm = dynamic(
  () => import('@/components/CreateBeefForm').then((m) => m.CreateBeefForm),
  {
    loading: () => (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    ),
  }
);

export default function CreateBeefPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (hasSeenOnboarding !== 'true') {
        router.push('/welcome');
        return;
      }
      router.push('/login');
    }
  }, [user, router]);

  const handleSubmit = async (beefData: SubmitBeefPayload) => {
    if (!user) {
      router.push('/login');
      return;
    }
    await submitNewBeef(supabase, user.id, beefData);
    router.push('/feed');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <CreateBeefForm onSubmit={handleSubmit} onCancel={() => navigateSmartBack(router, '/feed')} />
    </div>
  );
}
