export type ConstellationLayout = { rx: number; ry: number; centerY: number; haloVw: number };

export function computeConstellationLayout(tileCount: number, vpW: number, vpH: number): ConstellationLayout {
  if (tileCount <= 1 || vpW === 0 || vpH === 0) {
    return { rx: 0, ry: 0, centerY: 50, haloVw: 42 };
  }

  const vmin_px = Math.min(vpW, vpH);
  const isDesktop = vpW >= 1024;
  const cW = isDesktop ? vpW - 350 : vpW; // 350px pour le panneau de chat
  const cH = vpH - 80; // Marge sécurisée pour le chrome (header/footer)

  const badge_vmin = (44 * 100) / vmin_px; // Épaisseur absolue du badge en vmin
  const V_avail = ((cH / 2) - 44) * 100 / vmin_px;
  const H_avail = ((cW / 2) - 10) * 100 / vmin_px;

  const hasStacker = tileCount === 3 || tileCount === 5 || tileCount === 6;
  const sin_min = 0.7071; // Diagonales (45° / 135°)
  const sin_max = hasStacker ? 1.0 : 0.7071; // Position Haut/Bas (90°)
  const cos_max = 0.7071;

  // Équation de maximisation
  const num = (V_avail * sin_min) - (badge_vmin * sin_max);
  const den = sin_max + (sin_min / 2);

  let haloVw = Math.floor(num / den);
  haloVw = Math.max(8, haloVw); // Seuil de lisibilité minimal

  let ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);

  // BOUCLE DE SÉCURITÉ : Compense les arrondis JS et force un gap de +0.5 vmin
  while (haloVw > 8 && (ry * sin_min < haloVw + badge_vmin + 0.5)) {
    haloVw -= 1;
    ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);
  }

  // Calcul du rayon horizontal (priorise la largeur sans devenir trop plat)
  const rx_vert = Math.floor((H_avail - (haloVw / 2)) / cos_max);
  const rx = Math.floor(Math.min(rx_vert, ry * 1.2));

  return { rx, ry, centerY: 50, haloVw };
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
