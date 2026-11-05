import test from 'node:test';
import assert from 'node:assert/strict';

import { addDays, isWeekendNight, nightKeys, nightsBetween } from '../src/domain/dates.js';
import { maxRedeemablePoints, quoteStay, rateForNight } from '../src/domain/pricing.js';
import { pointsEarned, tierFor, tierProgress } from '../src/domain/loyalty.js';

const room = {
  id: 'room-1',
  basePrice: 850_000,
  weekendMultiplier: 1.15,
  freeCancellationDays: 2,
  dateOverrides: [],
};

test('night keys are check-in inclusive and check-out exclusive', () => {
  assert.deepEqual(nightKeys('2026-11-06', '2026-11-08'), ['2026-11-06', '2026-11-07']);
  assert.equal(nightsBetween('2026-11-06', '2026-11-09'), 3);
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('weekend nights are Friday and Saturday', () => {
  assert.equal(isWeekendNight('2026-11-06'), true); // Friday
  assert.equal(isWeekendNight('2026-11-07'), true); // Saturday
  assert.equal(isWeekendNight('2026-11-08'), false); // Sunday
  assert.equal(rateForNight(room, '2026-11-06'), 977_500);
  assert.equal(rateForNight(room, '2026-11-08'), 850_000);
});

test('date overrides win over weekend pricing', () => {
  const withOverride = {
    ...room,
    dateOverrides: [{ from: '2026-12-20', to: '2026-12-31', multiplier: 1.4 }],
  };
  assert.equal(rateForNight(withOverride, '2026-12-25'), 1_190_000);
  assert.equal(rateForNight(withOverride, '2026-11-06'), 977_500);
});

test('quote adds service fee and tax on the discounted room subtotal', () => {
  const quote = quoteStay({ roomType: room, checkIn: '2026-11-06', checkOut: '2026-11-08', rooms: 2 });
  assert.equal(quote.subtotal, 1_955_000 * 2);
  assert.equal(quote.serviceFee, Math.round(quote.subtotal * 0.05));
  assert.equal(quote.tax, Math.round((quote.subtotal + quote.serviceFee) * 0.11));
  assert.equal(quote.total, quote.subtotal + quote.serviceFee + quote.tax);
  assert.equal(quote.nights.length, 2);
});

test('percentage promos respect the maximum discount cap', () => {
  const promo = { code: 'CAP', type: 'percent', value: 50, maxDiscount: 200_000 };
  const quote = quoteStay({ roomType: room, checkIn: '2026-11-08', checkOut: '2026-11-11', rooms: 2, promo });
  assert.equal(quote.promoDiscount, 200_000);
});

test('points redemption is capped at half of the room subtotal', () => {
  assert.equal(maxRedeemablePoints(1_000_000, 100_000), 5_000);
  const quote = quoteStay({
    roomType: room,
    checkIn: '2026-11-08',
    checkOut: '2026-11-09',
    rooms: 1,
    pointsToUse: 99_999,
    availablePoints: 99_999,
  });
  assert.equal(quote.pointsUsed, 4_250); // half of 850.000 / Rp100
  assert.equal(quote.pointsValue, 425_000);
});

test('membership tiers and earning multiplier follow lifetime points', () => {
  assert.equal(tierFor(0).key, 'bronze');
  assert.equal(tierFor(500).key, 'silver');
  assert.equal(tierFor(1499).key, 'silver');
  assert.equal(tierFor(1500).key, 'gold');
  assert.equal(tierFor(5000).key, 'platinum');
  assert.equal(pointsEarned(1_000_000, 0), 100);
  assert.equal(pointsEarned(1_000_000, 1500), 150);
  assert.equal(tierProgress(1200).pointsToNext, 300);
});
