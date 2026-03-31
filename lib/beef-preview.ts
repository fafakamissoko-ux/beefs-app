/** Minutes offertes aux spectateurs après le démarrage officiel du beef (beef.started_at). */
export const DEFAULT_FREE_PREVIEW_MINUTES = 10;

export function previewElapsedSeconds(startedAt: string | null): number | null {
  if (!startedAt) return null;
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
}

export function viewerNeedsContinuationPay(
  startedAt: string | null,
  freePreviewMinutes: number,
  continuationPricePoints: number,
  hasPaidAccess: boolean
): boolean {
  if (continuationPricePoints <= 0 || hasPaidAccess) return false;
  const elapsed = previewElapsedSeconds(startedAt);
  if (elapsed === null) return false;
  return elapsed > freePreviewMinutes * 60;
}
