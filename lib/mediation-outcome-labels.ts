/** Libellés UI pour resolution_status (beefs). */
export const RESOLUTION_STATUS_OPTIONS = [
  { value: 'in_progress', label: 'En cours' },
  { value: 'resolved', label: 'Résolu' },
  { value: 'unresolved', label: 'Non résolu' },
  { value: 'abandoned', label: 'Abandonné' },
] as const;

export function resolutionStatusLabel(status?: string | null): string {
  const row = RESOLUTION_STATUS_OPTIONS.find((o) => o.value === status);
  return row?.label ?? '—';
}
