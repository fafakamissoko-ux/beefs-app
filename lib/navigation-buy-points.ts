export const openBuyPointsPage = (router: { push: (href: string) => void }, currentPath: string = '/feed') => {
  router.push(`/buy-points?returnTo=${encodeURIComponent(currentPath)}`);
};
