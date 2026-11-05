import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { addDays, dateKey } from '../src/domain/dates.js';
import { paymentSignature } from '../src/domain/auth.js';

const SERVER_KEY = 'test-payment-key';

async function startApp() {
  const app = createApp({ file: null, secret: 'test-secret', paymentServerKey: SERVER_KEY });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    ...app,
    base,
    close: () => new Promise((resolve) => app.server.close(resolve)),
  };
}

async function request(base, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

async function login(base, email, password = 'password123') {
  const response = await request(base, '/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  return response.json;
}

function guest() {
  return { name: 'Demo Guest', email: 'demo@hotelreserve.id', phone: '081100000004' };
}

test('booking requires authentication', async () => {
  const app = await startApp();
  try {
    const response = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      body: { roomTypeId: 'anything', checkIn: addDays(dateKey(), 10), checkOut: addDays(dateKey(), 12) },
    });
    assert.equal(response.status, 401);
  } finally {
    await app.close();
  }
});

test('full lifecycle: hold, book, pay, check-in, check-out, earn points', async () => {
  const app = await startApp();
  try {
    const { token } = await login(app.base, 'demo@hotelreserve.id');
    const partner = await login(app.base, 'partner@hotelreserve.id');
    const hotel = app.store.data.hotels.find((item) => item.name === 'Ubud Cliff Retreat');
    const room = app.store.data.roomTypes.find((item) => item.hotelId === hotel.id);
    const checkIn = addDays(dateKey(), 30);
    const checkOut = addDays(checkIn, 2);

    const hold = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      token,
      body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1, adults: 2, children: 0 },
    });
    assert.equal(hold.status, 201, JSON.stringify(hold.json));
    assert.ok(hold.json.quote.total > 0);
    assert.ok(hold.json.quote.tax > 0);
    assert.equal(hold.json.quote.nights.length, 2);

    const booking = await request(app.base, '/api/v1/bookings', {
      method: 'POST',
      token,
      body: {
        holdId: hold.json.hold.id,
        guest: guest(),
        paymentMethod: 'qris',
        specialRequests: 'Kamar lantai atas',
      },
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.json));
    assert.equal(booking.json.booking.status, 'pending_payment');
    assert.match(booking.json.booking.code, /^HR-[A-Z0-9]{6}$/);
    const bookingId = booking.json.booking.id;

    const pay = await request(app.base, `/api/v1/payments/${booking.json.payment.id}/simulate`, {
      method: 'POST',
      token,
      body: { outcome: 'paid' },
    });
    assert.equal(pay.status, 200, JSON.stringify(pay.json));
    assert.equal(pay.json.booking.status, 'confirmed');
    assert.equal(pay.json.booking.paymentStatus, 'paid');

    const replay = await request(app.base, `/api/v1/payments/${booking.json.payment.id}/simulate`, {
      method: 'POST',
      token,
      body: { outcome: 'paid' },
    });
    assert.equal(replay.json.alreadyPaid, true);

    const checkin = await request(app.base, `/api/v1/partner/bookings/${bookingId}/checkin`, {
      method: 'POST',
      token: partner.token,
      body: { roomNumber: 'V-12' },
    });
    assert.equal(checkin.status, 200, JSON.stringify(checkin.json));
    assert.equal(checkin.json.booking.status, 'checked_in');
    assert.equal(checkin.json.booking.roomNumber, 'V-12');

    const before = app.store.data.users.find((user) => user.email === 'demo@hotelreserve.id').points;
    const checkout = await request(app.base, `/api/v1/partner/bookings/${bookingId}/checkout`, {
      method: 'POST',
      token: partner.token,
    });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.json));
    assert.equal(checkout.json.booking.status, 'completed');
    assert.ok(checkout.json.pointsEarned > 0);
    const after = app.store.data.users.find((user) => user.email === 'demo@hotelreserve.id').points;
    assert.equal(after, before + checkout.json.pointsEarned);
  } finally {
    await app.close();
  }
});

test('only one guest can win the last remaining room', async () => {
  const app = await startApp();
  try {
    const { token } = await login(app.base, 'demo@hotelreserve.id');
    const hotel = app.store.data.hotels.find((item) => item.name === 'Labuan Bajo Bay Hostel');
    const room = app.store.data.roomTypes.find(
      (item) => item.hotelId === hotel.id && item.name === 'Private Twin',
    );
    room.inventory = 1;
    room.blocks = [];
    app.store.data.bookings = app.store.data.bookings.filter(
      (booking) => booking.roomTypeId !== room.id,
    );
    app.store.data.holds = [];

    const checkIn = addDays(dateKey(), 40);
    const checkOut = addDays(checkIn, 1);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app.base, '/api/v1/holds', {
          method: 'POST',
          token,
          body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1, adults: 1 },
        }),
      ),
    );
    const winners = attempts.filter((attempt) => attempt.status === 201);
    const conflicts = attempts.filter((attempt) => attempt.status === 409);
    assert.equal(winners.length, 1);
    assert.equal(conflicts.length, 7);
    assert.equal(app.store.data.holds.length, 1);
  } finally {
    await app.close();
  }
});

test('cancelling a paid booking releases inventory and creates a refund', async () => {
  const app = await startApp();
  try {
    const { token } = await login(app.base, 'demo@hotelreserve.id');
    const hotel = app.store.data.hotels.find((item) => item.name === 'Lombok Beachfront Villas');
    const room = app.store.data.roomTypes.find((item) => item.hotelId === hotel.id);
    room.inventory = 1;
    app.store.data.bookings = app.store.data.bookings.filter(
      (booking) => booking.roomTypeId !== room.id,
    );
    app.store.data.holds = [];
    const checkIn = addDays(dateKey(), 45);
    const checkOut = addDays(checkIn, 2);

    const hold = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      token,
      body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1 },
    });
    assert.equal(hold.status, 201, JSON.stringify(hold.json));

    const booking = await request(app.base, '/api/v1/bookings', {
      method: 'POST',
      token,
      body: { holdId: hold.json.hold.id, guest: guest(), paymentMethod: 'bca_va' },
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.json));

    await request(app.base, `/api/v1/payments/${booking.json.payment.id}/simulate`, {
      method: 'POST',
      token,
      body: { outcome: 'paid' },
    });

    const blocked = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      token,
      body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1 },
    });
    assert.equal(blocked.status, 409);

    const cancelled = await request(app.base, `/api/v1/bookings/${booking.json.booking.id}/cancel`, {
      method: 'POST',
      token,
      body: { reason: 'Rencana berubah' },
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.json));
    assert.equal(cancelled.json.booking.status, 'cancelled');
    assert.equal(cancelled.json.booking.paymentStatus, 'refunded');
    assert.equal(cancelled.json.refund.refundAmount > 0, true);
    assert.ok(app.store.data.refunds.some((refund) => refund.status === 'processed'));

    const retry = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      token,
      body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1 },
    });
    assert.equal(retry.status, 201, 'inventory must be released after cancellation');
  } finally {
    await app.close();
  }
});

test('payment webhook verifies the signature and is idempotent', async () => {
  const app = await startApp();
  try {
    const { token } = await login(app.base, 'demo@hotelreserve.id');
    const hotel = app.store.data.hotels.find((item) => item.name === 'Bandung Highland Lodge');
    const room = app.store.data.roomTypes.find((item) => item.hotelId === hotel.id);
    const checkIn = addDays(dateKey(), 20);
    const checkOut = addDays(checkIn, 2);

    const hold = await request(app.base, '/api/v1/holds', {
      method: 'POST',
      token,
      body: { roomTypeId: room.id, checkIn, checkOut, rooms: 1 },
    });
    const booking = await request(app.base, '/api/v1/bookings', {
      method: 'POST',
      token,
      body: { holdId: hold.json.hold.id, guest: guest(), paymentMethod: 'bca_va' },
    });
    const payment = booking.json.payment;

    const bad = await request(app.base, '/api/v1/payments/webhook', {
      method: 'POST',
      body: {
        order_id: payment.orderId,
        status_code: '200',
        gross_amount: payment.amount,
        transaction_status: 'settlement',
        signature: 'deadbeef',
      },
    });
    assert.equal(bad.status, 401);

    const signature = paymentSignature({
      orderId: payment.orderId,
      statusCode: '200',
      grossAmount: payment.amount,
      serverKey: SERVER_KEY,
    });
    const hook = await request(app.base, '/api/v1/payments/webhook', {
      method: 'POST',
      body: {
        order_id: payment.orderId,
        status_code: '200',
        gross_amount: payment.amount,
        transaction_status: 'settlement',
        signature,
      },
    });
    assert.equal(hook.status, 200, JSON.stringify(hook.json));

    const replay = await request(app.base, '/api/v1/payments/webhook', {
      method: 'POST',
      body: {
        order_id: payment.orderId,
        status_code: '200',
        gross_amount: payment.amount,
        transaction_status: 'settlement',
        signature,
      },
    });
    assert.equal(replay.json.idempotent, true);

    const detail = await request(app.base, `/api/v1/bookings/${booking.json.booking.id}`, { token });
    assert.equal(detail.json.booking.status, 'confirmed');
  } finally {
    await app.close();
  }
});

test('a completed stay can be reviewed exactly once', async () => {
  const app = await startApp();
  try {
    const { token } = await login(app.base, 'demo@hotelreserve.id');
    const list = await request(app.base, '/api/v1/bookings', { token });
    const completed = list.json.items.find((item) => item.canReview);
    assert.ok(completed, 'seed should contain a reviewable completed booking');

    const review = await request(app.base, `/api/v1/bookings/${completed.id}/review`, {
      method: 'POST',
      token,
      body: { rating: 5, cleanliness: 5, service: 4, location: 5, title: 'Menginap yang menyenangkan', body: 'Staf ramah dan kamar bersih. Sarapan juga enak.' },
    });
    assert.equal(review.status, 201, JSON.stringify(review.json));
    assert.equal(review.json.review.verifiedStay, true);

    const duplicate = await request(app.base, `/api/v1/bookings/${completed.id}/review`, {
      method: 'POST',
      token,
      body: { rating: 4, title: 'Ulang', body: 'Mencoba mengirim ulasan kedua kali.' },
    });
    assert.equal(duplicate.status, 409);
  } finally {
    await app.close();
  }
});

test('partner accepts a pay-at-hotel request and admin verifies a new hotel', async () => {
  const app = await startApp();
  try {
    const partner = await login(app.base, 'partner@hotelreserve.id');
    const pending = app.store.data.bookings.find(
      (booking) => booking.status === 'pending_confirmation',
    );
    assert.ok(pending);
    const accept = await request(app.base, `/api/v1/partner/bookings/${pending.id}/accept`, {
      method: 'POST',
      token: partner.token,
    });
    assert.equal(accept.status, 200, JSON.stringify(accept.json));
    assert.equal(accept.json.booking.status, 'confirmed');

    const created = await request(app.base, '/api/v1/partner/hotels', {
      method: 'POST',
      token: partner.token,
      body: {
        name: 'Hotel Uji Coba Nusantara',
        city: 'Makassar',
        district: 'Panakkukang',
        address: 'Jl. Pengujian No. 1, Makassar',
        stars: 4,
        propertyType: 'hotel',
        facilities: ['Wi-Fi Gratis', 'Kolam Renang'],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    assert.equal(created.json.hotel.status, 'pending');

    const admin = await login(app.base, 'admin@hotelreserve.id');
    const verify = await request(app.base, `/api/v1/admin/hotels/${created.json.hotel.id}/verify`, {
      method: 'POST',
      token: admin.token,
      body: { action: 'verify' },
    });
    assert.equal(verify.status, 200, JSON.stringify(verify.json));
    assert.equal(verify.json.hotel.status, 'verified');

    const search = await request(app.base, '/api/v1/hotels?q=Makassar');
    assert.equal(search.json.total, 0, 'a hotel without room types has no bookable price');
  } finally {
    await app.close();
  }
});
