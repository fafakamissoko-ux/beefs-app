# 🎯 **SYSTÈME COMPLET - PARTICIPANTS & INVITATIONS**

Date: 17 Mars 2026  
Status: **PLANIFICATION**

---

## **1️⃣ BEEF "SOLO START" (Déjà possible)**

### **Status:** ✅ Fonctionnel

**Flow actuel:**
1. Médiateur crée un beef
2. Peut laisser "Participants" vide
3. Lance le beef en "live"
4. Spectateurs peuvent rejoindre via l'URL

**Modifications nécessaires:**
- ✅ Aucune! Déjà fonctionnel avec la création actuelle

---

## **2️⃣ AJOUT PARTICIPANTS EN LIVE**

### **Status:** ⏳ À développer (Priorité: Haute)

### **Flow utilisateur:**

**Scénario A - Utilisateur inscrit:**
1. Beef est "live"
2. Médiateur clique "Ajouter un participant"
3. Modal avec searchbar (username, email, téléphone)
4. Sélectionne l'utilisateur
5. Envoie invitation en temps réel
6. Utilisateur reçoit notification in-app
7. Utilisateur clique → rejoint le beef

**Scénario B - Utilisateur non inscrit:**
1. Beef est "live"
2. Médiateur clique "Inviter par email/téléphone"
3. Entre email ou numéro
4. Envoie invitation externe
5. Personne reçoit lien unique
6. S'inscrit → redirigé vers le beef

---

## **3️⃣ SYSTÈME D'INVITATION EXTERNE**

### **Status:** ⏳ À développer (Priorité: Très haute - Feature virale)

### **A. Base de données (Nouvelle table):**

```sql
-- Table: invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES users(id), -- Le médiateur
  
  -- Contact info
  email TEXT,
  phone TEXT,
  
  -- Invitation details
  role TEXT DEFAULT 'participant', -- 'participant', 'spectator'
  token TEXT UNIQUE NOT NULL, -- Token unique pour le lien
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'expired'
  
  -- Tracking
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  
  -- User created (if registered via invitation)
  created_user_id UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_beef_id ON invitations(beef_id);
CREATE INDEX idx_invitations_email ON invitations(email) WHERE email IS NOT NULL;
CREATE INDEX idx_invitations_phone ON invitations(phone) WHERE phone IS NOT NULL;
```

---

### **B. API Endpoints nécessaires:**

**POST `/api/invitations/send`**
- Crée une invitation
- Génère token unique
- Envoie email/SMS
- Retourne lien d'invitation

**GET `/api/invitations/[token]`**
- Vérifie validité du token
- Retourne infos du beef
- Redirige vers signup ou beef

**POST `/api/invitations/accept`**
- Marque invitation comme acceptée
- Crée l'utilisateur si nécessaire
- Ajoute au beef
- Retourne URL du beef

---

### **C. Services externes:**

**Email:**
- **Service:** Resend, SendGrid, ou Mailgun
- **Template:** Email branded avec lien unique
- **Coût:** ~$10/mois pour 10k emails

**SMS:**
- **Service:** Twilio, Vonage
- **Template:** "Tu es invité à rejoindre un Beef! [lien]"
- **Coût:** ~$0.01 par SMS

**WhatsApp (Optionnel - Phase 2):**
- **Service:** Twilio WhatsApp API
- **Template:** Message avec lien cliquable
- **Coût:** ~$0.005 par message

---

### **D. Flow technique complet:**

#### **Étape 1: Médiateur envoie invitation**
```typescript
// Frontend: components/InviteParticipant.tsx
const sendInvitation = async (contact: string, type: 'email' | 'phone') => {
  const response = await fetch('/api/invitations/send', {
    method: 'POST',
    body: JSON.stringify({
      beef_id: beefId,
      [type]: contact,
      role: 'participant',
    }),
  });
  
  const { invitation_id, link } = await response.json();
  // Affiche confirmation
};
```

#### **Étape 2: Backend génère invitation**
```typescript
// app/api/invitations/send/route.ts
export async function POST(request: Request) {
  const { beef_id, email, phone, role } = await request.json();
  
  // Génère token unique
  const token = crypto.randomUUID();
  
  // Crée invitation en DB
  const { data: invitation } = await supabase
    .from('invitations')
    .insert({
      beef_id,
      inviter_id: userId,
      email,
      phone,
      role,
      token,
    })
    .select()
    .single();
  
  // Génère lien
  const link = `${baseUrl}/join/${token}`;
  
  // Envoie email ou SMS
  if (email) {
    await sendEmail(email, link, beefTitle);
  } else if (phone) {
    await sendSMS(phone, link, beefTitle);
  }
  
  return { invitation_id: invitation.id, link };
}
```

#### **Étape 3: Invité clique sur le lien**
```typescript
// app/join/[token]/page.tsx
export default async function JoinPage({ params }: { params: { token: string } }) {
  // Vérifie token
  const { data: invitation } = await supabase
    .from('invitations')
    .select('*, beefs(*)')
    .eq('token', params.token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (!invitation) {
    return <InvitationExpired />;
  }
  
  // Track ouverture
  await supabase
    .from('invitations')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', invitation.id);
  
  // Vérifie si utilisateur connecté
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // Utilisateur connecté → rejoindre directement
    return redirect(`/arena/${invitation.beef_id}?invitation=${params.token}`);
  } else {
    // Utilisateur non connecté → signup avec pré-remplissage
    return <SignupPage invitation={invitation} />;
  }
}
```

#### **Étape 4: Signup facilité**
```typescript
// app/signup/page.tsx (avec invitation)
const handleSignup = async (formData) => {
  // Crée compte
  const { data: authData } = await supabase.auth.signUp({
    email: invitation.email || formData.email,
    password: formData.password,
  });
  
  // Marque invitation comme acceptée
  await supabase
    .from('invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      created_user_id: authData.user.id,
    })
    .eq('token', invitation.token);
  
  // Redirige vers le beef
  router.push(`/arena/${invitation.beef_id}`);
};
```

---

## **4️⃣ INTERFACE UTILISATEUR**

### **A. Pendant le Beef - Panel Médiateur**

**Bouton "Ajouter Participant":**
- Icône: ➕ 👤
- Position: Sidebar droite (desktop) ou menu hamburger (mobile)
- Modal avec 2 onglets:
  - **"Utilisateurs inscrits"** (Recherche)
  - **"Inviter par email/téléphone"** (Formulaire)

### **B. Modal "Inviter"**

```
┌─────────────────────────────────────────┐
│  Inviter un Participant                 │
│                                         │
│  ┌───────┬────────────────────────────┐ │
│  │ Email │ Téléphone │                │ │
│  └───────┴────────────────────────────┘ │
│                                         │
│  Email ou téléphone:                   │
│  ┌─────────────────────────────────┐   │
│  │ participant@example.com         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Message personnalisé (optionnel):     │
│  ┌─────────────────────────────────┐   │
│  │ Rejoins-moi pour débattre...    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │  Annuler    │  │  Envoyer        │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────┘
```

### **C. Email Template**

```
Subject: 🔥 Tu es invité à un Beef sur Beefs!

Salut!

[Nom du Médiateur] t'invite à participer à un débat en direct:

📌 Titre: [Titre du Beef]
🗓️ Date: [Date] ou "En direct maintenant!"

[Message personnalisé si fourni]

👉 Rejoins le Beef: [Lien unique]

Ce lien expire dans 7 jours.

---
Beefs - La plateforme de débats en direct
```

---

## **5️⃣ SÉCURITÉ & LIMITATIONS**

### **Rate Limiting:**
- Max 10 invitations par beef
- Max 50 invitations par jour par utilisateur
- Protection anti-spam

### **Validation:**
- Email/téléphone valides
- Token unique (UUID)
- Expiration 7 jours
- Une invitation = un token (pas de réutilisation)

### **Tracking:**
- Nombre d'invitations envoyées
- Taux de conversion (invitation → inscription)
- Analytics pour médiateurs

---

## **6️⃣ ORDRE DE DÉVELOPPEMENT**

### **Phase 1: MVP (2-3 jours)**
1. ✅ Table `invitations`
2. ✅ API `/api/invitations/send`
3. ✅ Page `/join/[token]`
4. ✅ Email avec Resend (gratuit jusqu'à 3k/mois)
5. ✅ Modal "Inviter" dans le beef
6. ✅ Signup facilité avec pré-remplissage

### **Phase 2: Améliorations (1-2 jours)**
1. SMS via Twilio
2. Recherche utilisateurs inscrits
3. File d'attente des demandes de participation
4. Notifications in-app

### **Phase 3: Advanced (Phase 2 du projet)**
1. WhatsApp invitations
2. Invitations bulk (CSV upload)
3. Analytics avancées
4. Templates personnalisés

---

## **7️⃣ COÛTS ESTIMÉS**

| Service | Volume | Coût/mois |
|---|---|---|
| Resend (Email) | 10k emails | Gratuit → $20 |
| Twilio (SMS) | 1k SMS | $10 |
| WhatsApp (Phase 2) | 1k messages | $5 |
| **Total** | | **$0-35/mois** |

---

## **🎯 PROCHAINE ÉTAPE:**

**Veux-tu que je commence par:**

**Option A: Système d'invitation complet (3-4 jours)**
- Table invitations
- API endpoints
- Email avec Resend
- Page /join/[token]
- Modal dans beef
- Signup facilité

**Option B: Terminer les tests actuels d'abord**
- Tester chat avec UUID réel
- Vérifier searchbar
- Puis passer aux invitations

**Option C: Juste la base pour tester le concept (1 jour)**
- Table invitations
- API simple
- Email basic
- Sans SMS pour le moment

---

**Qu'est-ce que tu préfères?** 🚀
