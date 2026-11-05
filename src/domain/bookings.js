import { nightsBetween, parseKey } from './dates.js';

export const BOOKING_STATUSES = [
  'pending_payment',
  'pending_confirmation',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'expired',
  'rejected',
];

/** Allowed status transitions for the booking state machine. */
const TRANSITIONS = {
  pending_payment: ['pending_confirmation', 'confirmed', 'cancelled', 'expired'],
  pending_confirmation: ['confirmed', 'rejected', 'cancelled', 'expired'],
  confirmed: ['checked_in', 'cancelled', 'completed'],
  checked_in: ['completed'],
  completed: [],
  cancelled: [],
  expired: [],
  rejected: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateBookingCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `HR-${code}`;
}

export function uniqueBookingCode(db) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateBookingCode();
    if (!db.bookings.some((booking) => booking.code === code)) return code;
  }
  return `HR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/**
 * Guest-facing phase, derived from status + dates.
 * Mirrors the "My Trips" tabs in the blueprint.
 */
export function bookingPhase(booking, now = new Date()) {
  if (booking.status === 'expired') return 'expired';
  if (booking.status === 'rejected') return 'cancelled';
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status === 'completed') return 'completed';
  if (booking.status === 'pending_payment') return 'pending_payment';
  if (booking.status === 'pending_confirmation') return 'pending_confirmation';
  if (booking.status === 'checked_in') return 'ongoing';
  const today = now.toISOString().slice(0, 10);
  if (booking.checkIn <= today && booking.checkOut > today) return 'ongoing';
  return 'upcoming';
}

/** Free cancellation window comes from the room type, falling back to the hotel policy. */
export function freeCancellationDeadline(checkIn, freeDays = 0) {
  if (freeDays <= 0) return null;
  const deadline = new Date(parseKey(checkIn).getTime());
  deadline.setUTCDate(deadline.getUTCDate() - freeDays);
  return deadline.toISOString().slice(0, 10);
}

export function quoteCancellation(booking, freeDays = 0, now = new Date()) {
  if (['cancelled', 'completed', 'expired', 'rejected'].includes(booking.status)) {
    return { allowed: false, reason: 'Reservasi tidak dapat dibatalkan lagi.' };
  }
  const today = now.toISOString().slice(0, 10);
  if (booking.checkIn <= today && booking.status === 'checked_in') {
    return { allowed: false, reason: 'Tamu sedang menginap. Hubungi hotel untuk perubahan.' };
  }
  const deadline = freeCancellationDeadline(booking.checkIn, freeDays);
  const free = deadline ? today <= deadline : false;
  const oneNight = booking.price.nights[0]?.rate ?? 0;
  const penalty = free ? 0 : Math.min(booking.price.total, oneNight * booking.rooms);
  const paid = ['paid', 'settled_on_arrival'].includes(booking.paymentStatus) ? booking.price.total : 0;
  return {
    allowed: true,
    free,
    policy: freeDays > 0 ? `Gratis pembatalan sampai ${freeDays} hari sebelum check-in.` : 'Pembatalan dikenakan biaya 1 malam.',
    deadline,
    penalty,
    refundAmount: Math.max(0, Math.min(paid, booking.price.total - penalty)),
    nights: nightsBetween(booking.checkIn, booking.checkOut),
  };
}
