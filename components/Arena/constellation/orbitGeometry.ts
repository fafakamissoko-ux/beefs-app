export type ConstellationLayout = { rx: number; ry: number; centerY: number; haloVw: number };

const LAYOUT_TABLE: Record<number, ConstellationLayout> = {
  1: { rx: 0,  ry: 0,  centerY: 50, haloVw: 42 },
  // N=2 : Écartement rx à 40 pour éviter la collision (haloVw 38 + marge 2)
  2: { rx: 40, ry: 40, centerY: 50, haloVw: 38 },
  // N=3 : Réduction du halo à 28 et rx à 32 pour éviter l'overflow vertical sur Desktop
  3: { rx: 32, ry: 32, centerY: 50, haloVw: 28 },
  // N=4 : Configuration équilibrée intacte
  4: { rx: 34, ry: 34, centerY: 50, haloVw: 32 },
  // N=5 et N=6 : Réduction massive du halo à 22 pour éviter la collision des paires à 45°
  5: { rx: 34, ry: 34, centerY: 50, haloVw: 22 },
  6: { rx: 34, ry: 34, centerY: 50, haloVw: 22 },
};

export function computeConstellationLayout(tileCount: number): ConstellationLayout {
  return LAYOUT_TABLE[Math.max(1, Math.min(tileCount, 6))] ?? LAYOUT_TABLE[6];
}

export function getOrbitPositionPercent(
  index: number,
  total: number,
  rx: number,
  ry: number,
  cy: number,
): { left: string; top: string } {
  let angle = 0;
  if (total === 2)
    angle = index === 0 ? (-3 * Math.PI) / 4 : Math.PI / 4;
  else if (total === 3)
    angle = ([-Math.PI / 2, (3 * Math.PI) / 4, Math.PI / 4] as number[])[index] ?? 0;
  else if (total === 4)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4] as number[])[index] ?? 0;
  else if (total === 5)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2] as number[])[index] ?? 0;
  else if (total === 6)
    angle = ([(-3 * Math.PI) / 4, -Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2, Math.PI / 2] as number[])[index] ?? 0;

  return {
    left: `calc(50% + ${rx * Math.cos(angle)}vmin)`,
    top: `calc(${cy}% + ${ry * Math.sin(angle)}vmin)`,
  };
}
