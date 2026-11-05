import { isWeekendNight, nightKeys } from './dates.js';

export const POINT_VALUE_IDR = 100;
export const MAX_POINTS_REDEEM_RATIO = 0.5;
export const SERVICE_RATE = 0.05;
export const TAX_RATE = 0.11;
export const CURRENCY = 'IDR';

export function rateForNight(roomType, date) {
  const overrides = roomType.dateOverrides ?? [];
  const override = overrides.find((item) => date >= item.from && date <= item.to);
  if (override) {
    if (typeof override.price === 'number') return Math.round(override.price);
    if (typeof override.multiplier === 'number') return Math.round(roomType.basePrice * override.multiplier);
  }
  if (isWeekendNight(date)) {
    return Math.round(roomType.basePrice * (roomType.weekendMultiplier ?? 1));
  }
  return Math.round(roomType.basePrice);
}

export function promoDiscount(promo, subtotal) {
  if (!promo) return 0;
  if (promo.type === 'percent') {
    const raw = Math.round((subtotal * promo.value) / 100);
    return Math.min(raw, promo.maxDiscount ?? Number.MAX_SAFE_INTEGER);
  }
  return Math.min(Math.round(promo.value), subtotal);
}

/** A points redemption may never exceed half of the room subtotal. */
export function maxRedeemablePoints(subtotal, availablePoints = 0) {
  const capBySubtotal = Math.floor((subtotal * MAX_POINTS_REDEEM_RATIO) / POINT_VALUE_IDR);
  return Math.max(0, Math.min(Math.floor(availablePoints), capBySubtotal));
}

/**
 * Price a stay. Pure function so both the hold and the booking endpoint use
 * exactly the same numbers the guest saw in the review step.
 */
export function quoteStay({
  roomType,
  checkIn,
  checkOut,
  rooms = 1,
  promo = null,
  pointsToUse = 0,
  availablePoints = 0,
  earnMultiplier = 1,
}) {
  const nights = nightKeys(checkIn, checkOut).map((date) => ({
    date,
    rate: rateForNight(roomType, date),
    weekend: isWeekendNight(date),
  }));
  const subtotal = nights.reduce((sum, night) => sum + night.rate, 0) * rooms;
  const discount = promo ? promoDiscount(promo, subtotal) : 0;
  const afterPromo = Math.max(0, subtotal - discount);
  const pointsUsed = Math.max(
    0,
    Math.min(Math.floor(Number(pointsToUse) || 0), maxRedeemablePoints(afterPromo, availablePoints)),
  );
  const pointsValue = pointsUsed * POINT_VALUE_IDR;
  const base = Math.max(0, afterPromo - pointsValue);
  const serviceFee = Math.round(base * SERVICE_RATE);
  const tax = Math.round((base + serviceFee) * TAX_RATE);
  const total = base + serviceFee + tax;

  return {
    currency: CURRENCY,
    rooms,
    checkIn,
    checkOut,
    nights,
    subtotal,
    promoCode: promo?.code ?? null,
    promoDiscount: discount,
    pointsUsed,
    pointsValue,
    base,
    serviceFee,
    tax,
    total,
    earnPoints: Math.round(Math.floor(total / 10_000) * earnMultiplier),
    freeCancellationDays: roomType.freeCancellationDays ?? 0,
  };
}
