export type ConstellationLayout = { rx: number; ry: number; centerY: number; haloVw: number };

const LAYOUT_TABLE: Record<number, ConstellationLayout> = {
  1: { rx: 0,  ry: 0,  centerY: 50, haloVw: 40 },
  2: { rx: 32, ry: 28, centerY: 50, haloVw: 36 },
  3: { rx: 32, ry: 28, centerY: 50, haloVw: 34 },
  4: { rx: 34, ry: 28, centerY: 50, haloVw: 32 },
  5: { rx: 34, ry: 28, centerY: 50, haloVw: 28 },
  6: { rx: 34, ry: 30, centerY: 50, haloVw: 26 },
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
    left: `${50 + rx * Math.cos(angle)}%`,
    top: `${cy + ry * Math.sin(angle)}%`,
  };
}
