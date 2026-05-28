export type ConstellationLayout = { rx: number; ry: number; centerY: number; haloVw: number };

export function computeConstellationLayout(tileCount: number, vpW: number, vpH: number): ConstellationLayout {
  if (tileCount <= 1 || vpW === 0 || vpH === 0) {
    return { rx: 0, ry: 0, centerY: 50, haloVw: 42 };
  }

  const vmin_px = Math.min(vpW, vpH);
  const isDesktop = vpW >= 1024;
  const cW = isDesktop ? vpW - 350 : vpW;
  // 220px amputés sur Mobile pour sécuriser la zone de chat (bas) et le header (haut)
  const cH = isDesktop ? vpH - 80 : vpH - 220;

  const badge_vmin = (44 * 100) / vmin_px;
  const V_avail = ((cH / 2) - 44) * 100 / vmin_px;
  const H_avail = ((cW / 2) - 10) * 100 / vmin_px;

  const hasStacker = tileCount === 3 || tileCount === 5 || tileCount === 6;
  const sin_min = 0.7071;
  const sin_max = hasStacker ? 1.0 : 0.7071;
  const cos_max = 0.7071;

  let haloVw = 8;
  let ry = 0;

  if (isDesktop) {
    // --- DOCTRINE DESKTOP : Contrainte diagonale inutile, optimisation max ---
    if (hasStacker) {
      const cH_safe = ((cH / 2) / vmin_px) * 100 - 2;
      haloVw = Math.floor((cH_safe - badge_vmin) / 1.5);
      ry = Math.floor(cH_safe - (haloVw / 2));
    } else {
      haloVw = 28;
      ry = Math.floor((V_avail - (haloVw / 2)) / sin_min);
    }
  } else {
    // --- DOCTRINE MOBILE : Contrainte verticale 1D stricte conservée ---
    const num = (V_avail * sin_min) - (badge_vmin * sin_max);
    const den = sin_max + (sin_min / 2);
    let haloVw_V = Math.max(8, Math.floor(num / den));

    // BOUCLIER HORIZONTAL : Empêche l'explosion de largeur sur N=4
    const haloVw_H_max = Math.floor(H_avail - 0.5);
    haloVw = Math.min(haloVw_V, haloVw_H_max);

    ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);

    while (haloVw > 8 && (ry * sin_min < haloVw + badge_vmin + 0.5)) {
      haloVw -= 1;
      ry = Math.floor((V_avail - (haloVw / 2)) / sin_max);
    }
  }

  // Calcul du rayon horizontal (Bridage à 1.2 pour empêcher l'aplatissement)
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
