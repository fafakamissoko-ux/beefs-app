/**
 * Copie la liste des domaines jetables npm vers l’Edge Function Auth Hook.
 * Exécuté en postinstall ; requis avant `supabase functions deploy`.
 */
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'node_modules', 'disposable-email-domains', 'index.json');
const destDir = join(root, 'supabase', 'functions', 'before-user-created');
const dest = join(destDir, 'disposable-domains.json');

if (!existsSync(src)) {
  console.warn('[sync-disposable-domains] node_modules/disposable-email-domains/index.json absent — npm install ?');
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[sync-disposable-domains] OK →', dest);
