import { api, session } from '../api.js';
import { ensureSession, refreshShell } from '../shell.js';
import {
  addDaysKey,
  compactMoney,
  dateLong,
  emptyState,
  esc,
  icon,
  modal,
  money,
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
  ['hotel', 'Hotel'],
  ['transaksi', 'Transaksi'],
  ['refund', 'Refund'],
  ['promo', 'Promo'],
  ['pengguna', 'Pengguna'],
  ['ulasan', 'Ulasan'],
];

const HOTEL_STATUS = [
  ['', 'Semua'],
  ['pending', 'Menunggu verifikasi'],
  ['verified', 'Terverifikasi'],
  ['rejected', 'Ditolak'],
];

const PAYMENT_STATUS = [
  ['', 'Semua transaksi'],
  ['paid', 'Lunas'],
  ['pending', 'Menunggu'],
  ['failed', 'Gagal'],
  ['refunded', 'Direfund'],
  ['on_arrival', 'Bayar di hotel'],
];

function tabHref(tab, extra = {}) {
  const params = new URLSearchParams({ tab, ...extra });
  return `#/admin?${params}`;
}

function gate() {
  return `<div class="wrap section">${emptyState(
    'lock',
    'Akses administrator',
    'Halaman ini hanya untuk admin platform. Masuk dengan akun demo admin@hotelreserve.id / password123.',
    '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk sebagai admin</button>',
  )}</div>`;
}

export async function adminView({ query }) {
  if (!session.user) {
    return {
      html: gate(),
      title: 'Admin — Hotel Reserve',
      mount(root) {
        root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
          if (await ensureSession('Masuk dengan akun administrator.')) window.dispatchEvent(new Event('hr:refresh'));
        });
      },
    };
  }
  if (session.user.role !== 'admin') {
    return {
      html: `<div class="wrap section">${emptyState('lock', 'Bukan akun admin', 'Akun Anda tidak memiliki izin membuka panel admin.', '<a class="btn btn-primary btn-sm" href="#/">Kembali ke beranda</a>')}</div>`,
      title: 'Admin — Hotel Reserve',
      mount() {},
    };
  }

  const tab = TABS.some(([key]) => key === query.tab) ? query.tab : 'ringkasan';
  let content = '';
  let pageTitle = 'Admin platform';

  if (tab === 'ringkasan') {
    const stats = await api('/admin/stats');
    const t = stats.totals;
    const integration = stats.integrations;
    content = `
      <div class="kpi-grid">
        <div class="kpi accent"><span class="kpi-label">GMV (transaksi lunas)</span><p class="kpi-value">${compactMoney(t.gmv)}</p><span class="kpi-note">${t.paidTransactions} pembayaran sukses</span></div>
        <div class="kpi"><span class="kpi-label">Pendapatan komisi</span><p class="kpi-value">${compactMoney(t.commission)}</p><span class="kpi-note">dari seluruh hotel mitra</span></div>
        <div class="kpi"><span class="kpi-label">Pengguna</span><p class="kpi-value">${t.users}</p><span class="kpi-note">${t.customers} tamu terdaftar</span></div>
        <div class="kpi"><span class="kpi-label">Refund tertunda</span><p class="kpi-value">${t.pendingRefunds}</p><span class="kpi-note">${compactMoney(t.refundedAmount)} sudah direfund</span></div>
      </div>

      <div class="dash-grid mt-16">
        <div class="panel">
          <div class="panel-head"><div><h3>Reservasi terbaru</h3><p class="tiny muted">8 aktivitas terakhir lintas hotel</p></div><a class="btn-link tiny" href="${tabHref('transaksi')}">Lihat transaksi</a></div>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Kode</th><th>Tamu</th><th>Hotel</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${stats.recentBookings
              .map(
                (booking) => `<tr>
                  <td><strong>${esc(booking.code)}</strong><br /><span class="tiny muted">${relative(booking.createdAt)}</span></td>
                  <td>${esc(booking.guestName)}</td>
                  <td>${esc(booking.hotelName)}</td>
                  <td class="nowrap">${money(booking.total)}</td>
                  <td>${pill(booking.status)}</td>
                </tr>`,
              )
              .join('')}</tbody>
          </table></div>
        </div>

        <div class="stack" style="gap:16px">
          <div class="panel">
            <div class="panel-head"><h3>Status reservasi</h3></div>
            <div class="stack" style="gap:8px">
              ${Object.entries(stats.statusCounts)
                .map(
                  ([status, count]) => `<div class="between"><span class="small">${pill(status)}</span><strong class="small">${count}</strong></div>`,
                )
                .join('')}
            </div>
            <div class="divider"></div>
            <div class="between"><span class="small muted">Hotel menunggu verifikasi</span><strong>${t.pendingHotels}</strong></div>
            <a class="btn btn-outline btn-block mt-12" href="${tabHref('hotel', { status: 'pending' })}">Tinjau hotel baru</a>
          </div>

          <div class="panel" style="background:var(--surface-2)">
            <div class="panel-head"><h3 style="font-size:1rem">Integrasi Traveloka</h3><span class="chip chip-warn">Placeholder</span></div>
            <p class="small muted">${esc(integration.docsNote)}</p>
            <div class="stack mt-12" style="gap:6px">
              ${integration.capabilities
                .map(
                  (item) => `<div class="between"><span class="tiny">${esc(item.label)}</span><span class="chip ${item.ready ? 'chip-ok' : 'chip-line'}">${item.ready ? 'Siap' : 'Belum'}</span></div>`,
                )
                .join('')}
            </div>
            <p class="tiny muted mt-12">Status: <code>${esc(integration.status)}</code></p>
            <p class="tiny muted">Env yang dibutuhkan: <code>${integration.requiredEnvVars.join(', ')}</code></p>
            <p class="tiny muted mt-8">Platform tetap berjalan penuh tanpa integrasi ini.</p>
          </div>
        </div>
      </div>`;
    pageTitle = 'Ringkasan admin';
  }

  if (tab === 'hotel') {
    const status = HOTEL_STATUS.some(([key]) => key === query.status) ? query.status : '';
    const data = await api(`/admin/hotels${status ? `?status=${status}` : ''}`);
    content = `
      <div class="dash-toolbar">
        <div class="tabs" style="margin:0;border:0">
          ${HOTEL_STATUS.map(([key, text]) => `<a class="tab${status === key ? ' active' : ''}" href="${tabHref('hotel', key ? { status: key } : {})}">${text}</a>`).join('')}
        </div>
        <span class="chip chip-line">${data.items.length} properti</span>
      </div>
      ${
        data.items.length
          ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Properti</th><th>Pemilik</th><th>Kamar</th><th>Reservasi</th><th>Rating</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>${data.items
                .map(
                  (hotel) => `<tr>
                    <td><strong>${esc(hotel.name)}</strong><br /><span class="tiny muted">${esc(hotel.city)} · ${'★'.repeat(hotel.stars)}</span></td>
                    <td>${esc(hotel.ownerName || '—')}<br /><span class="tiny muted">${esc(hotel.ownerEmail || '')}</span></td>
                    <td>${hotel.roomCount}</td>
                    <td>${hotel.bookingCount}</td>
                    <td>${hotel.rating.rating.toFixed(1)} (${hotel.rating.count})</td>
                    <td>${pill(hotel.status)}</td>
                    <td><div class="actions">
                      ${
                        hotel.status !== 'verified'
                          ? `<button class="btn btn-primary btn-xs" type="button" data-verify="${hotel.id}" data-action="verify">Verifikasi</button>`
                          : ''
                      }
                      ${
                        hotel.status !== 'rejected'
                          ? `<button class="btn btn-soft btn-xs" type="button" data-verify="${hotel.id}" data-action="reject">Tolak</button>`
                          : ''
                      }
                    </div></td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table></div>`
          : emptyState('building', 'Tidak ada properti', 'Belum ada properti dengan status ini.')
      }`;
    pageTitle = 'Verifikasi hotel';
  }

  if (tab === 'transaksi') {
    const status = PAYMENT_STATUS.some(([key]) => key === query.status) ? query.status : '';
    const data = await api(`/admin/transactions${status ? `?status=${status}` : ''}`);
    content = `
      <div class="dash-toolbar">
        <div class="inline-form">
          <div class="field"><label for="tx-status">Status pembayaran</label>
            <select class="select" id="tx-status" data-tx-filter>${PAYMENT_STATUS.map(([key, text]) => `<option value="${key}" ${status === key ? 'selected' : ''}>${text}</option>`).join('')}</select>
          </div>
        </div>
        <div class="row">
          <span class="chip chip-ok">Lunas ${money(data.totals.paid)}</span>
          <span class="chip chip-warn">Refund ${money(data.totals.refunded)}</span>
        </div>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Order</th><th>Tamu / Hotel</th><th>Metode</th><th class="right">Nominal</th><th class="right">Komisi</th><th>Status</th><th>Waktu</th></tr></thead>
        <tbody>${data.items
          .map(
            (item) => `<tr>
              <td><strong>${esc(item.orderId)}</strong><br /><span class="tiny muted">${esc(item.bookingCode)}</span></td>
              <td>${esc(item.guestName)}<br /><span class="tiny muted">${esc(item.hotelName)}</span></td>
              <td>${esc(item.method)}<br /><span class="tiny muted">${esc(item.provider)}</span></td>
              <td class="right nowrap">${money(item.amount)}</td>
              <td class="right nowrap">${money(item.commission)}</td>
              <td>${pill(item.status)}</td>
              <td><span class="tiny">${relative(item.createdAt)}</span><br />${item.paidAt ? `<span class="tiny muted">bayar ${relative(item.paidAt)}</span>` : ''}</td>
            </tr>`,
          )
          .join('')}</tbody>
      </table></div>`;
    pageTitle = 'Transaksi';
  }

  if (tab === 'refund') {
    const data = await api('/admin/refunds');
    content = data.items.length
      ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Reservasi</th><th>Tamu / Hotel</th><th class="right">Nominal</th><th>Alasan</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${data.items
            .map(
              (refund) => `<tr>
                <td><strong>${esc(refund.bookingCode)}</strong><br /><span class="tiny muted">${relative(refund.createdAt)}</span></td>
                <td>${esc(refund.guestName)}<br /><span class="tiny muted">${esc(refund.hotelName)}</span></td>
                <td class="right nowrap">${money(refund.amount)}<br /><span class="tiny muted">penalti ${money(refund.penalty)}</span></td>
                <td style="max-width:240px"><span class="tiny">${esc(refund.reason)}</span></td>
                <td>${pill(refund.status)}</td>
                <td><div class="actions">
                  ${
                    refund.status === 'pending'
                      ? `<button class="btn btn-primary btn-xs" type="button" data-refund="${refund.id}" data-action="approve">Setujui</button>
                         <button class="btn btn-soft btn-xs" type="button" data-refund="${refund.id}" data-action="reject">Tolak</button>`
                      : '<span class="tiny muted">Selesai diputuskan</span>'
                  }
                </div></td>
              </tr>`,
            )
            .join('')}</tbody>
        </table></div>`
      : emptyState('copy', 'Tidak ada pengajuan refund', 'Pengajuan dari tamu akan muncul di sini untuk diputuskan.');
    pageTitle = 'Refund';
  }

  if (tab === 'promo') {
    const data = await api('/admin/promos');
    content = `
      <div class="dash-toolbar">
        <div><p class="eyebrow">Kampanye</p><h2 style="font-size:1.4rem">Kode promo</h2></div>
        <button class="btn btn-primary btn-sm" type="button" data-add-promo>${icon('plus', 15)} Buat promo</button>
      </div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Kode</th><th>Judul</th><th>Nilai</th><th>Min. belanja</th><th>Berlaku s/d</th><th>Pemakaian</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${data.items
          .map(
            (promo) => `<tr>
              <td><strong>${esc(promo.code)}</strong><br /><span class="tiny muted">${esc(promo.city || 'semua kota')}</span></td>
              <td>${esc(promo.title)}<br /><span class="tiny muted">${esc(promo.description || '')}</span></td>
              <td>${promo.type === 'percent' ? `${promo.value}%` : money(promo.value)}${promo.maxDiscount ? `<br /><span class="tiny muted">maks ${money(promo.maxDiscount)}</span>` : ''}</td>
              <td>${promo.minSpend ? money(promo.minSpend) : '—'}</td>
              <td>${dateLong(promo.validUntil)}</td>
              <td>${promo.usedCount}${promo.usageLimit ? ` / ${promo.usageLimit}` : ''}</td>
              <td>${pill(promo.active ? 'active' : 'hidden')}</td>
              <td><button class="btn btn-soft btn-xs" type="button" data-promo="${promo.id}" data-active="${promo.active}">${promo.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td>
            </tr>`,
          )
          .join('')}</tbody>
      </table></div>`;
    pageTitle = 'Promo';
  }

  if (tab === 'pengguna') {
    const data = await api('/admin/users');
    content = `<div class="table-wrap"><table class="data">
      <thead><tr><th>Nama</th><th>Peran</th><th>Reservasi</th><th class="right">Total belanja</th><th>Hotel</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>${data.items
        .map(
          (user) => `<tr>
            <td><strong>${esc(user.name)}</strong><br /><span class="tiny muted">${esc(user.email)}</span></td>
            <td><span class="chip chip-line">${esc(user.role)}</span></td>
            <td>${user.bookings}</td>
            <td class="right nowrap">${money(user.spend)}</td>
            <td>${user.hotelsOwned || '—'}</td>
            <td>${pill(user.status)}</td>
            <td>${
              user.role === 'admin'
                ? '<span class="tiny muted">—</span>'
                : `<button class="btn btn-soft btn-xs" type="button" data-user="${user.id}" data-status="${user.status === 'active' ? 'suspended' : 'active'}">${user.status === 'active' ? 'Bekukan' : 'Aktifkan'}</button>`
            }</td>
          </tr>`,
        )
        .join('')}</tbody>
    </table></div>`;
    pageTitle = 'Pengguna';
  }

  if (tab === 'ulasan') {
    const data = await api('/admin/reviews');
    content = `<div class="panel">
      <div class="panel-head"><div><h3>Moderasi ulasan</h3><p class="tiny muted">Sembunyikan ulasan yang melanggar pedoman komunitas.</p></div><span class="chip chip-line">${data.items.length} ulasan</span></div>
      ${data.items
        .map(
          (review) => `<div class="review-item">
            <div class="between">
              <div>
                <div class="row" style="gap:8px"><h4>${esc(review.title)}</h4>${review.hidden ? '<span class="chip chip-danger">Disembunyikan</span>' : ''}${review.reports ? `<span class="chip chip-warn">${review.reports} laporan</span>` : ''}</div>
                <span class="tiny muted">${esc(review.guestName)} · ${esc(review.hotelName)} · ${dateLong(String(review.createdAt).slice(0, 10))}</span>
              </div>
              <div class="right">${stars(review.rating)}<p class="tiny muted">${review.rating}/5</p></div>
            </div>
            <p class="review-body">${esc(review.body)}</p>
            <button class="btn btn-soft btn-xs mt-8" type="button" data-review="${review.id}" data-hidden="${review.hidden}">${review.hidden ? 'Tampilkan kembali' : 'Sembunyikan ulasan'}</button>
          </div>`,
        )
        .join('')}
    </div>`;
    pageTitle = 'Moderasi ulasan';
  }

  const html = `
    <section class="dash-head">
      <div class="wrap">
        <div class="between" style="align-items:flex-start">
          <div>
            <p class="eyebrow" style="color:#e9d8a6">Admin platform</p>
            <h1>Kendali penuh Hotel Reserve</h1>
            <p>Verifikasi mitra, pantau transaksi, putuskan refund, dan jaga kualitas ulasan.</p>
          </div>
          <div class="row">
            <span class="chip">${esc(session.user.name)}</span>
            <a class="btn btn-gold btn-sm" href="#/search">Lihat situs</a>
          </div>
        </div>
      </div>
    </section>
    <div class="wrap" style="padding-bottom:64px">
      <div class="tabs" role="tablist">
        ${TABS.map(([key, text]) => `<a class="tab${tab === key ? ' active' : ''}" href="${tabHref(key)}" role="tab">${text}</a>`).join('')}
      </div>
      ${content}
    </div>`;

  return {
    html,
    title: `Admin · ${pageTitle} — Hotel Reserve`,
    mount(root) {
      root.querySelector('[data-tx-filter]')?.addEventListener('change', (event) => {
        location.hash = tabHref('transaksi', event.target.value ? { status: event.target.value } : {});
      });

      root.addEventListener('click', async (event) => {
        const verifyButton = event.target.closest('[data-verify]');
        const refundButton = event.target.closest('[data-refund]');
        const promoButton = event.target.closest('[data-promo]');
        const userButton = event.target.closest('[data-user]');
        const reviewButton = event.target.closest('[data-review]');

        if (verifyButton) {
          const action = verifyButton.dataset.action;
          let note = '';
          if (action === 'reject') {
            note = await promptDialog({
              title: 'Tolak properti',
              label: 'Catatan untuk mitra',
              placeholder: 'Contoh: foto properti belum sesuai',
              confirmLabel: 'Tolak properti',
              multiline: true,
            });
            if (note === null) return;
          }
          setBusy(verifyButton, true, '…');
          try {
            await api(`/admin/hotels/${verifyButton.dataset.verify}/verify`, {
              method: 'POST',
              body: { action, note },
            });
            toast(action === 'verify' ? 'Hotel berhasil diverifikasi.' : 'Hotel ditolak dengan catatan.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
            setBusy(verifyButton, false);
          }
          return;
        }

        if (refundButton) {
          const action = refundButton.dataset.action;
          let note = '';
          if (action === 'reject') {
            note = await promptDialog({
              title: 'Tolak refund',
              label: 'Alasan penolakan',
              placeholder: 'Contoh: di luar kebijakan pembatalan',
              confirmLabel: 'Tolak',
              multiline: true,
            });
            if (note === null) return;
          } else if (!window.confirm('Setujui refund ini? Dana akan ditandai dikembalikan.')) {
            return;
          }
          try {
            await api(`/admin/refunds/${refundButton.dataset.refund}/decide`, {
              method: 'POST',
              body: { action, note },
            });
            toast(action === 'approve' ? 'Refund disetujui.' : 'Refund ditolak.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
          }
          return;
        }

        if (promoButton) {
          const nextActive = promoButton.dataset.active !== 'true';
          try {
            await api(`/admin/promos/${promoButton.dataset.promo}`, {
              method: 'PATCH',
              body: { active: nextActive },
            });
            toast(nextActive ? 'Promo diaktifkan.' : 'Promo dinonaktifkan.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
          }
          return;
        }

        if (userButton) {
          const nextStatus = userButton.dataset.status;
          if (!window.confirm(nextStatus === 'suspended' ? 'Bekukan akun ini?' : 'Aktifkan kembali akun ini?')) return;
          try {
            await api(`/admin/users/${userButton.dataset.user}/status`, {
              method: 'POST',
              body: { status: nextStatus },
            });
            toast(nextStatus === 'suspended' ? 'Akun dibekukan.' : 'Akun diaktifkan.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
          }
          return;
        }

        if (reviewButton) {
          const hidden = reviewButton.dataset.hidden !== 'true';
          try {
            await api(`/admin/reviews/${reviewButton.dataset.review}/hide`, {
              method: 'POST',
              body: { hidden },
            });
            toast(hidden ? 'Ulasan disembunyikan.' : 'Ulasan ditampilkan kembali.');
            window.dispatchEvent(new Event('hr:refresh'));
          } catch (error) {
            toast(error.message, 'error');
          }
        }
      });

      root.querySelector('[data-add-promo]')?.addEventListener('click', () => openPromoCreate());
    },
  };
}

function openPromoCreate() {
  const dialog = modal({
    title: 'Buat kode promo',
    subtitle: 'Promo berlaku untuk semua hotel kecuali kota diisi.',
    wide: true,
    body: `<form data-promo-form>
      <div class="form-grid">
        <div class="field"><label>Kode</label><input class="input" name="code" placeholder="HEMAT20" maxlength="20" required /></div>
        <div class="field"><label>Judul</label><input class="input" name="title" placeholder="Diskon 20% akhir pekan" required /></div>
        <div class="field"><label>Tipe</label><select class="select" name="type"><option value="percent">Persen (%)</option><option value="fixed">Nominal (Rp)</option></select></div>
        <div class="field"><label>Nilai</label><input class="input" type="number" name="value" min="1" value="10" required /></div>
        <div class="field"><label>Maks. diskon (0 = tanpa batas)</label><input class="input" type="number" name="maxDiscount" min="0" value="200000" /></div>
        <div class="field"><label>Min. belanja</label><input class="input" type="number" name="minSpend" min="0" value="0" /></div>
        <div class="field"><label>Kota (opsional)</label><input class="input" name="city" placeholder="Bali" /></div>
        <div class="field"><label>Berlaku sampai</label><input class="input" type="date" name="validUntil" value="${addDaysKey(todayKey(), 30)}" /></div>
        <div class="field span-2"><label>Deskripsi</label><input class="input" name="description" maxlength="300" placeholder="Syarat singkat promo" /></div>
      </div>
      <div class="form-error hidden mt-12" data-promo-error></div>
    </form>`,
    footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button><button class="btn btn-primary" type="button" data-save>Buat promo</button>`,
  });
  const form = dialog.card.querySelector('[data-promo-form]');
  const error = dialog.card.querySelector('[data-promo-error]');
  dialog.card.querySelector('[data-cancel]').onclick = dialog.close;
  dialog.card.querySelector('[data-save]').onclick = async (event) => {
    const data = values(form);
    setBusy(event.target, true, 'Menyimpan…');
    try {
      await api('/admin/promos', {
        method: 'POST',
        body: {
          code: data.code.trim().toUpperCase(),
          title: data.title.trim(),
          description: data.description || '',
          type: data.type,
          value: Number(data.value),
          maxDiscount: Number(data.maxDiscount),
          minSpend: Number(data.minSpend),
          city: data.city.trim() || null,
          validUntil: data.validUntil,
        },
      });
      dialog.close();
      toast('Kode promo dibuat.');
      window.dispatchEvent(new Event('hr:refresh'));
    } catch (err) {
      error.textContent = err.message;
      error.classList.remove('hidden');
      setBusy(event.target, false);
    }
  };
}
