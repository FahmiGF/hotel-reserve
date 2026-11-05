import { addDays, nightKeys } from './dates.js';

/** Bookings in these states still own inventory. */
export const INVENTORY_STATUSES = new Set([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
  'checked_in',
]);

export function isBookingReserving(booking, now = Date.now()) {
  if (!INVENTORY_STATUSES.has(booking.status)) return false;
  if (booking.reservationExpiresAt && new Date(booking.reservationExpiresAt).getTime() <= now) return false;
  return true;
}

export function isHoldActive(hold, now = Date.now()) {
  return new Date(hold.expiresAt).getTime() > now;
}

/** Units of a room type already committed on a single night. */
export function unitsCommitted(db, roomType, date, now = Date.now(), ignoreBookingId = null, ignoreHoldId = null) {
  let used = 0;
  for (const booking of db.bookings) {
    if (booking.roomTypeId !== roomType.id) continue;
    if (booking.id === ignoreBookingId) continue;
    if (!isBookingReserving(booking, now)) continue;
    if (date >= booking.checkIn && date < booking.checkOut) used += booking.rooms;
  }
  for (const hold of db.holds) {
    if (hold.roomTypeId !== roomType.id) continue;
    if (hold.id === ignoreHoldId) continue;
    if (!isHoldActive(hold, now)) continue;
    if (date >= hold.checkIn && date < hold.checkOut) used += hold.rooms;
  }
  for (const block of roomType.blocks ?? []) {
    const to = addDays(block.to, 1);
    if (date >= block.from && date < to) used += block.units ?? roomType.inventory;
  }
  return used;
}

export function remainingUnits(db, roomType, date, now = Date.now()) {
  return Math.max(0, roomType.inventory - unitsCommitted(db, roomType, date, now));
}

/**
 * Availability for a whole stay. A stay is available only when every night has
 * enough free units for the requested number of rooms.
 */
export function checkStayAvailability(
  db,
  roomType,
  checkIn,
  checkOut,
  rooms,
  now = Date.now(),
  ignoreBookingId = null,
  ignoreHoldId = null,
) {
  const nights = nightKeys(checkIn, checkOut);
  const nightly = nights.map((date) => ({
    date,
    remaining: Math.max(
      0,
      roomType.inventory - unitsCommitted(db, roomType, date, now, ignoreBookingId, ignoreHoldId),
    ),
  }));
  const minRemaining = nightly.reduce((min, night) => Math.min(min, night.remaining), Infinity);
  return {
    available: nights.length > 0 && nightly.every((night) => night.remaining >= rooms),
    minRemaining: Number.isFinite(minRemaining) ? minRemaining : 0,
    nights: nightly,
  };
}
