/** Classes Tailwind du conteneur grille selon le nombre de tuiles (1–6). */
export function getNexusGridClass(tileCount: number): string {
  switch (tileCount) {
    case 1:
      return 'grid-cols-1 grid-rows-1';
    case 2:
      return 'grid-cols-2 grid-rows-1';
    case 3:
      return 'grid-cols-2 grid-rows-2';
    case 4:
      return 'grid-cols-2 grid-rows-2';
    case 5:
      return 'grid-cols-6 grid-rows-2'; // 6 colonnes virtuelles pour centrer la ligne du bas
    case 6:
      return 'grid-cols-3 grid-rows-2'; // 3 colonnes symétriques
    default:
      return 'grid-cols-1 grid-rows-1';
  }
}

/** Placement d'une cellule dans la grille Nexus. */
export function getNexusCellClass(index: number, tileCount: number): string {
  if (tileCount === 3 && index === 2) return 'col-span-2';
  // Disposition 5 joueurs : 3 en haut, 2 centrés en bas (utilise 6 colonnes virtuelles)
  if (tileCount === 5) {
    if (index <= 2) return 'col-span-2'; // Ligne 1 : Les 3 tuiles prennent 2 cols chacune
    if (index === 3) return 'col-span-2 col-start-2'; // Ligne 2 : Tuile 4 centrée gauche
    if (index === 4) return 'col-span-2 col-start-4'; // Ligne 2 : Tuile 5 centrée droite
  }
  return '';
}

/** Position du chrome (nom, DIRECT, contrôles) sur une tuile Nexus. */
export function getNexusChromeUiPos(index: number, tileCount: number): string {
  if (tileCount === 2 && index === 1) {
    return 'top-[3.5rem] right-2 sm:top-[4.5rem] sm:right-4 flex-row-reverse items-start';
  }
  if (tileCount === 3 && index === 0) {
    return 'inset-2 sm:inset-3 flex-col justify-between !pointer-events-none [&>*:first-child]:self-end [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-start [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 1) {
    return 'inset-2 sm:inset-3 pt-12 sm:pt-14 flex-col justify-between !pointer-events-none [&>*:first-child]:self-start [&>*:first-child]:!pointer-events-auto [&>*:last-child]:self-end [&>*:last-child]:!pointer-events-auto';
  }
  if (tileCount === 3 && index === 2) {
    return 'left-2 right-2 sm:left-4 sm:right-4 top-2 sm:top-4 flex-row justify-between items-start pointer-events-none';
  }
  if (tileCount === 4 && index === 3) {
    return 'top-2 right-2 sm:top-4 sm:right-4 flex-col items-end';
  }

  // RÈGLE UNIVERSELLE POUR 5 OU 6 JOUEURS : Centrage horizontal forcé, alignement texte au centre.
  if (tileCount >= 5) {
    return 'top-2 inset-x-0 mx-auto flex-col items-center justify-center text-center w-[90%]';
  }

  // Valeur par défaut (1, 2, 3, 4 joueurs, sauf exceptions ci-dessus)
  return 'top-2 left-2 sm:top-4 sm:left-4 flex-row items-start max-w-[90%]';
}
