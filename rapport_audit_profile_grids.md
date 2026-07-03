# Rapport d'audit — Grilles & panneaux onglets profil

**Date :** 2026-05-31  
**Mode :** extraction uniquement — aucune modification de code  
**Objectif :** calibrer le futur composant partagé de grilles BeefCard / avis sous `ProfileTabs`

---

## 1. Privé — Rendu conditionnel onglets (`ProfileContent.tsx`)

**Après :** `<ProfileTabs />` (fermeture L634)  
**Plage extraite :** L636–829  
**Onglets :** `stats` (tuiles résolution + BeefCard filtrés `mediationBeefs`) | `debates` (grille `beefs` + `MediationBeefEditorPanel`)

```tsx
          {activeTab === 'stats' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-2">⚖️ Historique des Jugements</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-4 max-w-3xl">
                Chaque beef médié est classé selon son statut en base :{' '}
                <strong className="text-gray-400">En cours</strong> (live, programmé, préparation),{' '}
                <strong className="text-gray-400">Résolu</strong> quand la session se termine avec une clôture « succès »
                (fin explicite par le médiateur, temps max, etc.),{' '}
                <strong className="text-gray-400">Non résolu</strong> si personne n’a pu débattre jusqu’au bout,{' '}
                <strong className="text-gray-400">Abandonné</strong> si la room s’arrête sans médiation aboutie (déconnexion, bug, fin sans statut).
                Les anciens tests marqués « résolus » par défaut peuvent encore apparaître ainsi jusqu’à correction des données.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {([
                  { id: 'resolved', value: stats.beefs_resolved, label: 'Verdicts', desc: 'Conflits tranchés', color: 'green', icon: Check },
                  { id: 'in_progress', value: stats.beefs_in_progress, label: 'En cours', desc: 'Beefs actifs ou programmés', color: 'blue', icon: Clock },
                  { id: 'unresolved', value: stats.beefs_unresolved, label: 'Impasses', desc: 'Médiation sans accord', color: 'brand', icon: X },
                  { id: 'abandoned', value: stats.beefs_abandoned, label: 'Désertions', desc: 'Beefs annulés/forfaits', color: 'gray', icon: Flame },
                ] as const).map((tile) => {
                  const Icon = tile.icon;
                  const active = selectedResolutionFilter === tile.id;
                  const accent = tile.color === 'brand' ? 'brand-500' : tile.color === 'gray' ? 'gray-500' : `${tile.color}-500`;
                  return (
                    <button
                      key={tile.id}
                      onClick={() => setSelectedResolutionFilter(active ? null : tile.id)}
                      className={`rounded-2xl bg-white/[0.04] backdrop-blur-xl border p-4 text-left transition-all duration-200 hover:scale-[0.98] hover:bg-white/[0.06] ${
                        active ? `border-${accent} ring-2 ring-${accent}/50` : 'border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 bg-${accent}/15 rounded-xl flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`} />
                        </div>
                        <div>
                          <p className="font-mono text-2xl font-black text-white tabular-nums">{tile.value}</p>
                          <p className={`font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`}>{tile.label}</p>
                        </div>
                      </div>
                      <p className="font-sans text-[11px] text-white/35">{tile.desc}</p>
                      {active && <p className={`font-mono text-[10px] mt-2 font-bold tracking-wider text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`}>FILTRE ACTIF</p>}
                    </button>
                  );
                })}
              </div>

              {/* Filtered Beefs List */}
              {selectedResolutionFilter && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">
                      {selectedResolutionFilter === 'resolved' && '✅ Verdicts'}
                      {selectedResolutionFilter === 'in_progress' && '⏳ Beefs En Cours'}
                      {selectedResolutionFilter === 'unresolved' && '❌ Impasses'}
                      {selectedResolutionFilter === 'abandoned' && '🚫 Désertions'}
                    </h3>
                    <button
                      onClick={() => setSelectedResolutionFilter(null)}
                      className="text-gray-400 hover:text-white text-sm font-semibold"
                    >
                      Réinitialiser
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {mediationBeefs
                      .filter((beef) => mediationCategoryForBeef(beef) === selectedResolutionFilter)
                      .map((beef, idx) => (
                        <BeefCard
                          key={beef.id}
                          id={beef.id}
                          index={idx}
                          title={beef.title}
                          host_name={beef.card_host_name || profile?.display_name || profile?.username || 'Utilisateur'}
                          host_username={beef.card_host_username}
                          status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                          created_at={beef.created_at}
                          viewer_count={beef.viewer_count || 0}
                          tags={beef.tags}
                          scheduled_at={beef.scheduled_at}
                          onClick={() => {
                          if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                            router.push(`/beef/${beef.id}/summary`);
                          } else {
                            router.push(`/arena/${beef.id}`);
                          }
                        }}
                        />
                      ))}
                    {mediationBeefs.filter((beef) => mediationCategoryForBeef(beef) === selectedResolutionFilter)
                      .length === 0 && (
                      <div className="text-center py-12 bg-white/5 rounded-[2px]">
                        <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Aucun beef dans cette catégorie</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Success Rate */}
              <div className="bg-white/5 rounded-[2px] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Taux de réussite</h3>
                    <p className="text-gray-400 text-sm">Pourcentage de beefs résolus avec succès</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                      {stats.beefs_hosted > 0 ? Math.round((stats.beefs_resolved / stats.beefs_hosted) * 100) : 0}%
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${stats.beefs_hosted > 0 ? (stats.beefs_resolved / stats.beefs_hosted) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Other Stats */}
              <h3 className="text-white font-bold text-lg mb-4">📈 Autres statistiques</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-[2px] p-6">
                  <Trophy className="w-8 h-8 text-yellow-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Beefs Hébergés</h3>
                  <p className="text-3xl font-black text-white">{stats.beefs_hosted}</p>
                  <p className="text-gray-400 text-sm mt-1">Total de médiations effectuées</p>
                </div>
                <div className="bg-white/5 rounded-[2px] p-6">
                  <Users className="w-8 h-8 text-blue-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Vues Totales</h3>
                  <p className="text-3xl font-black text-white">{stats.total_views.toLocaleString()}</p>
                  <p className="text-gray-400 text-sm mt-1">Popularité des beefs</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'debates' && (
            <div>
              {beefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {beefs.map((beef, idx) => (
                    <div key={beef.id} className="space-y-2">
                      <BeefCard
                        id={beef.id}
                        index={idx}
                        title={beef.title}
                        host_name={beef.card_host_name || profile?.display_name || profile?.username || 'Utilisateur'}
                        host_username={beef.card_host_username}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        onClick={() => {
                          if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                            router.push(`/beef/${beef.id}/summary`);
                          } else {
                            router.push(`/arena/${beef.id}`);
                          }
                        }}
                      />
                      {user && beef.mediator_id === user.id && (
                        <MediationBeefEditorPanel
                          beefId={beef.id}
                          resolutionStatus={beef.resolution_status}
                          mediationSummary={beef.mediation_summary ?? ''}
                          onSaved={(patch) => applyMediationBeefPatch(beef.id, patch)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">Aucun beef pour le moment</p>
                  <Link
                    href={hrefWithFrom('/create', pathname)}
                    className="inline-block px-6 py-3 brand-gradient hover:opacity-90 text-black font-bold rounded-[2px] transition-all"
                  >
                    Créer un beef
                  </Link>
                </div>
              )}
            </div>
          )}
```

---

## 2. Public — Rendu conditionnel onglets (`[username]/page.tsx`)

**Après :** `<ProfileTabs />` (fermeture L791)  
**Plage extraite :** L793–921  
**Onglets :** `debates` (grille `beefs` + `MediationSummaryPublic`) | `participations` (grille `participantBeefs`) | `reviews` (liste avis `mediatorReviews`, pas de `ReviewCard` — markup inline `<li>`)

```tsx
          {/* Contenu des Onglets */}
          {activeTab === 'debates' && (
            <div id="profile-section-beefs" className="scroll-mt-24">
              {beefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {beefs.map((beef, idx) => (
                    <div key={beef.id} className="space-y-2">
                      <BeefCard
                        id={beef.id}
                        index={idx}
                        title={beef.title}
                        host_name={beef.host_name}
                        host_username={beef.host_username}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        onClick={() => {
                        if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                          router.push(`/beef/${beef.id}/summary`);
                        } else {
                          router.push(`/arena/${beef.id}`);
                        }
                      }}
                      />
                      {(beef.resolution_status && beef.resolution_status !== 'in_progress') || beef.mediation_summary?.trim() ? (
                        <div className="pl-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          {beef.resolution_status && beef.resolution_status !== 'in_progress' && (
                            <p className="text-[11px] text-gray-500">
                              Issue de la médiation :{' '}
                              <span className="text-gray-400 font-medium">
                                {resolutionStatusLabel(beef.resolution_status)}
                              </span>
                            </p>
                          )}
                          <MediationSummaryPublic text={beef.mediation_summary ?? ''} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune médiation pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'participations' && (
            <div id="profile-section-participations" className="scroll-mt-24">
              {participantBeefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {participantBeefs.map((beef, idx) => (
                    <BeefCard
                      key={beef.id}
                      id={beef.id}
                      index={idx}
                      title={beef.title}
                      host_name={beef.host_name}
                      host_username={beef.host_username}
                      status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                      created_at={beef.created_at}
                      viewer_count={beef.viewer_count || 0}
                      tags={beef.tags}
                      scheduled_at={beef.scheduled_at}
                      onClick={() => {
                        if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                          router.push(`/beef/${beef.id}/summary`);
                        } else {
                          router.push(`/arena/${beef.id}`);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune affaire pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div id="profile-section-reviews" className="scroll-mt-24">
              <h2 className="mb-3 flex items-center gap-2 font-black text-xl text-white">
                <Star className="h-5 w-5 text-prestige-gold" aria-hidden strokeWidth={1.5} />
                Vox Populi · Évaluations
              </h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Les spectateurs déposent un avis depuis la page résumé d&apos;un direct terminé (une fois par beef).
              </p>
              {mediatorReviews.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun avis pour le moment.</p>
              ) : (
                <ul className="space-y-3">
                  {mediatorReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 backdrop-blur-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <ProfileUserLink
                          username={review.authorUsername}
                          className="text-sm font-semibold text-white/80"
                        >
                          {review.authorName}
                        </ProfileUserLink>
                        <span className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-prestige-gold text-prestige-gold" />
                          ))}
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="text-sm text-gray-400 italic leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                      ) : (
                        <p className="text-xs text-gray-600">Note sans commentaire</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
```

---

## Synthèse — props futures `ProfileBeefGrid` / panneaux

| Panneau | Privé | Public |
|---------|-------|--------|
| Liste beefs médiés | `mediationBeefs` + filtre `selectedResolutionFilter` | `beefs` |
| Liste participations | `beefs` (fusion) | `participantBeefs` |
| BeefCard props | `card_host_name`, `card_host_username`, `onClick` → summary/arena | `host_name`, `host_username`, idem |
| Extra médiateur | `MediationBeefEditorPanel` si `mediator_id === user.id` | `MediationSummaryPublic` + `resolutionStatusLabel` |
| Stats-only | Tuiles résolution, taux réussite, empty states | — |
| Avis | — (dans modale preview) | `mediatorReviews.map` inline (ProfileUserLink + Star) |
| Empty states | Créer un beef (Link `/create`) | Messages statiques |

**Note :** Aucun composant `ReviewCard` importé — les avis publics sont rendus en liste `<ul>/<li>` custom.

**Prochaine étape Architecte :** unification en composants `ProfileTabPanel` / `ProfileBeefGrid` avec variantes owner/public.
