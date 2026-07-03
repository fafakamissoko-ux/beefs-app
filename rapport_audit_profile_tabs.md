# Rapport d'audit — Tabs & chargement Beefs (profil privé / public)

**Date :** 2026-05-31  
**Mode :** extraction uniquement — aucune modification de code  
**Objectif :** préparer la standardisation du contenu inférieur profil (Tabs & grilles Beefs)


---

## 1. Privé — États (listes Beefs + navigation)

**Fichier :** `app/profile/ProfileContent.tsx`  
**Plage :** L97–110

```tsx
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [mediationBeefs, setMediationBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'debates'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedResolutionFilter, setSelectedResolutionFilter] = useState<string | null>(null);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner' | null>(null);
  const [cropOriginalFile, setCropOriginalFile] = useState<File | null>(null);

  const [mediatorReviews, setMediatorReviews] = useState<MediatorViewerReviewDisplay[]>([]);
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
```


---

## 2. Privé — Chargement des Beefs

**Fichier :** `app/profile/ProfileContent.tsx`  
**Plage :** L112–285

```tsx
  // Load user profile
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    
    const loadProfile = async () => {
      try {
        let { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!data) {
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              id: user.id,
              email: user.email || '',
              username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
              display_name: user.user_metadata?.display_name || user.user_metadata?.username || user.email?.split('@')[0] || 'User',
              points: 0,
              is_premium: false,
              is_verified: false,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating user');
            throw insertError;
          }

          data = newUser;
        }

        if (data) {
          setProfile({
            id: data.id,
            username: data.username,
            display_name: data.display_name || data.username,
            bio: data.bio,
            avatar_url: data.avatar_url,
            banner_url: data.banner_url,
            avatar_original_url: data.avatar_original_url,
            banner_original_url: data.banner_original_url,
            accent_color: data.accent_color || '#E83A14',
            points: data.points || 0,
            lifetime_points: data.lifetime_points || 0,
            is_premium: data.is_premium || false,
            premium_settings: data.premium_settings || {
              showPremiumBadge: true,
              showPremiumFrame: true,
              showPremiumAnimations: true,
            },
            created_at: data.created_at,
          });

          // Load real stats from database
          const { data: followersData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('following_id', data.id);

          const { data: followingData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('follower_id', data.id);

          const { data: mediatedRows } = await supabase
            .from('beefs')
            .select('*')
            .eq('mediator_id', data.id)
            .order('created_at', { ascending: false });

          const { data: participantRows } = await supabase
            .from('beef_participants')
            .select('beef_id, beefs(*)')
            .eq('user_id', data.id);

          const mediatedList = (mediatedRows || []) as Beef[];
          const fromParticipants: Beef[] = [];
          for (const row of participantRows || []) {
            const raw = row.beefs as Beef | Beef[] | null | undefined;
            if (!raw) continue;
            const b = Array.isArray(raw) ? raw[0] : raw;
            if (b) fromParticipants.push(b as Beef);
          }

          const mergedById = new Map<string, Beef>();
          mediatedList.forEach((b) => mergedById.set(b.id, b));
          fromParticipants.forEach((b) => {
            if (!mergedById.has(b.id)) mergedById.set(b.id, b);
          });

          const mergedSorted = [...mergedById.values()].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          const displayNameSelf = data.display_name || data.username || 'Utilisateur';
          const mediatorIds = [...new Set(mergedSorted.map((b) => b.mediator_id).filter(Boolean))] as string[];
          const mediatorMap: Record<string, string> = {};
          const mediatorUsernameById: Record<string, string> = {};
          if (mediatorIds.length > 0) {
            const { data: mu } = await supabase
              .from('user_public_profile')
              .select('id, display_name, username')
              .in('id', mediatorIds);
            (mu || []).forEach((u: { id: string; display_name?: string; username?: string }) => {
              mediatorMap[u.id] = u.display_name || u.username || 'Médiateur';
              const un = u.username?.trim();
              if (un) mediatorUsernameById[u.id] = un;
            });
          }

          const selfUsername = data.username?.trim() || null;

          const attachHost = (b: Beef): Beef => ({
            ...b,
            card_host_name:
              b.mediator_id === data.id
                ? displayNameSelf
                : (b.mediator_id && mediatorMap[b.mediator_id]) || 'Médiateur',
            card_host_username:
              b.mediator_id === data.id
                ? selfUsername
                : b.mediator_id
                  ? mediatorUsernameById[b.mediator_id] ?? null
                  : null,
          });

          const beefsParticipatedCount = new Set((participantRows || []).map((r: { beef_id: string }) => r.beef_id)).size;
          const beefsHostedCount = mediatedList.length;

          // Résolution stats = uniquement beefs médiés (catégorie dérivée status + resolution_status)
          const resolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'resolved').length || 0;
          const unresolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'unresolved').length || 0;
          const inProgressBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'in_progress').length || 0;
          const abandonedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'abandoned').length || 0;

          setStats({
            beefs_participated: beefsParticipatedCount,
            beefs_hosted: beefsHostedCount,
            beefs_resolved: resolvedBeefs,
            beefs_unresolved: unresolvedBeefs,
            beefs_in_progress: inProgressBeefs,
            beefs_abandoned: abandonedBeefs,
            total_views: 0,
            followers: followersData?.length || 0,
            following: followingData?.length || 0,
          });

          setBeefs(mergedSorted.map(attachHost));
          setMediationBeefs(mediatedList.map((b) => attachHost({ ...b, card_host_name: displayNameSelf })));

          const viewerReviews = await fetchMediatorViewerReviews(supabase, data.id);
          setMediatorReviews(viewerReviews);
        }

      } catch (error) {
        console.error('Error loading profile:', error);
        toast('Erreur lors du chargement du profil. Vérifie la console.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user, toast]);
```


---

## 3. Privé — JSX navigation onglets

**Fichier :** `app/profile/ProfileContent.tsx`  
**Plage :** L622–647

```tsx
        {/* Tabs */}
        <div className="rounded-[2rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl p-6">
          <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 [scrollbar-width:none] backdrop-blur-md [-ms-overflow-style:none] mb-6 [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'stats'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Statistiques
            </button>
            <button
              onClick={() => setActiveTab('debates')}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'debates'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Mes Affaires
            </button>
          </div>
```


---

## 4. Public — États (listes Beefs + navigation)

**Fichier :** `app/profile/[username]/page.tsx`  
**Plage :** L118–119, L127

```tsx
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [participantBeefs, setParticipantBeefs] = useState<Beef[]>([]);
  const [activeTab, setActiveTab] = useState<'debates' | 'participations' | 'reviews'>('debates');
```


---

## 5. Public — Chargement des Beefs

**Fichier :** `app/profile/[username]/page.tsx`  
**Plage :** L163–465

```tsx
  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const usernameKey = decodeURIComponent(String(username || '')).trim();
      if (!usernameKey) {
        setLoading(false);
        return;
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let profileData: Record<string, unknown> | null = null;

      if (authUser) {
        const { data: pubRow, error: pubErr } = await supabase
          .from('user_public_profile')
          .select('*')
          .ilike('username', escapeForIlikeExact(usernameKey))
          .maybeSingle();
        if (pubErr || !pubRow) {
          setLoading(false);
          return;
        }
        if (authUser.id === pubRow.id) {
          const { data: full, error: fullErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          if (fullErr || !full) {
            setLoading(false);
            return;
          }
          profileData = full as Record<string, unknown>;
        } else {
          profileData = pubRow as Record<string, unknown>;
        }
      } else {
        const { data: pubRows, error: rpcError } = await supabase.rpc('get_public_profile_by_username', {
          p_username: usernameKey,
        });
        if (rpcError) {
          setLoading(false);
          return;
        }
        const pub = Array.isArray(pubRows) ? pubRows[0] : pubRows;
        if (!pub || typeof pub !== 'object') {
          setLoading(false);
          return;
        }
        const p = pub as {
          id: string;
          username: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          banner_url?: string | null;
          avatar_original_url?: string | null;
          banner_original_url?: string | null;
          points: number;
          lifetime_points?: number | null;
          is_premium: boolean;
          created_at: string;
          avatar_likes?: number | null;
          banner_likes?: number | null;
        };
        profileData = {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          bio: p.bio,
          avatar_url: p.avatar_url,
          banner_url: p.banner_url,
          avatar_original_url: p.avatar_original_url ?? null,
          banner_original_url: p.banner_original_url ?? null,
          points: p.points,
          lifetime_points: p.lifetime_points ?? 0,
          is_premium: p.is_premium,
          created_at: p.created_at,
          avatar_likes: Number(p.avatar_likes ?? 0),
          banner_likes: Number(p.banner_likes ?? 0),
        };
      }

      if (!profileData) {
        setLoading(false);
        return;
      }

      const raw = profileData as Record<string, unknown>;
      const lpFromRow = Number(raw.lifetime_points ?? 0);
      const pd: UserProfile = {
        ...(profileData as unknown as UserProfile),
        lifetime_points: Number.isFinite(lpFromRow) ? lpFromRow : 0,
        avatar_likes: Number(raw.avatar_likes ?? 0),
        banner_likes: Number(raw.banner_likes ?? 0),
        avatar_original_url: typeof raw.avatar_original_url === 'string' ? raw.avatar_original_url : null,
        banner_original_url: typeof raw.banner_original_url === 'string' ? raw.banner_original_url : null,
      };

      setProfile(pd);

      let followersCount = 0;
      let followingCount = 0;
      if (authUser) {
        const { data: followersData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('following_id', pd.id);
        const { data: followingData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('follower_id', pd.id);
        followersCount = followersData?.length || 0;
        followingCount = followingData?.length || 0;
      } else {
        const { data: fcRows, error: fcErr } = await supabase.rpc('get_public_follow_counts', {
          p_user_id: pd.id,
        });
        if (!fcErr && fcRows?.length) {
          const fc = fcRows[0] as { followers_count?: number | string; following_count?: number | string };
          followersCount = Number(fc.followers_count ?? 0);
          followingCount = Number(fc.following_count ?? 0);
        }
      }

      if (!authUser) {
        const { data: bundleJson, error: bundleErr } = await supabase.rpc('get_public_profile_beefs_payload', {
          p_profile_user_id: pd.id,
        });
        if (bundleErr) {
          console.error('[profile] get_public_profile_beefs_payload', bundleErr);
        }
        const bundle = (bundleJson as Record<string, unknown> | null) ?? {};
        const hosted = Array.isArray(bundle.hosted) ? bundle.hosted : [];
        const participated = Array.isArray(bundle.participated) ? bundle.participated : [];
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;

        setStats({
          beefs_participated: Number(bundle.participated_count ?? 0),
          beefs_hosted: Number(bundle.hosted_count ?? 0),
          followers: followersCount,
          following: followingCount,
        });

        setBeefs(
          hosted.map((row) => beefFromPublicRpcRow(row as Record<string, unknown>, hn, hu)),
        );

        setParticipantBeefs(
          participated.slice(0, 12).map((row) => {
            const r = row as Record<string, unknown>;
            const mid = r.mediator_id as string | undefined;
            const medUn =
              typeof r.mediator_username === 'string' ? r.mediator_username.trim() : '';
            const medDn =
              typeof r.mediator_display_name === 'string' ? r.mediator_display_name.trim() : '';
            const isSelf = !mid || mid === pd.id;
            return beefFromPublicRpcRow(
              r,
              isSelf ? hn : medDn || medUn || 'Médiateur',
              isSelf ? hu : medUn || null,
            );
          }),
        );

        const viewerReviewsGuest = await fetchMediatorViewerReviews(supabase, pd.id);
        setMediatorReviews(viewerReviewsGuest);
        setMediaLikes({
          avatar: { count: pd.avatar_likes ?? 0, liked: false },
          banner: { count: pd.banner_likes ?? 0, liked: false },
        });
        return;
      }

      const { data: beefsData } = await supabase
        .from('beefs')
        .select('id', { count: 'exact' })
        .eq('mediator_id', pd.id);

      const { data: partRows } = await supabase
        .from('beef_participants')
        .select('beef_id')
        .eq('user_id', pd.id);

      const beefsParticipated = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

      setStats({
        beefs_participated: beefsParticipated,
        beefs_hosted: beefsData?.length || 0,
        followers: followersCount,
        following: followingCount,
      });

      // Load user's beefs
      const { data: userBeefs, error: beefsError } = await supabase
        .from('beefs')
        .select('*')
        .eq('mediator_id', pd.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userBeefs) {
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;
        setBeefs(userBeefs.map(beef => ({
          ...beef,
          host_name: hn,
          host_username: hu,
        })));
      }

      const { data: partWithBeefs } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs(*)')
        .eq('user_id', pd.id);

      const pbRaw: Beef[] = [];
      const seenPb = new Set<string>();
      for (const row of partWithBeefs || []) {
        const raw = row.beefs as Beef | Beef[] | null | undefined;
        const b = Array.isArray(raw) ? raw[0] : raw;
        if (!b?.id || seenPb.has(b.id)) continue;
        seenPb.add(b.id);
        pbRaw.push(b as Beef);
      }
      pbRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const medIds = [
        ...new Set(
          pbRaw
            .map((b) => (b as { mediator_id?: string }).mediator_id)
            .filter((id): id is string => !!id && id !== pd.id),
        ),
      ];
      let medNameById: Record<string, string> = {};
      let medUsernameById: Record<string, string> = {};
      if (medIds.length > 0) {
        const { data: mus } = await supabase
          .from('user_public_profile')
          .select('id, display_name, username')
          .in('id', medIds);
        for (const u of mus || []) {
          const row = u as { id: string; display_name?: string; username?: string };
          medNameById[row.id] = row.display_name || row.username || 'Médiateur';
          const un = row.username?.trim();
          if (un) medUsernameById[row.id] = un;
        }
      }
      const selfName = pd.display_name || pd.username;
      const selfUsername = pd.username.trim() || null;
      setParticipantBeefs(
        pbRaw.slice(0, 12).map((b) => {
          const mid = (b as { mediator_id?: string }).mediator_id;
          const host_name =
            !mid || mid === pd.id ? selfName : medNameById[mid] || 'Médiateur';
          const host_username =
            !mid || mid === pd.id ? selfUsername : medUsernameById[mid] ?? null;
          return { ...b, host_name, host_username };
        }),
      );

      // Check if current user follows this profile
      if (user && user.id !== pd.id) {
        const { data: followData } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', pd.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      const viewerReviews = await fetchMediatorViewerReviews(supabase, pd.id);
      setMediatorReviews(viewerReviews);

      let likedAvatar = false;
      let likedBanner = false;
      if (authUser && authUser.id !== pd.id) {
        const { data: myMediaLikes } = await supabase
          .from('profile_media_likes')
          .select('media_type')
          .eq('media_owner_id', pd.id)
          .eq('user_id', authUser.id);
        for (const row of myMediaLikes || []) {
          const mt = (row as { media_type?: string }).media_type;
          if (mt === 'avatar') likedAvatar = true;
          if (mt === 'banner') likedBanner = true;
        }
      }
      setMediaLikes({
        avatar: { count: pd.avatar_likes ?? 0, liked: likedAvatar },
        banner: { count: pd.banner_likes ?? 0, liked: likedBanner },
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [username, user]);
```


---

## 6. Public — JSX navigation onglets (Tabs Publics)

**Fichier :** `app/profile/[username]/page.tsx`  
**Plage :** L773–814

```tsx
        {/* Tabs Publics */}
        <div className="rounded-[2rem] bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 p-6 mt-6 mb-6">
          <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 [scrollbar-width:none] backdrop-blur-md [-ms-overflow-style:none] mb-6 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('debates')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'debates'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Médiations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participations')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'participations'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Affaires
            </button>
            {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                  activeTab === 'reviews'
                    ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                    : 'text-gray-500 hover:text-gray-200'
                }`}
              >
                <Star className="w-4 h-4" />
                Vox Populi
              </button>
            )}
          </div>
```


---

## Synthèse comparative

| Aspect | Privé | Public |
|--------|-------|--------|
| Listes | `beefs` (fusion), `mediationBeefs` (filtre stats) | `beefs` (hosted), `participantBeefs` |
| `activeTab` | `'stats' \| 'debates'` | `'debates' \| 'participations' \| 'reviews'` |
| Chargement | Inline dans `useEffect` | `loadProfile` `useCallback` |
| RPC public | — | `get_public_profile_beefs_payload` (guest) |
| Filtre stats | `selectedResolutionFilter` + tuiles résolution | — |
| Onglet extra | Statistiques (Historique Jugements) | Vox Populi (reviews) |

**Prochaine étape Architecte :** composant unifié `ProfileTabs` / `ProfileBeefGrid` avec variantes owner/public.
