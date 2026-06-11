# Rapport Phase 2 UI — Formulaire changement d'e-mail

**Date :** 2026-05-31  
**Fichier cible :** `app/settings/page.tsx`  
**Onglet :** `activeTab === 'profile'`  
**Commande :** `npx tsc --noEmit`

## Statut de compilation TypeScript

**Résultat : SUCCÈS** (exit code 0, aucune erreur TypeScript)

## Remplacement confirmé

| Élément | Avant | Après |
|---------|-------|-------|
| Localisation | L667–676 (bloc statique) | L667–719 (formulaire interactif) |
| Affichage e-mail actuel | `<span className="text-gray-400">` | `<span className="text-white">` + label « Adresse Email » |
| Interaction | Aucune (texte informatif Supabase Auth) | Formulaire Premium Glass branché sur `handleChangeEmail` |
| États UI | — | `idle` → formulaire ; `loading` → champs/bouton désactivés ; `pending_confirmation` → bannière brand |

## Bloc supprimé (ancien JSX statique)

```tsx
<div>
  <p id="settings-email-label" className="block text-white font-semibold mb-2 text-sm">
    Email
  </p>
  <div className="flex items-center gap-2" role="group" aria-labelledby="settings-email-label">
    <Mail className="w-5 h-5 text-gray-400" aria-hidden />
    <span className="text-gray-400">{profile.email}</span>
  </div>
  <p className="text-gray-500 text-xs mt-1">L&apos;email est géré par votre fournisseur d&apos;authentification</p>
</div>
```

## Bloc injecté (nouveau JSX interactif)

```667:719:app/settings/page.tsx
              <div>
                <label className="block text-white font-semibold mb-2 text-sm">
                  Adresse Email
                </label>
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5 text-gray-400" aria-hidden />
                  <span className="text-white">{profile.email}</span>
                </div>

                {emailChangeStatus === 'pending_confirmation' ? (
                  <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-brand-400 text-sm shadow-lg">
                    <p className="font-bold flex items-center gap-2"><Check className="w-4 h-4" /> E-mail de confirmation envoyé</p>
                    <p className="mt-1 opacity-80 leading-relaxed">
                      Un lien a été envoyé à <strong>{emailForm.newEmail || 'la nouvelle adresse'}</strong>.
                      Veuillez cliquer dessus pour valider le changement. Votre ancienne adresse reste active en attendant.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-white/5 bg-black/20 p-4">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Modifier l&apos;adresse</p>
                    <input
                      type="email"
                      placeholder="Nouvelle adresse e-mail"
                      value={emailForm.newEmail}
                      onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                      className={SETTINGS_INPUT}
                      disabled={emailChangeStatus === 'loading'}
                    />
                    <input
                      type="password"
                      placeholder="Mot de passe actuel (requis pour sécurité)"
                      value={emailForm.currentPassword}
                      onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                      className={SETTINGS_INPUT}
                      disabled={emailChangeStatus === 'loading'}
                    />
                    {emailError && (
                      <p className="text-red-400 text-xs flex items-start gap-1.5 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{emailError}</span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleChangeEmail}
                      disabled={!emailForm.newEmail || !emailForm.currentPassword || emailChangeStatus === 'loading'}
                      className="mt-2 w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {emailChangeStatus === 'loading' ? 'Envoi de la demande...' : 'Mettre à jour l\'e-mail'}
                    </button>
                  </div>
                )}
              </div>
```

## Design system Premium Glass — conformité

| Token / classe | Usage dans le formulaire |
|----------------|--------------------------|
| `SETTINGS_INPUT` | Champs e-mail et mot de passe (rounded-full, border white/10, bg white/5) |
| `rounded-2xl border border-white/5 bg-black/20` | Conteneur « Modifier l'adresse » |
| `rounded-full border border-white/10 bg-white/5` | Bouton secondaire glass |
| `border-brand-500/30 bg-brand-500/10 text-brand-400` | Bannière confirmation pending |
| `AlertCircle` + `text-red-400` | Affichage erreur `emailError` |

## Ajustement logique minimal (cohérence UI)

Dans `handleChangeEmail`, après succès Supabase, seul `currentPassword` est réinitialisé — `newEmail` est conservé pour alimenter la bannière `pending_confirmation` (évite le fallback « la nouvelle adresse »).

```tsx
setEmailChangeStatus('pending_confirmation');
setEmailForm((prev) => ({ ...prev, currentPassword: '' }));
```

## Wiring handlers ↔ UI

| Prop / handler | Rôle |
|----------------|------|
| `emailForm.newEmail` / `emailForm.currentPassword` | Champs contrôlés |
| `handleChangeEmail` | Soumission via bouton « Mettre à jour l'e-mail » |
| `emailChangeStatus` | Bascule formulaire / loading / bannière confirmation |
| `emailError` | Message d'erreur inline sous les champs |

## Synthèse

Le bloc e-mail statique de l'onglet Profil a été **intégralement remplacé** par le formulaire interactif Premium Glass. La logique métier Phase 2 (`handleChangeEmail`, états `emailForm` / `emailChangeStatus` / `emailError`) est désormais exposée dans l'UI. Compilation TypeScript validée.
