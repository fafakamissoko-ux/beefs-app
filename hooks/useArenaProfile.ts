'use client';

import { useState, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToastType } from '@/components/Toast';
import { isValidArenaUserId } from '@/lib/participant-identity';
import { escapeForIlikeExact } from '@/lib/ilike-exact';

type ToastFn = (message: string, type?: ToastType) => void;

export interface ArenaUserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio?: string;
  isPrivate: boolean;
  joinedDate: string;
  stats: {
    mediations: number;
    participations: number;
    followers: number;
    following: number;
    points: number;
  };
}

interface UseArenaProfileParams {
  userId: string | null;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
  requireAuth: (title: string, subtitle: string) => boolean;
}

interface UseArenaProfileReturn {
  showProfile: boolean;
  setShowProfile: React.Dispatch<React.SetStateAction<boolean>>;
  selectedProfile: ArenaUserProfile | null;
  setSelectedProfile: React.Dispatch<React.SetStateAction<ArenaUserProfile | null>>;
  profileFollowsTarget: boolean;
  setProfileFollowsTarget: React.Dispatch<React.SetStateAction<boolean>>;
  profileCache: React.MutableRefObject<Record<string, ArenaUserProfile>>;
  openProfile: (username: string, knownUserId?: string | null) => Promise<void>;
  toggleFollowProfileTarget: () => Promise<void>;
}

export function useArenaProfile({
  userId,
  supabaseClient,
  toast,
  requireAuth,
}: UseArenaProfileParams): UseArenaProfileReturn {
  const [showProfile, setShowProfile] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<ArenaUserProfile | null>(null);
  const [profileFollowsTarget, setProfileFollowsTarget] = useState(false);
  const profileCache = useRef<Record<string, ArenaUserProfile>>({});

  const openProfile = useCallback(async (username: string, knownUserId?: string | null) => {
    const cacheKey =
      knownUserId && isValidArenaUserId(knownUserId) ? knownUserId : username;
    if (cacheKey && profileCache.current[cacheKey]) {
      const p = profileCache.current[cacheKey];
      setSelectedProfile(p);
      if (userId && p.id) {
        const { data: row } = await supabaseClient
          .from('followers')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', p.id)
          .maybeSingle();
        setProfileFollowsTarget(!!row);
      }
      setShowProfile(true);
      return;
    }

    type UserRow = {
      id: string;
      username: string;
      display_name: string | null;
      bio: string | null;
      created_at: string;
      avatar_url: string | null;
      points: number | null;
    };
    let data: UserRow | null = null;

    if (knownUserId && isValidArenaUserId(knownUserId)) {
      const { data: d } = await supabaseClient
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .eq('id', knownUserId)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const term = escapeForIlikeExact(username.trim());
      const { data: d } = await supabaseClient
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .ilike('username', term)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const term = escapeForIlikeExact(username.trim());
      const { data: rows } = await supabaseClient
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .ilike('display_name', term)
        .limit(1);
      data = (rows?.[0] as UserRow | undefined) ?? null;
    }

    if (!data) {
      toast('Profil introuvable', 'error');
      return;
    }

    const [
      { count: followerCount },
      { count: debateCount },
      { count: followingCount },
      { data: partRows },
      myFollowResult,
    ] = await Promise.all([
      supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
      supabaseClient.from('beefs').select('*', { count: 'exact', head: true }).eq('mediator_id', data.id),
      supabaseClient.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', data.id),
      supabaseClient.from('beef_participants').select('beef_id').eq('user_id', data.id),
      userId
        ? supabaseClient.from('followers').select('id').eq('follower_id', userId).eq('following_id', data.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const participations = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

    const profile: ArenaUserProfile = {
      id: data.id,
      username: data.username,
      displayName: data.display_name || data.username,
      avatarUrl: data.avatar_url ?? null,
      bio: data.bio || '',
      isPrivate: false,
      joinedDate: data.created_at?.split('T')[0] || '',
      stats: {
        mediations: debateCount ?? 0,
        participations,
        followers: followerCount ?? 0,
        following: followingCount ?? 0,
        points: data.points ?? 0,
      },
    };
    profileCache.current[data.id] = profile;
    if (username) profileCache.current[username] = profile;
    setSelectedProfile(profile);
    setProfileFollowsTarget(!!myFollowResult.data);
    setShowProfile(true);
  }, [userId, supabaseClient, toast]);

  const toggleFollowProfileTarget = useCallback(async () => {
    if (requireAuth('Abonne-toi', 'Crée un compte pour suivre ce profil.')) return;
    if (!selectedProfile || selectedProfile.id === userId) return;
    try {
      if (profileFollowsTarget) {
        await supabaseClient.from('followers').delete().eq('follower_id', userId).eq('following_id', selectedProfile.id);
        setProfileFollowsTarget(false);
        toast('Tu ne suis plus cet utilisateur', 'info');
      } else {
        await supabaseClient.from('followers').insert({ follower_id: userId, following_id: selectedProfile.id });
        setProfileFollowsTarget(true);
        toast('Tu suis cet utilisateur', 'success');
      }
    } catch {
      toast('Impossible de modifier l\u2019abonnement', 'error');
    }
  }, [requireAuth, selectedProfile, userId, profileFollowsTarget, supabaseClient, toast]);

  return {
    showProfile,
    setShowProfile,
    selectedProfile,
    setSelectedProfile,
    profileFollowsTarget,
    setProfileFollowsTarget,
    profileCache,
    openProfile,
    toggleFollowProfileTarget,
  };
}
