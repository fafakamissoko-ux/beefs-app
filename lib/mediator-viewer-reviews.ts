import type { SupabaseClient } from '@supabase/supabase-js';

export type MediatorViewerReviewDisplay = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  authorName: string;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
};

/** Avis spectateurs pour le profil médiateur (noms résolus via users). */
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
    .from('users')
    .select('id, display_name, username')
    .in('id', reviewerIds);

  const nameById = new Map<string, string>();
  for (const u of users || []) {
    const row = u as { id: string; display_name?: string | null; username?: string | null };
    nameById.set(row.id, row.display_name?.trim() || row.username || 'Spectateur');
  }

  return typed.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    authorName: nameById.get(r.reviewer_id) ?? 'Spectateur',
  }));
}
