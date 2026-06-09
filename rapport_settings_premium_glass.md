# Rapport — Design System Premium Glass (`app/settings/page.tsx`)

**Date :** 31 mai 2026  
**Nature :** intégration Tailwind **CSS uniquement** — aucune logique React / Supabase modifiée  
**Référence squelette :** commit `b724a39` (navigation par onglets)

---

## 1. Objectif

Appliquer le **Design System Premium Glass** sur les 5 onglets de paramètres, en conservant intégralement OTP, retraits (historique lingots), handlers et états.

---

## 2. Tokens CSS centralisés (module)

Constantes ajoutées en tête de fichier (classes Tailwind réutilisables, **sans logique métier**) :

| Constante | Rôle |
|-----------|------|
| `SETTINGS_GLASS_CARD` | Carte glass standard |
| `SETTINGS_GLASS_CARD_DANGER` | Carte zone de danger |
| `SETTINGS_INPUT` | Champs texte / mot de passe / OTP |
| `SETTINGS_TEXTAREA` | Bio ( `rounded-2xl` ) |
| `SETTINGS_BTN_PRIMARY` | Actions principales |
| `SETTINGS_BTN_DANGER` | Suppression de compte |

---

## 3. Application par zone

### Fond de page

```tsx
<div className="min-h-screen bg-transparent">
```

Le wrapper principal du rendu settings est transparent ; les écrans de chargement (`authLoading`) restent inchangés.

### Menu des onglets (5 onglets)

| État | Classes appliquées |
|------|-------------------|
| **Actif** | `bg-white/10 text-white border-white/20` |
| **Inactif** | `border-transparent text-white/40 hover:bg-white/5 hover:text-white` |
| **Icône inactive** | `text-white/40` (danger : `text-red-400`) |

Layout mobile/desktop (scroll horizontal / sidebar `w-64`) **inchangé**.

---

## 4. Cartes par onglet

Style glass standard :

```
w-full rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8 shadow-2xl backdrop-blur-md
```

Style danger :

```
w-full rounded-[2rem] border border-red-500/20 bg-red-950/20 p-6 md:p-8 shadow-2xl backdrop-blur-md
```

| Onglet | Cartes mises à jour |
|--------|---------------------|
| **Profil** | Informations du profil · Bouclier Anti-Spam |
| **Sécurité** | Changer le mot de passe (OTP inclus) |
| **Portefeuille** | Historique des Lingots (retraits listés) |
| **Préférences** | Affichage & accessibilité · Radar & alertes · Guides d'utilisation · Accès Médiation |
| **Zone de danger** | Zone de danger (variante `SETTINGS_GLASS_CARD_DANGER`) |

**Total : 9 cartes** — aucune section supprimée.

---

## 5. Champs de saisie

### Inputs (`text`, `password` dynamique, OTP)

```
w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white
placeholder:text-white/30 outline-none focus:border-white/25 transition-colors
```

**Champs concernés :**
- Nom d'utilisateur (disabled + `opacity-60`)
- Nom affiché
- Mot de passe actuel / nouveau / confirmation (`pr-12` pour toggle œil)
- Code OTP (`tracking-widest text-center text-lg`)

Classes d'erreur existantes (`beefs-field-invalid`) **conservées**.

### Textarea

- Bio → `SETTINGS_TEXTAREA` (`rounded-2xl` au lieu de `rounded-full`)

---

## 6. Boutons d'action

| Type | Usage | Classes |
|------|-------|---------|
| **Primaire** | Enregistrer profil · Changer / valider mot de passe | `SETTINGS_BTN_PRIMARY` (`brand-gradient`, `rounded-full`, `active:scale-[0.98]`) |
| **Danger** | Supprimer mon compte | `SETTINGS_BTN_DANGER` |

Boutons secondaires (Retour OTP, Renvoyer le code, Réinitialiser les guides, toggles) : **classes inchangées** (hors scope brief).

---

## 7. Certification — logique intacte

| Élément | Statut |
|---------|--------|
| `useState` / `useEffect` / `useCallback` | ✅ Aucune modification |
| Handlers (OTP, profil, notifs, suppression) | ✅ Aucune modification |
| Requêtes Supabase | ✅ Aucune modification |
| Structure onglets + sections | ✅ 9 cartes, 5 onglets |
| Lignes de fichier | ✅ ~1325 lignes (fichier non tronqué) |
| `tsc --noEmit` | ✅ OK |

---

## 8. Résumé visuel

```
[ bg-transparent page ]
├── Nav tabs (glass states actif/inactif)
└── Contenu onglet actif
    └── Carte(s) glass rounded-[2rem]
        ├── Inputs rounded-full / textarea rounded-2xl
        └── Boutons brand-gradient | danger red
```

---

**Statut :** Design System Premium Glass **appliqué** sur les 5 onglets — logique métier **non altérée**.
