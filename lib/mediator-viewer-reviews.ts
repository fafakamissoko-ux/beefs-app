import type { SupabaseClient } from '@supabase/supabase-js';

export type MediatorViewerReviewDisplay = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  authorName: string;
  /** Pour lien profil ; null si inconnu. */
  authorUsername: string | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
};

/** Avis spectateurs pour le profil médiateur (noms résolus via user_public_profile). */
export async function fetchMediatorViewerReviews(
  supabase: SupabaseClient,
  mediatorId: string,
  limit = 25,
): Promise<MediatorViewerReviewDisplay[]> {
  const { data: rows, error } = await supabase
    .from('mediator_viewer_reviews')
    .select('id, rating, comment, created_at, reviewer_id')
    .eq('mediator_id', mediatorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !rows?.length) {
    return [];
  }

  const typed = rows as ReviewRow[];
  const reviewerIds = [...new Set(typed.map((r) => r.reviewer_id))];
  const { data: users } = await supabase
    .from('user_public_profile')
    .select('id, display_name, username')
    .in('id', reviewerIds);

  const nameById = new Map<string, string>();
  const usernameById = new Map<string, string | null>();
  for (const u of users || []) {
    const row = u as { id: string; display_name?: string | null; username?: string | null };
    nameById.set(row.id, row.display_name?.trim() || row.username || 'Spectateur');
    usernameById.set(row.id, row.username?.trim() || null);
  }

  return typed.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    authorName: nameById.get(r.reviewer_id) ?? 'Spectateur',
    authorUsername: usernameById.get(r.reviewer_id) ?? null,
  }));
}
