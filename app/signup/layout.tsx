/** Évite HTML/cache agressif sur l’inscription (chunks à jour après déploiements). */
export const dynamic = 'force-dynamic';

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
