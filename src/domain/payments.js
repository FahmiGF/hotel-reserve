import { randomInt, randomUUID } from 'node:crypto';
import { paymentSignature } from './auth.js';

export const PAYMENT_METHODS = [
  { key: 'qris', label: 'QRIS', group: 'QRIS', kind: 'qris', expiryMinutes: 30 },
  { key: 'bca_va', label: 'Virtual Account BCA', group: 'Virtual Account', kind: 'va', bank: 'BCA', expiryMinutes: 60 },
  { key: 'mandiri_va', label: 'Virtual Account Mandiri', group: 'Virtual Account', kind: 'va', bank: 'Mandiri', expiryMinutes: 60 },
  { key: 'bni_va', label: 'Virtual Account BNI', group: 'Virtual Account', kind: 'va', bank: 'BNI', expiryMinutes: 60 },
  { key: 'gopay', label: 'GoPay', group: 'E-Wallet', kind: 'ewallet', expiryMinutes: 30 },
  { key: 'ovo', label: 'OVO', group: 'E-Wallet', kind: 'ewallet', expiryMinutes: 30 },
  { key: 'dana', label: 'DANA', group: 'E-Wallet', kind: 'ewallet', expiryMinutes: 30 },
  { key: 'shopeepay', label: 'ShopeePay', group: 'E-Wallet', kind: 'ewallet', expiryMinutes: 30 },
  { key: 'bank_transfer', label: 'Transfer Bank Manual', group: 'Transfer Bank', kind: 'manual', expiryMinutes: 180 },
  { key: 'card', label: 'Kartu Kredit / Debit', group: 'Kartu', kind: 'card', expiryMinutes: 30 },
  { key: 'pay_at_hotel', label: 'Bayar di Hotel', group: 'Bayar di Hotel', kind: 'on_arrival', expiryMinutes: 0 },
];

export function paymentMethod(key) {
  return PAYMENT_METHODS.find((method) => method.key === key) ?? null;
}

export function methodsForHotel(hotel) {
  return PAYMENT_METHODS.filter(
    (method) => method.key !== 'pay_at_hotel' || hotel?.policies?.payAtHotel === true,
  );
}

function digits(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += randomInt(0, 10);
  return out;
}

/** Creates the pending payment record for a booking. */
export function createPayment(booking, method, now = new Date()) {
  const expiresAt = method.expiryMinutes
    ? new Date(now.getTime() + method.expiryMinutes * 60_000).toISOString()
    : null;
  const orderId = `${booking.code}-${now.getTime().toString(36).toUpperCase()}`;
  const payment = {
    id: randomUUID(),
    orderId,
    bookingId: booking.id,
    bookingCode: booking.code,
    userId: booking.userId,
    provider: 'hotelreserve-sandbox',
    method: method.key,
    methodLabel: method.label,
    kind: method.kind,
    amount: booking.price.total,
    currency: 'IDR',
    status: 'pending',
    expiresAt,
    paidAt: null,
    failedAt: null,
    refundedAt: null,
    refundAmount: 0,
    idempotencyKey: `${booking.id}:${method.key}:${booking.price.total}`,
    createdAt: now.toISOString(),
  };

  if (method.kind === 'va') {
    payment.vaNumber = `${method.bank === 'BCA' ? '8808' : method.bank === 'Mandiri' ? '8950' : '8277'}${digits(10)}`;
    payment.instructions = [
      `Buka aplikasi ${method.bank} lalu pilih Transfer / Virtual Account.`,
      `Masukkan nomor VA ${payment.vaNumber}.`,
      `Masukkan nominal tepat Rp${payment.amount.toLocaleString('id-ID')} dan selesaikan pembayaran.`,
    ];
  } else if (method.kind === 'qris') {
    payment.qrString = `00020101021226670016ID.HOTELRESERVE.WWW0118${orderId}5204581253033605802ID5910HOTELRESERVE6007JAKARTA6304${orderId.slice(-4)}`;
    payment.instructions = [
      'Buka aplikasi e-wallet atau m-banking apa pun yang mendukung QRIS.',
      'Pindai kode QRIS pada halaman pembayaran.',
      'Periksa nominal lalu konfirmasi. Status terverifikasi otomatis lewat webhook.',
    ];
  } else if (method.kind === 'ewallet') {
    payment.deeplink = `${method.key}://pay?order=${orderId}&amount=${payment.amount}`;
    payment.instructions = [
      `Buka aplikasi ${method.label} di ponsel Anda.`,
      'Tekan tombol bayar untuk membuka tagihan, lalu konfirmasi.',
      'Kembali ke Hotel Reserve; status akan diperbarui otomatis.',
    ];
  } else if (method.kind === 'card') {
    payment.instructions = [
      'Masukkan nomor kartu pada formulir 3D Secure yang muncul.',
      'Selesaikan verifikasi OTP dari bank penerbit.',
      'Pembayaran terkonfirmasi otomatis setelah verifikasi berhasil.',
    ];
  } else if (method.kind === 'manual') {
    payment.instructions = [
      'Transfer ke rekening platform 123-456-7890 (Hotel Reserve).',
      'Cantumkan kode booking pada berita transfer.',
      'Unggah bukti / hubungi CS agar admin memverifikasi pembayaran.',
    ];
  } else if (method.kind === 'on_arrival') {
    payment.instructions = [
      'Reservasi dikirim ke hotel untuk dikonfirmasi.',
      'Pembayaran dilakukan langsung di hotel saat check-in.',
      'Bawa identitas dan kode booking Anda.',
    ];
  }

  if (method.kind === 'on_arrival') payment.status = 'on_arrival';
  return payment;
}

export function isPaymentExpired(payment, now = Date.now()) {
  if (!payment?.expiresAt) return false;
  if (payment.status !== 'pending') return false;
  return new Date(payment.expiresAt).getTime() <= now;
}

export function verifyPaymentSignature({ orderId, statusCode, grossAmount, signature, serverKey }) {
  const expected = paymentSignature({ orderId, statusCode, grossAmount, serverKey });
  return signature === expected;
}
