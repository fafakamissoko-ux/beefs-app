/** Position en % du conteneur (centre de la bulle) pour une orbite régulière. */
export function getOrbitPositionPercent(
  index: number,
  total: number,
): { left: string; top: string } {
  if (total <= 0) {
    return { left: '50%', top: '50%' };
  }

  // 1. Décalage du centre vers le haut (42% au lieu de 50%) pour fuir le chat mobile
  const centerY = 42;

  // 2. Orbite Elliptique : Rayons X et Y distincts pour écraser la hauteur
  const rx = total <= 2 ? 40 : total <= 4 ? 38 : 34;
  const ry = total <= 2 ? 32 : total <= 4 ? 28 : 24;

  // 3. Calcul de l'angle (Phase -Math.PI pour commencer à gauche)
  const angle = (index / total) * Math.PI * 2 - Math.PI;

  // 4. Application trigonométrique elliptique
  const cx = 50 + rx * Math.cos(angle);
  const cy = centerY + ry * Math.sin(angle);

  return { left: `${cx}%`, top: `${cy}%` };
}
