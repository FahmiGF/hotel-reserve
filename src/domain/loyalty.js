/**
 * Membership ladder. `minPoints` is measured on lifetime points so redeeming
 * points never demotes a member.
 */
export const TIERS = [
  {
    key: 'bronze',
    name: 'Bronze',
    minPoints: 0,
    earnMultiplier: 1,
    benefits: ['Poin dasar setiap menginap', 'Promo member bulanan'],
  },
  {
    key: 'silver',
    name: 'Silver',
    minPoints: 500,
    earnMultiplier: 1.25,
    benefits: ['Diskon eksklusif member', 'Poin 25% lebih cepat', 'Prioritas chat CS'],
  },
  {
    key: 'gold',
    name: 'Gold',
    minPoints: 1500,
    earnMultiplier: 1.5,
    benefits: ['Poin 50% lebih cepat', 'Late check-out bila tersedia', 'Dukungan prioritas'],
  },
  {
    key: 'platinum',
    name: 'Platinum',
    minPoints: 3000,
    earnMultiplier: 2,
    benefits: ['Poin 2x setiap menginap', 'Penawaran VIP terbatas', 'Concierge prioritas'],
  },
];

export const POINTS_PER_10K_IDR = 1;

export function tierFor(lifetimePoints = 0) {
  let tier = TIERS[0];
  for (const candidate of TIERS) {
    if (lifetimePoints >= candidate.minPoints) tier = candidate;
  }
  return tier;
}

export function tierProgress(lifetimePoints = 0) {
  const tier = tierFor(lifetimePoints);
  const index = TIERS.findIndex((item) => item.key === tier.key);
  const next = TIERS[index + 1] ?? null;
  const span = next ? next.minPoints - tier.minPoints : 0;
  const gained = lifetimePoints - tier.minPoints;
  return {
    tier,
    next,
    pointsToNext: next ? Math.max(0, next.minPoints - lifetimePoints) : 0,
    progress: next ? Math.min(1, Math.max(0, gained / span)) : 1,
  };
}

/** 1 point per Rp10.000 spent, multiplied by the membership tier. */
export function pointsEarned(totalIdr, lifetimePoints = 0) {
  const tier = tierFor(lifetimePoints);
  return Math.round(Math.floor(totalIdr / 10_000) * POINTS_PER_10K_IDR * tier.earnMultiplier);
}
