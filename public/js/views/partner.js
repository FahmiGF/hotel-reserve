import { api, getMeta, session } from '../api.js';
import { ensureSession, refreshShell } from '../shell.js';
import {
  addDaysKey,
  art,
  compactMoney,
  dateLong,
  dateRange,
  emptyState,
  esc,
  icon,
  money,
  modal,
  pill,
  promptDialog,
  relative,
  setBusy,
  stars,
  toast,
  todayKey,
  values,
} from '../ui.js';

const TABS = [
  ['ringkasan', 'Ringkasan'],
  ['reservasi', 'Reservasi'],
  ['kalender', 'Kalender'],
  ['kamar', 'Kamar & tarif'],
  ['ulasan', 'Ulasan'],
  ['properti', 'Properti'],
];

const BOOKING_STATUS = [
  ['', 'Semua status'],
  ['pending_payment', 'Menunggu pembayaran'],
  ['pending_confirmation', 'Menunggu konfirmasi'],
  ['confirmed', 'Terkonfirmasi'],
  ['checked_in', 'Sedang menginap'],
  ['completed', 'Selesai'],
  ['cancelled', 'Dibatalkan'],
  ['rejected', 'Ditolak'],
];

const propertyLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

function gate(title, text) {
  return {
    html: `<div class="wrap section">${emptyState('building', title, text, '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk</button>')}</div>`,
    title: `${title} — Hotel Reserve`,
    mount(root) {
      root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
        if (await ensureSession('Masuk sebagai mitra atau staf hotel.')) window.dispatchEvent(new Event('hr:refresh'));
      });
    },
  };
}

function tabHref(tab, hotelId, extra = {}) {
  const params = new URLSearchParams({ tab, hotelId, ...extra });
  return `#/partner?${params}`;
}

function bookingActions(booking) {
  const role = session.user?.role;
  const buttons = [];
  if (booking.status === 'pending_confirmation' && role !== 'staff') {
    buttons.push(`<button class="btn btn-primary btn-xs" type="button" data-booking-action="accept" data-id="${booking.id}">Terima</button>`);
    buttons.push(`<button class="btn btn-soft btn-xs" type="button" data-booking-action="reject" data-id="${booking.id}">Tolak</button>`);
  }
  if (booking.status === 'confirmed') {
    buttons.push(`<button class="btn btn-primary btn-xs" type="button" data-booking-action="checkin" data-id="${booking.id}">Check-in</button>`);
    if (!booking.roomNumber) {
      buttons.push(`<button class="btn btn-soft btn-xs" type="button" data-booking-action="assign" data-id="${booking.id}">Kamar</button>`);
    }
  }
  if (booking.status === 'checked_in') {
    buttons.push(`<button class="btn btn-primary btn-xs" type="button" data-booking-action="checkout" data-id="${booking.id}">Check-out</button>`);
  }
  if (['pending_payment', 'pending_confirmation', 'confirmed'].includes(booking.status) && role !== 'staff') {
    buttons.push(`<button class="btn btn-danger btn-xs" type="button" data-booking-action="cancel" data-id="${booking.id}">Batalkan</button>`);
  }
  return buttons.join('');
}

function bookingsTable(items) {
  if (!items.length) return emptyState('ticket', 'Belum ada reservasi', 'Reservasi baru akan muncul di sini secara otomatis.');
  return `<div class="table-wrap"><table class="data">
    <thead><tr><th>Kode</th><th>Tamu</th><th>Kamar &amp; tanggal</th><th>Status</th><th class="right">Total</th><th>Aksi</th></tr></thead>
    <tbody>
      ${items
        .map(
          (booking) => `<tr>
            <td><strong>${esc(booking.code)}</strong><br /><span class="tiny muted">${relative(booking.createdAt)}</span></td>
            <td>${esc(booking.guest?.name || '')}<br /><span class="tiny muted">${esc(booking.guest?.phone || '')}</span></td>
            <td>${esc(booking.roomType?.name || '')}<br /><span class="tiny muted">${dateRange(booking.checkIn, booking.checkOut)} · ${booking.rooms} kamar</span></td>
            <td>${pill(booking.status)}<br /><span class="tiny muted">${esc(booking.payment?.methodLabel || '')}</span></td>
            <td class="right nowrap">${money(booking.price?.total)}</td>
            <td><div class="actions">${bookingActions(booking)}</div></td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table></div>`;
}

export async function partnerView({ query }) {
  if (!session.user) return gate('Dashboard mitra', 'Masuk dengan akun mitra atau staf hotel untuk mengelola properti.');
  if (!['partner', 'staff', 'admin'].includes(session.user.role)) {
    return {
      html: `<div class="wrap section">${emptyState('lock', 'Akses mitra diperlukan', 'Akun ini adalah akun tamu. Masuk dengan akun demo mitra (partner@hotelreserve.id) untuk membuka dashboard hotel.', '<a class="btn btn-primary btn-sm" href="#/search">Kembali jelajahi hotel</a>')}</div>`,
      title: 'Dashboard mitra — Hotel Reserve',
      mount() {},
    };
  }

  const meta = await getMeta();
  const hotelsData = await api('/partner/hotels');
  const hotels = hotelsData.hotels;
  if (!hotels.length) {
    return {
      html: `<div class="wrap section">${emptyState('building', 'Belum ada properti', 'Hubungi admin platform untuk mendaftarkan properti pertama Anda.')}</div>`,
      title: 'Dashboard mitra — Hotel Reserve',
      mount() {},
    };
  }

  const isStaff = session.user.role === 'staff';
  const tab = TABS.some(([key]) => key === query.tab) ? query.tab : 'ringkasan';
  const hotelId = hotels.some((hotel) => hotel.id === query.hotelId) ? query.hotelId : hotels[0].id;
  const hotel = hotels.find((item) => item.id === hotelId);
  const bookingsById = new Map();

  let content = '';
  let title = 'Dashboard mitra';

  if (tab === 'ringkasan') {
    const stats = await api('/partner/stats');
    stats.upcoming.forEach((booking) => bookingsById.set(booking.id, booking));
    const totals = stats.totals;
    const maxRevenue = Math.max(...stats.last7Days.map((day) => day.revenue), 1);

    content = `
      <div class="kpi-grid">
        <div class="kpi accent"><span class="kpi-label">Pendapatan bersih</span><p class="kpi-value">${compactMoney(totals.netRevenue)}</p><span class="kpi-note">setelah komisi ${compactMoney(totals.commission)}</span></div>
        <div class="kpi"><span class="kpi-label">Total reservasi</span><p class="kpi-value">${totals.bookings}</p><span class="kpi-note">${totals.inHouse} tamu sedang menginap</span></div>
        <div class="kpi"><span class="kpi-label">Okupansi hari ini</span><p class="kpi-value">${totals.occupancyRate}%</p><span class="kpi-note">${totals.arrivalsToday} kedatangan · ${totals.departuresToday} keberangkatan</span></div>
        <div class="kpi"><span class="kpi-label">Butuh perhatian</span><p class="kpi-value">${totals.pendingConfirmations + totals.pendingPayment}</p><span class="kpi-note">${totals.pendingConfirmations} konfirmasi · ${totals.pendingPayment} pembayaran</span></div>
      </div>

      <div class="dash-grid mt-16">
        <div class="panel">
          <div class="panel-head"><div><h3>Pendapatan 7 hari terakhir</h3><p class="tiny muted">Berdasarkan transaksi lunas</p></div><span class="chip chip-brand">${money(stats.last7Days.reduce((sum, day) => sum + day.revenue, 0))}</span></div>
          <div class="bars">
            ${stats.last7Days
              .map(
                (day) => `<div class="bar-col" title="${dateLong(day.date)}: ${money(day.revenue)}">
                  <div class="bar" style="height:${Math.max(3, Math.round((day.revenue / maxRevenue) * 100))}%"></div>
                  <span>${dateLong(day.date).replace(/ \d{4}$/, '')}</span>
                </div>`,
              )
              .join('')}
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Properti Anda</h3><a class="btn-link tiny" href="${tabHref('properti', hotelId)}">Kelola</a></div>
          <div class="stack" style="gap:12px">
            ${hotels
              .map(
                (item) => `<div class="between">
                  <div><p class="small strong">${esc(item.name)}</p><span class="tiny muted">${esc(item.city)} · ${item.roomCount} tipe kamar · ${item.inventory} unit</span></div>
                  <div class="right">${pill(item.status)}<p class="tiny muted mt-4">${item.rating.toFixed(1)} ★</p></div>
                </div>`,
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="panel mt-16">
        <div class="panel-head"><div><h3>Kedatangan terdekat</h3><p class="tiny muted">Reservasi aktif yang perlu disiapkan</p></div><a class="btn-link tiny" href="${tabHref('reservasi', hotelId)}">Semua reservasi</a></div>
        ${
          stats.upcoming.length
            ? `<div class="table-wrap"><table class="data">
                <thead><tr><th>Kode</th><th>Tamu</th><th>Check-in</th><th>Kamar</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>${stats.upcoming
                  .map(
                    (booking) => `<tr>
                      <td><strong>${esc(booking.code)}</strong></td>
                      <td>${esc(booking.guest?.name || '')}</td>
                      <td>${dateLong(booking.checkIn)}<br /><span class="tiny muted">${booking.price?.nights?.length || 1} malam</span></td>
                      <td>${esc(booking.roomType?.name || '')}<br /><span class="tiny muted">${booking.rooms} kamar</span></td>
                      <td>${pill(booking.status)}</td>
                      <td><div class="actions">${bookingActions(booking)}</div></td>
                    </tr>`,
                  )
                  .join('')}</tbody>
              </table></div>`
            : '<p class="muted small">Tidak ada kedatangan dalam waktu dekat.</p>'
        }
      </div>`;
    title = 'Ringkasan mitra';
  }

  if (tab === 'reservasi') {
    const status = query.status || '';
    const q = query.q || '';
    const params = new URLSearchParams({ hotelId });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    const data = await api(`/partner/bookings?${params}`);
    data.items.forEach((booking) => bookingsById.set(booking.id, booking));

    content = `
      <form class="dash-toolbar" data-booking-filter>
        <div class="inline-form">
          <div class="field"><label for="f-status">Status</label>
            <select class="select" id="f-status" name="status">${BOOKING_STATUS.map(([value, text]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${text}</option>`).join('')}</select>
          </div>
          <div class="field" style="min-width:220px"><label for="f-q">Cari kode / nama tamu</label>
            <input class="input" id="f-q" name="q" value="${esc(q)}" placeholder="HR-XXXXXX atau nama" />
          </div>
          <button class="btn btn-primary" type="submit">Terapkan</button>
        </div>
        <span class="chip chip-line">${data.items.length} reservasi</span>
      </form>
      ${bookingsTable(data.items)}`;
    title = 'Reservasi mitra';
  }

  if (tab === 'kalender') {
    const from = query.from || todayKey();
    const to = query.to && query.to >= from ? query.to : addDaysKey(from, 14);
    const calendar = await api(`/partner/calendar?hotelId=${hotelId}&from=${from}&to=${to}`);
    const dates = calendar.rooms[0]?.days.map((day) => day.date) || [];

    content = `
      <form class="dash-toolbar" data-calendar-filter>
        <div class="inline-form">
          <div class="field"><label for="cal-hotel">Properti</label>
            <select class="select" id="cal-hotel" name="hotelId">${hotels.map((item) => `<option value="${item.id}" ${item.id === hotelId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>
          </div>
          <div class="field"><label for="cal-from">Dari</label><input class="input" id="cal-from" type="date" name="from" value="${from}" /></div>
          <div class="field"><label for="cal-to">Sampai</label><input class="input" id="cal-to" type="date" name="to" value="${to}" /></div>
          <button class="btn btn-primary" type="submit">Tampilkan</button>
        </div>
        <div class="cal-legend">
          <span><i class="cal-ok"></i>Tersedia</span>
          <span><i class="cal-mid"></i>Terisi sebagian</span>
          <span><i class="cal-low"></i>Hampir penuh</span>
          <span><i class="cal-full"></i>Penuh</span>
        </div>
      </form>
      ${
        dates.length
          ? `<div class="calendar-wrap"><table class="calendar">
              <thead><tr><th>Tipe kamar</th>${dates
                .map((date) => `<th>${dateLong(date).replace(/ \d{4}$/, '')}</th>`)
                .join('')}</tr></thead>
              <tbody>
                ${calendar.rooms
                  .map(
                    (room) => `<tr>
                      <td><strong>${esc(room.name)}</strong><br /><span class="tiny muted">${room.inventory} unit · ${money(room.basePrice)}</span></td>
                      ${room.days
                        .map((day) => {
                          const ratio = day.inventory ? day.remaining / day.inventory : 0;
                          const tone = !room.active
                            ? 'cal-off'
                            : day.remaining === 0
                              ? 'cal-full'
                              : ratio <= 0.3
                                ? 'cal-low'
                                : ratio < 1
                                  ? 'cal-mid'
                                  : 'cal-ok';
                          return `<td title="${dateLong(day.date)} · sisa ${day.remaining}/${day.inventory} · ${day.reserved} terisi · ${money(day.rate)}/malam">
                            <span class="cal-cell ${tone}">${day.remaining}</span>
                          </td>`;
                        })
                        .join('')}
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table></div>
            <p class="help mt-8">Angka menunjukkan kamar yang masih bisa dijual pada tanggal tersebut. Tarif akhir mengikuti harga akhir pekan dan override tanggal.</p>`
          : emptyState('calendar', 'Belum ada tipe kamar', 'Tambahkan tipe kamar untuk melihat kalender ketersediaan.', `<a class="btn btn-primary btn-sm" href="${tabHref('kamar', hotelId)}">Tambah kamar</a>`)
      }`;
    title = 'Kalender ketersediaan';
  }

  if (tab === 'kamar') {
    const calendar = await api(`/partner/calendar?hotelId=${hotelId}&from=${todayKey()}&to=${addDaysKey(todayKey(), 2)}`);
    const rooms = calendar.rooms;

    content = `
      <div class="dash-toolbar">
        <div class="inline-form">
          <div class="field"><label for="room-hotel">Properti</label>
            <select class="select" id="room-hotel" data-hotel-switch>${hotels.map((item) => `<option value="${item.id}" ${item.id === hotelId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select>
          </div>
        </div>
        ${isStaff ? '<span class="chip chip-warn">Akses staf: hanya check-in / check-out</span>' : `<button class="btn btn-primary btn-sm" type="button" data-add-room>${icon('plus', 15)} Tambah tipe kamar</button>`}
      </div>
      <div class="panel">
        <div class="panel-head"><div><h3>${esc(hotel.name)}</h3><p class="tiny muted">${rooms.length} tipe kamar · ${rooms.reduce((sum, room) => sum + room.inventory, 0)} unit</p></div><span class="chip chip-line">${esc(hotel.city)}</span></div>
        ${rooms.length
          ? rooms
              .map(
                (room) => `<div class="room-admin">
                  <div>
                    <div class="row" style="gap:8px"><strong>${esc(room.name)}</strong>${room.active ? '<span class="chip chip-ok">Aktif</span>' : '<span class="chip chip-danger">Nonaktif</span>'}</div>
                    <div class="room-meta mt-4">
                      <span>${money(room.basePrice)} / malam</span>
                      <span>${room.inventory} unit</span>
                      <span>${room.days[0]?.reserved || 0} terisi hari ini</span>
                    </div>
                  </div>
                  <div class="dash-actions">
                    <button class="btn btn-soft btn-xs" type="button" data-edit-room="${room.id}">${icon('edit', 13)} Edit</button>
                    <button class="btn btn-soft btn-xs" type="button" data-block-room="${room.id}">Blokir tanggal</button>
                    ${room.active ? `<button class="btn btn-danger btn-xs" type="button" data-deactivate-room="${room.id}">Nonaktifkan</button>` : ''}
                  </div>
                </div>`,
              )
              .join('')
          : emptyState('bed', 'Belum ada kamar', 'Tambahkan tipe kamar pertama Anda agar properti bisa dipesan.', `<button class="btn btn-primary btn-sm" type="button" data-add-room>Tambah kamar</button>`)}
      </div>`;
    title = 'Kamar & tarif';
  }

  if (tab === 'ulasan') {
    const data = await api('/partner/reviews');
    content = `<div class="panel">
      <div class="panel-head"><h3>Ulasan tamu</h3><span class="chip chip-line">${data.items.length} ulasan</span></div>
      ${
        data.items.length
          ? data.items
              .map(
                (review) => `<div class="review-item">
                  <div class="between">
                    <div><h4>${esc(review.title)}</h4><span class="tiny muted">${esc(review.guestName)} · ${esc(review.hotelName)} · ${dateLong(String(review.createdAt).slice(0, 10))}</span></div>
                    <div class="right">${stars(review.rating)}<p class="tiny muted">${review.rating}/5</p></div>
                  </div>
                  <p class="review-body">${esc(review.body)}</p>
                  ${review.response ? `<div class="review-response"><strong>Balasan Anda</strong><p>${esc(review.response.body)}</p></div>` : `<button class="btn btn-outline btn-xs mt-8" type="button" data-reply="${review.id}" ${isStaff ? 'disabled' : ''}>Balas ulasan</button>`}
                </div>`,
              )
              .join('')
          : emptyState('star', 'Belum ada ulasan', 'Ulasan tamu yang menyelesaikan menginap akan tampil di sini.')
      }
    </div>`;
    title = 'Ulasan mitra';
  }

  if (tab === 'properti') {
    content = `<div class="dash-grid">
      <div>
        ${hotels
          .map(
            (item) => `<div class="panel mb-16">
              <div class="panel-head">
                <div><div class="row" style="gap:8px"><h3>${esc(item.name)}</h3>${pill(item.status)}</div>
                <p class="tiny muted">${esc(item.city)} · ${item.roomCount} tipe kamar · ${item.rating.toFixed(1)} ★ (${item.reviewCount} ulasan)</p></div>
                <div class="dash-actions">
                  ${item.pendingConfirmations ? `<span class="chip chip-warn">${item.pendingConfirmations} perlu konfirmasi</span>` : ''}
                  <button class="btn btn-soft btn-xs" type="button" data-edit-hotel="${item.id}" ${isStaff ? 'disabled' : ''}>${icon('edit', 13)} Edit</button>
                </div>
              </div>
              <div class="row">
                <a class="btn btn-outline btn-xs" href="${tabHref('kamar', item.id)}">Kelola kamar</a>
                <a class="btn btn-outline btn-xs" href="${tabHref('kalender', item.id)}">Kalender</a>
                <a class="btn btn-outline btn-xs" href="${tabHref('reservasi', item.id)}">Reservasi</a>
              </div>
            </div>`,
          )
          .join('')}
      </div>
      <aside class="panel">
        <h3>Daftarkan properti baru</h3>
        <p class="small muted mt-4">Properti baru berstatus <strong>menunggu verifikasi</strong> admin sebelum tampil di pencarian.</p>
        <button class="btn btn-primary btn-block mt-16" type="button" data-add-hotel ${isStaff ? 'disabled' : ''}>${icon('plus', 15)} Tambah properti</button>
        <div class="divider"></div>
        <h3 style="font-size:0.95rem">Checklist kualitas</h3>
        <ul class="mt-8" style="display:flex;flex-direction:column;gap:6px">
          <li class="small muted">${icon('check', 12)} Foto & deskripsi jelas</li>
          <li class="small muted">${icon('check', 12)} Minimal satu tipe kamar aktif</li>
          <li class="small muted">${icon('check', 12)} Alamat & kontak valid</li>
          <li class="small muted">${icon('check', 12)} Kebijakan pembatalan transparan</li>
        </ul>
      </aside>
    </div>`;
    title = 'Properti mitra';
  }

  const html = `
    <section class="dash-head">
      <div class="wrap">
        <div class="between" style="align-items:flex-start">
          <div>
            <p class="eyebrow" style="color:#e9d8a6">Dashboard ${isStaff ? 'staf hotel' : 'mitra'}</p>
            <h1>${esc(isStaff ? hotel.name : session.user.name.split(' ')[0] + ', kelola properti Anda')}</h1>
            <p>${esc(hotel.name)} · ${esc(hotel.city)} — data diperbarui langsung dari inventori hotel.</p>
          </div>
          <div class="row">
            ${hotels.length > 1 ? `<select class="select" data-hotel-switch style="background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.25);min-height:38px">${hotels.map((item) => `<option value="${item.id}" ${item.id === hotelId ? 'selected' : ''} style="color:#111">${esc(item.name)}</option>`).join('')}</select>` : `<span class="chip">${esc(hotel.name)}</span>`}
            ${!isStaff ? '<button class="btn btn-gold btn-sm" type="button" data-add-room>+ Kamar</button>' : ''}
          </div>
        </div>
      </div>
    </section>

    <div class="wrap" style="padding-bottom:64px">
      <div class="tabs" role="tablist">
        ${TABS.map(([key, text]) => `<a class="tab${tab === key ? ' active' : ''}" href="${tabHref(key, hotelId)}" role="tab">${text}</a>`).join('')}
      </div>
      ${content}
    </div>`;

  return {
    html,
    title: `${title} — Hotel Reserve`,
    mount(root) {
      /* Hotel switcher (header and room tab). */
      root.querySelectorAll('[data-hotel-switch]').forEach((select) => {
        select.addEventListener('change', () => {
          location.hash = tabHref(tab, select.value, tab === 'reservasi' ? { status: query.status || '', q: query.q || '' } : {});
        });
      });

      /* Booking actions. */
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-booking-action]');
        if (!button) return;
        const booking = bookingsById.get(button.dataset.id);
        if (!booking) return;
        const action = button.dataset.bookingAction;
        event.preventDefault();

        let body = {};
        if (action === 'accept') {
          setBusy(button, true, '…');
          try {
            await api(`/partner/bookings/${booking.id}/accept`, { method: 'POST' });
            toast(`Reservasi ${booking.code} dikonfirmasi.`);
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
          }
          return;
        }
        if (action === 'reject') {
          const reason = await promptDialog({
            title: `Tolak ${booking.code}?`,
            label: 'Alasan penolakan',
            placeholder: 'Contoh: kamar tidak tersedia untuk tanggal tersebut',
            confirmLabel: 'Tolak reservasi',
            multiline: true,
          });
          if (!reason) return;
          body = { reason };
        }
        if (action === 'checkin') {
          const roomNumber = await promptDialog({
            title: `Check-in ${booking.code}`,
            label: 'Nomor kamar',
            value: booking.roomNumber || '',
            placeholder: 'Contoh: V-201',
            hint: 'Kosongkan untuk nomor otomatis.',
            required: false,
            confirmLabel: 'Check-in',
          });
          if (roomNumber === null) return;
          body = { roomNumber };
        }
        if (action === 'assign') {
          const roomNumber = await promptDialog({
            title: 'Berikan nomor kamar',
            label: 'Nomor kamar',
            value: booking.roomNumber || '',
            placeholder: 'Contoh: 301',
            confirmLabel: 'Simpan',
          });
          if (!roomNumber) return;
          body = { roomNumber };
        }
        if (action === 'checkout') {
          const confirmed = window.confirm(`Check-out ${booking.code}? Poin tamu akan dihitung.`);
          if (!confirmed) return;
        }
        if (action === 'cancel') {
          const reason = await promptDialog({
            title: 'Batalkan reservasi hotel',
            label: 'Alasan pembatalan',
            placeholder: 'Contoh: maintenance mendadak',
            confirmLabel: 'Batalkan reservasi',
            multiline: true,
          });
          if (!reason) return;
          body = { reason };
        }

        setBusy(button, true, 'Memproses…');
        try {
          const result = await api(`/partner/bookings/${booking.id}/${action}`, { method: 'POST', body });
          toast(
            action === 'checkout'
              ? `Check-out selesai. ${result.pointsEarned || 0} poin diberikan ke tamu.`
              : `Aksi ${action} untuk ${booking.code} berhasil.`,
          );
          window.dispatchEvent(new Event('hr:refresh'));
          refreshShell();
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      });

      /* Filters. */
      root.querySelector('[data-booking-filter]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = values(event.target);
        location.hash = tabHref('reservasi', hotelId, { status: data.status || '', q: data.q || '' });
      });
      root.querySelector('[data-calendar-filter]')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = values(event.target);
        const params = new URLSearchParams({ tab: 'kalender', hotelId: data.hotelId, from: data.from, to: data.to });
        location.hash = `#/partner?${params}`;
      });

      /* Room and property editors. */
      if (tab === 'kamar') {
        root.querySelectorAll('[data-edit-room], [data-block-room]').forEach((button) => {
          button.addEventListener('click', async () => {
            const roomId = button.dataset.editRoom || button.dataset.blockRoom;
            try {
              const data = await api(`/partner/rooms/${roomId}`);
              if (button.dataset.blockRoom) openBlockRoom(data.roomType);
              else openRoomEditor(data.roomType);
            } catch (error) {
              toast(error.message, 'error');
            }
          });
        });
        root.querySelectorAll('[data-deactivate-room]').forEach((button) => {
          button.addEventListener('click', async () => {
            if (!window.confirm('Nonaktifkan tipe kamar ini? Kamar tidak akan bisa dipesan lagi.')) return;
            try {
              await api(`/partner/rooms/${button.dataset.deactivateRoom}`, { method: 'DELETE' });
              toast('Tipe kamar dinonaktifkan.');
              window.dispatchEvent(new Event('hr:refresh'));
            } catch (error) {
              toast(error.message, 'error');
            }
          });
        });
      }

      root.querySelectorAll('[data-edit-hotel]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            const data = await api(`/partner/hotels/${button.dataset.editHotel}`);
            openHotelEditor(data.hotel, meta);
          } catch (error) {
            toast(error.message, 'error');
          }
        });
      });

      root.querySelector('[data-add-hotel]')?.addEventListener('click', () => openHotelCreate(meta));
      root.querySelectorAll('[data-add-room]').forEach((button) => {
        button.addEventListener('click', () => openRoomCreate(hotelId, meta));
      });

      /* Review replies. */
      root.querySelectorAll('[data-reply]').forEach((button) => {
        button.addEventListener('click', async () => {
          const body = await promptDialog({
            title: 'Balas ulasan',
            label: 'Balasan hotel',
            placeholder: 'Terima kasih atas ulasannya…',
            confirmLabel: 'Kirim balasan',
            multiline: true,
          });
          if (!body) return;
          try {
            await api(`/partner/reviews/${button.dataset.reply}/respond`, { method: 'POST', body: { body } });
            toast('Balasan terkirim.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
          }
        });
      });
    },
  };
}

/* ---------------------------- editor dialogs --------------------------- */

function roomForm(room = {}) {
  return `<form data-room-form>
    <div class="form-grid">
      <div class="field span-2"><label>Nama tipe kamar</label><input class="input" name="name" value="${esc(room.name || '')}" required /></div>
      <div class="field"><label>Kategori</label>
        <select class="select" name="category">${['single', 'double', 'twin', 'suite', 'family', 'dorm'].map((key) => `<option value="${key}" ${room.category === key ? 'selected' : ''}>${propertyLabel(key)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Kapasitas per kamar</label><input class="input" type="number" name="capacity" min="1" max="8" value="${room.capacity || 2}" /></div>
      <div class="field"><label>Tempat tidur</label><input class="input" name="beds" value="${esc(room.beds || '1 Queen Bed')}" /></div>
      <div class="field"><label>Luas (m²)</label><input class="input" type="number" name="size" min="6" value="${room.size || 24}" /></div>
      <div class="field"><label>Harga dasar / malam</label><input class="input" type="number" name="basePrice" min="50000" step="50000" value="${room.basePrice || 500000}" /></div>
      <div class="field"><label>Pengali akhir pekan</label><input class="input" type="number" name="weekendMultiplier" min="1" max="3" step="0.05" value="${room.weekendMultiplier || 1.15}" /></div>
      <div class="field"><label>Jumlah unit</label><input class="input" type="number" name="inventory" min="1" max="200" value="${room.inventory || 5}" /></div>
      <div class="field"><label>Batal gratis H-</label><input class="input" type="number" name="freeCancellationDays" min="0" max="30" value="${room.freeCancellationDays ?? 3}" /></div>
      <div class="field span-2"><label>Deskripsi</label><textarea class="textarea" name="description" maxlength="500">${esc(room.description || '')}</textarea></div>
      <label class="check span-2"><input type="checkbox" name="breakfastIncluded" ${room.breakfastIncluded ? 'checked' : ''} /> Sarapan termasuk</label>
      ${room.id ? `<label class="check span-2"><input type="checkbox" name="active" ${room.active !== false ? 'checked' : ''} /> Tipe kamar aktif &amp; bisa dipesan</label>` : ''}
    </div>
    <div class="form-error hidden mt-12" data-room-error></div>
  </form>`;
}

function openRoomEditor(room) {
  const dialog = modal({
    title: 'Edit tipe kamar',
    subtitle: room.name,
    wide: true,
    body: roomForm(room),
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Simpan kamar</button>`,
  });
  const form = dialog.card.querySelector('[data-room-form]');
  const error = dialog.card.querySelector('[data-room-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    const data = new FormData(form);
    setBusy(event.target, true, 'Menyimpan…');
    try {
      await api(`/partner/rooms/${room.id}`, {
        method: 'PATCH',
        body: {
          name: String(data.get('name')).trim(),
          category: data.get('category'),
          capacity: Number(data.get('capacity')),
          beds: String(data.get('beds')),
          size: Number(data.get('size')),
          basePrice: Number(data.get('basePrice')),
          weekendMultiplier: Number(data.get('weekendMultiplier')),
          inventory: Number(data.get('inventory')),
          freeCancellationDays: Number(data.get('freeCancellationDays')),
          description: String(data.get('description') || ''),
          breakfastIncluded: data.get('breakfastIncluded') === 'on',
          active: data.get('active') === null ? room.active : data.get('active') === 'on',
        },
      });
      dialog.close();
      toast('Tipe kamar diperbarui.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

function openRoomCreate(hotelId) {
  const dialog = modal({
    title: 'Tambah tipe kamar',
    subtitle: 'Kamar langsung bisa dipesan setelah disimpan.',
    wide: true,
    body: roomForm(),
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Tambah kamar</button>`,
  });
  const form = dialog.card.querySelector('[data-room-form]');
  const error = dialog.card.querySelector('[data-room-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    const data = new FormData(form);
    setBusy(event.target, true, 'Menyimpan…');
    try {
      await api(`/partner/hotels/${hotelId}/rooms`, {
        method: 'POST',
        body: {
          name: String(data.get('name')).trim(),
          category: data.get('category'),
          capacity: Number(data.get('capacity')),
          beds: String(data.get('beds')),
          size: Number(data.get('size')),
          basePrice: Number(data.get('basePrice')),
          weekendMultiplier: Number(data.get('weekendMultiplier')),
          inventory: Number(data.get('inventory')),
          freeCancellationDays: Number(data.get('freeCancellationDays')),
          description: String(data.get('description') || ''),
          breakfastIncluded: data.get('breakfastIncluded') === 'on',
        },
      });
      dialog.close();
      toast('Tipe kamar ditambahkan.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

function openBlockRoom(room) {
  const dialog = modal({
    title: 'Blokir kamar',
    subtitle: `${room.name} · ${room.inventory} unit`,
    body: `<form data-block-form>
      <div class="form-grid">
        <div class="field"><label>Dari tanggal</label><input class="input" type="date" name="from" min="${todayKey()}" value="${todayKey()}" required /></div>
        <div class="field"><label>Sampai tanggal</label><input class="input" type="date" name="to" min="${todayKey()}" value="${addDaysKey(todayKey(), 2)}" required /></div>
        <div class="field"><label>Jumlah unit diblokir</label><input class="input" type="number" name="units" min="1" max="${room.inventory}" value="${room.inventory}" /></div>
        <div class="field"><label>Alasan</label><input class="input" name="reason" placeholder="Maintenance / renovasi" value="Maintenance" /></div>
      </div>
      <div class="form-error hidden mt-12" data-block-error></div>
    </form>`,
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Blokir</button>`,
  });
  const form = dialog.card.querySelector('[data-block-form]');
  const error = dialog.card.querySelector('[data-block-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    const data = new FormData(form);
    setBusy(event.target, true, 'Menyimpan…');
    try {
      await api(`/partner/rooms/${room.id}`, {
        method: 'PATCH',
        body: {
          blocks: [
            ...(room.blocks || []),
            {
              from: data.get('from'),
              to: data.get('to'),
              units: Number(data.get('units')),
              reason: String(data.get('reason') || 'Maintenance'),
            },
          ],
        },
      });
      dialog.close();
      toast('Tanggal berhasil diblokir.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

function hotelForm(hotel = {}, meta = {}) {
  return `<form data-hotel-form>
    <div class="form-grid">
      <div class="field span-2"><label>Nama properti</label><input class="input" name="name" value="${esc(hotel.name || '')}" required /></div>
      <div class="field"><label>Kota</label><input class="input" name="city" value="${esc(hotel.city || '')}" required /></div>
      <div class="field"><label>Kecamatan / area</label><input class="input" name="district" value="${esc(hotel.district || '')}" /></div>
      <div class="field span-2"><label>Alamat lengkap</label><input class="input" name="address" value="${esc(hotel.address || '')}" required /></div>
      <div class="field"><label>Bintang</label><select class="select" name="stars">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(hotel.stars || 3) === n ? 'selected' : ''}>${n} bintang</option>`).join('')}</select></div>
      <div class="field"><label>Jenis properti</label><select class="select" name="propertyType">${(meta.propertyTypes || ['hotel']).map((type) => `<option value="${type}" ${hotel.propertyType === type ? 'selected' : ''}>${propertyLabel(type)}</option>`).join('')}</select></div>
      <div class="field span-2"><label>Tagline</label><input class="input" name="tagline" value="${esc(hotel.tagline || '')}" maxlength="120" /></div>
      <div class="field span-2"><label>Deskripsi</label><textarea class="textarea" name="description" maxlength="2000">${esc(hotel.description || '')}</textarea></div>
    </div>
    <p class="label mt-16">Fasilitas</p>
    <div class="form-grid">
      ${(meta.facilities || [])
        .map(
          (facility) => `<label class="check"><input type="checkbox" name="facilities" value="${esc(facility)}" ${(hotel.facilities || []).includes(facility) ? 'checked' : ''} /> ${esc(facility)}</label>`,
        )
        .join('')}
    </div>
    <div class="form-error hidden mt-12" data-hotel-error></div>
  </form>`;
}

function collectHotelForm(form) {
  const data = new FormData(form);
  return {
    name: String(data.get('name')).trim(),
    city: String(data.get('city')).trim(),
    district: String(data.get('district') || '').trim(),
    address: String(data.get('address')).trim(),
    stars: Number(data.get('stars')),
    propertyType: data.get('propertyType'),
    tagline: String(data.get('tagline') || ''),
    description: String(data.get('description') || ''),
    facilities: [...form.querySelectorAll('input[name="facilities"]:checked')].map((input) => input.value),
  };
}

function openHotelEditor(hotel, meta) {
  const dialog = modal({
    title: 'Edit properti',
    subtitle: hotel.name,
    wide: true,
    body: hotelForm(hotel, meta),
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Simpan perubahan</button>`,
  });
  const form = dialog.card.querySelector('[data-hotel-form]');
  const error = dialog.card.querySelector('[data-hotel-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    setBusy(event.target, true, 'Menyimpan…');
    try {
      await api(`/partner/hotels/${hotel.id}`, { method: 'PATCH', body: collectHotelForm(form) });
      dialog.close();
      toast('Properti diperbarui.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}

function openHotelCreate(meta) {
  const dialog = modal({
    title: 'Tambah properti',
    subtitle: 'Properti akan diverifikasi admin sebelum tampil.',
    wide: true,
    body: hotelForm({}, meta),
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Kirim pendaftaran</button>`,
  });
  const form = dialog.card.querySelector('[data-hotel-form]');
  const error = dialog.card.querySelector('[data-hotel-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    setBusy(event.target, true, 'Mengirim…');
    try {
      await api('/partner/hotels', { method: 'POST', body: collectHotelForm(form) });
      dialog.close();
      toast('Properti dikirim untuk verifikasi admin.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}
