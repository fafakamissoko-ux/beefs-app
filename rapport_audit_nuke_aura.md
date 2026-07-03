# Rapport d'audit — Nuke & Pave Aura Teaser

**Date :** 31 mai 2026  
**Cibles :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Objectif :** extraction des blocs à démolir (aucun correctif)

---

## 1. `app/feed/page.tsx` — Abonnement Realtime `beefs_changes` (debounce 1500 ms)

**Fichier :** `app/feed/page.tsx`  
**Lignes :** 623–654

```typescript
  useEffect(() => {
    if (authLoading) return;
    void loadBeefs();

    let debounceTimer: NodeJS.Timeout;

    const channel = supabase
      .channel('beefs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => {
        // Bouclier réseau : annule la requête précédente si la DB spamme les événements
        clearTimeout(debounceTimer);
        // Attend 1.5s que la base soit stabilisée avant de déclencher le refetch
        debounceTimer = setTimeout(() => {
          void loadBeefs(true);
        }, 1500);
      })
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      channel.unsubscribe();
    };
  }, [
    authLoading,
    user?.id,
    feedType,
    selectedTags,
    selectedStatus,
    followingIds,
    fetchLimit,
    loadBeefs,
  ]);
```

---

## 2. `app/feed/page.tsx` — `handleTeaserAuraClick`

**Fichier :** `app/feed/page.tsx`  
**Lignes :** 746–790

```typescript
  /** Teaser : pas d’optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
  const handleTeaserAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingTeaser.current) return;
    isLikingTeaser.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    if (!targetBeef) {
      isLikingTeaser.current = false;
      return;
    }
    const isCurrentlyLiked = !!targetBeef.has_liked_teaser;

    // --- AJOUT OPTIMISTIC UI (Partiel) ---
    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          return {
            ...b,
            has_liked_teaser: !b.has_liked_teaser,
            // On retire l'incrémentation locale du score pour éviter le glitch "+2".
            // Le Realtime se chargera de fetcher le compte exact après 1500ms.
          };
        }
        return b;
      }),
    );
    // -------------------------------------

    try {
      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from('teaser_likes')
          .delete()
          .match({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teaser_likes').insert({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Erreur lors du vote Aura (teaser):', error);
    }
    setTimeout(() => {
      isLikingTeaser.current = false;
    }, 1500);
  };
```

---

## 3. `components/BeefCard.tsx` — État local particules & verrou Teaser

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 135, 144

```typescript
  const [teaserFloatingAuras, setTeaserFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
```

```typescript
  const localTeaserAuraLock = useRef(false);
```

---

## 4. `components/BeefCard.tsx` — JSX complet du bouton Aura Teaser (modale)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 593–702

```tsx
              {/* Conteneur fusionné anti-collision */}
              {(video_url || onTeaserAuraClick) && (
                <div className="absolute bottom-4 right-4 z-[9999] flex flex-col-reverse items-center gap-3">
                  {video_url && (
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
                      aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                    >
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  )}

                  {onTeaserAuraClick && (
                    <div className="relative flex flex-col items-center gap-1.5">
                      <AnimatePresence>
                        {teaserFloatingAuras.map((aura) => (
                          <motion.span
                            key={aura.id}
                            initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                            animate={{ opacity: 0, y: -40, scale: 1.5 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.65 }}
                            className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 text-sm font-black text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                          >
                            +1
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!has_liked_teaser && !localTeaserAuraLock.current) {
                            localTeaserAuraLock.current = true;
                            onTeaserAuraClick();
                            const newId = Date.now() + Math.random();
                            setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                            setTimeout(() => {
                              setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                            }, 800);

                            setTimeout(() => {
                              localTeaserAuraLock.current = false;
                            }, 1500);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!has_liked_teaser && !localTeaserAuraLock.current) {
                              localTeaserAuraLock.current = true;
                              onTeaserAuraClick();
                              const newId = Date.now() + Math.random();
                              setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                              setTimeout(() => {
                                setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                              }, 800);

                              setTimeout(() => {
                                localTeaserAuraLock.current = false;
                              }, 1500);
                            }
                          }
                        }}
                        aria-label="Aura teaser"
                        className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg transition-transform active:scale-90 ${
                          has_liked_teaser
                            ? 'border-amber-400/50 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                            : 'border-white/10 hover:bg-white/20'
                        }`}
                      >
                        <Sparkles
                          className={`h-6 w-6 ${
                            has_liked_teaser
                              ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                              : 'text-white'
                          }`}
                        />
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTeaserAuraModalOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsTeaserAuraModalOpen(true);
                          }
                        }}
                        aria-label="Voir les donateurs d'Aura teaser"
                        className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold drop-shadow-md transition-transform active:scale-95 ${
                          has_liked_teaser
                            ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                            : 'text-white'
                        }`}
                      >
                        {(teaser_score || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
```

---

## 5. `components/BeefCard.tsx` — Affichage `teaser_score` (isolé)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 676–698

```tsx
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTeaserAuraModalOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsTeaserAuraModalOpen(true);
                          }
                        }}
                        aria-label="Voir les donateurs d'Aura teaser"
                        className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold drop-shadow-md transition-transform active:scale-95 ${
                          has_liked_teaser
                            ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                            : 'text-white'
                        }`}
                      >
                        {(teaser_score || 0).toLocaleString()}
                      </span>
```
