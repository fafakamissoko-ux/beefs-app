import { redirect } from 'next/navigation';

/** Portail unifié — /signup redirige vers /login */
export default function SignUpPage() {
  redirect('/login');
}
