# 🤝 Guide de Contribution - Arena VS

Merci de votre intérêt pour contribuer à Arena VS ! Ce guide vous aidera à participer au projet.

## 📋 Table des Matières

1. [Code de Conduite](#code-de-conduite)
2. [Comment Contribuer](#comment-contribuer)
3. [Setup Développement](#setup-développement)
4. [Standards de Code](#standards-de-code)
5. [Process de Pull Request](#process-de-pull-request)

---

## Code de Conduite

Arena VS est un espace de débat ouvert mais respectueux. Nous attendons des contributeurs qu'ils :

- Soient respectueux et constructifs
- Acceptent les critiques de code
- Favorisent un environnement inclusif
- Se concentrent sur ce qui est meilleur pour la communauté

---

## Comment Contribuer

### 🐛 Reporter un Bug

1. Vérifiez que le bug n'a pas déjà été reporté dans les [Issues](https://github.com/votre-username/arena-vs/issues)
2. Créez une nouvelle issue avec le template "Bug Report"
3. Incluez :
   - Description claire du bug
   - Steps pour le reproduire
   - Comportement attendu vs réel
   - Screenshots si applicable
   - Environnement (OS, browser, version)

### 💡 Proposer une Fonctionnalité

1. Créez une issue avec le template "Feature Request"
2. Expliquez :
   - Le problème que ça résout
   - Votre solution proposée
   - Des alternatives considérées
   - Mockups/wireframes si applicable

### 🔧 Soumettre du Code

1. Forkez le repository
2. Créez une branche (`git checkout -b feature/MaSuperFeature`)
3. Commitez vos changements (`git commit -m 'Add: Ma super feature'`)
4. Pushez vers la branche (`git push origin feature/MaSuperFeature`)
5. Ouvrez une Pull Request

---

## Setup Développement

### Prérequis

- Node.js 18+ et npm
- Compte Supabase (gratuit)
- Compte OpenAI (optionnel)

### Installation

```bash
# 1. Cloner votre fork
git clone https://github.com/votre-username/arena-vs.git
cd arena-vs

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditez .env.local avec vos clés

# 4. Configurer Supabase
# Exécutez lib/supabase/schema.sql dans votre projet Supabase

# 5. Lancer le serveur
npm run dev
```

### Structure du Projet

```
arena-vs/
├── app/              # Next.js App Router (pages & layouts)
├── components/       # Composants React réutilisables
├── hooks/           # Custom React hooks
├── lib/             # Utilitaires et configurations
├── types/           # TypeScript types
└── public/          # Assets statiques
```

---

## Standards de Code

### TypeScript

- Utilisez TypeScript strict mode
- Définissez des types explicites pour les props
- Évitez `any`, préférez `unknown` si nécessaire

```typescript
// ✅ Bon
interface Props {
  roomId: string;
  userId: string;
}

// ❌ Mauvais
interface Props {
  data: any;
}
```

### React

- Utilisez des functional components
- Préférez les hooks aux classes
- Utilisez `useCallback` et `useMemo` pour les optimisations

```typescript
// ✅ Bon
const MyComponent = ({ data }: Props) => {
  const memoizedValue = useMemo(() => expensiveCalc(data), [data]);
  return <div>{memoizedValue}</div>;
};

// ❌ Mauvais
class MyComponent extends React.Component {
  // ...
}
```

### Styling

- Utilisez Tailwind CSS en priorité
- Classes custom dans `globals.css` si nécessaire
- Suivez la palette de couleurs définie (`arena-blue`, `arena-red`, etc.)

```tsx
// ✅ Bon
<div className="bg-arena-dark text-arena-blue rounded-lg p-4">

// ❌ Mauvais (inline styles)
<div style={{ background: '#000', color: '#00F' }}>
```

### Nommage

- **Components** : PascalCase (`TensionGauge.tsx`)
- **Hooks** : camelCase avec `use` prefix (`useTensionMeter.ts`)
- **Utilities** : camelCase (`formatRelativeTime`)
- **Constants** : UPPER_SNAKE_CASE (`MAX_TENSION_LEVEL`)

### Commits

Suivez [Conventional Commits](https://www.conventionalcommits.org/) :

```bash
feat: Add gift animation system
fix: Resolve tension meter sync issue
docs: Update setup guide
refactor: Simplify chat panel logic
test: Add tests for useTensionMeter
chore: Update dependencies
```

---

## Process de Pull Request

### Checklist Avant PR

- [ ] Code compile sans erreurs
- [ ] Pas d'erreurs linter (`npm run lint`)
- [ ] Tests ajoutés/mis à jour si applicable
- [ ] Documentation mise à jour
- [ ] Commit messages suivent les conventions
- [ ] Branch à jour avec `main`

### Template PR

```markdown
## Description

Brève description des changements.

## Type de changement

- [ ] Bug fix
- [ ] Nouvelle fonctionnalité
- [ ] Breaking change
- [ ] Documentation

## Comment tester ?

1. Étape 1
2. Étape 2
3. ...

## Screenshots (si UI)

[Ajoutez des screenshots]

## Checklist

- [ ] J'ai testé localement
- [ ] Code suit les standards du projet
- [ ] Documentation mise à jour
```

### Review Process

1. **Automated Checks** : CI/CD vérifie le build et les tests
2. **Code Review** : Un maintainer review le code
3. **Changes Requested** : Si nécessaire, faites les ajustements
4. **Approval** : Une fois approuvé, merge par un maintainer

---

## Domaines de Contribution

### 🎨 Frontend

- Amélioration UI/UX
- Animations et micro-interactions
- Responsive design
- Accessibilité (a11y)

### ⚙️ Backend

- API routes optimization
- Database queries performance
- Realtime logic improvements
- Caching strategies

### 🤖 IA & ML

- Fact-checking amélioration
- Sentiment analysis
- Transcription audio
- Modération automatique

### 📚 Documentation

- Guides utilisateur
- Tutoriels vidéo
- Translations
- API documentation

### 🧪 Testing

- Unit tests
- Integration tests
- E2E tests (Playwright)
- Performance tests

---

## Getting Help

- 💬 **Discord** : [Lien vers serveur] (communauté)
- 🐛 **Issues** : Pour bugs et features
- 📧 **Email** : team@arena-vs.com (questions privées)

---

## License

En contribuant, vous acceptez que vos contributions soient sous la même licence que le projet.

---

## Merci !

Chaque contribution, petite ou grande, est appréciée. Vous faites partie de l'équipe Arena VS ! 🔥

**Top Contributors**

[Sera rempli automatiquement avec un bot GitHub]

---

**Dernière mise à jour** : 4 février 2026
