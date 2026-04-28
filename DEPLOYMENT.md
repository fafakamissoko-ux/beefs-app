# 🚀 Guide de Déploiement - Arena VS

## Options de Déploiement

### Option 1 : Vercel (Recommandé)

Vercel est la plateforme idéale pour Next.js avec déploiement automatique depuis Git.

#### Étapes

1. **Préparer le Repository**

```bash
git init
git add .
git commit -m "Initial commit: Arena VS"
```

1. **Pusher sur GitHub**

```bash
# Créez un repo sur github.com puis :
git remote add origin https://github.com/votre-username/arena-vs.git
git push -u origin main
```

1. **Déployer sur Vercel**
  - Allez sur [vercel.com](https://vercel.com)
  - Cliquez sur "New Project"
  - Importez votre repo GitHub
  - Vercel détecte automatiquement Next.js
2. **Configurer les Variables d'Environnement**

Dans Vercel Dashboard > Settings > Environment Variables :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_clé_anon
OPENAI_API_KEY=sk-votre-clé
NEXT_PUBLIC_APP_URL=https://votre-app.vercel.app
```

1. **Déployer**

Cliquez sur "Deploy". Vercel va :

- Installer les dépendances
- Build le projet
- Déployer sur CDN global
- Fournir une URL (ex: `arena-vs.vercel.app`)

#### Déploiements Automatiques

Chaque `git push` déclenche un nouveau déploiement automatique.

---

### Option 2 : Docker + Cloud Provider

Pour plus de contrôle, utilisez Docker avec AWS/GCP/DigitalOcean.

#### Dockerfile

Créez `Dockerfile` :

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  arena-vs:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    restart: unless-stopped
```

#### Déploiement

```bash
docker-compose up -d
```

---

### Option 3 : Netlify

Similaire à Vercel, optimisé pour Jamstack.

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

Configurez les variables d'environnement dans Netlify Dashboard.

---

## Configuration Production

### 1. Optimisation Next.js

Modifiez `next.config.js` :

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // Pour Docker
  images: {
    domains: ['api.dicebear.com', 'votre-cdn.com'],
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

module.exports = nextConfig;
```

### 2. Variables d'Environnement

Créez `.env.production` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://prod.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=prod_key
OPENAI_API_KEY=prod_openai_key
NEXT_PUBLIC_APP_URL=https://arena-vs.com
```

**⚠️ IMPORTANT** : Ne commitez JAMAIS `.env.production` !

### 3. Sécurité Supabase

#### Row Level Security (RLS)

Modifiez les policies dans Supabase SQL Editor :

```sql
-- Supprimer les policies "Allow all"
DROP POLICY "Allow all operations on rooms" ON public.rooms;

-- Créer des policies sécurisées
-- Lecture : Tout le monde
CREATE POLICY "Anyone can read rooms" ON public.rooms
  FOR SELECT USING (true);

-- Création : Utilisateurs authentifiés uniquement
CREATE POLICY "Authenticated users can create rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Mise à jour : Uniquement le host
CREATE POLICY "Only host can update room" ON public.rooms
  FOR UPDATE USING (auth.uid()::text = host_id);

-- Répéter pour les autres tables...
```

### 4. Rate Limiting

Créez `middleware.ts` à la racine :

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimit = new Map();

export function middleware(request: NextRequest) {
  const ip = request.ip ?? 'anonymous';
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, []);
  }

  const requests = rateLimit.get(ip).filter((time: number) => now - time < windowMs);
  
  if (requests.length >= maxRequests) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  requests.push(now);
  rateLimit.set(ip, requests);

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
```

### 5. Monitoring & Analytics

#### Vercel Analytics

```bash
npm install @vercel/analytics
```

Dans `app/layout.tsx` :

```typescript
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

#### Sentry (Error Tracking)

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### 6. Performance

#### Edge Functions

Pour les API routes critiques, utilisez Edge Runtime :

```typescript
// app/api/fact-check/route.ts
export const runtime = 'edge';

export async function POST(request: Request) {
  // Votre code...
}
```

#### Caching

Configurez les headers de cache :

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=120' },
        ],
      },
    ];
  },
};
```

---

## Checklist Pré-Déploiement

- Tests manuels de toutes les fonctionnalités
- Variables d'environnement configurées
- RLS activé sur Supabase
- Rate limiting implémenté
- Error tracking configuré (Sentry)
- Analytics installé
- Domaine personnalisé configuré (optionnel)
- SSL/HTTPS activé
- Backups Supabase configurés
- Monitoring uptime configuré (UptimeRobot)

---

## Post-Déploiement

### 1. Tester en Production

```bash
# Tester l'API
curl https://votre-app.vercel.app/api/health

# Tester les WebSockets Supabase
# Vérifier dans la console du navigateur
```

### 2. Monitorer les Performances

- **Vercel Analytics** : Voir les Core Web Vitals
- **Supabase Dashboard** : Monitorer les requêtes DB
- **Sentry** : Tracker les erreurs

### 3. Scaler si Nécessaire

#### Supabase

- Upgrade vers le plan Pro si > 50K utilisateurs actifs
- Activer Connection Pooler pour haute charge

#### Vercel

- Plan Pro pour plus de bande passante
- Edge Functions pour latence réduite

---

## Rollback en Cas de Problème

### Vercel

```bash
vercel rollback
```

Ou dans le Dashboard : Deployments > Select previous > Promote to Production

### Docker

```bash
docker-compose down
git checkout previous-commit
docker-compose up -d --build
```

---

## CI/CD avec GitHub Actions

Créez `.github/workflows/deploy.yml` :

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
      
      - name: Pull Vercel Environment
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Build Project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

---

## Support & Maintenance

### Logs

```bash
# Vercel
vercel logs

# Docker
docker logs arena-vs

# Supabase
# Dashboard > Logs
```

### Backups

```bash
# Supabase auto-backup (plan Pro)
# Ou export manuel :
pg_dump -h db.xxx.supabase.co -U postgres arena_vs > backup.sql
```

---

**Besoin d'aide pour le déploiement ?** Consultez la [documentation Vercel](https://vercel.com/docs) ou [Supabase](https://supabase.com/docs).