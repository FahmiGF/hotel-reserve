import { api, session } from '../api.js';
import { ensureSession } from '../shell.js';
import {
  art,
  copyText,
  dateLong,
  dateRange,
  dateWithDay,
  emptyState,
  esc,
  hotelHref,
  icon,
  money,
  modal,
  nightsBetween,
  pill,
  promptDialog,
  qrMock,
  relative,
  setBusy,
  toast,
  todayKey,
  addDaysKey,
  confirmDialog,
} from '../ui.js';

const PHASE_TABS = [
  ['all', 'Semua'],
  ['upcoming', 'Akan datang'],
  ['active', 'Sedang berlangsung'],
  ['past', 'Selesai'],
  ['cancelled', 'Dibatalkan'],
];

export function priceLines(price) {
  if (!price) return '';
  return `<div class="price-lines">
    <div><span>${price.nights?.length ?? 0} malam × ${price.rooms || 1} kamar</span><span>${money(price.subtotal)}</span></div>
    ${price.promoDiscount ? `<div class="discount"><span>Promo ${esc(price.promoCode || '')}</span><span>−${money(price.promoDiscount)}</span></div>` : ''}
    ${price.pointsUsed ? `<div class="discount"><span>${price.pointsUsed} poin dipakai</span><span>−${money(price.pointsValue)}</span></div>` : ''}
    <div><span>Biaya layanan (5%)</span><span>${money(price.serviceFee)}</span></div>
    <div><span>PPN 11%</span><span>${money(price.tax)}</span></div>
    <div class="total"><span>Total</span><span>${money(price.total)}</span></div>
    ${price.earnPoints ? `<div class="muted"><span>Poin yang akan diperoleh</span><span>+${price.earnPoints} poin</span></div>` : ''}
  </div>`;
}

const methodIcon = (method) => {
  if (method.kind === 'va') return icon('building', 18);
  if (method.kind === 'qris') return icon('qr', 18);
  if (method.kind === 'card') return icon('card', 18);
  if (method.kind === 'on_arrival') return icon('bed', 18);
  if (method.kind === 'manual') return icon('copy', 18);
  return icon('phone', 18);
};

function paymentMethodsHtml(methods, selected) {
  const groups = [];
  for (const method of methods) {
    const group = groups.find((item) => item.name === method.group);
    if (group) group.items.push(method);
    else groups.push({ name: method.group, items: [method] });
  }
  return groups
    .map(
      (group) => `<p class="pay-group-label">${esc(group.name)}</p>
      <div class="pay-methods">
        ${group.items
          .map(
            (method) => `<label class="pay-option${method.key === selected ? ' selected' : ''}" data-pay-option>
              <input type="radio" name="paymentMethod" value="${esc(method.key)}" ${method.key === selected ? 'checked' : ''} />
              <span style="color:var(--brand)">${methodIcon(method)}</span>
              <span class="pay-name">${esc(method.label)}</span>
              <span class="pay-kind">${method.kind === 'on_arrival' ? 'tanpa bayar sekarang' : 'instan'}</span>
            </label>`,
          )
          .join('')}
      </div>`,
    )
    .join('');
}

/* ------------------------------- checkout ------------------------------ */

function expiredPanel(message = 'Penahanan kamar sudah berakhir.') {
  return `<div class="wrap section">
    <div class="error-panel">
      <div class="empty-icon" style="margin:0 auto 12px">${icon('clock', 22)}</div>
      <h1 style="font-size:1.6rem">Sesi pemesanan berakhir</h1>
      <p class="muted mt-8">${esc(message)} Kamar yang ditahan sudah dilepas agar tamu lain bisa memesannya.</p>
      <div class="row mt-24" style="justify-content:center">
        <a class="btn btn-primary" href="#/search">Cari kamar lagi</a>
        <a class="btn btn-outline" href="#/trips">Lihat perjalanan saya</a>
      </div>
    </div>
  </div>`;
}

export async function checkoutView({ params }) {
  let data;
  try {
    data = await api(`/holds/${params.id}`);
  } catch (error) {
    return { html: expiredPanel(error.message), title: 'Pemesanan — Hotel Reserve', mount() {} };
  }

  if (data.hold.expired) {
    return { html: expiredPanel(), title: 'Pemesanan — Hotel Reserve', mount() {} };
  }

  const { hotel, roomType, hold, quote } = data;
  const user = session.user;
  const nights = quote.nights?.length ?? nightsBetween(hold.checkIn, hold.checkOut);
  const maxPoints = Math.min(
    data.availablePoints,
    Math.floor(((quote.subtotal - quote.promoDiscount) * 0.5) / 100),
  );

  const html = `
    <div class="wrap section-tight" style="padding-bottom:0">
      <div class="steps">
        <span class="step done"><b>${icon('check', 11)}</b> Pilih kamar</span>
        <span class="step-sep"></span>
        <span class="step active"><b>2</b> Data tamu &amp; pembayaran</span>
        <span class="step-sep"></span>
        <span class="step"><b>3</b> Selesai</span>
      </div>
      <a class="btn-link" href="${hotelHref(hotel.id, { checkIn: hold.checkIn, checkOut: hold.checkOut, rooms: hold.rooms, guests: hold.adults })}">${icon('back', 14)} Kembali ke ${esc(hotel.name)}</a>
      <h1 style="font-size:clamp(1.6rem,3vw,2.2rem);margin-top:10px">Lengkapi reservasi Anda</h1>
      <p class="muted small">Kamar ditahan sampai <span data-countdown data-expires="${hold.expiresAt}">15:00</span> · ${nights} malam · ${dateRange(hold.checkIn, hold.checkOut)}</p>
    </div>

    <div class="wrap checkout-layout mt-24">
      <form data-booking-form novalidate>
        <div class="checkout-block">
          <h2>Data tamu</h2>
          <p class="sub">Nama harus sama dengan identitas yang akan ditunjukkan saat check-in.</p>
          <div class="form-grid">
            <div class="field span-2"><label for="guest-name">Nama lengkap</label>
              <input class="input" id="guest-name" name="guestName" value="${esc(user?.name || '')}" autocomplete="name" required />
            </div>
            <div class="field"><label for="guest-email">Email</label>
              <input class="input" id="guest-email" name="guestEmail" type="email" value="${esc(user?.email || '')}" autocomplete="email" required />
            </div>
            <div class="field"><label for="guest-phone">Nomor HP</label>
              <input class="input" id="guest-phone" name="guestPhone" value="${esc(user?.phone || '')}" inputmode="tel" autocomplete="tel" required />
            </div>
            <div class="field span-2"><label for="requests">Permintaan khusus <span class="muted tiny">(opsional)</span></label>
              <textarea class="textarea" id="requests" name="specialRequests" placeholder="Contoh: kamar lantai atas, tempat tidur tambahan, check-in larut malam." maxlength="500"></textarea>
              <span class="help">Permintaan dipenuhi sesuai ketersediaan hotel.</span>
            </div>
          </div>
        </div>

        <div class="checkout-block">
          <h2>Promo &amp; poin</h2>
          <p class="sub">Kode promo divalidasi terhadap subtotal kamar dan masa berlaku.</p>
          <div data-promo-form class="promo-row">
            <input class="input" name="promoCode" placeholder="Kode promo (mis. HEMAT10)" value="${esc(hold.promoCode || '')}" />
            <button class="btn btn-outline" type="button" data-promo-submit>Terapkan</button>
          </div>
          <div class="row mt-8" style="gap:8px">
            ${quote.promoCode ? `<span class="chip chip-ok">${esc(quote.promoCode)} aktif −${money(quote.promoDiscount)}</span>` : '<span class="chip chip-line">Belum ada promo</span>'}
            <button class="btn-link tiny" type="button" data-toggle-points>Poin &amp; membership</button>
          </div>
          <div class="points-box mt-16" data-points-box>
            <div class="between">
              <div>
                <p class="small strong">Gunakan poin</p>
                <p class="tiny muted">Saldo ${data.availablePoints.toLocaleString('id-ID')} poin · maksimal ${maxPoints.toLocaleString('id-ID')} poin untuk reservasi ini (senilai ${money(maxPoints * 100)}).</p>
              </div>
              <label class="check"><input type="checkbox" data-points-checkbox ${quote.pointsUsed ? 'checked' : ''} ${maxPoints ? '' : 'disabled'} /> <span class="small">${quote.pointsUsed ? `${quote.pointsUsed} poin dipakai` : 'Pakai poin'}</span></label>
            </div>
          </div>
        </div>

        <div class="checkout-block">
          <h2>Metode pembayaran</h2>
          <p class="sub">Semua transaksi di prototipe ini memakai penyedia sandbox. Tidak ada uang sungguhan yang berpindah.</p>
          ${paymentMethodsHtml(data.paymentMethods, 'qris')}
          <div class="form-error hidden mt-12" data-form-error></div>
          <label class="check mt-16"><input type="checkbox" name="terms" /> Saya menyetujui kebijakan pembatalan dan ketentuan layanan Hotel Reserve.</label>
        </div>

        <div class="between">
          <a class="btn btn-soft" href="${hotelHref(hotel.id, { checkIn: hold.checkIn, checkOut: hold.checkOut, rooms: hold.rooms, guests: hold.adults })}">Ganti kamar</a>
          <button class="btn btn-primary btn-lg" type="submit" data-submit-booking>Buat reservasi · ${money(quote.total)}</button>
        </div>
      </form>

      <aside class="summary-card">
        <div class="summary-art">
          ${art(hotel.images?.[0], { className: 'art-sm' })}
          <div>
            <h3>${esc(hotel.name)}</h3>
            <p class="tiny muted">${esc(hotel.district)}, ${esc(hotel.city)}</p>
            <div class="row mt-4" style="gap:5px">${icon('star', 12)}<span class="small">${esc(roomType.name)}</span></div>
          </div>
        </div>
        <div class="summary-body">
          <div class="hold-timer" data-hold-timer>${icon('clock', 15)} <span data-countdown data-expires="${hold.expiresAt}">15:00</span> tersisa</div>
          <div>
            <div class="between small"><span class="muted">Check-in</span><strong>${dateWithDay(hold.checkIn)}</strong></div>
            <div class="between small mt-4"><span class="muted">Check-out</span><strong>${dateWithDay(hold.checkOut)}</strong></div>
            <div class="between small mt-4"><span class="muted">Tamu</span><strong>${hold.adults} dewasa · ${hold.rooms} kamar</strong></div>
            <div class="between small mt-4"><span class="muted">Sarapan</span><strong>${roomType.breakfastIncluded ? 'Termasuk' : 'Tidak termasuk'}</strong></div>
          </div>
          <div class="divider" style="margin-block:2px"></div>
          ${priceLines(quote)}
          ${roomType.freeCancellationDays ? `<p class="help">${icon('shield', 12)} Batal gratis sampai H-${roomType.freeCancellationDays} sebelum check-in.</p>` : '<p class="help">Tarif ini tidak dapat dibatalkan.</p>'}
        </div>
      </aside>
    </div>`;

  return {
    html,
    title: `Pemesanan ${hotel.name} — Hotel Reserve`,
    mount(root) {
      const bookForm = root.querySelector('[data-booking-form]');
      const errorBox = root.querySelector('[data-form-error]');
      const submit = root.querySelector('[data-submit-booking]');

      /* Countdown for the temporary hold. */
      const countdowns = [...root.querySelectorAll('[data-countdown]')];
      const timer = setInterval(() => {
        const expires = new Date(countdowns[0]?.dataset.expires || 0).getTime();
        const left = expires - Date.now();
        if (left <= 0) {
          countdowns.forEach((node) => (node.textContent = 'kedaluwarsa'));
          root.querySelector('[data-hold-timer]')?.classList.add('expired');
          submit.disabled = true;
          submit.textContent = 'Sesi berakhir';
          clearInterval(timer);
          return;
        }
        const minutes = Math.floor(left / 60_000);
        const seconds = Math.floor((left % 60_000) / 1000);
        countdowns.forEach((node) => (node.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`));
      }, 1000);
      window.addEventListener('hashchange', () => clearInterval(timer), { once: true });

      /* Promo code and points both update the hold server-side, so the total
         the guest confirms is exactly the total the booking is created with. */
      const refresh = () => window.dispatchEvent(new Event('hr:refresh'));

      const promoBox = root.querySelector('[data-promo-form]');
      const applyPromo = async () => {
        const input = promoBox.querySelector('input[name="promoCode"]');
        const button = promoBox.querySelector('[data-promo-submit]');
        setBusy(button, true, 'Memeriksa…');
        try {
          const result = await api(`/holds/${hold.id}`, {
            method: 'PATCH',
            body: { promoCode: input.value.trim() },
          });
          toast(result.quote.promoCode ? `Promo ${result.quote.promoCode} diterapkan.` : 'Kode promo dihapus.');
          refresh();
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      };
      promoBox.querySelector('[data-promo-submit]').addEventListener('click', applyPromo);
      promoBox.querySelector('input[name="promoCode"]').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyPromo();
        }
      });

      const checkbox = root.querySelector('[data-points-checkbox]');
      checkbox?.addEventListener('change', async () => {
        try {
          await api(`/holds/${hold.id}`, {
            method: 'PATCH',
            body: { pointsToUse: checkbox.checked ? data.availablePoints : 0 },
          });
          toast(checkbox.checked ? 'Poin berhasil diterapkan.' : 'Poin dilepas dari reservasi.');
          refresh();
        } catch (error) {
          toast(error.message, 'error');
          checkbox.checked = !checkbox.checked;
        }
      });

      root.querySelector('[data-toggle-points]')?.addEventListener('click', () => {
        root.querySelector('[data-points-box]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      root.querySelectorAll('[data-pay-option]').forEach((option) => {
        option.addEventListener('click', () => {
          root.querySelectorAll('[data-pay-option]').forEach((node) => node.classList.remove('selected'));
          option.classList.add('selected');
        });
      });

      bookForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorBox.classList.add('hidden');
        const dataForm = new FormData(bookForm);
        const method = dataForm.get('paymentMethod');
        if (!method) {
          errorBox.textContent = 'Pilih metode pembayaran.';
          errorBox.classList.remove('hidden');
          return;
        }
        if (!dataForm.get('terms')) {
          errorBox.textContent = 'Centang persetujuan kebijakan sebelum melanjutkan.';
          errorBox.classList.remove('hidden');
          return;
        }
        setBusy(submit, true, 'Membuat reservasi…');
        try {
          const result = await api('/bookings', {
            method: 'POST',
            body: {
              holdId: hold.id,
              guest: {
                name: String(dataForm.get('guestName')).trim(),
                email: String(dataForm.get('guestEmail')).trim(),
                phone: String(dataForm.get('guestPhone')).trim(),
              },
              specialRequests: String(dataForm.get('specialRequests') || ''),
              paymentMethod: method,
            },
          });
          if (result.booking.status === 'pending_confirmation') {
            toast('Permintaan reservasi dikirim ke hotel.');
            location.hash = `#/trips/${result.booking.id}`;
          } else {
            location.hash = `#/pay/${result.booking.id}`;
          }
        } catch (error) {
          errorBox.textContent = error.message;
          errorBox.classList.remove('hidden');
          setBusy(submit, false);
          if (error.status === 410) {
            setTimeout(() => location.reload(), 1200);
          }
        }
      });
    },
  };
}

/* ------------------------------- payment ------------------------------- */

function paymentInstructions(booking, payment) {
  const lines = (payment.instructions || []).map(
    (text, index) => `<li><b>${index + 1}</b><span>${esc(text)}</span></li>`,
  );
  let detail = '';
  if (payment.kind === 'va') {
    detail = `<div class="va-box">
      <div><span class="tiny muted">Nomor Virtual Account ${esc(payment.methodLabel)}</span><p><code>${esc(payment.vaNumber)}</code></p></div>
      <button class="btn btn-soft btn-sm" type="button" data-copy="${esc(payment.vaNumber)}">${icon('copy', 14)} Salin</button>
    </div>`;
  } else if (payment.kind === 'qris') {
    detail = `<div class="center">${qrMock(payment.qrString || payment.orderId)}<p class="tiny muted mt-8">QRIS demo · ${esc(payment.orderId)}</p></div>`;
  } else if (payment.kind === 'ewallet') {
    detail = `<div class="va-box"><div><span class="tiny muted">Tautan pembayaran ${esc(payment.methodLabel)}</span><p class="small">${esc(payment.deeplink)}</p></div>
      <button class="btn btn-soft btn-sm" type="button" data-copy="${esc(payment.deeplink)}">${icon('copy', 14)} Salin</button></div>`;
  } else if (payment.kind === 'manual') {
    detail = `<div class="va-box"><div><span class="tiny muted">Rekening tujuan (demo)</span><p><code>123-456-7890</code> · Hotel Reserve</p></div>
      <button class="btn btn-soft btn-sm" type="button" data-copy="1234567890">${icon('copy', 14)} Salin</button></div>`;
  } else if (payment.kind === 'card') {
    detail = `<div class="va-box"><div><span class="tiny muted">Kartu demo</span><p><code>4111 1111 1111 1111</code></p></div><span class="chip chip-line">3D Secure</span></div>`;
  }
  return `${detail}<ol class="instructions mt-16">${lines.join('')}</ol>`;
}

function statusPanel(booking) {
  const payment = booking.payment;
  if (booking.status === 'pending_confirmation') {
    return `<div class="pay-hero">
      <div class="success-burst" style="background:var(--warn-soft);color:var(--warn)">${icon('clock', 28)}</div>
      <h1 style="font-size:1.8rem;margin-top:14px">Menunggu konfirmasi hotel</h1>
      <p class="muted mt-8">Reservasi ${esc(booking.code)} sudah dikirim ke ${esc(booking.hotel?.name || 'hotel')}. Hotel akan mengonfirmasi maksimal 24 jam. Anda tidak perlu membayar sekarang.</p>
      <div class="row mt-24">
        <a class="btn btn-primary" href="#/trips/${booking.id}">Lihat e-voucher</a>
        <a class="btn btn-outline" href="#/trips">Perjalanan saya</a>
      </div>
    </div>`;
  }

  if (booking.paymentStatus === 'paid' || ['confirmed', 'checked_in', 'completed'].includes(booking.status)) {
    return `<div class="pay-hero">
      <div class="success-burst">${icon('check', 30)}</div>
      <h1 style="font-size:1.8rem;margin-top:14px">Pembayaran berhasil</h1>
      <p class="muted mt-8">Reservasi ${esc(booking.code)} di ${esc(booking.hotel?.name || '')} sudah terkonfirmasi. E-voucher siap ditunjukkan saat check-in.</p>
      <div class="voucher mt-24">
        <div class="voucher-top">
          <div><span class="tiny" style="opacity:.7">Kode booking</span><p class="code">${esc(booking.code)}</p></div>
          ${pill(booking.status)}
        </div>
        <div class="voucher-body">
          <div>
            <h3>${esc(booking.hotel?.name || '')}</h3>
            <p class="small muted">${esc(booking.roomType?.name || '')} · ${esc(booking.hotel?.address || '')}</p>
            <div class="stub-grid mt-16">
              <div><span class="tiny muted">Check-in</span><p class="small strong">${dateLong(booking.checkIn)}</p></div>
              <div><span class="tiny muted">Check-out</span><p class="small strong">${dateLong(booking.checkOut)}</p></div>
              <div><span class="tiny muted">Tamu</span><p class="small strong">${booking.adults} dewasa</p></div>
            </div>
          </div>
          <div class="qr-stub">${qrMock(booking.qrToken || booking.code)}<p class="tiny muted mt-4">${esc(booking.code)}</p></div>
        </div>
      </div>
      <div class="row mt-24">
        <a class="btn btn-primary" href="#/trips/${booking.id}">Buka detail perjalanan</a>
        <button class="btn btn-outline" type="button" data-print>Cetak voucher</button>
      </div>
    </div>`;
  }

  if (booking.status === 'cancelled' || booking.status === 'expired' || booking.status === 'rejected') {
    return `<div class="pay-hero">
      <div class="success-burst" style="background:var(--danger-soft);color:var(--danger)">${icon('x', 28)}</div>
      <h1 style="font-size:1.8rem;margin-top:14px">Reservasi ${pill(booking.status).replace(/<[^>]+>/g, '')}</h1>
      <p class="muted mt-8">${esc(booking.cancellation?.reason || 'Reservasi ini sudah tidak aktif.')}</p>
      <div class="row mt-24"><a class="btn btn-primary" href="#/search">Cari penginapan lain</a>
      <a class="btn btn-outline" href="#/trips">Perjalanan saya</a></div>
    </div>`;
  }

  if (payment?.status === 'failed') {
    return `<div class="pay-hero">
      <div class="success-burst" style="background:var(--danger-soft);color:var(--danger)">${icon('alert', 28)}</div>
      <h1 style="font-size:1.8rem;margin-top:14px">Pembayaran gagal</h1>
      <p class="muted mt-8">Pembayaran ${esc(payment.methodLabel)} untuk ${esc(booking.code)} tidak berhasil. Kamar masih ditahan hingga ${esc(booking.reservationExpiresAt ? relative(booking.reservationExpiresAt) : 'batas waktu')}.</p>
      <div class="row mt-24">
        <button class="btn btn-primary" type="button" data-retry>${icon('card', 15)} Coba metode lain</button>
        <a class="btn btn-outline" href="#/trips">Perjalanan saya</a>
      </div>
    </div>`;
  }

  return `<div class="pay-hero"><h1 style="font-size:1.6rem">Status reservasi</h1><p class="muted mt-8">${pill(booking.status)}</p></div>`;
}

export async function paymentView({ params }) {
  const data = await api(`/bookings/${params.id}`);
  const booking = data.booking;
  const payment = booking.payment;
  const payable = booking.status === 'pending_payment' && payment?.status === 'pending';

  const html = `
    <div class="wrap section-tight" style="padding-bottom:0">
      <div class="steps">
        <span class="step done"><b>${icon('check', 11)}</b> Pilih kamar</span><span class="step-sep"></span>
        <span class="step ${payable ? 'active' : 'done'}"><b>2</b> Pembayaran</span><span class="step-sep"></span>
        <span class="step ${payable ? '' : 'active'}"><b>3</b> E-voucher</span>
      </div>
      <div class="between">
        <div>
          <p class="eyebrow">Reservasi ${esc(booking.code)}</p>
          <h1 style="font-size:clamp(1.6rem,3vw,2.2rem);margin-top:4px">${esc(booking.hotel?.name || 'Pembayaran')}</h1>
        </div>
        <span class="chip chip-line">Mode sandbox — tanpa uang sungguhan</span>
      </div>
    </div>

    <div class="wrap ${payable ? 'pay-layout' : ''} mt-24" style="padding-bottom:64px">
      ${
        payable
          ? `<div>
              <div class="pay-hero">
                <div class="between">
                  <div>
                    <p class="tiny muted">Total yang harus dibayar</p>
                    <p class="pay-amount">${money(payment.amount)}</p>
                    <p class="small muted mt-4">${esc(payment.methodLabel)} · ${esc(payment.orderId)}</p>
                  </div>
                  <div class="right">
                    <span class="tiny muted">Selesaikan dalam</span>
                    <p class="countdown" data-countdown data-expires="${payment.expiresAt || ''}">--:--</p>
                  </div>
                </div>
                <div class="divider"></div>
                ${paymentInstructions(booking, payment)}
                <div class="panel mt-16" style="background:#fffdf6;border-style:dashed">
                  <p class="small strong">Simulasi pembayaran</p>
                  <p class="tiny muted">Karena ini prototipe, gunakan tombol di bawah untuk menandai pembayaran sebagai berhasil atau gagal — setara dengan callback webhook penyedia pembayaran.</p>
                  <div class="row mt-12">
                    <button class="btn btn-primary" type="button" data-simulate="paid">${icon('check', 15)} Simulasikan berhasil</button>
                    <button class="btn btn-danger btn-sm" type="button" data-simulate="failed">Simulasikan gagal</button>
                  </div>
                </div>
              </div>
            </div>
            <aside class="summary-card">
              <div class="summary-art">
                ${art(booking.hotel?.images?.[0], { className: 'art-sm' })}
                <div><h3>${esc(booking.hotel?.name || '')}</h3><p class="tiny muted">${esc(booking.roomType?.name || '')}</p></div>
              </div>
              <div class="summary-body">
                <div class="between small"><span class="muted">Check-in</span><strong>${dateLong(booking.checkIn)}</strong></div>
                <div class="between small"><span class="muted">Check-out</span><strong>${dateLong(booking.checkOut)}</strong></div>
                <div class="between small"><span class="muted">Tamu</span><strong>${booking.adults} dewasa · ${booking.rooms} kamar</strong></div>
                <div class="divider" style="margin-block:2px"></div>
                ${priceLines(booking.price)}
                <a class="btn btn-soft btn-block" href="#/trips/${booking.id}">Lihat detail reservasi</a>
              </div>
            </aside>`
          : statusPanel(booking)
      }
    </div>`;

  return {
    html,
    title: `Pembayaran ${booking.code} — Hotel Reserve`,
    mount(root) {
      root.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', () => copyText(button.dataset.copy));
      });
      root.querySelector('[data-print]')?.addEventListener('click', () => window.print());

      const countdowns = [...root.querySelectorAll('[data-countdown]')];
      if (countdowns.length) {
        const timer = setInterval(() => {
          const left = new Date(countdowns[0].dataset.expires || 0).getTime() - Date.now();
          if (!countdowns[0].dataset.expires) {
            countdowns.forEach((node) => (node.textContent = '—'));
            clearInterval(timer);
            return;
          }
          if (left <= 0) {
            countdowns.forEach((node) => (node.textContent = 'kedaluwarsa'));
            clearInterval(timer);
            return;
          }
          const hours = Math.floor(left / 3_600_000);
          const minutes = Math.floor((left % 3_600_000) / 60_000);
          const seconds = Math.floor((left % 60_000) / 1000);
          const text = hours > 0
            ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
            : `${minutes}:${String(seconds).padStart(2, '0')}`;
          countdowns.forEach((node) => (node.textContent = text));
        }, 1000);
        window.addEventListener('hashchange', () => clearInterval(timer), { once: true });
      }

      root.querySelectorAll('[data-simulate]').forEach((button) => {
        button.addEventListener('click', async () => {
          setBusy(button, true, 'Memproses…');
          try {
            await api(`/payments/${payment.id}/simulate`, {
              method: 'POST',
              body: { outcome: button.dataset.simulate },
            });
            toast(button.dataset.simulate === 'paid' ? 'Pembayaran berhasil dikonfirmasi.' : 'Pembayaran ditandai gagal.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
          }
        });
      });

      root.querySelector('[data-retry]')?.addEventListener('click', () => {
        const methods = [
          ['qris', 'QRIS'],
          ['bca_va', 'Virtual Account BCA'],
          ['gopay', 'GoPay'],
          ['card', 'Kartu kredit / debit'],
        ];
        const dialog = modal({
          title: 'Pilih metode pembayaran baru',
          body: `<div class="pay-methods">${methods
            .map(
              ([key, text], index) => `<label class="pay-option${index === 0 ? ' selected' : ''}">
                <input type="radio" name="retry-method" value="${key}" ${index === 0 ? 'checked' : ''} />
                <span class="pay-name">${text}</span>
              </label>`,
            )
            .join('')}</div>`,
          footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-confirm>Buat pembayaran</button>`,
        });
        dialog.card.querySelectorAll('.pay-option').forEach((option) => {
          option.addEventListener('click', () => {
            dialog.card.querySelectorAll('.pay-option').forEach((node) => node.classList.remove('selected'));
            option.classList.add('selected');
          });
        });
        dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
        dialog.card.querySelector('[data-confirm]').onclick = async (event) => {
          const method = dialog.card.querySelector('input[name="retry-method"]:checked')?.value;
          setBusy(event.target, true, 'Menyiapkan…');
          try {
            await api(`/bookings/${booking.id}/pay`, { method: 'POST', body: { method } });
            dialog.close();
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
            setBusy(event.target, false);
          }
        };
      });
    },
  };
}

/* --------------------------------- trips ------------------------------- */

function tripActions(booking) {
  const actions = [];
  if (booking.status === 'pending_payment') {
    actions.push(`<a class="btn btn-primary btn-xs" href="#/pay/${booking.id}">Bayar sekarang</a>`);
  }
  if (['confirmed', 'checked_in', 'completed'].includes(booking.status)) {
    actions.push(`<a class="btn btn-outline btn-xs" href="#/trips/${booking.id}">E-voucher</a>`);
  }
  if (booking.status === 'pending_confirmation') {
    actions.push(`<span class="chip chip-warn">Menunggu hotel</span>`);
  }
  if (booking.canReview) {
    actions.push(`<button class="btn btn-gold btn-xs" type="button" data-action="review" data-id="${booking.id}">Tulis ulasan</button>`);
  }
  if (booking.canCancel) {
    actions.push(`<button class="btn btn-soft btn-xs" type="button" data-action="cancel" data-id="${booking.id}">Batalkan</button>`);
  }
  return actions.join('');
}

function tripCard(booking) {
  return `<article class="trip-card">
    ${art(booking.hotel?.images?.[0], { className: 'art-sm' })}
    <div class="trip-main">
      <div class="row" style="gap:8px">${pill(booking.status)}<span class="trip-code">${esc(booking.code)}</span></div>
      <h3>${esc(booking.hotel?.name || '')}</h3>
      <p class="small muted">${esc(booking.roomType?.name || '')} · ${esc(booking.hotel?.city || '')}</p>
      <p class="small">${icon('calendar', 13)} ${dateRange(booking.checkIn, booking.checkOut)} · ${booking.rooms} kamar · ${booking.adults} tamu</p>
      <div class="trip-actions">${tripActions(booking)}</div>
    </div>
    <div class="trip-side">
      <span class="tiny muted">Total</span>
      <strong class="price">${money(booking.price?.total)}</strong>
      ${booking.status === 'pending_payment' ? '<span class="tiny" style="color:var(--warn)">Belum dibayar</span>' : ''}
      <a class="btn-link tiny" href="#/trips/${booking.id}">Detail reservasi</a>
    </div>
  </article>`;
}

function openReview(booking) {
  const dialog = modal({
    title: 'Tulis ulasan',
    subtitle: `${booking.hotel?.name || ''} · menginap ${dateRange(booking.checkIn, booking.checkOut)}`,
    wide: true,
    body: `<form data-review-form>
      <div class="form-grid">
        <div class="field"><label>Rating keseluruhan</label>
          <select class="select" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${'★'.repeat(n)} (${n})</option>`).join('')}</select>
        </div>
        <div class="field"><label>Kebersihan</label>
          <select class="select" name="cleanliness">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Pelayanan</label>
          <select class="select" name="service">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Lokasi</label>
          <select class="select" name="location">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="field span-2"><label>Judul ulasan</label><input class="input" name="title" maxlength="120" placeholder="Ringkas pengalaman Anda" required /></div>
        <div class="field span-2"><label>Ceritakan pengalaman Anda</label><textarea class="textarea" name="body" maxlength="2000" placeholder="Apa yang membuat menginap Anda berkesan?" required></textarea></div>
      </div>
      <div class="form-error hidden mt-12" data-review-error></div>
    </form>`,
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-submit>Kirim ulasan</button>`,
  });
  const form = dialog.card.querySelector('[data-review-form]');
  const error = dialog.card.querySelector('[data-review-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-submit]').onclick = async (event) => {
    const data = new FormData(form);
    setBusy(event.target, true, 'Mengirim…');
    try {
      await api(`/bookings/${booking.id}/review`, {
        method: 'POST',
        body: {
          rating: Number(data.get('rating')),
          cleanliness: Number(data.get('cleanliness')),
          service: Number(data.get('service')),
          location: Number(data.get('location')),
          title: String(data.get('title')).trim(),
          body: String(data.get('body')).trim(),
        },
      });
      dialog.close();
      toast('Terima kasih! Ulasan Anda sudah tayang.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

async function cancelBooking(booking) {
  const quote = booking.cancellationQuote;
  const message = quote
    ? quote.refundAmount > 0
      ? `Pembatalan gratis. Dana ${money(quote.refundAmount)} akan dikembalikan ke metode pembayaran awal.`
      : `Pembatalan dikenakan biaya ${money(quote.penalty)}. Sisa ${money(quote.refundAmount)} dikembalikan bila ada.`
    : 'Reservasi ini akan dibatalkan. Tindakan tidak dapat dibatalkan.';
  const confirmed = await confirmDialog({
    title: 'Batalkan reservasi?',
    message: `${booking.code} di ${booking.hotel?.name || 'hotel'}.\n\n${message}`,
    confirmLabel: 'Ya, batalkan',
    danger: true,
  });
  if (!confirmed) return;
  try {
    const result = await api(`/bookings/${booking.id}/cancel`, {
      method: 'POST',
      body: { reason: 'Dibatalkan oleh tamu' },
    });
    toast(
      result.refund?.refundAmount
        ? `Reservasi dibatalkan. Refund ${money(result.refund.refundAmount)} diproses.`
        : 'Reservasi dibatalkan.',
    );
    window.dispatchEvent(new Event('hr:refresh'));
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openModify(booking) {
  const dialog = modal({
    title: 'Ubah tanggal menginap',
    subtitle: `${booking.code} · ${booking.hotel?.name || ''}`,
    body: `<form data-modify-form>
      <div class="form-grid">
        <div class="field"><label>Check-in</label><input class="input" type="date" name="checkIn" min="${todayKey()}" value="${booking.checkIn}" required /></div>
        <div class="field"><label>Check-out</label><input class="input" type="date" name="checkOut" min="${addDaysKey(todayKey(), 1)}" value="${booking.checkOut}" required /></div>
        <div class="field"><label>Kamar</label><select class="select" name="rooms">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === booking.rooms ? 'selected' : ''}>${n} kamar</option>`).join('')}</select></div>
        <div class="field"><label>Tamu</label><select class="select" name="adults">${Array.from({ length: 8 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === booking.adults ? 'selected' : ''}>${n} tamu</option>`).join('')}</select></div>
      </div>
      <p class="help mt-12">Perubahan tunduk pada ketersediaan kamar. Selisih harga diselesaikan di hotel.</p>
      <div class="form-error hidden mt-12" data-modify-error></div>
    </form>`,
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-submit>Simpan perubahan</button>`,
  });
  const form = dialog.card.querySelector('[data-modify-form]');
  const error = dialog.card.querySelector('[data-modify-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-submit]').onclick = async (event) => {
    const data = new FormData(form);
    setBusy(event.target, true, 'Menyimpan…');
    try {
      const result = await api(`/bookings/${booking.id}/modify`, {
        method: 'POST',
        body: {
          checkIn: data.get('checkIn'),
          checkOut: data.get('checkOut'),
          rooms: Number(data.get('rooms')),
          adults: Number(data.get('adults')),
        },
      });
      dialog.close();
      toast(`Reservasi diperbarui. Total baru ${money(result.booking.price.total)}.`);
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

async function requestRefund(booking) {
  const reason = await promptDialog({
    title: 'Ajukan refund',
    label: 'Alasan pengajuan',
    placeholder: 'Contoh: perubahan rencana perjalanan',
    confirmLabel: 'Kirim pengajuan',
    multiline: true,
  });
  if (!reason) return;
  try {
    const result = await api(`/bookings/${booking.id}/refund`, { method: 'POST', body: { reason } });
    toast(`Pengajuan refund ${money(result.refund.amount)} dikirim ke admin.`);
    window.dispatchEvent(new Event('hr:refresh'));
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function handleBookingAction(event, booking) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const button = event.target.closest('[data-action]');
  if (action === 'cancel') {
    setBusy(button, true, '…');
    await cancelBooking(booking);
    setBusy(button, false);
  } else if (action === 'review') {
    openReview(booking);
  } else if (action === 'modify') {
    openModify(booking);
  } else if (action === 'refund') {
    await requestRefund(booking);
  } else if (action === 'print') {
    window.print();
  }
}

export async function tripsView({ query }) {
  if (!session.user) {
    return {
      html: `<div class="wrap section">${emptyState(
        'ticket',
        'Masuk untuk melihat perjalanan',
        'Semua reservasi, e-voucher, dan riwayat menginap tersimpan di akun Anda.',
        '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk ke akun</button>',
      )}</div>`,
      title: 'Perjalanan saya — Hotel Reserve',
      mount(root) {
        root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
          if (await ensureSession('Masuk untuk melihat perjalanan Anda.')) window.dispatchEvent(new Event('hr:refresh'));
        });
      },
    };
  }

  const phase = PHASE_TABS.some(([key]) => key === query.phase) ? query.phase : 'all';
  const data = await api(`/bookings${phase !== 'all' ? `?phase=${phase}` : ''}`);
  const byId = new Map(data.items.map((item) => [item.id, item]));

  const html = `<div class="wrap section-tight trips-layout">
    <div class="section-head">
      <div><p class="eyebrow">Akun saya</p><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">Perjalanan saya</h1>
      <p class="muted small">Kelola reservasi, e-voucher, pembatalan, dan ulasan dalam satu tempat.</p></div>
      <a class="btn btn-outline btn-sm" href="#/search">Pesan menginap baru</a>
    </div>
    <div class="tabs" role="tablist">
      ${PHASE_TABS.map(([key, text]) => `<a class="tab${phase === key ? ' active' : ''}" href="#/trips${key === 'all' ? '' : `?phase=${key}`}" role="tab">${text}${key !== 'all' && data.counts[key] ? `<span class="count">${data.counts[key]}</span>` : ''}</a>`).join('')}
    </div>
    ${
      data.items.length
        ? data.items.map(tripCard).join('')
        : emptyState('ticket', 'Belum ada perjalanan', 'Saatnya merencanakan menginap berikutnya. Cari hotel dan mulai dari kamar terbaik.', '<a class="btn btn-primary btn-sm" href="#/search">Jelajahi hotel</a>')
    }
  </div>`;

  return {
    html,
    title: 'Perjalanan saya — Hotel Reserve',
    mount(root) {
      root.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-action]');
        if (!action) return;
        const booking = byId.get(action.dataset.id);
        if (!booking) return;
        event.preventDefault();
        await handleBookingAction(event, booking);
      });
      root.querySelectorAll('[data-action]').forEach((button) => {
        if (button.tagName === 'A') button.setAttribute('href', button.getAttribute('href') || '#');
      });
    },
  };
}

/* ----------------------------- trip detail ----------------------------- */

function timeline(booking) {
  const steps = [
    ['Reservasi dibuat', booking.createdAt, 'Reservasi diterima sistem', true],
  ];
  if (booking.paymentStatus === 'paid' && booking.payment?.paidAt) {
    steps.push(['Pembayaran diterima', booking.payment.paidAt, booking.payment.methodLabel, true]);
  } else if (booking.paymentStatus === 'on_arrival') {
    steps.push(['Bayar di hotel', null, 'Dibayar saat check-in', false]);
  } else if (booking.status === 'pending_payment') {
    steps.push(['Menunggu pembayaran', null, 'Selesaikan pembayaran untuk mengunci harga', false]);
  }
  if (['confirmed', 'checked_in', 'completed'].includes(booking.status)) {
    steps.push(['Dikonfirmasi hotel', null, 'E-voucher aktif', true]);
  } else if (booking.status === 'pending_confirmation') {
    steps.push(['Menunggu konfirmasi hotel', null, 'Maksimal 24 jam', false]);
  }
  steps.push(['Check-in', booking.checkedInAt, booking.roomNumber ? `Kamar ${booking.roomNumber}` : 'Tunjukkan e-voucher', Boolean(booking.checkedInAt)]);
  steps.push(['Check-out', booking.checkedOutAt, booking.checkedOutAt ? `${booking.price?.earnPoints || 0} poin diperoleh` : 'Selesai sesuai jadwal', Boolean(booking.checkedOutAt)]);
  if (booking.status === 'cancelled' || booking.status === 'rejected') {
    steps.push(['Dibatalkan', booking.cancellation?.at, booking.cancellation?.reason || 'Reservasi tidak aktif', true]);
  }
  return `<ul class="timeline">${steps
    .map(
      ([title, at, note, done]) => `<li class="${done ? 'done' : ''}">
        <strong>${esc(title)}</strong>
        <span>${esc(note)}${at ? ` · ${relative(at)}` : ''}</span>
      </li>`,
    )
    .join('')}</ul>`;
}

export async function tripDetailView({ params }) {
  if (!session.user) {
    return {
      html: `<div class="wrap section">${emptyState('ticket', 'Masuk untuk membuka reservasi', 'E-voucher dan detail pembayaran hanya tersedia untuk pemilik akun.', '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk</button>')}</div>`,
      title: 'Detail reservasi — Hotel Reserve',
      mount(root) {
        root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
          if (await ensureSession('Masuk untuk membuka reservasi ini.')) window.dispatchEvent(new Event('hr:refresh'));
        });
      },
    };
  }

  const data = await api(`/bookings/${params.id}`);
  const booking = data.booking;
  const showVoucher = ['confirmed', 'checked_in', 'completed'].includes(booking.status);

  const html = `<div class="wrap section-tight" style="padding-bottom:64px">
    <a class="btn-link" href="#/trips">${icon('back', 14)} Semua perjalanan</a>
    <div class="between mt-12">
      <div>
        <div class="row" style="gap:8px">${pill(booking.status)}<span class="trip-code">${esc(booking.code)}</span></div>
        <h1 style="font-size:clamp(1.7rem,3vw,2.3rem);margin-top:6px">${esc(booking.hotel?.name || '')}</h1>
        <p class="muted small">${esc(booking.roomType?.name || '')} · ${dateRange(booking.checkIn, booking.checkOut)} · ${booking.rooms} kamar</p>
      </div>
      <div class="row no-print">
        ${booking.canReview ? `<button class="btn btn-gold btn-sm" type="button" data-action="review" data-id="${booking.id}">Tulis ulasan</button>` : ''}
        ${booking.canCancel ? `<button class="btn btn-soft btn-sm" type="button" data-action="cancel" data-id="${booking.id}">Batalkan</button>` : ''}
        ${booking.paymentStatus === 'paid' ? `<button class="btn btn-soft btn-sm" type="button" data-action="refund" data-id="${booking.id}">Ajukan refund</button>` : ''}
      </div>
    </div>

    <div class="dash-grid mt-24">
      <div>
        ${
          showVoucher
            ? `<div class="voucher">
                <div class="voucher-top">
                  <div>
                    <span class="tiny" style="opacity:.75">E-voucher Hotel Reserve</span>
                    <p class="code">${esc(booking.code)}</p>
                    <p class="small" style="opacity:.85">${esc(booking.guest?.name || '')} · ${booking.adults} dewasa${booking.children ? `, ${booking.children} anak` : ''}</p>
                  </div>
                  <div class="right">${pill(booking.status)}<p class="tiny mt-4" style="opacity:.75">${booking.roomNumber ? `Kamar ${esc(booking.roomNumber)}` : 'Tunjukkan saat check-in'}</p></div>
                </div>
                <div class="voucher-body">
                  <div>
                    <div class="stub-grid">
                      <div><span class="tiny muted">Check-in</span><p class="small strong">${dateLong(booking.checkIn)}</p></div>
                      <div><span class="tiny muted">Check-out</span><p class="small strong">${dateLong(booking.checkOut)}</p></div>
                      <div><span class="tiny muted">Durasi</span><p class="small strong">${booking.price?.nights?.length || nightsBetween(booking.checkIn, booking.checkOut)} malam</p></div>
                    </div>
                    <div class="divider"></div>
                    <p class="small"><strong>${esc(booking.hotel?.name || '')}</strong></p>
                    <p class="small muted">${esc(booking.hotel?.address || '')}</p>
                    <p class="tiny muted mt-8">${esc(booking.specialRequests || 'Tanpa permintaan khusus.')}</p>
                    <div class="row mt-16 no-print">
                      <button class="btn btn-soft btn-sm" type="button" data-copy="${esc(booking.code)}">${icon('copy', 14)} Salin kode</button>
                      <button class="btn btn-outline btn-sm" type="button" data-action="print">${icon('ticket', 14)} Cetak</button>
                    </div>
                  </div>
                  <div class="qr-stub">${qrMock(booking.qrToken || booking.code)}<p class="tiny muted mt-4">Tunjukkan QR ini di resepsionis</p></div>
                </div>
              </div>`
            : `<div class="panel">
                <div class="row">${pill(booking.status)}<strong>${esc(booking.hotel?.name || '')}</strong></div>
                <p class="prose mt-12">${
                  booking.status === 'pending_payment'
                    ? 'Selesaikan pembayaran untuk menerima e-voucher. Kamar Anda masih ditahan sampai batas waktu pembayaran.'
                    : booking.status === 'pending_confirmation'
                      ? 'Hotel sedang meninjau permintaan Anda. E-voucher akan aktif setelah hotel mengonfirmasi (maksimal 24 jam).'
                      : esc(booking.cancellation?.reason || 'Reservasi ini tidak memiliki voucher aktif.')
                }</p>
                ${booking.status === 'pending_payment' ? `<a class="btn btn-primary btn-sm mt-16" href="#/pay/${booking.id}">Bayar sekarang</a>` : ''}
              </div>`
        }

        <div class="panel mt-16">
          <div class="panel-head"><h3>Rincian harga</h3><span class="muted small">${esc(booking.payment?.methodLabel || booking.paymentMethod || '')}</span></div>
          ${priceLines(booking.price)}
        </div>

        <div class="panel mt-16">
          <div class="panel-head"><h3>Data tamu</h3></div>
          <div class="stub-grid">
            <div><span class="tiny muted">Nama</span><p class="small strong">${esc(booking.guest?.name || '')}</p></div>
            <div><span class="tiny muted">Email</span><p class="small">${esc(booking.guest?.email || '')}</p></div>
            <div><span class="tiny muted">Telepon</span><p class="small">${esc(booking.guest?.phone || '')}</p></div>
          </div>
          ${booking.modification ? `<p class="help mt-12">Diubah ${relative(booking.modification.at)} · semula ${dateRange(booking.modification.previousCheckIn, booking.modification.previousCheckOut)} · selisih ${money(booking.modification.difference)} (${booking.modification.settlement === 'charge_at_hotel' ? 'dibayar di hotel' : 'refund di hotel'})</p>` : ''}
          ${booking.cancellation ? `<div class="form-error mt-12">Dibatalkan ${relative(booking.cancellation.at)} — ${esc(booking.cancellation.reason)}</div>` : ''}
        </div>

        ${
          booking.payment
            ? `<div class="panel mt-16">
                <div class="panel-head"><h3>Pembayaran</h3>${pill(booking.payment.status)}</div>
                <div class="stub-grid">
                  <div><span class="tiny muted">Metode</span><p class="small strong">${esc(booking.payment.methodLabel)}</p></div>
                  <div><span class="tiny muted">Order ID</span><p class="tiny">${esc(booking.payment.orderId)}</p></div>
                  <div><span class="tiny muted">Jumlah</span><p class="small strong">${money(booking.payment.amount)}</p></div>
                  <div><span class="tiny muted">Dibayar</span><p class="small">${booking.payment.paidAt ? relative(booking.payment.paidAt) : 'Belum'}</p></div>
                </div>
              </div>`
            : ''
        }
      </div>

      <aside class="stack" style="gap:16px">
        <div class="panel">
          <div class="panel-head"><h3>Perjalanan reservasi</h3></div>
          ${timeline(booking)}
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Butuh bantuan?</h3></div>
          <p class="small muted">Hubungi hotel untuk kebutuhan khusus setelah reservasi dikonfirmasi.</p>
          <div class="va-box mt-12" style="padding:10px 12px">
            <div><span class="tiny muted">Resepsionis</span><p class="small strong">+62 21 5000 1234</p></div>
            ${icon('phone', 16)}
          </div>
          ${booking.canCancel ? `<button class="btn btn-soft btn-block mt-12 no-print" type="button" data-action="modify" data-id="${booking.id}">Ubah tanggal</button>` : ''}
          <a class="btn btn-outline btn-block mt-8 no-print" href="#/trips">Kembali ke daftar</a>
        </div>
      </aside>
    </div>
  </div>`;

  return {
    html,
    title: `${booking.code} — Hotel Reserve`,
    mount(root) {
      root.querySelectorAll('[data-copy]').forEach((button) => {
        button.addEventListener('click', () => copyText(button.dataset.copy));
      });
      root.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-action]');
        if (!action) return;
        event.preventDefault();
        await handleBookingAction(event, booking);
      });
    },
  };
}
