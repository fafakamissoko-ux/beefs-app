/** Position en % du conteneur (centre de la bulle) pour une orbite régulière ou diagonale. */
export function getOrbitPositionPercent(
  index: number,
  total: number,
): { left: string; top: string } {
  if (total <= 0) {
    return { left: '50%', top: '50%' };
  }

  // 1. Décalage du centre vers le haut (42% au lieu de 50%) pour fuir le chat mobile
  const centerY = total <= 2 ? 42 : 40;

  // 2. Orbite Elliptique : Ajustement strict des rayons
  const rx = total <= 2 ? 36 : total === 3 ? 32 : 34;
  const ry = total <= 2 ? 32 : total === 3 ? 30 : 36;

  let angle: number;

  if (total === 2) {
    // Formation X-Shape : Diagonale Top-Left vs Bottom-Right
    // index 0 : -3π/4 (Haut-Gauche)
    // index 1 : π/4 (Bas-Droite)
    angle = index === 0 ? -3 * Math.PI / 4 : Math.PI / 4;
  } else {
    // Formation standard pour 3 à 6 challengers (commence à gauche)
    angle = (index / total) * Math.PI * 2 - Math.PI;
  }

  // 4. Application trigonométrique elliptique
  const cx = 50 + rx * Math.cos(angle);
  const cy = centerY + ry * Math.sin(angle);

  return { left: `${cx}%`, top: `${cy}%` };
}
