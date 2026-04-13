/**
 * Échappe % et \ pour une recherche `.ilike()` traitée comme égalité insensible à la casse
 * (évite que _ et % soient interprétés comme jokers SQL).
 */
export function escapeForIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
