import { redirect } from 'next/navigation';

/** Connexion SMS désactivée tant qu’un fournisseur SMS n’est pas configuré (budget). */
export default function AuthPhonePlaceholderPage() {
  redirect('/signup');
}
