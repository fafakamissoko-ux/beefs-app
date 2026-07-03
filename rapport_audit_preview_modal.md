# Rapport d'audit — Modale aperçu public (ProfileContent)

**Date :** 2026-05-31  
**Mode :** extraction uniquement — aucune modification de code  
**Fichier cible :** `app/profile/ProfileContent.tsx`  
**Objectif Phase 3.3 :** préparer le remplacement par `<ProfileHeader mode="preview" />`

---

## Localisation

| Élément | Détail |
|---------|--------|
| État conditionnel | `publicPreviewOpen` (`useState(false)` — L106) |
| Fermeture | `closePublicPreview` → `setPublicPreviewOpen(false)` (L297) |
| Plage JSX extraite | **L849–1030** (`{publicPreviewOpen && ( ... )}`) |
| Déclencheur ouverture | Bouton « Aperçu public » dans `ProfileHeader` actionButtons (`setPublicPreviewOpen(true)`) |

## Effets associés (hors bloc JSX, référence intégration)

- **Escape** : listener `keydown` Escape → `closePublicPreview` (L360–371)
- **Focus** : autofocus bouton fermeture `#profile-preview-close` à l'ouverture (L374–379)
- **Navigation preview** : `goPreviewParticipations`, `goPreviewMediations`, `goPreviewFollowers`, `goPreviewFollowing` (L317–338)

## Contenu de la modale (structure)

1. Overlay fixe `fixed inset-0 z-modal` + fermeture au clic backdrop
2. Dialog ARIA avec titre « Aperçu » + bouton fermer (`X`)
3. **Mini-header inline dupliqué** (bannière CSS, avatar, identité, Aura, métriques) — **cible remplacement ProfileHeader preview**
4. Section **Vox Populi** (`mediatorReviews`, condition `stats.beefs_hosted > 0 \|\| mediatorReviews.length > 0`)
5. Lien « Ouvrir la page publique dans un onglet » → `/profile/{username}`

## Code JSX brut extrait (intégralité L849–1030)

```tsx
      {publicPreviewOpen && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
          role="presentation"
          onClick={closePublicPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-preview-title"
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[2rem] border border-white/[0.1] bg-white/[0.04] backdrop-blur-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
              <h2 id="profile-preview-title" className="text-lg font-bold text-white">
                Aperçu
              </h2>
              <button
                type="button"
                id="profile-preview-close"
                onClick={closePublicPreview}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 touch-manipulation"
                aria-label="Fermer l’aperçu"
              >
                <X className="w-6 h-6 sm:w-5 sm:h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-y-auto max-h-[min(78vh,760px)]">
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/50">
                <div
                  className="h-28 bg-cover bg-center"
                  style={
                    profile.banner_url
                      ? { backgroundImage: `url(${profile.banner_url})` }
                      : {
                          background: `linear-gradient(135deg, ${profile.accent_color || '#E83A14'}44, ${profile.accent_color || '#E83A14'}11)`,
                        }
                  }
                />
                <div className="px-5 pb-5 -mt-12 relative">
                  <div
                    className={`relative w-24 h-24 rounded-[1.5rem] border-4 border-[#0f0f0f] overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-3xl font-black text-white ${
                      profile.is_premium ? 'shadow-[0_0_20px_rgba(212,175,55,0.35)]' : ''
                    }`}
                    style={{ borderColor: profile.is_premium ? '#D4AF37' : profile.accent_color || '#E83A14' }}
                  >
                    {profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="96px" />
                    ) : (
                      profile.username[0].toUpperCase()
                    )}
                  </div>
                  {/* User Info & Bio — aperçu */}
                  <div className="mb-4 mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-sans text-2xl font-black text-white">{profile.display_name}</h3>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">@{profile.username}</p>

                    {profile.bio && (
                      <p className="text-gray-200 text-sm mb-4 leading-relaxed whitespace-pre-wrap line-clamp-6">{profile.bio}</p>
                    )}

                    {/* Aura (aperçu public) */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      {(() => {
                        const currentAura = profile.lifetime_points ?? profile.points;
                        const rank = getAuraRank(currentAura);
                        return (
                          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md">
                            <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
                            <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                              {rank.title}
                            </span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <InlineAuraGivers
                          targetId={profile.id}
                          type="profile"
                          ownerId={profile.id}
                        />
                        <Flame className="h-4 w-4 text-brand-500" aria-hidden />
                        <span className="font-bold text-white">
                          {(profile.lifetime_points ?? profile.points).toLocaleString('fr-FR')}
                        </span>{' '}
                        Aura
                      </div>
                      {stats.beefs_resolved >= 3 && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-400" title="Indice de Sagesse">
                          <span className="font-bold text-prestige-gold">
                            ✦ {(stats.beefs_resolved / Math.max(stats.beefs_hosted, 1) * 100).toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Métriques Standard (X/Instagram style) */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <button type="button" onClick={goPreviewParticipations} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.beefs_participated}</span>
                        <span className="text-gray-400">Affaires</span>
                      </button>
                      <button type="button" onClick={goPreviewMediations} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.beefs_hosted}</span>
                        <span className="text-gray-400">Médiations</span>
                      </button>
                      <div className="flex gap-1.5 cursor-help" title="Forfaits ou désistements">
                        <span className="font-bold text-white">{stats.beefs_abandoned}</span>
                        <span className="text-gray-400">Réputation</span>
                      </div>
                      <button type="button" onClick={goPreviewFollowers} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.followers}</span>
                        <span className="text-gray-400">Abonnés</span>
                      </button>
                      <button type="button" onClick={goPreviewFollowing} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.following}</span>
                        <span className="text-gray-400">Abonnements</span>
                      </button>
                    </div>
                  </div>
                  {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
                    <div className="mt-5 pt-4 border-t border-white/[0.08]">
                      <h4 className="font-sans text-xs font-bold text-white mb-2 flex items-center gap-2">
                        <Star className="w-3.5 h-3.5 text-prestige-gold" aria-hidden />
                        Vox Populi (Évaluations)
                      </h4>
                      {mediatorReviews.length === 0 ? (
                        <p className="font-sans text-xs text-white/25 italic">
                          Aucun avis pour le moment — déposés après un direct sur la page résumé.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {mediatorReviews.slice(0, 3).map((review) => (
                            <li
                              key={review.id}
                              className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2 backdrop-blur-xl"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <ProfileUserLink
                                  username={review.authorUsername}
                                  className="font-sans text-[10px] font-bold text-white/60"
                                >
                                  {review.authorName}
                                </ProfileUserLink>
                                <span className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                                  {Array.from({ length: review.rating }).map((_, i) => (
                                    <Star key={i} className="w-2 h-2 fill-prestige-gold text-prestige-gold" />
                                  ))}
                                </span>
                              </div>
                              {review.comment ? (
                                <p className="font-sans text-xs text-white/40 font-light italic leading-relaxed">
                                  &ldquo;{review.comment}&rdquo;
                                </p>
                              ) : (
                                <p className="font-sans text-[10px] text-white/20">Note sans commentaire</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center mt-4">
                <Link
                  href={`/profile/${encodeURIComponent(profile.username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 text-sm font-semibold hover:underline"
                  onClick={() => setPublicPreviewOpen(false)}
                >
                  Ouvrir la page publique dans un onglet
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
```

---

## Notes pour Phase 3.3

- Le bloc L877–1015 (carte `rounded-2xl` avec mini-header) est le **candidat direct** au slot `ProfileHeader mode="preview"`.
- Conserver la coquille dialog (L849–875, L1016–1029) autour du header unifié.
- Section Vox Populi (L971–1013) et lien externe (L1016–1026) restent **hors** `ProfileHeader`.
- Indice Sagesse (L938–944) n'existe pas dans `ProfileHeader` actuel — décision Architecte requise (prop extra ou section sibling).
