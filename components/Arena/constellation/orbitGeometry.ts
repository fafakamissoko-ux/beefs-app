/** Constantes de sécurité pour la constellation */
const SAFE_MARGIN_VW = 4;
const GAP_VW = 2.5;
const MEDIATOR_CENTER_X = 50;
const MEDIATOR_CENTER_Y = 42;
const MEDIATOR_VW = 30;

/** Calcule l'angle (rad) pour un pair `index/total` dans la formation choisie. */
function orbitAngle(index: number, total: number): number {
  if (total === 2) {
    return index === 0 ? (-3 * Math.PI) / 4 : Math.PI / 4;
  }
  return (index / total) * Math.PI * 2 - Math.PI;
}

/** Point orbital (en %) à partir des paramètres elliptiques. */
function orbitPoint(
  index: number,
  total: number,
  rx: number,
  ry: number,
  cy: number,
): { x: number; y: number } {
  const a = orbitAngle(index, total);
  return { x: MEDIATOR_CENTER_X + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
}

/** Distance minimale (en vw-équivalents %) entre toutes les paires de challengers. */
function minPairwiseDist(pts: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Calcule les paramètres de layout constellation qui respectent :
 * — marge écran (`SAFE_MARGIN_VW`)
 * — gap inter-challengers (`GAP_VW`)
 * — gap challenger ↔ Ref central (30 vw)
 *
 * L'algorithme réduit d'abord `haloVw`, puis l'orbite (rx/ry) si nécessaire.
 */
export interface ConstellationLayout {
  rx: number;
  ry: number;
  centerY: number;
  haloVw: number;
}

export function computeConstellationLayout(tileCount: number): ConstellationLayout {
  if (tileCount <= 0) return { rx: 36, ry: 32, centerY: 42, haloVw: 46 };

  // Valeurs de départ issues des constantes précédentes
  let haloVw = tileCount === 1 ? 46 : tileCount === 2 ? 40 : tileCount === 3 ? 26 : 24;
  let rx = tileCount <= 2 ? 36 : 32;
  let ry = tileCount <= 2 ? 32 : tileCount === 3 ? 30 : 28;
  let centerY = tileCount <= 2 ? 42 : tileCount === 3 ? 40 : 45;

  const medR = MEDIATOR_VW / 2;

  for (let iter = 0; iter < 30; iter++) {
    const haloR = haloVw / 2;
    const pts = Array.from({ length: tileCount }, (_, i) =>
      orbitPoint(i, tileCount, rx, ry, centerY),
    );

    // Vérification marges bord écran
    const edgeOk = pts.every(
      (p) =>
        p.x - haloR >= SAFE_MARGIN_VW &&
        p.x + haloR <= 100 - SAFE_MARGIN_VW &&
        p.y - haloR >= SAFE_MARGIN_VW &&
        p.y + haloR <= 100 - SAFE_MARGIN_VW,
    );

    // Gap pairwise (uniquement pertinent si ≥ 2 challengers)
    const pairOk =
      tileCount < 2 || minPairwiseDist(pts) >= 2 * haloR + GAP_VW;

    // Gap avec le Ref central
    const medOk = pts.every(
      (p) =>
        Math.hypot(p.x - MEDIATOR_CENTER_X, p.y - MEDIATOR_CENTER_Y) >= medR + haloR + GAP_VW,
    );

    if (edgeOk && pairOk && medOk) break;

    // Réduction : bulle d'abord (minimum 16 vw), puis orbite
    if (haloVw > 16) {
      haloVw -= 1.5;
    } else if (rx > 20) {
      rx -= 1.5;
      ry -= 1;
      centerY = Math.min(centerY + 0.4, 50);
    } else {
      break;
    }
  }

  return { rx, ry, centerY, haloVw };
}

/** Position en % du conteneur (centre de la bulle) pour une orbite régulière ou diagonale. */
export function getOrbitPositionPercent(
  index: number,
  total: number,
  rx?: number,
  ry?: number,
  centerY?: number,
): { left: string; top: string } {
  if (total <= 0) return { left: '50%', top: '50%' };

  // Si les paramètres ne sont pas fournis, calcule le layout optimal
  const layout = computeConstellationLayout(total);
  const _rx = rx ?? layout.rx;
  const _ry = ry ?? layout.ry;
  const _cy = centerY ?? layout.centerY;

  const pt = orbitPoint(index, total, _rx, _ry, _cy);
  return { left: `${pt.x}%`, top: `${pt.y}%` };
}
