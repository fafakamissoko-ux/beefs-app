/** Position en % du conteneur (centre de la bulle) pour une orbite régulière. */
export function getOrbitPositionPercent(
  index: number,
  total: number,
  radiusPercent = 38,
): { left: string; top: string } {
  if (total <= 0) {
    return { left: '50%', top: '50%' };
  }
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const cx = 50 + radiusPercent * Math.cos(angle);
  const cy = 50 + radiusPercent * Math.sin(angle);
  return { left: `${cx}%`, top: `${cy}%` };
}
