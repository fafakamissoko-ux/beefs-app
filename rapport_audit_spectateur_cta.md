# Rapport d'audit — CTA Spectateur / Salle d'attente

**Date :** 31 mai 2026  
**Cible :** `components/BeefCard.tsx`  
**Contexte :** suspension transition module Notifications — incohérence UI/RBAC sur « Rejoindre la salle d'attente »  
**Statut :** exploration uniquement (aucun correctif)

---

## 1. Bloc parent — branche `scheduled` / `pending` (contexte CTA)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 742–843

Le bouton « Rejoindre la salle d'attente » n'apparaît que si `onPrepareAudience` est **absent** (branche `else`). Le Ref et le créateur manifesto sans Ref reçoivent « 🎛️ Préparer la Régie » à la place.

```tsx
                ) : status === 'scheduled' || status === 'pending' ? (
                  <div className="flex flex-col gap-2">
                    {onPrepareAudience ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrepareAudience();
                          setIsTeaserOpen(false);
                        }}
                        className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        🎛️ Préparer la Régie
                      </button>
                    ) : (
                      <>
                        {isManifesto && onApply && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onApply?.();
                              setIsTeaserOpen(false);
                            }}
                            className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-3 text-xs font-bold uppercase tracking-widest text-prestige-gold transition-colors hover:bg-prestige-gold/20"
                          >
                            + Rôle au ring
                          </button>
                        )}
                        {status === 'pending' && onSaisirAffaire && !mediator_name && !isParticipant && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaisirAffaire();
                              setIsTeaserOpen(false);
                            }}
                            className="w-full rounded-xl bg-prestige-gold py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(212,175,55,0.5)] transition-transform hover:scale-[1.02] active:scale-95"
                          >
                            Devenir le Ref
                          </button>
                        )}
                        {status === 'pending' && !!mediator_name && onValiderRef && (
                          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <span className="text-center text-[11px] text-gray-300">@{mediator_name} postule.</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRefuserRef?.();
                                  setIsTeaserOpen(false);
                                }}
                                className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
                              >
                                Refuser
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onValiderRef();
                                  setIsTeaserOpen(false);
                                }}
                                className="flex-1 rounded-lg bg-prestige-gold py-2.5 text-xs font-bold text-black shadow-[0_0_10px_rgba(212,175,55,0.4)] hover:bg-yellow-500"
                              >
                                Valider
                              </button>
                            </div>
                          </div>
                        )}

                        {(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef)) && (
                          <>
                            {userInviteStatus === 'pending' ? (
                              <div className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-4 text-center text-sm font-bold text-prestige-gold">
                                ⚠️ Convocation en attente
                              </div>
                            ) : userInviteStatus === 'declined' ? (
                              <div className="w-full rounded-xl border border-blood-500/40 bg-blood-500/10 py-4 text-center text-sm font-bold text-blood-400">
                                ❌ Convocation refusée
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClick();
                                  setIsTeaserOpen(false);
                                }}
                                className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                              >
                                Rejoindre la salle d'attente
                              </button>
                            )}
                            {status === 'pending' && pendingRefText && userInviteStatus !== 'pending' && (
                              <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                                {pendingRefText}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
```

---

## 2. Bloc isolé — rendu conditionnel « Rejoindre la salle d'attente »

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 814–841

```tsx
                        {(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef)) && (
                          <>
                            {userInviteStatus === 'pending' ? (
                              <div className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-4 text-center text-sm font-bold text-prestige-gold">
                                ⚠️ Convocation en attente
                              </div>
                            ) : userInviteStatus === 'declined' ? (
                              <div className="w-full rounded-xl border border-blood-500/40 bg-blood-500/10 py-4 text-center text-sm font-bold text-blood-400">
                                ❌ Convocation refusée
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClick();
                                  setIsTeaserOpen(false);
                                }}
                                className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                              >
                                Rejoindre la salle d'attente
                              </button>
                            )}
                            {status === 'pending' && pendingRefText && userInviteStatus !== 'pending' && (
                              <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                                {pendingRefText}
                              </div>
                            )}
                          </>
                        )}
```

**Comportement actuel :**

| `userInviteStatus` | Rendu |
|--------------------|--------|
| `'pending'` | Bandeau non cliquable « ⚠️ Convocation en attente » |
| `'declined'` | Bandeau non cliquable « ❌ Convocation refusée » |
| **`null`**, **`'accepted'`**, ou toute autre valeur | Bouton cliquable « Rejoindre la salle d'attente » → `onClick()` |

Aucune distinction entre spectateur pur et challenger accepté dans la branche `else`. Aucun `disabled`, aucune vérification de `status === 'live'`, aucune vérification de `mediator_id`.

---

## 3. Variables de permission disponibles dans `BeefCard`

### 3.1 Props RBAC / rôle

**Interface — l. 48–49, 64–67, 121 :**

```typescript
  mediator_id?: string | null;
  mediator_name?: string | null;
  onPrepareAudience?: () => void;
  liveAudienceAction?: { variant: 'join' | 'return'; onClick: () => void };
  userInviteStatus?: string | null;
```

**Câblage parent (`app/feed/page.tsx` l. 1028–1033) — qui reçoit `onPrepareAudience` :**

```tsx
                    onPrepareAudience={
                      (beef.status === 'scheduled' || beef.status === 'pending') &&
                      (user?.id === beef.mediator_id || (!beef.mediator_id && user?.id === beef.created_by))
                        ? () => router.push(`/arena/${beef.id}`)
                        : undefined
                    }
```

### 3.2 Dérivées locales

**`isParticipant` — l. 143–150 :**

```typescript
  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      user.user_metadata?.username === challenger_c_username ||
      user.user_metadata?.username === challenger_d_username ||
      user.user_metadata?.username === host_username
    : false;
```

**Limites :** ne couvre **pas** `mediator_id`. Un Ref validé n'est pas `isParticipant` sauf s'il est aussi host/challenger/creator. Ne s'appuie **pas** sur `userInviteStatus`.

**`isWaitingForMe` — l. 152–156 :**

```typescript
  const isWaitingForMe =
    status === 'pending' &&
    Boolean(mediator_id) &&
    user?.id === mediator_id &&
    user?.id !== created_by;
```

Ref en attente de validation créateur (manifesto).

**`isManifesto` — l. 204 :**

```typescript
  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
```

### 3.3 Tableau — détection spectateur pur

| Signal | Disponible | Fiabilité pour « spectateur pur » |
|--------|------------|-----------------------------------|
| `userInviteStatus === null` | ✅ prop feed | Forte — pas de ligne `beef_invitations` pour cet user |
| `userInviteStatus === 'accepted'` | ✅ | Challenger / invité accepté — **pas** spectateur |
| `isParticipant === false` | ✅ local | Partielle — exclut Ref, peut exclure challenger si username non résolu |
| `user?.id === mediator_id` | ✅ | Ref — accès Régie via `onPrepareAudience`, pas spectateur |
| `user?.id === created_by` | ✅ | Créateur — Régie si pas de Ref |
| `onPrepareAudience` défini | ✅ | Exclut déjà Ref/créateur de la branche salle d'attente |
| `mediator_id` / `mediator_name` | ✅ | Présence Ref (UUID vs affichage) |

**Spectateur pur (heuristique actuelle la plus fiable) :**

```typescript
userInviteStatus == null && !isParticipant && user?.id !== mediator_id && user?.id !== created_by
```

---

## 4. Présence du Ref — variables

| Variable | Rôle | Usage actuel dans BeefCard |
|----------|------|----------------------------|
| `mediator_id` | UUID Ref validé en base | `isWaitingForMe`, `getPendingRefText`, `AuraGiversModal.ownerId` |
| `mediator_name` | Affichage @Ref | Garde « Devenir le Ref » (`!mediator_name`), textes pending manifesto |
| `onPrepareAudience` | Prop dérivée côté feed si user = Ref ou créateur sans Ref | Remplace tout le bloc salle d'attente par « Préparer la Régie » |

**Incohérence :** « Devenir le Ref » teste `!mediator_name` ; la validation Ref teste `!!mediator_name`. Le verrou UI demandé devrait préférer **`mediator_id`** (contrat RBAC) plutôt que `mediator_name` seul (peut être vide alors que le Ref existe).

---

## 5. Grep — « salle d'attente » et textes participant

### 5.1 Chaîne exacte dans `BeefCard.tsx`

Une seule occurrence :

```tsx
                                Rejoindre la salle d'attente
```

(l. 834)

### 5.2 Autres textes orientés « participant » (sans « salle d'attente »)

**`getPendingRefText()` — l. 221–236 :**

```typescript
  const getPendingRefText = () => {
    // Logique pour les Médiations standards
    if (intent !== 'manifesto') {
      if (user?.id === mediator_id) return 'En attente des combattants…';
      if (userInviteStatus === 'pending') return null; // Masqué pour éviter le doublon avec le bouton d'action
      if (userInviteStatus === 'accepted') return 'En attente de ton adversaire…';
      return 'En attente des participants…'; // Spectateurs
    }

    // Logique spécifique aux Manifestes
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validation…' : "En attente d'un Ref…";
  };
```

**Autres libellés proches :**

| Ligne | Texte | Public visé |
|-------|-------|-------------|
| 768 | `+ Rôle au ring` | Postulant manifesto |
| 781 | `Devenir le Ref` | Non-participant, pas de Ref |
| 818 | `⚠️ Convocation en attente` | Invité `pending` |
| 740 | `🔴 Rejoindre le Direct` | Live (via `liveAudienceAction`) |
| 754 | `🎛️ Préparer la Régie` | Ref / créateur sans Ref |

**Effet de bord :** un challenger `accepted` voit « Rejoindre la salle d'attente » **et** le sous-texte « En attente de ton adversaire… » — message cohérent pour lui, mais **identique** au spectateur qui voit le même bouton avec « En attente des participants… ».

---

## 6. Branche `live` (comparaison — pas de verrou non-live)

**Lignes :** 722–741

```tsx
                ) : status === 'live' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (liveAudienceAction) {
                        liveAudienceAction.onClick();
                      } else {
                        onClick();
                      }
                      setIsTeaserOpen(false);
                    }}
                    ...
                  >
                    {liveAudienceAction?.variant === 'return' ? '⚔️ Retourner dans l\'Agora' : '🔴 Rejoindre le Direct'}
                  </button>
```

En `live`, **tous** les utilisateurs ont un bouton cliquable vers `/arena/{id}` (feed passe toujours `liveAudienceAction`). Pas de distinction spectateur / participant.

---

## 7. Lacune `status === 'ready'`

La branche CTA ne couvre que `scheduled || pending` (l. 742). Un beef `ready` tombe dans `: null` (l. 861) — **aucun CTA** en modale. À noter pour la matrice rôle × statut.

---

## 8. Observations — croisement pour un verrou UI cible

Objectif Architecte : différencier les CTAs par rôle exact ; **verrouiller le clic spectateur** si Ref absent **et** statut non-live.

### 8.1 Matrice rôle × statut (état actuel)

| Profil | `pending` sans Ref | `pending` avec Ref | `scheduled` | `live` |
|--------|-------------------|-------------------|-------------|--------|
| Ref | Régie (`onPrepareAudience`) | Régie | Régie | Rejoindre Direct |
| Créateur sans Ref | Régie | Régie | Régie | Rejoindre Direct |
| Challenger `accepted` | **Salle d'attente** (cliquable) | **Salle d'attente** | **Salle d'attente** | Rejoindre Direct |
| Invité `pending` | Bandeau convocation | idem | idem | Rejoindre Direct |
| **Spectateur (`null`)** | **Salle d'attente** (cliquable) ❌ | **Salle d'attente** (cliquable) | **Salle d'attente** (cliquable) | Rejoindre Direct |

### 8.2 Condition de verrou proposée (analyse, pas implémentation)

**Spectateur pur :**

```typescript
const isPureSpectator =
  userInviteStatus == null &&
  !isParticipant &&
  user?.id !== mediator_id &&
  user?.id !== created_by;
```

**Arène « inactive » pour spectateur (Ref absent + non-live) :**

```typescript
const isArenaInactiveForSpectator =
  !mediator_id && status !== 'live';
```

**Verrou UI (clic + style disabled) :**

```typescript
const shouldLockSpectatorCTA = isPureSpectator && isArenaInactiveForSpectator;
```

**Cas limites à trancher avant implémentation :**

1. **`scheduled` avec Ref présent** — le spectateur doit-il entrer en salle d'attente avant le direct, ou rester verrouillé jusqu'au `live` ?
2. **Manifesto sans Ref** — spectateur voit « En attente d'un Ref… » + bouton cliquable ; le verrou `!mediator_id` bloquerait aussi les challengers `accepted` tant que le Ref n'est pas validé — probablement souhaité.
3. **`userInviteStatus === 'accepted'` mais `isParticipant === false`** — mismatch username/metadata ; le bouton reste actif aujourd'hui.
4. **`onClick` parent** (`handleBeefClick` feed) pousse **toujours** `/arena/{id}` hors replays — le verrou modale ne suffit pas si le clic carte/teaser contourne le CTA.
5. **`mediator_name` vs `mediator_id`** — un Ref postulant non validé a `mediator_id` en base mais le créateur voit « Valider » ; les spectateurs n'ont pas encore de Ref **validé** si seul `mediator_name` est set sans `mediator_id` — aligner la condition sur le contrat feed/RBAC.

### 8.3 Piste de différenciation CTA (sans coder)

| Profil | CTA souhaité (pending/scheduled, Ref OK ou live imminent) | CTA si verrou |
|--------|-----------------------------------------------------------|---------------|
| Spectateur | « Suivre l'affaire » / bandeau informatif | Disabled + « Arène pas encore ouverte » |
| Challenger `accepted` | « Rejoindre la salle d'attente » | Actif dès Ref validé |
| Ref / créateur | « Préparer la Régie » | Déjà isolé via `onPrepareAudience` |
| Invité `pending` | Bandeau convocation | Déjà non cliquable |

---

## 9. Synthèse des failles confirmées

1. **Branche `else` du ternaire `userInviteStatus`** — tout profil hors `pending`/`declined` reçoit le même bouton cliquable, y compris spectateurs (`null`).
2. **Aucun test `mediator_id` ni `status === 'live'`** sur ce bouton.
3. **`isParticipant` incomplet** — ne modélise pas le Ref ni `userInviteStatus`.
4. **Textes pending** (`getPendingRefText`) partiellement différenciés, mais le CTA principal ne suit pas la même granularité.
5. **`status === 'ready'`** — trou CTA total en modale.

---

**Fin du rapport — prêt pour plan de correction Architecte.**
