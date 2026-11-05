import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from './domain/auth.js';
import { addDays, dateKey, eachDateKey, isValidKey, nightsBetween } from './domain/dates.js';
import { checkStayAvailability, unitsCommitted } from './domain/availability.js';
import { quoteStay, rateForNight, POINT_VALUE_IDR } from './domain/pricing.js';
import { tierFor, tierProgress, pointsEarned, TIERS } from './domain/loyalty.js';
import {
  bookingPhase,
  canTransition,
  quoteCancellation,
  uniqueBookingCode,
} from './domain/bookings.js';
import {
  PAYMENT_METHODS,
  createPayment,
  methodsForHotel,
  paymentMethod,
  verifyPaymentSignature,
} from './domain/payments.js';
import { hotelRating, parseSearchParams, ratingBand, searchHotels } from './domain/search.js';
import { travelokaStatus } from './integrations/traveloka.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const FACILITIES = [
  'Wi-Fi Gratis', 'Kolam Renang', 'Gym', 'Parkir', 'Restoran', 'Spa', 'AC',
  'Resepsionis 24 Jam', 'Sarapan', 'Antar-Jemput Bandara', 'Antar-Jemput Pelabuhan',
];

const PROPERTY_TYPES = ['hotel', 'resort', 'villa', 'hostel', 'apartment'];
const ROOM_CATEGORIES = ['single', 'double', 'twin', 'suite', 'family'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const reply = (body, status = 200) => ({ status, body });

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new HttpError(413, 'Payload terlalu besar.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Body JSON tidak valid.'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let rel;
  try {
    rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const resolved = path.resolve(PUBLIC_DIR, rel);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let file = resolved;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(PUBLIC_DIR, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export function createApp({
  file = null,
  seed = true,
  secret = process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  paymentServerKey = process.env.PAYMENT_SERVER_KEY || 'sb-hotelreserve-demo-key',
} = {}) {
  const store = createStore({ file, seed });
  const db = () => store.data;
  const nowIso = () => new Date().toISOString();
  const today = () => dateKey(new Date());

  /* ------------------------------------------------------------------ *
   * Lookups and projections
   * ------------------------------------------------------------------ */

  const findHotel = (id) => db().hotels.find((hotel) => hotel.id === id) ?? null;
  const findRoom = (id) => db().roomTypes.find((room) => room.id === id) ?? null;
  const findUser = (id) => db().users.find((user) => user.id === id) ?? null;
  const findBooking = (id) => db().bookings.find((booking) => booking.id === id) ?? null;

  const activePromos = (city = null) => {
    const day = today();
    return db().promos.filter((promo) => {
      if (!promo.active) return false;
      if (promo.validUntil && promo.validUntil < day) return false;
      if (promo.usageLimit && promo.usedCount >= promo.usageLimit) return false;
      if (city && promo.city && promo.city !== city) return false;
      return true;
    });
  };

  const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    points: user.points,
    lifetimePoints: user.lifetimePoints,
    tier: tierFor(user.lifetimePoints).key,
    tierName: tierFor(user.lifetimePoints).name,
    hotelIds: user.hotelIds ?? [],
    createdAt: user.createdAt,
  });

  const hotelBase = (hotel) => ({
    id: hotel.id,
    code: hotel.code,
    name: hotel.name,
    city: hotel.city,
    district: hotel.district,
    address: hotel.address,
    lat: hotel.lat,
    lng: hotel.lng,
    stars: hotel.stars,
    propertyType: hotel.propertyType,
    tagline: hotel.tagline,
    description: hotel.description,
    facilities: hotel.facilities,
    images: hotel.images,
    policies: hotel.policies,
    nearby: hotel.nearby,
    status: hotel.status,
    ownerId: hotel.ownerId,
    commissionRate: hotel.commissionRate,
    createdAt: hotel.createdAt,
  });

  const hotelCard = ({ hotel, rating, reviewCount, fromPrice, nights }) => ({
    id: hotel.id,
    name: hotel.name,
    city: hotel.city,
    district: hotel.district,
    address: hotel.address,
    stars: hotel.stars,
    propertyType: hotel.propertyType,
    tagline: hotel.tagline,
    facilities: hotel.facilities,
    images: hotel.images,
    policies: hotel.policies,
    rating,
    reviewCount,
    ratingBand: ratingBand(rating),
    fromPrice,
    nights,
    freeCancellation: (hotel.policies?.freeCancellationDays ?? 0) > 0,
    payAtHotel: hotel.policies?.payAtHotel === true,
  });

  const publicPayment = (payment) => ({ ...payment });

  function publicBooking(booking) {
    const hotel = findHotel(booking.hotelId);
    const roomType = findRoom(booking.roomTypeId);
    const payments = db()
      .payments.filter((payment) => payment.bookingId === booking.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const freeDays = roomType?.freeCancellationDays ?? hotel?.policies?.freeCancellationDays ?? 0;
    const cancelQuote = quoteCancellation(booking, freeDays);
    return {
      ...booking,
      phase: bookingPhase(booking),
      hotel: hotel ? hotelBase(hotel) : null,
      roomType: roomType
        ? {
            id: roomType.id,
            name: roomType.name,
            category: roomType.category,
            capacity: roomType.capacity,
            beds: roomType.beds,
            breakfastIncluded: roomType.breakfastIncluded,
            freeCancellationDays: roomType.freeCancellationDays,
          }
        : null,
      payment: payments[0] ? publicPayment(payments[0]) : null,
      canCancel: cancelQuote.allowed,
      cancellationQuote: cancelQuote.allowed ? cancelQuote : null,
      canReview:
        booking.status === 'completed' && booking.checkOut <= today() && !booking.reviewId,
    };
  }

  const reviewView = (review) => ({
    id: review.id,
    hotelId: review.hotelId,
    guestName: review.guestName,
    rating: review.rating,
    cleanliness: review.cleanliness,
    service: review.service,
    location: review.location,
    title: review.title,
    body: review.body,
    verifiedStay: review.verifiedStay,
    createdAt: review.createdAt,
    response: review.response,
    hidden: review.hidden,
  });

  function hotelAccess(user, hotel) {
    if (!user || !hotel) return null;
    if (user.role === 'admin') return 'admin';
    if (hotel.ownerId === user.id) return 'owner';
    if (user.role === 'staff' && (user.hotelIds ?? []).includes(hotel.id)) return 'staff';
    return null;
  }

  const hotelsForPartner = (user) => {
    if (user.role === 'admin') return db().hotels;
    const ids = new Set([...(user.hotelIds ?? [])]);
    return db().hotels.filter((hotel) => hotel.ownerId === user.id || ids.has(hotel.id));
  };

  function notify(userId, { type, title, body, link = null }) {
    if (!userId) return;
    db().notifications.unshift({
      id: randomUUID(),
      userId,
      type,
      title,
      body,
      link,
      read: false,
      createdAt: nowIso(),
    });
  }

  function audit(actorId, action, target, detail = null) {
    db().auditLog.unshift({
      id: randomUUID(),
      actorId,
      action,
      target,
      detail,
      at: nowIso(),
    });
    if (db().auditLog.length > 500) db().auditLog.length = 500;
  }

  function countPromo(booking) {
    if (booking.promoCounted || !booking.price?.promoCode) return;
    const promo = db().promos.find((item) => item.code === booking.price.promoCode);
    if (promo) {
      promo.usedCount += 1;
      booking.promoCounted = true;
    }
  }

  /* ------------------------------------------------------------------ *
   * Lazy expiry sweep (holds, unpaid bookings, stale payments)
   * ------------------------------------------------------------------ */

  function sweep() {
    const now = Date.now();
    let changed = false;

    const activeHolds = db().holds.filter((hold) => new Date(hold.expiresAt).getTime() > now);
    if (activeHolds.length !== db().holds.length) {
      db().holds = activeHolds;
      changed = true;
    }

    for (const payment of db().payments) {
      if (
        payment.status === 'pending' &&
        payment.expiresAt &&
        new Date(payment.expiresAt).getTime() <= now
      ) {
        payment.status = 'expired';
        changed = true;
      }
    }

    for (const booking of db().bookings) {
      if (booking.status === 'pending_payment') {
        const deadline = booking.reservationExpiresAt;
        if (deadline && new Date(deadline).getTime() <= now) {
          booking.status = 'expired';
          booking.updatedAt = new Date().toISOString();
          const guest = findUser(booking.userId);
          notify(booking.userId, {
            type: 'booking_expired',
            title: `Reservasi ${booking.code} kedaluwarsa`,
            body: 'Batas waktu pembayaran terlewat, kamar dilepas kembali ke inventori.',
            link: '#/trips',
          });
          const hotel = findHotel(booking.hotelId);
          if (hotel?.ownerId && !guest) {
            notify(hotel.ownerId, {
              type: 'booking_expired',
              title: `Reservasi ${booking.code} kedaluwarsa`,
              body: 'Pembayaran tidak diterima sebelum batas waktu.',
              link: '#/partner',
            });
          }
          changed = true;
        }
      }
      if (booking.status === 'pending_confirmation' && booking.requestExpiresAt) {
        if (new Date(booking.requestExpiresAt).getTime() <= now) {
          booking.status = 'expired';
          booking.updatedAt = new Date().toISOString();
          notify(booking.userId, {
            type: 'booking_expired',
            title: `Permintaan reservasi ${booking.code} kedaluwarsa`,
            body: 'Hotel tidak merespons dalam batas waktu yang ditentukan.',
            link: '#/trips',
          });
          changed = true;
        }
      }
    }

    return changed;
  }

  /* ------------------------------------------------------------------ *
   * Auth, validation, and shared guest helpers
   * ------------------------------------------------------------------ */

  function currentUser(req) {
    const header = String(req.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    const payload = verifyToken(token, secret);
    if (!payload?.sub) return null;
    const user = findUser(payload.sub);
    if (!user || user.status !== 'active') return null;
    return user;
  }

  function requireRole(ctx, ...roles) {
    if (!ctx.user) throw new HttpError(401, 'Silakan masuk terlebih dahulu.');
    if (roles.length && !roles.includes(ctx.user.role)) {
      throw new HttpError(403, 'Anda tidak memiliki akses ke fitur ini.');
    }
    return ctx.user;
  }

  function parseStay(body = {}) {
    const checkIn = body.checkIn;
    const checkOut = body.checkOut;
    if (!isValidKey(checkIn) || !isValidKey(checkOut)) {
      throw new HttpError(400, 'Tanggal check-in dan check-out wajib dipilih.');
    }
    if (checkOut <= checkIn) {
      throw new HttpError(400, 'Tanggal check-out harus setelah tanggal check-in.');
    }
    const nights = nightsBetween(checkIn, checkOut);
    if (nights > 30) throw new HttpError(400, 'Maksimal 30 malam per reservasi.');
    if (checkIn < today()) throw new HttpError(400, 'Tanggal check-in tidak boleh di masa lalu.');
    const rooms = Math.max(1, Math.min(5, Number(body.rooms) || 1));
    const adults = Math.max(1, Math.min(16, Number(body.adults) || 2));
    const children = Math.max(0, Math.min(10, Number(body.children) || 0));
    return { checkIn, checkOut, nights, rooms, adults, children };
  }

  function resolvePromo(code, hotel, subtotal) {
    if (!code) return { promo: null };
    const promo = db().promos.find(
      (item) => item.code.toUpperCase() === String(code).trim().toUpperCase(),
    );
    if (!promo || !promo.active) {
      throw new HttpError(400, 'Kode promo tidak ditemukan atau tidak aktif.');
    }
    if (promo.validUntil && promo.validUntil < today()) {
      throw new HttpError(400, 'Kode promo sudah kedaluwarsa.');
    }
    if (promo.city && promo.city !== hotel.city) {
      throw new HttpError(400, `Promo ini hanya berlaku untuk hotel di ${promo.city}.`);
    }
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      throw new HttpError(400, 'Kuota promo sudah habis.');
    }
    if (subtotal < promo.minSpend) {
      throw new HttpError(
        400,
        `Minimum transaksi untuk promo ini adalah Rp${promo.minSpend.toLocaleString('id-ID')}.`,
      );
    }
    return { promo };
  }

  function stayPricing(roomType, stay, { promo = null, pointsToUse = 0, availablePoints = 0, lifetimePoints = 0 } = {}) {
    return quoteStay({
      roomType,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      rooms: stay.rooms,
      promo,
      pointsToUse,
      availablePoints,
      earnMultiplier: tierFor(lifetimePoints).earnMultiplier,
    });
  }

  function ensureGuest(body = {}) {
    const guest = body.guest ?? {};
    const name = String(guest.name ?? '').trim();
    const email = String(guest.email ?? '').trim().toLowerCase();
    const phone = String(guest.phone ?? '').trim();
    if (name.length < 2) throw new HttpError(400, 'Nama tamu minimal 2 karakter.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email tamu tidak valid.');
    if (phone.replace(/\D/g, '').length < 8) throw new HttpError(400, 'Nomor telepon tamu tidak valid.');
    return { name, email, phone };
  }

  function applyCancellation(booking, { reason, actorId = null, byHotel = false } = {}) {
    const roomType = findRoom(booking.roomTypeId);
    const hotel = findHotel(booking.hotelId);
    const guest = findUser(booking.userId);
    const freeDays = roomType?.freeCancellationDays ?? hotel?.policies?.freeCancellationDays ?? 0;
    const calc = byHotel
      ? { penalty: 0, refundAmount: booking.paymentStatus === 'paid' ? booking.price.total : 0 }
      : quoteCancellation(booking, freeDays);

    booking.status = 'cancelled';
    booking.updatedAt = nowIso();
    booking.reservationExpiresAt = null;
    booking.requestExpiresAt = null;
    booking.cancellation = {
      at: nowIso(),
      reason: String(reason ?? '').slice(0, 300) || (byHotel ? 'Dibatalkan oleh hotel' : 'Dibatalkan oleh tamu'),
      penalty: calc.penalty ?? 0,
      refundAmount: calc.refundAmount ?? 0,
      by: actorId,
    };

    if (guest && booking.price.pointsUsed) {
      guest.points += booking.price.pointsUsed;
    }

    if (booking.paymentStatus === 'paid' && (calc.refundAmount ?? 0) > 0) {
      const payment = db().payments.find(
        (item) => item.bookingId === booking.id && item.status === 'paid',
      );
      if (payment) {
        payment.status = 'refunded';
        payment.refundedAt = nowIso();
        payment.refundAmount = calc.refundAmount;
      }
      db().refunds.push({
        id: randomUUID(),
        bookingId: booking.id,
        bookingCode: booking.code,
        userId: booking.userId,
        hotelId: booking.hotelId,
        amount: calc.refundAmount,
        penalty: calc.penalty ?? 0,
        status: 'processed',
        method: 'original_payment_method',
        reason: booking.cancellation.reason,
        createdAt: nowIso(),
        decidedAt: nowIso(),
        decidedBy: actorId,
      });
      booking.paymentStatus = 'refunded';
      notify(booking.userId, {
        type: 'refund',
        title: `Refund ${booking.code} diproses`,
        body: `Dana Rp${calc.refundAmount.toLocaleString('id-ID')} dikembalikan ke metode pembayaran awal.`,
        link: '#/trips',
      });
    } else if (booking.paymentStatus === 'on_arrival') {
      booking.paymentStatus = 'cancelled';
    }

    notify(booking.userId, {
      type: 'cancelled',
      title: `Reservasi ${booking.code} dibatalkan`,
      body: booking.cancellation.reason,
      link: '#/trips',
    });
    if (hotel?.ownerId && !byHotel) {
      notify(hotel.ownerId, {
        type: 'booking_cancelled',
        title: `Reservasi ${booking.code} dibatalkan tamu`,
        body: `${hotel.name} — ${booking.checkIn} s/d ${booking.checkOut}`,
        link: '#/partner',
      });
    }
    return booking.cancellation;
  }

  function applyPaymentPaid(payment, source = 'simulator') {
    if (payment.status === 'paid') {
      const existing = findBooking(payment.bookingId);
      return { booking: existing, payment, alreadyPaid: true };
    }
    const booking = findBooking(payment.bookingId);
    if (!booking) throw new HttpError(404, 'Reservasi untuk pembayaran ini tidak ditemukan.');
    if (!canTransition(booking.status, 'confirmed')) {
      throw new HttpError(409, `Reservasi berstatus ${booking.status} tidak dapat dibayar.`);
    }
    payment.status = 'paid';
    payment.paidAt = nowIso();
    payment.source = source;
    booking.paymentStatus = 'paid';
    booking.status = 'confirmed';
    booking.reservationExpiresAt = null;
    booking.requestExpiresAt = null;
    booking.updatedAt = nowIso();
    countPromo(booking);
    const hotel = findHotel(booking.hotelId);
    notify(booking.userId, {
      type: 'payment_success',
      title: `Pembayaran ${booking.code} berhasil`,
      body: `Reservasi ${hotel?.name ?? ''} terkonfirmasi. E-voucher tersedia di halaman Perjalanan.`,
      link: '#/trips',
    });
    if (hotel?.ownerId) {
      notify(hotel.ownerId, {
        type: 'new_booking',
        title: `Reservasi baru ${booking.code}`,
        body: `${hotel.name} — ${booking.rooms} kamar, ${booking.checkIn} s/d ${booking.checkOut}`,
        link: '#/partner',
      });
    }
    return { booking, payment, alreadyPaid: false };
  }

  /* ------------------------------------------------------------------ *
   * Routing
   * ------------------------------------------------------------------ */

  const routes = [];
  function route(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      `^${pattern.replace(/:(\w+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      })}$`,
    );
    routes.push({ method, regex, keys, handler });
  }

  function matchRoute(method, pathname) {
    for (const entry of routes) {
      if (entry.method !== method) continue;
      const match = pathname.match(entry.regex);
      if (!match) continue;
      const params = {};
      entry.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return { route: entry, params };
    }
    return null;
  }

  /* ------------------------------- auth ------------------------------ */

  route('POST', '/api/v1/auth/register', (ctx) => {
    const body = ctx.body ?? {};
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const password = String(body.password ?? '');
    if (name.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Format email tidak valid.');
    if (phone.replace(/\D/g, '').length < 8) throw new HttpError(400, 'Nomor telepon tidak valid.');
    if (password.length < 8) throw new HttpError(400, 'Kata sandi minimal 8 karakter.');
    if (db().users.some((user) => user.email === email)) {
      throw new HttpError(409, 'Email sudah terdaftar. Silakan masuk.');
    }
    const user = {
      id: randomUUID(),
      name,
      email,
      phone,
      passwordHash: hashPassword(password),
      role: 'customer',
      status: 'active',
      points: 0,
      lifetimePoints: 0,
      createdAt: nowIso(),
    };
    db().users.push(user);
    notify(user.id, {
      type: 'welcome',
      title: 'Selamat datang di Hotel Reserve',
      body: 'Kumpulkan poin setiap menginap dan naikkan tier membership Anda.',
      link: '#/account',
    });
    return reply({ token: signToken({ sub: user.id }, secret), user: publicUser(user) }, 201);
  });

  route('POST', '/api/v1/auth/login', (ctx) => {
    const email = String(ctx.body?.email ?? '').trim().toLowerCase();
    const password = String(ctx.body?.password ?? '');
    const user = db().users.find((item) => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, 'Email atau kata sandi salah.');
    }
    if (user.status !== 'active') throw new HttpError(403, 'Akun Anda sedang dibekukan.');
    return reply({ token: signToken({ sub: user.id }, secret), user: publicUser(user) });
  });

  route('GET', '/api/v1/auth/me', (ctx) => {
    const user = requireRole(ctx);
    return reply({
      user: publicUser(user),
      loyalty: tierProgress(user.lifetimePoints),
      counts: {
        favorites: db().favorites.filter((item) => item.userId === user.id).length,
        unreadNotifications: db().notifications.filter(
          (item) => item.userId === user.id && !item.read,
        ).length,
        bookings: db().bookings.filter((item) => item.userId === user.id).length,
      },
    });
  });

  route('PATCH', '/api/v1/auth/profile', (ctx) => {
    const user = requireRole(ctx);
    const body = ctx.body ?? {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2) throw new HttpError(400, 'Nama minimal 2 karakter.');
      user.name = name;
    }
    if (body.phone !== undefined) {
      const phone = String(body.phone).trim();
      if (phone.replace(/\D/g, '').length < 8) throw new HttpError(400, 'Nomor telepon tidak valid.');
      user.phone = phone;
    }
    return reply({ user: publicUser(user) });
  });

  /* ----------------------------- catalogue --------------------------- */

  route('GET', '/api/v1/meta', () => reply({
    facilities: FACILITIES,
    propertyTypes: PROPERTY_TYPES,
    roomCategories: ROOM_CATEGORIES,
    stars: [3, 4, 5],
    cities: [...new Set(db().hotels.filter((hotel) => hotel.status === 'verified').map((hotel) => hotel.city))].sort(),
    paymentMethods: PAYMENT_METHODS,
    pointsValueIdr: POINT_VALUE_IDR,
    loyaltyTiers: TIERS,
  }));

  route('GET', '/api/v1/hotels', (ctx) => {
    const params = parseSearchParams(ctx.query);
    const { total, items, cities } = searchHotels(db(), params);
    return reply({
      total,
      count: items.length,
      cities,
      query: params,
      favoriteIds: ctx.user
        ? db().favorites.filter((item) => item.userId === ctx.user.id).map((item) => item.hotelId)
        : [],
      items: items.map(hotelCard),
    });
  });

  route('GET', '/api/v1/hotels/:id', (ctx) => {
    const hotel = findHotel(ctx.params.id);
    if (!hotel || hotel.status !== 'verified') throw new HttpError(404, 'Hotel tidak ditemukan.');
    const query = ctx.query;
    const checkIn = isValidKey(query.checkIn) ? query.checkIn : null;
    const checkOut = isValidKey(query.checkOut) && checkIn ? query.checkOut : null;
    const rooms = Math.max(1, Math.min(5, Number(query.rooms) || 1));
    const guests = Math.max(1, Number(query.guests) || 2);
    const points = ctx.user?.points ?? 0;
    const lifetimePoints = ctx.user?.lifetimePoints ?? 0;

    const roomTypes = db()
      .roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false)
      .map((roomType) => {
        let stay = null;
        let quote = null;
        if (checkIn && checkOut) {
          stay = checkStayAvailability(db(), roomType, checkIn, checkOut, rooms);
          quote = stayPricing(roomType, { checkIn, checkOut, rooms }, { availablePoints: points, lifetimePoints });
        }
        return {
          ...roomType,
          nightlyRate: checkIn ? rateForNight(roomType, checkIn) : roomType.basePrice,
          available: stay ? stay.available : null,
          remaining: stay ? stay.minRemaining : roomType.inventory,
          fitsGuests: roomType.capacity * rooms >= guests,
          quote,
        };
      });

    const reviews = db()
      .reviews.filter((review) => review.hotelId === hotel.id && !review.hidden)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const { rating, count } = hotelRating(db(), hotel);
    const average = (key) =>
      reviews.length
        ? Math.round((reviews.reduce((sum, review) => sum + (review[key] ?? review.rating), 0) / reviews.length) * 10) / 10
        : rating;

    return reply({
      hotel: hotelBase(hotel),
      rating,
      reviewCount: count,
      reviewSummary: {
        rating,
        count,
        cleanliness: average('cleanliness'),
        service: average('service'),
        location: average('location'),
        breakdown: {
          excellent: reviews.filter((review) => review.rating === 5).length,
          good: reviews.filter((review) => review.rating === 4).length,
          average: reviews.filter((review) => review.rating === 3).length,
          poor: reviews.filter((review) => review.rating <= 2).length,
        },
      },
      rooms: roomTypes,
      reviews: reviews.slice(0, 20).map(reviewView),
      paymentMethods: methodsForHotel(hotel),
      promos: activePromos(hotel.city),
      favorite: ctx.user
        ? db().favorites.some((item) => item.userId === ctx.user.id && item.hotelId === hotel.id)
        : false,
    });
  });

  route('GET', '/api/v1/home', () => {
    const verified = db().hotels.filter((hotel) => hotel.status === 'verified');
    const cardFor = (hotel) => {
      const { rating, reviewCount } = hotelRating(db(), hotel);
      const cheapest = db()
        .roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false)
        .reduce((min, roomType) => Math.min(min, roomType.basePrice), Infinity);
      return hotelCard({
        hotel,
        rating,
        reviewCount,
        fromPrice: Number.isFinite(cheapest) ? cheapest : 0,
        nights: null,
      });
    };
    const featured = [...verified].sort((a, b) => hotelRating(db(), b).rating - hotelRating(db(), a).rating).slice(0, 6);
    const cityMap = new Map();
    for (const hotel of verified) {
      const entry = cityMap.get(hotel.city) ?? { city: hotel.city, count: 0, minPrice: Infinity, image: hotel.images?.[0] ?? null, ratingSum: 0 };
      entry.count += 1;
      entry.ratingSum += hotelRating(db(), hotel).rating;
      const cheapest = db()
        .roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false)
        .reduce((min, roomType) => Math.min(min, roomType.basePrice), Infinity);
      entry.minPrice = Math.min(entry.minPrice, cheapest);
      cityMap.set(hotel.city, entry);
    }
    const destinations = [...cityMap.values()]
      .map((entry) => ({ ...entry, rating: Math.round((entry.ratingSum / entry.count) * 10) / 10, minPrice: Number.isFinite(entry.minPrice) ? entry.minPrice : 0 }))
      .sort((a, b) => b.count - a.count || b.rating - a.rating);

    return reply({
      destinations,
      featured: featured.map((hotel) => cardFor(hotel)),
      recommended: [...verified]
        .sort((a, b) => hotelRating(db(), b).reviewCount - hotelRating(db(), a).reviewCount)
        .slice(0, 6)
        .map((hotel) => cardFor(hotel)),
      promos: activePromos(),
      stats: {
        hotels: verified.length,
        cities: destinations.length,
        bookings: db().bookings.filter((booking) => booking.status === 'completed').length,
      },
    });
  });

  route('GET', '/api/v1/destinations', () => {
    const verified = db().hotels.filter((hotel) => hotel.status === 'verified');
    const map = new Map();
    for (const hotel of verified) {
      const entry = map.get(hotel.city) ?? { city: hotel.city, count: 0, minPrice: Infinity, image: hotel.images?.[0] ?? null };
      entry.count += 1;
      const cheapest = db()
        .roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false)
        .reduce((min, roomType) => Math.min(min, roomType.basePrice), Infinity);
      entry.minPrice = Math.min(entry.minPrice, cheapest);
      map.set(hotel.city, entry);
    }
    return reply({
      destinations: [...map.values()].sort((a, b) => b.count - a.count),
    });
  });

  route('GET', '/api/v1/promos', () => reply({ promos: activePromos() }));

  route('GET', '/api/v1/integrations/traveloka', () => reply(travelokaStatus()));

  /* ------------------------------ holds ------------------------------ */

  route('POST', '/api/v1/holds', (ctx) => {
    const user = requireRole(ctx);
    sweep();
    const body = ctx.body ?? {};
    const roomType = findRoom(body.roomTypeId);
    if (!roomType || roomType.active === false) {
      throw new HttpError(404, 'Tipe kamar tidak ditemukan.');
    }
    const hotel = findHotel(roomType.hotelId);
    if (!hotel || hotel.status !== 'verified') {
      throw new HttpError(400, 'Hotel belum tersedia untuk dipesan.');
    }
    const stay = parseStay(body);
    if (roomType.capacity * stay.rooms < stay.adults + stay.children) {
      throw new HttpError(
        400,
        `Kamar ${roomType.name} menampung ${roomType.capacity} tamu per kamar. Tambah jumlah kamar atau pilih tipe lain.`,
      );
    }

    const baseQuote = stayPricing(roomType, stay, { availablePoints: user.points, lifetimePoints: user.lifetimePoints });
    const { promo } = resolvePromo(body.promoCode, hotel, baseQuote.subtotal);

    // Critical section: check and hold without yielding to the event loop, so two
    // guests can never both win the last room.
    const availability = checkStayAvailability(db(), roomType, stay.checkIn, stay.checkOut, stay.rooms);
    if (!availability.available) {
      throw new HttpError(
        409,
        availability.minRemaining === 0
          ? 'Kamar untuk tanggal tersebut sudah habis. Coba tanggal lain atau hotel lain.'
          : `Hanya tersisa ${availability.minRemaining} kamar untuk tanggal tersebut.`,
      );
    }

    const quote = stayPricing(roomType, stay, {
      promo,
      pointsToUse: body.pointsToUse,
      availablePoints: user.points,
      lifetimePoints: user.lifetimePoints,
    });

    const hold = {
      id: randomUUID(),
      userId: user.id,
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      rooms: stay.rooms,
      adults: stay.adults,
      children: stay.children,
      promoCode: promo?.code ?? null,
      pointsUsed: quote.pointsUsed,
      quote,
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      createdAt: nowIso(),
    };

    const userHolds = db().holds.filter((item) => item.userId === user.id);
    if (userHolds.length >= 5) {
      const oldest = [...userHolds].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      db().holds = db().holds.filter((item) => item.id !== oldest.id);
    }
    db().holds.push(hold);

    return reply(
      {
        hold: {
          id: hold.id,
          expiresAt: hold.expiresAt,
          checkIn: hold.checkIn,
          checkOut: hold.checkOut,
          rooms: hold.rooms,
          adults: hold.adults,
          children: hold.children,
          promoCode: hold.promoCode,
          pointsUsed: hold.pointsUsed,
        },
        quote,
        hotel: { id: hotel.id, name: hotel.name, city: hotel.city, images: hotel.images, address: hotel.address, policies: hotel.policies },
        roomType: { id: roomType.id, name: roomType.name, beds: roomType.beds, capacity: roomType.capacity, breakfastIncluded: roomType.breakfastIncluded, freeCancellationDays: roomType.freeCancellationDays },
        paymentMethods: methodsForHotel(hotel),
        promo: promo ? { code: promo.code, title: promo.title } : null,
        availablePoints: user.points,
      },
      201,
    );
  });

  route('DELETE', '/api/v1/holds/:id', (ctx) => {
    const user = requireRole(ctx);
    const hold = db().holds.find((item) => item.id === ctx.params.id);
    if (!hold) return reply({ released: true });
    if (hold.userId !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Anda tidak dapat melepas penahanan kamar milik pengguna lain.');
    }
    db().holds = db().holds.filter((item) => item.id !== hold.id);
    return reply({ released: true });
  });

  const holdView = (hold, user) => {
    const hotel = findHotel(hold.hotelId);
    const roomType = findRoom(hold.roomTypeId);
    return {
      hold: {
        id: hold.id,
        expiresAt: hold.expiresAt,
        checkIn: hold.checkIn,
        checkOut: hold.checkOut,
        rooms: hold.rooms,
        adults: hold.adults,
        children: hold.children,
        promoCode: hold.promoCode,
        pointsUsed: hold.pointsUsed,
        expired: new Date(hold.expiresAt).getTime() <= Date.now(),
      },
      quote: hold.quote,
      hotel: hotel
        ? { id: hotel.id, name: hotel.name, city: hotel.city, district: hotel.district, images: hotel.images, address: hotel.address, policies: hotel.policies }
        : null,
      roomType: roomType
        ? { id: roomType.id, name: roomType.name, beds: roomType.beds, capacity: roomType.capacity, size: roomType.size, breakfastIncluded: roomType.breakfastIncluded, freeCancellationDays: roomType.freeCancellationDays }
        : null,
      paymentMethods: hotel ? methodsForHotel(hotel) : [],
      promo: hold.promoCode ? { code: hold.promoCode } : null,
      availablePoints: user.points,
    };
  };

  route('GET', '/api/v1/holds/:id', (ctx) => {
    const user = requireRole(ctx);
    sweep();
    const hold = db().holds.find((item) => item.id === ctx.params.id);
    if (!hold) throw new HttpError(404, 'Sesi penahanan kamar tidak ditemukan atau sudah berakhir. Silakan pilih kamar kembali.');
    if (hold.userId !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Penahanan kamar ini bukan milik Anda.');
    }
    return reply(holdView(hold, user));
  });

  route('PATCH', '/api/v1/holds/:id', (ctx) => {
    const user = requireRole(ctx);
    sweep();
    const hold = db().holds.find((item) => item.id === ctx.params.id);
    if (!hold) throw new HttpError(410, 'Sesi penahanan kamar sudah berakhir. Silakan pilih kamar kembali.');
    if (hold.userId !== user.id) throw new HttpError(403, 'Penahanan kamar ini bukan milik Anda.');
    if (new Date(hold.expiresAt).getTime() <= Date.now()) {
      db().holds = db().holds.filter((item) => item.id !== hold.id);
      throw new HttpError(410, 'Waktu penahanan kamar sudah habis. Silakan pilih kamar kembali.');
    }
    const roomType = findRoom(hold.roomTypeId);
    const hotel = findHotel(hold.hotelId);
    if (!roomType || !hotel) throw new HttpError(404, 'Data kamar tidak ditemukan.');
    const body = ctx.body ?? {};
    const stay = { checkIn: hold.checkIn, checkOut: hold.checkOut, rooms: hold.rooms };
    const baseQuote = stayPricing(roomType, stay, { availablePoints: 0, lifetimePoints: 0 });
    const code = body.promoCode === undefined ? hold.promoCode : String(body.promoCode ?? '').trim().toUpperCase();
    let promo = null;
    if (code) {
      const resolved = resolvePromo(code, hotel, baseQuote.subtotal);
      promo = resolved.promo;
    }
    const quote = stayPricing(roomType, stay, {
      promo,
      pointsToUse: body.pointsToUse === undefined ? hold.pointsUsed : body.pointsToUse,
      availablePoints: user.points,
      lifetimePoints: user.lifetimePoints,
    });
    hold.promoCode = promo?.code ?? null;
    hold.pointsUsed = quote.pointsUsed;
    hold.quote = quote;
    return reply(holdView(hold, user));
  });

  /* ----------------------------- bookings ---------------------------- */

  route('POST', '/api/v1/bookings', (ctx) => {
    const user = requireRole(ctx);
    sweep();
    const body = ctx.body ?? {};
    const hold = db().holds.find((item) => item.id === body.holdId && item.userId === user.id);
    if (!hold) {
      throw new HttpError(410, 'Sesi penahanan kamar tidak ditemukan. Silakan pilih kamar kembali.');
    }
    if (new Date(hold.expiresAt).getTime() <= Date.now()) {
      db().holds = db().holds.filter((item) => item.id !== hold.id);
      throw new HttpError(410, 'Waktu penahanan kamar sudah habis. Silakan pilih kamar kembali.');
    }
    const roomType = findRoom(hold.roomTypeId);
    const hotel = findHotel(hold.hotelId);
    if (!roomType || !hotel) throw new HttpError(404, 'Data kamar tidak ditemukan.');

    const stay = {
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
      nights: nightsBetween(hold.checkIn, hold.checkOut),
      rooms: hold.rooms,
      adults: hold.adults,
      children: hold.children,
    };
    const availability = checkStayAvailability(
      db(), roomType, stay.checkIn, stay.checkOut, stay.rooms, Date.now(), null, hold.id,
    );
    if (!availability.available) {
      db().holds = db().holds.filter((item) => item.id !== hold.id);
      throw new HttpError(409, 'Kamar baru saja dipesan tamu lain. Silakan pilih kamar lain.');
    }

    const method = paymentMethod(body.paymentMethod);
    if (!method) throw new HttpError(400, 'Metode pembayaran tidak dikenali.');
    if (method.key === 'pay_at_hotel' && !hotel.policies?.payAtHotel) {
      throw new HttpError(400, 'Hotel ini tidak menerima pembayaran di tempat.');
    }

    const guest = ensureGuest(body);
    const promo = hold.promoCode
      ? db().promos.find((item) => item.code === hold.promoCode) ?? null
      : null;
    const quote = stayPricing(roomType, stay, {
      promo,
      pointsToUse: hold.pointsUsed,
      availablePoints: user.points,
      lifetimePoints: user.lifetimePoints,
    });

    const booking = {
      id: randomUUID(),
      code: uniqueBookingCode(db()),
      userId: user.id,
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      rooms: stay.rooms,
      adults: stay.adults,
      children: stay.children,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      guest,
      specialRequests: String(body.specialRequests ?? '').slice(0, 500),
      price: quote,
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentMethod: method.key,
      qrToken: randomUUID(),
      roomNumber: null,
      reservationExpiresAt: null,
      requestExpiresAt: null,
      pointsAwarded: false,
      promoSourced: quote.promoCode,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      checkedInAt: null,
      checkedOutAt: null,
      reviewId: null,
      cancellation: null,
      modification: null,
    };

    const payment = createPayment(booking, method);
    if (method.kind === 'on_arrival') {
      booking.status = 'pending_confirmation';
      booking.paymentStatus = 'on_arrival';
      booking.requestExpiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
      payment.status = 'on_arrival';
    } else {
      booking.reservationExpiresAt = payment.expiresAt;
    }

    if (quote.pointsUsed > 0) user.points = Math.max(0, user.points - quote.pointsUsed);

    db().bookings.push(booking);
    db().payments.push(payment);
    db().holds = db().holds.filter((item) => item.id !== hold.id);

    notify(user.id, {
      type: 'booking_created',
      title:
        booking.status === 'pending_confirmation'
          ? `Permintaan reservasi ${booking.code} dikirim`
          : `Reservasi ${booking.code} menunggu pembayaran`,
      body: `${hotel.name} — ${booking.checkIn} s/d ${booking.checkOut}. Selesaikan pembayaran sebelum batas waktu.`,
      link: booking.status === 'pending_confirmation' ? '#/trips' : `#/pay/${booking.id}`,
    });
    if (booking.status === 'pending_confirmation' && hotel.ownerId) {
      notify(hotel.ownerId, {
        type: 'booking_request',
        title: `Permintaan reservasi ${booking.code}`,
        body: `${hotel.name} — perlu konfirmasi hotel.`,
        link: '#/partner',
      });
    }

    return reply({ booking: publicBooking(booking), payment: publicPayment(payment) }, 201);
  });

  route('GET', '/api/v1/bookings', (ctx) => {
    const user = requireRole(ctx);
    const phase = ctx.query.phase;
    const items = db()
      .bookings.filter((booking) => booking.userId === user.id)
      .map(publicBooking)
      .filter((booking) => (phase ? booking.phase === phase : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const counts = items.reduce((acc, booking) => {
      acc[booking.phase] = (acc[booking.phase] ?? 0) + 1;
      return acc;
    }, {});
    return reply({ items, counts });
  });

  route('GET', '/api/v1/bookings/:id', (ctx) => {
    const user = requireRole(ctx);
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    const hotel = findHotel(booking.hotelId);
    const isOwner = booking.userId === user.id;
    const access = hotelAccess(user, hotel);
    if (!isOwner && !access) throw new HttpError(403, 'Anda tidak memiliki akses ke reservasi ini.');
    return reply({ booking: publicBooking(booking) });
  });

  route('POST', '/api/v1/bookings/:id/pay', (ctx) => {
    const user = requireRole(ctx);
    sweep();
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    if (booking.userId !== user.id) throw new HttpError(403, 'Reservasi ini bukan milik Anda.');
    if (booking.status !== 'pending_payment') {
      throw new HttpError(400, 'Reservasi ini tidak sedang menunggu pembayaran.');
    }
    const method = paymentMethod(ctx.body?.method);
    if (!method) throw new HttpError(400, 'Metode pembayaran tidak dikenali.');
    const hotel = findHotel(booking.hotelId);
    if (method.key === 'pay_at_hotel' && !hotel?.policies?.payAtHotel) {
      throw new HttpError(400, 'Hotel ini tidak menerima pembayaran di tempat.');
    }
    const payment = createPayment(booking, method);
    db().payments.push(payment);
    booking.paymentMethod = method.key;
    if (method.kind === 'on_arrival') {
      booking.status = 'pending_confirmation';
      booking.paymentStatus = 'on_arrival';
      booking.reservationExpiresAt = null;
      booking.requestExpiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
      payment.status = 'on_arrival';
    } else {
      booking.paymentStatus = 'pending';
      booking.reservationExpiresAt = payment.expiresAt;
    }
    booking.updatedAt = nowIso();
    return reply({ booking: publicBooking(booking), payment: publicPayment(payment) }, 201);
  });

  route('POST', '/api/v1/bookings/:id/cancel', (ctx) => {
    const user = requireRole(ctx);
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    const hotel = findHotel(booking.hotelId);
    const isOwner = booking.userId === user.id;
    const access = hotelAccess(user, hotel);
    if (!isOwner && !access) throw new HttpError(403, 'Anda tidak memiliki akses ke reservasi ini.');
    if (['cancelled', 'expired', 'completed', 'rejected'].includes(booking.status)) {
      throw new HttpError(400, 'Reservasi ini sudah tidak aktif.');
    }
    const roomType = findRoom(booking.roomTypeId);
    const freeDays = roomType?.freeCancellationDays ?? hotel?.policies?.freeCancellationDays ?? 0;
    const isStaff = access === 'staff';
    const quote = quoteCancellation(booking, isStaff ? 999 : freeDays);
    if (!quote.allowed) throw new HttpError(400, quote.reason);

    applyCancellation(booking, {
      reason: ctx.body?.reason,
      actorId: user.id,
      byHotel: user.role === 'partner' || user.role === 'admin',
    });
    return reply({ booking: publicBooking(booking), refund: quote });
  });

  route('POST', '/api/v1/bookings/:id/modify', (ctx) => {
    const user = requireRole(ctx);
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    if (booking.userId !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Reservasi ini bukan milik Anda.');
    }
    if (!['pending_payment', 'pending_confirmation', 'confirmed'].includes(booking.status)) {
      throw new HttpError(400, 'Reservasi dengan status ini tidak dapat diubah.');
    }
    if (booking.checkIn <= today()) {
      throw new HttpError(400, 'Tanggal tidak dapat diubah setelah check-in dimulai.');
    }
    const roomType = findRoom(booking.roomTypeId);
    if (!roomType) throw new HttpError(404, 'Tipe kamar tidak ditemukan.');
    const body = ctx.body ?? {};
    const stay = parseStay({
      checkIn: body.checkIn ?? booking.checkIn,
      checkOut: body.checkOut ?? booking.checkOut,
      rooms: body.rooms ?? booking.rooms,
      adults: body.adults ?? booking.adults,
      children: body.children ?? booking.children,
    });
    if (roomType.capacity * stay.rooms < stay.adults + stay.children) {
      throw new HttpError(400, `Kamar ini menampung ${roomType.capacity} tamu per kamar.`);
    }
    const availability = checkStayAvailability(
      db(), roomType, stay.checkIn, stay.checkOut, stay.rooms, Date.now(), booking.id,
    );
    if (!availability.available) {
      throw new HttpError(409, `Kamar tidak tersedia untuk tanggal baru (sisa ${availability.minRemaining}).`);
    }
    if (booking.status === 'confirmed') {
      // A confirmed booking may only be moved inside the free-cancellation window
      // unless the difference is settled at the hotel.
      const quote = quoteCancellation(booking, roomType.freeCancellationDays ?? 0);
      if (!quote.free && (stay.checkIn > booking.checkIn || stay.rooms > booking.rooms)) {
        throw new HttpError(400, 'Perubahan yang menambah biaya harus diselesaikan lewat pembatalan dan pemesanan ulang.');
      }
    }

    const guest = findUser(booking.userId);
    const promo = booking.price.promoCode
      ? db().promos.find((item) => item.code === booking.price.promoCode) ?? null
      : null;
    const quote = stayPricing(roomType, stay, {
      promo,
      pointsToUse: booking.price.pointsUsed,
      availablePoints: (guest?.points ?? 0) + booking.price.pointsUsed,
      lifetimePoints: guest?.lifetimePoints ?? 0,
    });
    const refundedPoints = booking.price.pointsUsed - quote.pointsUsed;
    if (guest && refundedPoints > 0) guest.points += refundedPoints;

    const previousTotal = booking.price.total;
    Object.assign(booking, {
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      rooms: stay.rooms,
      adults: stay.adults,
      children: stay.children,
      price: quote,
      updatedAt: nowIso(),
      modification: {
        at: nowIso(),
        previousCheckIn: booking.checkIn,
        previousCheckOut: booking.checkOut,
        previousTotal,
        newTotal: quote.total,
        difference: quote.total - previousTotal,
        settlement:
          quote.total === previousTotal
            ? 'none'
            : quote.total > previousTotal
              ? 'charge_at_hotel'
              : 'refund_at_hotel',
      },
    });

    notify(booking.userId, {
      type: 'booking_modified',
      title: `Reservasi ${booking.code} diperbarui`,
      body: `Tanggal baru ${booking.checkIn} s/d ${booking.checkOut}.`,
      link: '#/trips',
    });
    const hotel = findHotel(booking.hotelId);
    if (hotel?.ownerId) {
      notify(hotel.ownerId, {
        type: 'booking_modified',
        title: `Reservasi ${booking.code} diubah tamu`,
        body: `${booking.checkIn} s/d ${booking.checkOut} — ${booking.rooms} kamar.`,
        link: '#/partner',
      });
    }
    return reply({ booking: publicBooking(booking) });
  });

  route('POST', '/api/v1/bookings/:id/review', (ctx) => {
    const user = requireRole(ctx);
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    if (booking.userId !== user.id) throw new HttpError(403, 'Hanya tamu yang menginap dapat menulis ulasan.');
    if (booking.status !== 'completed') {
      throw new HttpError(400, 'Ulasan hanya dapat ditulis setelah masa menginap selesai.');
    }
    if (booking.checkOut > today()) {
      throw new HttpError(400, 'Ulasan dapat ditulis setelah tanggal check-out terlewati.');
    }
    if (booking.reviewId) throw new HttpError(409, 'Anda sudah menulis ulasan untuk reservasi ini.');

    const body = ctx.body ?? {};
    const clamp = (value) => Math.max(1, Math.min(5, Math.round(Number(value) || 0)));
    const rating = clamp(body.rating);
    if (rating < 1) throw new HttpError(400, 'Rating wajib diisi (1-5).');
    const title = String(body.title ?? '').trim();
    const text = String(body.body ?? '').trim();
    if (title.length < 3) throw new HttpError(400, 'Judul ulasan minimal 3 karakter.');
    if (text.length < 10) throw new HttpError(400, 'Isi ulasan minimal 10 karakter.');

    const review = {
      id: randomUUID(),
      hotelId: booking.hotelId,
      userId: user.id,
      bookingId: booking.id,
      guestName: user.name,
      rating,
      cleanliness: clamp(body.cleanliness ?? rating),
      service: clamp(body.service ?? rating),
      location: clamp(body.location ?? rating),
      title,
      body: text,
      verifiedStay: true,
      createdAt: nowIso(),
      response: null,
      hidden: false,
    };
    db().reviews.unshift(review);
    booking.reviewId = review.id;
    const hotel = findHotel(booking.hotelId);
    if (hotel?.ownerId) {
      notify(hotel.ownerId, {
        type: 'new_review',
        title: 'Ulasan baru masuk',
        body: `${user.name} memberi ${rating} bintang untuk ${hotel.name}.`,
        link: '#/partner',
      });
    }
    return reply({ review: reviewView(review), rating: hotelRating(db(), hotel) }, 201);
  });

  route('POST', '/api/v1/bookings/:id/refund', (ctx) => {
    const user = requireRole(ctx);
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    if (booking.userId !== user.id) throw new HttpError(403, 'Reservasi ini bukan milik Anda.');
    if (booking.paymentStatus !== 'paid') {
      throw new HttpError(400, 'Tidak ada pembayaran yang dapat direfund.');
    }
    if (db().refunds.some((refund) => refund.bookingId === booking.id && refund.status === 'pending')) {
      throw new HttpError(409, 'Pengajuan refund untuk reservasi ini masih diproses.');
    }
    const roomType = findRoom(booking.roomTypeId);
    const quote = quoteCancellation(booking, roomType?.freeCancellationDays ?? 0);
    const refund = {
      id: randomUUID(),
      bookingId: booking.id,
      bookingCode: booking.code,
      userId: booking.userId,
      hotelId: booking.hotelId,
      amount: quote.allowed ? quote.refundAmount : booking.price.total,
      penalty: quote.penalty ?? 0,
      status: 'pending',
      method: 'original_payment_method',
      reason: String(ctx.body?.reason ?? 'Permintaan refund tamu').slice(0, 300),
      createdAt: nowIso(),
      decidedAt: null,
      decidedBy: null,
    };
    db().refunds.push(refund);
    for (const admin of db().users.filter((item) => item.role === 'admin')) {
      notify(admin.id, {
        type: 'refund_request',
        title: `Pengajuan refund ${booking.code}`,
        body: `Nominal Rp${refund.amount.toLocaleString('id-ID')} menunggu keputusan admin.`,
        link: '#/admin',
      });
    }
    return reply({ refund }, 201);
  });

  route('POST', '/api/v1/reviews/:id/report', (ctx) => {
    const user = requireRole(ctx);
    const review = db().reviews.find((item) => item.id === ctx.params.id);
    if (!review) throw new HttpError(404, 'Ulasan tidak ditemukan.');
    db().reviewReports ??= [];
    db().reviewReports.push({
      id: randomUUID(),
      reviewId: review.id,
      reporterId: user.id,
      reason: String(ctx.body?.reason ?? '').slice(0, 300) || 'Tidak disebutkan',
      status: 'open',
      createdAt: nowIso(),
    });
    for (const admin of db().users.filter((item) => item.role === 'admin')) {
      notify(admin.id, {
        type: 'review_report',
        title: 'Laporan ulasan tidak pantas',
        body: `Ulasan oleh ${review.guestName} dilaporkan.`,
        link: '#/admin',
      });
    }
    return reply({ reported: true }, 201);
  });

  /* ----------------------------- payments ---------------------------- */

  route('GET', '/api/v1/payments/:id', (ctx) => {
    const user = requireRole(ctx);
    const payment = db().payments.find((item) => item.id === ctx.params.id);
    if (!payment) throw new HttpError(404, 'Pembayaran tidak ditemukan.');
    if (payment.userId !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Anda tidak memiliki akses ke pembayaran ini.');
    }
    return reply({ payment: publicPayment(payment), booking: publicBooking(findBooking(payment.bookingId)) });
  });

  route('POST', '/api/v1/payments/:id/simulate', (ctx) => {
    const user = requireRole(ctx);
    const payment = db().payments.find((item) => item.id === ctx.params.id);
    if (!payment) throw new HttpError(404, 'Pembayaran tidak ditemukan.');
    if (payment.userId !== user.id && user.role !== 'admin') {
      throw new HttpError(403, 'Anda tidak memiliki akses ke pembayaran ini.');
    }
    const outcome = ctx.body?.outcome ?? 'paid';
    if (!['paid', 'failed'].includes(outcome)) throw new HttpError(400, 'Hasil simulasi tidak valid.');
    if (payment.status === 'paid') {
      return reply({ payment: publicPayment(payment), booking: publicBooking(findBooking(payment.bookingId)), alreadyPaid: true });
    }
    if (payment.status !== 'pending') {
      throw new HttpError(400, `Pembayaran berstatus ${payment.status} tidak dapat diproses.`);
    }
    if (outcome === 'failed') {
      payment.status = 'failed';
      payment.failedAt = nowIso();
      const booking = findBooking(payment.bookingId);
      notify(payment.userId, {
        type: 'payment_failed',
        title: 'Pembayaran gagal',
        body: `Pembayaran untuk ${payment.bookingCode} gagal. Coba metode pembayaran lain.`,
        link: booking ? `#/pay/${booking.id}` : '#/trips',
      });
      return reply({ payment: publicPayment(payment), booking: booking ? publicBooking(booking) : null });
    }
    const result = applyPaymentPaid(payment, 'simulator');
    return reply({ payment: publicPayment(result.payment), booking: publicBooking(result.booking), alreadyPaid: result.alreadyPaid });
  });

  route('POST', '/api/v1/payments/webhook', (ctx) => {
    const body = ctx.body ?? {};
    const payment = db().payments.find((item) => item.orderId === body.order_id);
    if (!payment) throw new HttpError(404, 'Pesanan tidak ditemukan.');
    const valid = verifyPaymentSignature({
      orderId: body.order_id,
      statusCode: body.status_code ?? '200',
      grossAmount: body.gross_amount,
      signature: body.signature,
      serverKey: paymentServerKey,
    });
    if (!valid) throw new HttpError(401, 'Signature webhook tidak valid.');
    if (Number(body.gross_amount) !== Number(payment.amount)) {
      throw new HttpError(400, 'Nominal webhook tidak sesuai dengan tagihan.');
    }
    if (payment.status === 'paid') return reply({ ok: true, idempotent: true });
    if (payment.status !== 'pending') {
      throw new HttpError(409, `Pembayaran berstatus ${payment.status}.`);
    }
    const status = String(body.transaction_status ?? 'settlement');
    if (['settlement', 'capture', 'success'].includes(status)) {
      applyPaymentPaid(payment, 'webhook');
    } else if (['deny', 'cancel', 'failure', 'expire'].includes(status)) {
      payment.status = status === 'expire' ? 'expired' : 'failed';
      payment.failedAt = nowIso();
    } else {
      return reply({ ok: true, ignored: status });
    }
    return reply({ ok: true });
  });

  /* ---------------------------- favorites ---------------------------- */

  route('GET', '/api/v1/favorites', (ctx) => {
    const user = requireRole(ctx);
    const items = db()
      .favorites.filter((item) => item.userId === user.id)
      .map((favorite) => {
        const hotel = findHotel(favorite.hotelId);
        if (!hotel) return null;
        const { rating, reviewCount } = hotelRating(db(), hotel);
        const cheapest = db()
          .roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false)
          .reduce((min, roomType) => Math.min(min, roomType.basePrice), Infinity);
        return hotelCard({
          hotel,
          rating,
          reviewCount,
          fromPrice: Number.isFinite(cheapest) ? cheapest : 0,
          nights: null,
        });
      })
      .filter(Boolean);
    return reply({ items, hotelIds: items.map((item) => item.id) });
  });

  route('POST', '/api/v1/favorites/:hotelId', (ctx) => {
    const user = requireRole(ctx);
    const hotel = findHotel(ctx.params.hotelId);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    const existing = db().favorites.find(
      (item) => item.userId === user.id && item.hotelId === hotel.id,
    );
    if (existing) {
      db().favorites = db().favorites.filter((item) => item.id !== existing.id);
      return reply({ favorite: false, hotelId: hotel.id });
    }
    db().favorites.push({ id: randomUUID(), userId: user.id, hotelId: hotel.id, createdAt: nowIso() });
    return reply({ favorite: true, hotelId: hotel.id }, 201);
  });

  /* --------------------------- notifications ------------------------- */

  route('GET', '/api/v1/notifications', (ctx) => {
    const user = requireRole(ctx);
    const items = db()
      .notifications.filter((item) => item.userId === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50);
    return reply({
      items,
      unread: items.filter((item) => !item.read).length,
    });
  });

  route('POST', '/api/v1/notifications/read-all', (ctx) => {
    const user = requireRole(ctx);
    for (const item of db().notifications) {
      if (item.userId === user.id) item.read = true;
    }
    return reply({ ok: true });
  });

  route('POST', '/api/v1/notifications/:id/read', (ctx) => {
    const user = requireRole(ctx);
    const item = db().notifications.find(
      (notification) => notification.id === ctx.params.id && notification.userId === user.id,
    );
    if (!item) throw new HttpError(404, 'Notifikasi tidak ditemukan.');
    item.read = true;
    return reply({ ok: true });
  });

  /* ----------------------------- loyalty ----------------------------- */

  route('GET', '/api/v1/loyalty', (ctx) => {
    const user = requireRole(ctx);
    const progress = tierProgress(user.lifetimePoints);
    const history = [];
    for (const booking of db().bookings.filter((item) => item.userId === user.id)) {
      if (booking.price?.pointsUsed) {
        history.push({
          id: `${booking.id}-redeem`,
          type: 'redeem',
          points: -booking.price.pointsUsed,
          label: `Pakai poin untuk ${booking.code}`,
          at: booking.createdAt,
        });
      }
      if (booking.pointsAwarded && booking.price?.earnPoints) {
        history.push({
          id: `${booking.id}-earn`,
          type: 'earn',
          points: booking.price.earnPoints,
          label: `Menginap di ${findHotel(booking.hotelId)?.name ?? 'hotel'}`,
          at: booking.checkOut,
        });
      }
    }
    history.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return reply({
      points: user.points,
      lifetimePoints: user.lifetimePoints,
      ...progress,
      tiers: TIERS,
      history,
      pointsValueIdr: POINT_VALUE_IDR,
    });
  });

  /* ------------------------- partner dashboard ----------------------- */

  route('GET', '/api/v1/partner/hotels', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotels = hotelsForPartner(user).map((hotel) => {
      const rooms = db().roomTypes.filter((roomType) => roomType.hotelId === hotel.id && roomType.active !== false);
      const { rating, reviewCount } = hotelRating(db(), hotel);
      return {
        ...hotelBase(hotel),
        rating,
        reviewCount,
        roomCount: rooms.length,
        inventory: rooms.reduce((sum, roomType) => sum + roomType.inventory, 0),
        pendingConfirmations: db().bookings.filter(
          (booking) => booking.hotelId === hotel.id && booking.status === 'pending_confirmation',
        ).length,
      };
    });
    return reply({ hotels, role: user.role });
  });

  route('GET', '/api/v1/partner/hotels/:id', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotel = findHotel(ctx.params.id);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    if (!hotelAccess(user, hotel)) throw new HttpError(403, 'Anda tidak memiliki akses ke hotel ini.');
    return reply({
      hotel: hotelBase(hotel),
      rooms: db().roomTypes.filter((roomType) => roomType.hotelId === hotel.id),
    });
  });

  route('POST', '/api/v1/partner/hotels', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const body = ctx.body ?? {};
    const name = String(body.name ?? '').trim();
    const city = String(body.city ?? '').trim();
    const address = String(body.address ?? '').trim();
    if (name.length < 3) throw new HttpError(400, 'Nama hotel minimal 3 karakter.');
    if (!city) throw new HttpError(400, 'Kota wajib diisi.');
    if (address.length < 6) throw new HttpError(400, 'Alamat minimal 6 karakter.');
    const stars = Math.max(1, Math.min(5, Number(body.stars) || 3));
    const propertyType = PROPERTY_TYPES.includes(body.propertyType) ? body.propertyType : 'hotel';
    const paletteName = ['teal', 'forest', 'plum', 'amber', 'jade', 'steel', 'ocean', 'sand', 'violet', 'slate'][
      db().hotels.length % 10
    ];
    const hotel = {
      id: randomUUID(),
      ownerId: user.id,
      code: `HTL-${String(db().hotels.length + 1).padStart(3, '0')}`,
      status: 'pending',
      verifiedAt: null,
      commissionRate: 0.1,
      name,
      city,
      district: String(body.district ?? '').trim(),
      address,
      lat: Number(body.lat) || -6.2,
      lng: Number(body.lng) || 106.8,
      stars,
      propertyType,
      tagline: String(body.tagline ?? '').slice(0, 160) || `${propertyType} di ${city}`,
      description: String(body.description ?? '').slice(0, 2000) || 'Deskripsi properti belum diisi.',
      facilities: Array.isArray(body.facilities)
        ? body.facilities.filter((facility) => FACILITIES.includes(facility))
        : ['Wi-Fi Gratis', 'AC'],
      policies: {
        checkInTime: body.checkInTime ?? '14:00',
        checkOutTime: body.checkOutTime ?? '12:00',
        freeCancellationDays: Math.max(0, Math.min(30, Number(body.freeCancellationDays) || 0)),
        payAtHotel: Boolean(body.payAtHotel),
        note: String(body.policyNote ?? 'Identitas asli wajib ditunjukkan saat check-in.').slice(0, 500),
      },
      images: ['Lobby', 'Kamar', 'Area Umum', 'Pemandangan'].map((label, index) => ({
        id: `${randomUUID()}-${index}`,
        label,
        colors: PALETTE_SETS[paletteName],
      })),
      nearby: [],
      createdAt: nowIso(),
    };
    db().hotels.push(hotel);
    for (const admin of db().users.filter((item) => item.role === 'admin')) {
      notify(admin.id, {
        type: 'hotel_submitted',
        title: 'Hotel baru menunggu verifikasi',
        body: `${hotel.name} (${hotel.city}) dikirim oleh ${user.name}.`,
        link: '#/admin',
      });
    }
    audit(user.id, 'hotel.submitted', hotel.id, hotel.name);
    return reply({ hotel: hotelBase(hotel) }, 201);
  });

  route('PATCH', '/api/v1/partner/hotels/:id', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const hotel = findHotel(ctx.params.id);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    const access = hotelAccess(user, hotel);
    if (!access || access === 'staff') throw new HttpError(403, 'Hanya pemilik hotel yang dapat mengubah data hotel.');
    const body = ctx.body ?? {};
    const editable = ['name', 'city', 'district', 'address', 'stars', 'propertyType', 'tagline', 'description', 'facilities', 'nearby'];
    for (const key of editable) {
      if (body[key] !== undefined) {
        if (key === 'facilities') {
          hotel.facilities = Array.isArray(body.facilities)
            ? body.facilities.filter((facility) => FACILITIES.includes(facility))
            : hotel.facilities;
        } else if (key === 'stars') {
          hotel.stars = Math.max(1, Math.min(5, Number(body.stars) || hotel.stars));
        } else if (key === 'propertyType') {
          if (PROPERTY_TYPES.includes(body.propertyType)) hotel.propertyType = body.propertyType;
        } else if (key === 'description') {
          hotel.description = String(body.description).slice(0, 2000);
        } else {
          hotel[key] = String(body[key]).slice(0, 300);
        }
      }
    }
    if (body.policies) {
      hotel.policies = {
        ...hotel.policies,
        ...Object.fromEntries(
          Object.entries(body.policies).filter(([key]) =>
            ['checkInTime', 'checkOutTime', 'freeCancellationDays', 'payAtHotel', 'note'].includes(key),
          ),
        ),
      };
    }
    if (hotel.status === 'rejected') {
      hotel.status = 'pending';
      audit(user.id, 'hotel.resubmitted', hotel.id, hotel.name);
    }
    return reply({ hotel: hotelBase(hotel) });
  });

  route('GET', '/api/v1/partner/rooms/:id', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const roomType = findRoom(ctx.params.id);
    if (!roomType) throw new HttpError(404, 'Tipe kamar tidak ditemukan.');
    if (!hotelAccess(user, findHotel(roomType.hotelId))) {
      throw new HttpError(403, 'Anda tidak memiliki akses ke kamar ini.');
    }
    const hotel = findHotel(roomType.hotelId);
    return reply({ roomType, hotel: hotel ? { id: hotel.id, name: hotel.name } : null });
  });

  route('POST', '/api/v1/partner/hotels/:id/rooms', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const hotel = findHotel(ctx.params.id);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    const access = hotelAccess(user, hotel);
    if (!access || access === 'staff') throw new HttpError(403, 'Hanya pemilik hotel yang dapat menambah kamar.');
    const body = ctx.body ?? {};
    const name = String(body.name ?? '').trim();
    if (name.length < 2) throw new HttpError(400, 'Nama tipe kamar minimal 2 karakter.');
    const roomType = {
      id: randomUUID(),
      hotelId: hotel.id,
      name,
      category: ROOM_CATEGORIES.includes(body.category) ? body.category : 'double',
      capacity: Math.max(1, Math.min(8, Number(body.capacity) || 2)),
      beds: String(body.beds ?? '1 Queen Bed').slice(0, 60),
      size: Math.max(6, Number(body.size) || 24),
      basePrice: Math.max(50_000, Math.round(Number(body.basePrice) || 500_000)),
      weekendMultiplier: Math.max(1, Math.min(3, Number(body.weekendMultiplier) || 1.15)),
      inventory: Math.max(1, Math.min(200, Number(body.inventory) || 5)),
      breakfastIncluded: Boolean(body.breakfastIncluded),
      freeCancellationDays: Math.max(0, Math.min(30, Number(body.freeCancellationDays) || 0)),
      amenities: Array.isArray(body.amenities) ? body.amenities.map(String).slice(0, 20) : ['AC', 'Wi-Fi', 'TV'],
      description: String(body.description ?? '').slice(0, 500),
      dateOverrides: [],
      blocks: [],
      photos: [],
      active: true,
      createdAt: nowIso(),
    };
    db().roomTypes.push(roomType);
    return reply({ roomType }, 201);
  });

  route('PATCH', '/api/v1/partner/rooms/:id', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const roomType = findRoom(ctx.params.id);
    if (!roomType) throw new HttpError(404, 'Tipe kamar tidak ditemukan.');
    const hotel = findHotel(roomType.hotelId);
    const access = hotelAccess(user, hotel);
    if (!access || access === 'staff') throw new HttpError(403, 'Hanya pemilik hotel yang dapat mengubah kamar.');
    const body = ctx.body ?? {};

    if (body.inventory !== undefined) {
      const nextInventory = Math.max(1, Math.min(200, Number(body.inventory) || roomType.inventory));
      const committed = Math.max(
        ...db().bookings
          .filter((booking) => booking.roomTypeId === roomType.id && ['confirmed', 'checked_in', 'pending_confirmation', 'pending_payment'].includes(booking.status))
          .map((booking) => booking.rooms),
        0,
      );
      if (nextInventory < committed) {
        throw new HttpError(400, `Inventori tidak boleh lebih kecil dari ${committed} kamar yang sudah dipesan.`);
      }
      roomType.inventory = nextInventory;
    }
    for (const key of ['name', 'beds', 'description']) {
      if (body[key] !== undefined) roomType[key] = String(body[key]).slice(0, key === 'description' ? 500 : 120);
    }
    if (body.category !== undefined && ROOM_CATEGORIES.includes(body.category)) roomType.category = body.category;
    if (body.capacity !== undefined) roomType.capacity = Math.max(1, Math.min(8, Number(body.capacity) || roomType.capacity));
    if (body.basePrice !== undefined) roomType.basePrice = Math.max(50_000, Math.round(Number(body.basePrice) || roomType.basePrice));
    if (body.weekendMultiplier !== undefined) roomType.weekendMultiplier = Math.max(1, Math.min(3, Number(body.weekendMultiplier) || 1));
    if (body.size !== undefined) roomType.size = Math.max(6, Number(body.size) || roomType.size);
    if (body.breakfastIncluded !== undefined) roomType.breakfastIncluded = Boolean(body.breakfastIncluded);
    if (body.freeCancellationDays !== undefined) roomType.freeCancellationDays = Math.max(0, Math.min(30, Number(body.freeCancellationDays) || 0));
    if (body.active !== undefined) roomType.active = Boolean(body.active);
    if (Array.isArray(body.amenities)) roomType.amenities = body.amenities.map(String).slice(0, 20);

    if (Array.isArray(body.dateOverrides)) {
      roomType.dateOverrides = body.dateOverrides
        .filter((item) => isValidKey(item.from) && isValidKey(item.to) && item.from <= item.to)
        .map((item) => ({
          id: item.id ?? randomUUID(),
          from: item.from,
          to: item.to,
          ...(item.price ? { price: Math.max(50_000, Math.round(Number(item.price))) } : { multiplier: Math.max(0.5, Math.min(3, Number(item.multiplier) || 1)) }),
          label: String(item.label ?? 'Harga khusus').slice(0, 80),
        }));
    }
    if (Array.isArray(body.blocks)) {
      roomType.blocks = body.blocks
        .filter((item) => isValidKey(item.from) && isValidKey(item.to) && item.from <= item.to)
        .map((item) => ({
          id: item.id ?? randomUUID(),
          from: item.from,
          to: item.to,
          units: Math.max(1, Math.min(roomType.inventory, Number(item.units) || roomType.inventory)),
          reason: String(item.reason ?? 'Maintenance').slice(0, 120),
          createdAt: nowIso(),
        }));
    }
    return reply({ roomType });
  });

  route('DELETE', '/api/v1/partner/rooms/:id', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const roomType = findRoom(ctx.params.id);
    if (!roomType) throw new HttpError(404, 'Tipe kamar tidak ditemukan.');
    const hotel = findHotel(roomType.hotelId);
    const access = hotelAccess(user, hotel);
    if (!access || access === 'staff') throw new HttpError(403, 'Hanya pemilik hotel yang dapat menonaktifkan kamar.');
    const upcoming = db().bookings.some(
      (booking) =>
        booking.roomTypeId === roomType.id &&
        ['pending_payment', 'pending_confirmation', 'confirmed', 'checked_in'].includes(booking.status) &&
        booking.checkOut >= today(),
    );
    if (upcoming) {
      throw new HttpError(400, 'Tipe kamar masih memiliki reservasi aktif. Selesaikan atau batalkan dulu.');
    }
    roomType.active = false;
    return reply({ deactivated: true, roomType });
  });

  route('GET', '/api/v1/partner/calendar', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotel = findHotel(ctx.query.hotelId);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    if (!hotelAccess(user, hotel)) throw new HttpError(403, 'Anda tidak memiliki akses ke hotel ini.');
    const from = isValidKey(ctx.query.from) ? ctx.query.from : today();
    let to = isValidKey(ctx.query.to) ? ctx.query.to : addDays(from, 20);
    if (to < from) to = from;
    if (nightsBetween(from, to) > 62) to = addDays(from, 62);
    const dates = eachDateKey(from, to);
    const rooms = db()
      .roomTypes.filter((roomType) => roomType.hotelId === hotel.id)
      .map((roomType) => {
        const blockedUnits = (date) =>
          (roomType.blocks ?? []).reduce(
            (sum, block) =>
              date >= block.from && date <= block.to ? sum + (block.units ?? roomType.inventory) : sum,
            0,
          );
        return {
          id: roomType.id,
          name: roomType.name,
          inventory: roomType.inventory,
          active: roomType.active !== false,
          basePrice: roomType.basePrice,
          days: dates.map((date) => {
            const blocked = blockedUnits(date);
            const booked = unitsCommitted(db(), roomType, date);
            return {
              date,
              inventory: roomType.inventory,
              blocked,
              reserved: Math.max(0, booked - blocked),
              remaining: Math.max(0, roomType.inventory - booked),
              rate: rateForNight(roomType, date),
            };
          }),
        };
      });
    return reply({ hotel: hotelBase(hotel), from, to, rooms });
  });

  route('GET', '/api/v1/partner/bookings', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotels = hotelsForPartner(user);
    const hotelIds = new Set(hotels.map((hotel) => hotel.id));
    const q = String(ctx.query.q ?? '').trim().toUpperCase();
    const status = ctx.query.status;
    const items = db()
      .bookings.filter((booking) => hotelIds.has(booking.hotelId))
      .filter((booking) => (ctx.query.hotelId ? booking.hotelId === ctx.query.hotelId : true))
      .filter((booking) => (status ? booking.status === status : true))
      .filter((booking) =>
        q ? booking.code.includes(q) || String(booking.guest?.name ?? '').toUpperCase().includes(q) : true,
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((booking) => {
        const view = publicBooking(booking);
        const guest = findUser(booking.userId);
        return { ...view, guestAccount: guest ? { id: guest.id, email: guest.email } : null };
      });
    return reply({ items, hotels: hotels.map((hotel) => ({ id: hotel.id, name: hotel.name })) });
  });

  route('GET', '/api/v1/partner/reviews', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotelIds = new Set(hotelsForPartner(user).map((hotel) => hotel.id));
    const items = db()
      .reviews.filter((review) => hotelIds.has(review.hotelId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 50)
      .map((review) => ({ ...reviewView(review), hotelName: findHotel(review.hotelId)?.name ?? '' }));
    return reply({ items });
  });

  route('POST', '/api/v1/partner/reviews/:id/respond', (ctx) => {
    const user = requireRole(ctx, 'partner', 'admin');
    const review = db().reviews.find((item) => item.id === ctx.params.id);
    if (!review) throw new HttpError(404, 'Ulasan tidak ditemukan.');
    const hotel = findHotel(review.hotelId);
    const access = hotelAccess(user, hotel);
    if (!access || access === 'staff') throw new HttpError(403, 'Hanya pemilik hotel yang dapat membalas ulasan.');
    const body = String(ctx.body?.body ?? '').trim();
    if (body.length < 3) throw new HttpError(400, 'Balasan minimal 3 karakter.');
    review.response = { by: hotel.name, body: body.slice(0, 600), at: nowIso() };
    return reply({ review: reviewView(review) });
  });

  route('POST', '/api/v1/partner/bookings/:id/:action', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const booking = findBooking(ctx.params.id);
    if (!booking) throw new HttpError(404, 'Reservasi tidak ditemukan.');
    const hotel = findHotel(booking.hotelId);
    const access = hotelAccess(user, hotel);
    if (!access) throw new HttpError(403, 'Anda tidak memiliki akses ke reservasi ini.');
    const action = ctx.params.action;
    if (user.role === 'staff' && !['checkin', 'checkout', 'assign-room'].includes(action)) {
      throw new HttpError(403, 'Staf hotel hanya dapat melakukan check-in dan check-out.');
    }
    const body = ctx.body ?? {};
    const guest = findUser(booking.userId);
    const stamp = nowIso();

    if (action === 'accept') {
      if (booking.status !== 'pending_confirmation') throw new HttpError(400, 'Reservasi ini tidak menunggu konfirmasi.');
      booking.status = 'confirmed';
      booking.requestExpiresAt = null;
      booking.updatedAt = stamp;
      countPromo(booking);
      notify(booking.userId, {
        type: 'booking_confirmed',
        title: `Reservasi ${booking.code} dikonfirmasi hotel`,
        body: `${hotel.name} menerima reservasi Anda. E-voucher siap digunakan.`,
        link: '#/trips',
      });
      return reply({ booking: publicBooking(booking) });
    }

    if (action === 'reject') {
      if (booking.status !== 'pending_confirmation') throw new HttpError(400, 'Reservasi ini tidak menunggu konfirmasi.');
      booking.status = 'rejected';
      booking.requestExpiresAt = null;
      booking.updatedAt = stamp;
      booking.cancellation = { at: stamp, reason: String(body.reason ?? 'Hotel tidak dapat menerima reservasi ini.').slice(0, 300), penalty: 0, refundAmount: 0, by: user.id };
      booking.paymentStatus = booking.paymentStatus === 'on_arrival' ? 'cancelled' : booking.paymentStatus;
      notify(booking.userId, {
        type: 'booking_rejected',
        title: `Reservasi ${booking.code} belum dapat diterima`,
        body: booking.cancellation.reason,
        link: '#/trips',
      });
      return reply({ booking: publicBooking(booking) });
    }

    if (action === 'checkin') {
      if (booking.status !== 'confirmed') throw new HttpError(400, 'Hanya reservasi terkonfirmasi yang dapat check-in.');
      if (today() > booking.checkOut) throw new HttpError(400, 'Tanggal menginap sudah terlewat.');
      booking.status = 'checked_in';
      booking.checkedInAt = stamp;
      booking.roomNumber = String(body.roomNumber ?? booking.roomNumber ?? '').slice(0, 20) || `R-${Math.floor(Math.random() * 400) + 100}`;
      booking.updatedAt = stamp;
      notify(booking.userId, {
        type: 'checked_in',
        title: `Check-in ${booking.code} berhasil`,
        body: `Selamat menginap di ${hotel.name}. Nomor kamar: ${booking.roomNumber}.`,
        link: '#/trips',
      });
      return reply({ booking: publicBooking(booking) });
    }

    if (action === 'checkout') {
      if (booking.status !== 'checked_in') throw new HttpError(400, 'Reservasi ini belum check-in.');
      booking.status = 'completed';
      booking.checkedOutAt = stamp;
      booking.updatedAt = stamp;
      let earned = 0;
      if (!booking.pointsAwarded && guest) {
        earned = pointsEarned(booking.price.total, guest.lifetimePoints);
        guest.points += earned;
        guest.lifetimePoints += earned;
        booking.pointsAwarded = true;
        booking.price.earnPoints = earned;
      }
      notify(booking.userId, {
        type: 'checked_out',
        title: `Check-out ${booking.code} selesai`,
        body: `Terima kasih telah menginap di ${hotel.name}. Anda memperoleh ${earned} poin. Bagikan ulasan Anda!`,
        link: '#/trips',
      });
      return reply({ booking: publicBooking(booking), pointsEarned: earned });
    }

    if (action === 'assign-room') {
      if (!['confirmed', 'checked_in'].includes(booking.status)) throw new HttpError(400, 'Nomor kamar hanya dapat diberikan untuk reservasi aktif.');
      booking.roomNumber = String(body.roomNumber ?? '').slice(0, 20);
      if (!booking.roomNumber) throw new HttpError(400, 'Nomor kamar wajib diisi.');
      booking.updatedAt = stamp;
      return reply({ booking: publicBooking(booking) });
    }

    if (action === 'cancel') {
      if (!['pending_payment', 'pending_confirmation', 'confirmed'].includes(booking.status)) {
        throw new HttpError(400, 'Reservasi ini tidak dapat dibatalkan oleh hotel.');
      }
      applyCancellation(booking, {
        reason: ctx.body?.reason ?? 'Dibatalkan oleh hotel',
        actorId: user.id,
        byHotel: true,
      });
      return reply({ booking: publicBooking(booking) });
    }

    throw new HttpError(404, 'Aksi tidak dikenali.');
  });

  route('GET', '/api/v1/partner/stats', (ctx) => {
    const user = requireRole(ctx, 'partner', 'staff', 'admin');
    const hotels = hotelsForPartner(user);
    const hotelIds = new Set(hotels.map((hotel) => hotel.id));
    const bookings = db().bookings.filter((booking) => hotelIds.has(booking.hotelId));
    const paid = bookings.filter((booking) => booking.paymentStatus === 'paid');
    const gross = paid.reduce((sum, booking) => sum + booking.price.total, 0);
    const commission = paid.reduce((sum, booking) => {
      const hotel = findHotel(booking.hotelId);
      return sum + booking.price.total * (hotel?.commissionRate ?? 0.1);
    }, 0);
    const day = today();
    const roomTypes = db().roomTypes.filter(
      (roomType) => hotelIds.has(roomType.hotelId) && roomType.active !== false,
    );
    const totalUnits = roomTypes.reduce((sum, roomType) => sum + roomType.inventory, 0);
    const occupied = roomTypes.reduce(
      (sum, roomType) => sum + (roomType.inventory - Math.max(0, roomType.inventory - unitsCommitted(db(), roomType, day))),
      0,
    );
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(day, index - 6);
      const revenue = paid
        .filter((booking) => dateKey(new Date(booking.createdAt)) === date)
        .reduce((sum, booking) => sum + booking.price.total, 0);
      return { date, revenue };
    });
    return reply({
      hotels: hotels.map((hotel) => ({ id: hotel.id, name: hotel.name, status: hotel.status })),
      totals: {
        bookings: bookings.length,
        grossRevenue: gross,
        commission,
        netRevenue: gross - commission,
        occupancyRate: totalUnits ? Math.round((occupied / totalUnits) * 100) : 0,
        arrivalsToday: bookings.filter((booking) => booking.checkIn === day && booking.status === 'confirmed').length,
        departuresToday: bookings.filter((booking) => booking.checkOut === day && booking.status === 'checked_in').length,
        inHouse: bookings.filter((booking) => booking.status === 'checked_in').length,
        pendingConfirmations: bookings.filter((booking) => booking.status === 'pending_confirmation').length,
        pendingPayment: bookings.filter((booking) => booking.status === 'pending_payment').length,
      },
      last7Days,
      upcoming: bookings
        .filter((booking) => booking.checkIn >= day && ['confirmed', 'checked_in', 'pending_confirmation'].includes(booking.status))
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
        .slice(0, 6)
        .map(publicBooking),
    });
  });

  /* --------------------------- admin dashboard ----------------------- */

  route('GET', '/api/v1/admin/stats', (ctx) => {
    requireRole(ctx, 'admin');
    const paid = db().payments.filter((payment) => payment.status === 'paid');
    const gmv = paid.reduce((sum, payment) => sum + payment.amount, 0);
    const commission = db().bookings
      .filter((booking) => booking.paymentStatus === 'paid')
      .reduce((sum, booking) => sum + booking.price.total * (findHotel(booking.hotelId)?.commissionRate ?? 0.1), 0);
    const statusCounts = db().bookings.reduce((acc, booking) => {
      acc[booking.status] = (acc[booking.status] ?? 0) + 1;
      return acc;
    }, {});
    return reply({
      totals: {
        users: db().users.length,
        customers: db().users.filter((user) => user.role === 'customer').length,
        hotels: db().hotels.length,
        pendingHotels: db().hotels.filter((hotel) => hotel.status === 'pending').length,
        bookings: db().bookings.length,
        gmv,
        commission,
        paidTransactions: paid.length,
        refundedAmount: db().refunds
          .filter((refund) => refund.status === 'processed')
          .reduce((sum, refund) => sum + refund.amount, 0),
        pendingRefunds: db().refunds.filter((refund) => refund.status === 'pending').length,
      },
      statusCounts,
      recentBookings: [...db().bookings]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 8)
        .map((booking) => ({
          id: booking.id,
          code: booking.code,
          status: booking.status,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          total: booking.price.total,
          hotelName: findHotel(booking.hotelId)?.name ?? '',
          guestName: booking.guest?.name ?? '',
          createdAt: booking.createdAt,
        })),
      integrations: travelokaStatus(),
    });
  });

  route('GET', '/api/v1/admin/hotels', (ctx) => {
    requireRole(ctx, 'admin');
    const status = ctx.query.status;
    const items = db().hotels
      .filter((hotel) => (status ? hotel.status === status : true))
      .map((hotel) => ({
        ...hotelBase(hotel),
        ownerName: findUser(hotel.ownerId)?.name ?? null,
        ownerEmail: findUser(hotel.ownerId)?.email ?? null,
        rating: hotelRating(db(), hotel),
        roomCount: db().roomTypes.filter((roomType) => roomType.hotelId === hotel.id).length,
        bookingCount: db().bookings.filter((booking) => booking.hotelId === hotel.id).length,
      }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return reply({ items });
  });

  route('POST', '/api/v1/admin/hotels/:id/verify', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const hotel = findHotel(ctx.params.id);
    if (!hotel) throw new HttpError(404, 'Hotel tidak ditemukan.');
    const action = ctx.body?.action;
    if (!['verify', 'reject'].includes(action)) throw new HttpError(400, 'Aksi verifikasi tidak valid.');
    hotel.status = action === 'verify' ? 'verified' : 'rejected';
    hotel.verifiedAt = action === 'verify' ? nowIso() : null;
    hotel.verificationNote = String(ctx.body?.note ?? '').slice(0, 300);
    if (hotel.ownerId) {
      notify(hotel.ownerId, {
        type: action === 'verify' ? 'hotel_verified' : 'hotel_rejected',
        title: action === 'verify' ? `${hotel.name} telah diverifikasi` : `${hotel.name} belum lolos verifikasi`,
        body: action === 'verify' ? 'Properti Anda sekarang tampil di pencarian Hotel Reserve.' : hotel.verificationNote || 'Perbaiki data properti lalu kirim ulang.',
        link: '#/partner',
      });
    }
    audit(admin.id, `hotel.${action}`, hotel.id, hotel.name);
    return reply({ hotel: hotelBase(hotel) });
  });

  route('GET', '/api/v1/admin/users', (ctx) => {
    requireRole(ctx, 'admin');
    const items = db().users.map((user) => ({
      ...publicUser(user),
      bookings: db().bookings.filter((booking) => booking.userId === user.id).length,
      spend: db()
        .bookings.filter((booking) => booking.userId === user.id && booking.paymentStatus === 'paid')
        .reduce((sum, booking) => sum + booking.price.total, 0),
      hotelsOwned: db().hotels.filter((hotel) => hotel.ownerId === user.id).length,
    }));
    return reply({ items });
  });

  route('POST', '/api/v1/admin/users/:id/status', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const user = findUser(ctx.params.id);
    if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan.');
    if (user.role === 'admin') throw new HttpError(400, 'Akun admin tidak dapat dibekukan.');
    const status = ctx.body?.status;
    if (!['active', 'suspended'].includes(status)) throw new HttpError(400, 'Status tidak valid.');
    user.status = status;
    audit(admin.id, `user.${status}`, user.id, user.email);
    return reply({ user: publicUser(user) });
  });

  route('GET', '/api/v1/admin/transactions', (ctx) => {
    requireRole(ctx, 'admin');
    const status = ctx.query.status;
    const items = db().payments
      .filter((payment) => (status ? payment.status === status : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((payment) => {
        const booking = findBooking(payment.bookingId);
        const hotel = booking ? findHotel(booking.hotelId) : null;
        const user = findUser(payment.userId);
        return {
          id: payment.id,
          orderId: payment.orderId,
          bookingCode: payment.bookingCode,
          amount: payment.amount,
          status: payment.status,
          method: payment.methodLabel,
          provider: payment.provider,
          createdAt: payment.createdAt,
          paidAt: payment.paidAt,
          refundAmount: payment.refundAmount,
          guestName: user?.name ?? booking?.guest?.name ?? '',
          hotelName: hotel?.name ?? '',
          commission: hotel && booking ? booking.price.total * (hotel.commissionRate ?? 0.1) : 0,
        };
      });
    return reply({
      items,
      totals: {
        paid: items.filter((item) => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0),
        refunded: items.filter((item) => item.status === 'refunded').reduce((sum, item) => sum + (item.refundAmount || item.amount), 0),
      },
    });
  });

  route('GET', '/api/v1/admin/bookings', (ctx) => {
    requireRole(ctx, 'admin');
    const status = ctx.query.status;
    const items = db().bookings
      .filter((booking) => (status ? booking.status === status : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((booking) => ({
        id: booking.id,
        code: booking.code,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        rooms: booking.rooms,
        total: booking.price.total,
        hotelName: findHotel(booking.hotelId)?.name ?? '',
        guestName: booking.guest?.name ?? '',
        createdAt: booking.createdAt,
      }));
    return reply({ items });
  });

  route('GET', '/api/v1/admin/refunds', (ctx) => {
    requireRole(ctx, 'admin');
    const items = [...db().refunds]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((refund) => ({
        ...refund,
        hotelName: findHotel(refund.hotelId)?.name ?? '',
        guestName: findUser(refund.userId)?.name ?? '',
      }));
    return reply({ items });
  });

  route('POST', '/api/v1/admin/refunds/:id/decide', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const refund = db().refunds.find((item) => item.id === ctx.params.id);
    if (!refund) throw new HttpError(404, 'Pengajuan refund tidak ditemukan.');
    if (refund.status !== 'pending') throw new HttpError(409, 'Pengajuan refund ini sudah diputuskan.');
    const action = ctx.body?.action;
    if (!['approve', 'reject'].includes(action)) throw new HttpError(400, 'Aksi tidak valid.');
    const booking = findBooking(refund.bookingId);
    if (action === 'approve') {
      refund.status = 'approved';
      refund.decidedAt = nowIso();
      refund.decidedBy = admin.id;
      const payment = db().payments.find(
        (item) => item.bookingId === refund.bookingId && item.status === 'paid',
      );
      if (payment) {
        payment.status = 'refunded';
        payment.refundedAt = nowIso();
        payment.refundAmount = refund.amount;
      }
      if (booking) {
        booking.paymentStatus = 'refunded';
        if (!['cancelled', 'completed'].includes(booking.status)) {
          booking.status = 'cancelled';
          booking.cancellation = {
            at: nowIso(),
            reason: refund.reason,
            penalty: refund.penalty,
            refundAmount: refund.amount,
            by: admin.id,
          };
        }
      }
      notify(refund.userId, {
        type: 'refund',
        title: `Refund ${refund.bookingCode} disetujui`,
        body: `Rp${refund.amount.toLocaleString('id-ID')} dikembalikan ke metode pembayaran awal.`,
        link: '#/trips',
      });
    } else {
      refund.status = 'rejected';
      refund.decidedAt = nowIso();
      refund.decidedBy = admin.id;
      notify(refund.userId, {
        type: 'refund',
        title: `Refund ${refund.bookingCode} ditolak`,
        body: String(ctx.body?.note ?? 'Pengajuan tidak memenuhi kebijakan pembatalan.'),
        link: '#/trips',
      });
    }
    audit(admin.id, `refund.${action}`, refund.id, refund.bookingCode);
    return reply({ refund });
  });

  route('GET', '/api/v1/admin/promos', (ctx) => {
    requireRole(ctx, 'admin');
    return reply({ items: db().promos });
  });

  route('POST', '/api/v1/admin/promos', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const body = ctx.body ?? {};
    const code = String(body.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new HttpError(400, 'Kode promo 4-20 karakter (huruf/angka).');
    if (db().promos.some((promo) => promo.code === code)) throw new HttpError(409, 'Kode promo sudah digunakan.');
    if (!['percent', 'fixed'].includes(body.type)) throw new HttpError(400, 'Tipe promo harus percent atau fixed.');
    const promo = {
      id: randomUUID(),
      code,
      title: String(body.title ?? code).slice(0, 120),
      description: String(body.description ?? '').slice(0, 300),
      type: body.type,
      value: Math.max(1, Math.round(Number(body.value) || 0)),
      maxDiscount: Math.max(0, Math.round(Number(body.maxDiscount) || 0)),
      minSpend: Math.max(0, Math.round(Number(body.minSpend) || 0)),
      city: body.city ? String(body.city) : null,
      validUntil: isValidKey(body.validUntil) ? body.validUntil : addDays(today(), 30),
      usageLimit: Math.max(0, Math.round(Number(body.usageLimit) || 0)),
      usedCount: 0,
      active: body.active !== false,
    };
    db().promos.push(promo);
    audit(admin.id, 'promo.created', promo.id, code);
    return reply({ promo }, 201);
  });

  route('PATCH', '/api/v1/admin/promos/:id', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const promo = db().promos.find((item) => item.id === ctx.params.id);
    if (!promo) throw new HttpError(404, 'Promo tidak ditemukan.');
    const body = ctx.body ?? {};
    if (body.active !== undefined) promo.active = Boolean(body.active);
    if (body.validUntil && isValidKey(body.validUntil)) promo.validUntil = body.validUntil;
    if (body.title !== undefined) promo.title = String(body.title).slice(0, 120);
    if (body.description !== undefined) promo.description = String(body.description).slice(0, 300);
    if (body.usageLimit !== undefined) promo.usageLimit = Math.max(0, Math.round(Number(body.usageLimit) || 0));
    if (body.minSpend !== undefined) promo.minSpend = Math.max(0, Math.round(Number(body.minSpend) || 0));
    if (body.maxDiscount !== undefined) promo.maxDiscount = Math.max(0, Math.round(Number(body.maxDiscount) || 0));
    audit(admin.id, 'promo.updated', promo.id, promo.code);
    return reply({ promo });
  });

  route('GET', '/api/v1/admin/reviews', (ctx) => {
    requireRole(ctx, 'admin');
    const items = [...db().reviews]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100)
      .map((review) => ({
        ...reviewView(review),
        hotelName: findHotel(review.hotelId)?.name ?? '',
        reports: (db().reviewReports ?? []).filter((report) => report.reviewId === review.id).length,
      }));
    return reply({ items });
  });

  route('POST', '/api/v1/admin/reviews/:id/hide', (ctx) => {
    const admin = requireRole(ctx, 'admin');
    const review = db().reviews.find((item) => item.id === ctx.params.id);
    if (!review) throw new HttpError(404, 'Ulasan tidak ditemukan.');
    review.hidden = Boolean(ctx.body?.hidden ?? true);
    audit(admin.id, review.hidden ? 'review.hidden' : 'review.restored', review.id, review.title);
    return reply({ review: reviewView(review) });
  });

  /* --------------------------- infra routes -------------------------- */

  route('GET', '/api/v1/health', () => reply({ ok: true, time: nowIso() }));

  /* ----------------------------- pipeline ---------------------------- */

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    if (!url.pathname.startsWith('/api/')) {
      serveStatic(req, res, url.pathname);
      return;
    }
    let pathname = url.pathname.replace(/\/+$/, '') || '/';
    try {
      const swept = sweep();
      const match = matchRoute(req.method, pathname);
      if (!match) throw new HttpError(404, 'Endpoint tidak ditemukan.');
      const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)
        ? await readJson(req)
        : {};
      const ctx = {
        req,
        res,
        query: Object.fromEntries(url.searchParams),
        params: match.params,
        body,
        user: currentUser(req),
      };
      const result = await match.route.handler(ctx);
      sendJson(res, result.status ?? 200, result.body);
      if (req.method !== 'GET' || swept) store.save();
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error('[hotel-reserve]', error);
      if (!res.headersSent) {
        sendJson(res, status, {
          error: error instanceof HttpError ? error.message : 'Terjadi kesalahan pada server.',
        });
      }
    }
  });

  return { server, store, sweep };
}

const PALETTE_SETS = {
  teal: ['#083344', '#0e7490', '#67e8f9'],
  forest: ['#132e1f', '#3f7d54', '#a7f3d0'],
  plum: ['#2b1235', '#8b3a72', '#f5c2e7'],
  amber: ['#3d2412', '#a16207', '#fcd34d'],
  jade: ['#0f2e27', '#0f766e', '#99f6e4'],
  steel: ['#151f2b', '#33526e', '#bae6fd'],
  ocean: ['#062a4a', '#0369a1', '#7dd3fc'],
  sand: ['#2b2416', '#92702a', '#fde68a'],
  violet: ['#231430', '#5b21b6', '#ddd6fe'],
  slate: ['#16202b', '#475569', '#e2e8f0'],
};

export { PALETTE_SETS, PUBLIC_DIR };
