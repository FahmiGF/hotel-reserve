import { api, session, setSession, updateUser } from '../api.js';
import { ensureSession, refreshShell } from '../shell.js';
import {
  dateLong,
  emptyState,
  esc,
  icon,
  initials,
  money,
  pill,
  relative,
  setBusy,
  toast,
} from '../ui.js';

function loginGate(title, text) {
  return {
    html: `<div class="wrap section">${emptyState(
      'user',
      title,
      text,
      '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk ke akun</button>',
    )}</div>`,
    title: `${title} — Hotel Reserve`,
    mount(root) {
      root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
        if (await ensureSession('Masuk untuk membuka halaman akun.')) {
          window.dispatchEvent(new Event('hr:refresh'));
        }
      });
    },
  };
}

const ROLE_LABEL = {
  customer: 'Tamu',
  partner: 'Mitra hotel',
  staff: 'Staf hotel',
  admin: 'Administrator',
};

export async function accountView() {
  if (!session.user) return loginGate('Masuk ke akun Anda', 'Kelola profil, lihat statistik perjalanan, dan atur keanggotaan.');

  const data = await api('/auth/me');
  const user = data.user;
  const loyalty = data.loyalty;

  const html = `<div class="wrap section-tight">
    <div class="section-head">
      <div><p class="eyebrow">Akun</p><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">Halo, ${esc(user.name.split(' ')[0])}</h1>
      <p class="muted small">Kelola data akun dan lihat ringkasan aktivitas Anda.</p></div>
      <span class="chip chip-gold">${esc(ROLE_LABEL[user.role] || user.role)}</span>
    </div>

    <div class="dash-grid">
      <div>
        <div class="panel">
          <div class="panel-head"><div><h3>Profil</h3><p class="tiny muted">Nama dan nomor telepon dipakai pada e-voucher.</p></div><span class="avatar">${esc(initials(user.name))}</span></div>
          <form data-profile-form>
            <div class="form-grid">
              <div class="field span-2"><label for="p-name">Nama lengkap</label><input class="input" id="p-name" name="name" value="${esc(user.name)}" required /></div>
              <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" value="${esc(user.email)}" disabled /><span class="help">Email tidak dapat diubah di demo.</span></div>
              <div class="field"><label for="p-phone">Nomor HP</label><input class="input" id="p-phone" name="phone" value="${esc(user.phone || '')}" inputmode="tel" required /></div>
            </div>
            <div class="row mt-16"><button class="btn btn-primary" type="submit">Simpan perubahan</button><span class="tiny muted">Terdaftar ${dateLong(String(user.createdAt).slice(0, 10))}</span></div>
          </form>
        </div>

        <div class="panel mt-16">
          <div class="panel-head"><h3>Ringkasan aktivitas</h3></div>
          <div class="kpi-grid">
            <a class="kpi" href="#/trips"><span class="kpi-label">Perjalanan</span><p class="kpi-value">${data.counts.bookings}</p><span class="kpi-note">total reservasi</span></a>
            <a class="kpi" href="#/wishlist"><span class="kpi-label">Wishlist</span><p class="kpi-value">${data.counts.favorites}</p><span class="kpi-note">hotel disimpan</span></a>
            <a class="kpi" href="#/notifications"><span class="kpi-label">Notifikasi</span><p class="kpi-value">${data.counts.unreadNotifications}</p><span class="kpi-note">belum dibaca</span></a>
            <a class="kpi" href="#/loyalty"><span class="kpi-label">Poin</span><p class="kpi-value">${user.points.toLocaleString('id-ID')}</p><span class="kpi-note">${esc(loyalty.tier.name)} member</span></a>
          </div>
        </div>

        <div class="panel mt-16">
          <div class="panel-head"><h3>Keamanan &amp; sesi</h3></div>
          <p class="small muted">Kata sandi dikelola oleh server prototipe ini. Untuk demo, gunakan akun yang sama di perangkat lain.</p>
          <div class="row mt-12">
            <button class="btn btn-danger" type="button" data-logout>${icon('logout', 15)} Keluar dari akun</button>
            ${user.role !== 'customer' ? `<a class="btn btn-outline" href="${user.role === 'admin' ? '#/admin' : '#/partner'}">${icon('grid', 15)} Buka dashboard</a>` : ''}
          </div>
        </div>
      </div>

      <aside class="stack" style="gap:16px">
        <div class="member-card">
          <span class="tier">${esc(loyalty.tier.name)} member</span>
          <p class="member-points">${user.points.toLocaleString('id-ID')} <span style="font-size:1rem;opacity:.7">poin</span></p>
          <p class="small" style="opacity:.8">${money(user.points * 100)} nilai tukar · ${Number((loyalty.progress * 100).toFixed(0))}% menuju ${loyalty.next ? loyalty.next.name : 'tier tertinggi'}</p>
          <div class="progress-track mt-12"><div class="progress-fill" style="width:${Math.round(loyalty.progress * 100)}%"></div></div>
          <div class="between mt-8"><span class="tiny" style="opacity:.75">Lifetime ${user.lifetimePoints.toLocaleString('id-ID')} poin</span>
          <a class="tiny" style="color:var(--gold-soft)" href="#/loyalty">Detail membership →</a></div>
        </div>
        <div class="panel">
          <h3 style="font-size:1rem">Tautan cepat</h3>
          <div class="stack mt-12" style="gap:2px">
            <a class="btn-link" href="#/trips">${icon('ticket', 14)} Perjalanan saya</a>
            <a class="btn-link" href="#/notifications">${icon('bell', 14)} Notifikasi</a>
            <a class="btn-link" href="#/loyalty">${icon('star', 14)} Poin &amp; tier</a>
            <a class="btn-link" href="#/search">${icon('search', 14)} Cari hotel</a>
            ${session.user.role !== 'customer' ? `<a class="btn-link" href="${session.user.role === 'admin' ? '#/admin' : '#/partner'}">${icon('grid', 14)} Dashboard ${session.user.role === 'admin' ? 'admin' : 'mitra'}</a>` : ''}
          </div>
        </div>
        <div class="panel" style="background:var(--surface-2)">
          <h3 style="font-size:0.95rem">Butuh bantuan?</h3>
          <p class="small muted mt-4">Tim CS demo tersedia 09.00–21.00 WIB.</p>
          <p class="small mt-8"><strong>cs@hotelreserve.id</strong><br />+62 21 5000 1234</p>
        </div>
      </aside>
    </div>
  </div>`;

  return {
    html,
    title: 'Akun saya — Hotel Reserve',
    mount(root) {
      const form = root.querySelector('[data-profile-form]');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        setBusy(button, true, 'Menyimpan…');
        try {
          const result = await api('/auth/profile', {
            method: 'PATCH',
            body: {
              name: form.querySelector('[name="name"]').value.trim(),
              phone: form.querySelector('[name="phone"]').value.trim(),
            },
          });
          updateUser({ ...session.user, ...result.user });
          refreshShell();
          toast('Profil diperbarui.');
          window.dispatchEvent(new Event('hr:refresh'));
        } catch (error) {
          toast(error.message, 'error');
          setBusy(button, false);
        }
      });

      root.querySelector('[data-logout]')?.addEventListener('click', () => {
        setSession({ token: '', user: null });
        localStorage.removeItem('hotelReserveToken');
        localStorage.removeItem('hotelReserveUser');
        window.dispatchEvent(new Event('hr:session'));
        refreshShell();
        toast('Anda sudah keluar.');
        location.hash = '#/';
      });
    },
  };
}

export async function loyaltyView() {
  if (!session.user) return loginGate('Masuk untuk melihat poin', 'Kumpulkan poin dari setiap menginap dan tukar menjadi diskon.');

  const data = await api('/loyalty');
  const tier = data.tier;
  const progress = Math.round((data.progress || 0) * 100);

  const html = `<div class="wrap section-tight">
    <div class="section-head">
      <div><p class="eyebrow">Membership</p><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">Poin &amp; tier Anda</h1>
      <p class="muted small">Setiap Rp10.000 dari total menginap menghasilkan 1 poin dasar, dikali bonus tier.</p></div>
      <a class="btn btn-outline btn-sm" href="#/trips">Riwayat perjalanan</a>
    </div>

    <div class="dash-grid">
      <div>
        <div class="member-card">
          <div class="between" style="align-items:flex-start">
            <div><span class="tier">${esc(tier.name)} member</span><p class="member-points">${data.points.toLocaleString('id-ID')}<span style="font-size:1rem;opacity:.7"> poin tersedia</span></p></div>
            <div class="right"><span class="tiny" style="opacity:.7">Nilai tukar</span><p class="strong" style="font-size:1.1rem">${money(data.points * data.pointsValueIdr)}</p></div>
          </div>
          <div class="progress-track mt-16"><div class="progress-fill" style="width:${progress}%"></div></div>
          <div class="between mt-8">
            <span class="tiny" style="opacity:.8">${data.next ? `${data.pointsToNext.toLocaleString('id-ID')} poin lagi menuju ${data.next.name}` : 'Anda berada di tier tertinggi'}</span>
            <span class="tiny" style="opacity:.8">Lifetime ${data.lifetimePoints.toLocaleString('id-ID')} poin</span>
          </div>
        </div>

        <div class="tier-grid mt-16">
          ${data.tiers
            .map(
              (item) => `<div class="tier-card${item.key === tier.key ? ' current' : ''}">
                <h4>${esc(item.name)}${item.key === tier.key ? ' · Anda' : ''}</h4>
                <p class="tier-mult">${item.earnMultiplier}×</p>
                <p>Mulai ${item.minPoints.toLocaleString('id-ID')} poin lifetime</p>
                <ul class="mt-8" style="display:flex;flex-direction:column;gap:4px">${item.benefits
                  .map((benefit) => `<li class="tiny muted">${icon('check', 11)} ${esc(benefit)}</li>`)
                  .join('')}</ul>
              </div>`,
            )
            .join('')}
        </div>

        <div class="panel mt-16">
          <div class="panel-head"><h3>Riwayat poin</h3><span class="muted small">${data.history.length} transaksi</span></div>
          ${
            data.history.length
              ? data.history
                  .map(
                    (item) => `<div class="history-item">
                      <div><p class="small strong">${esc(item.label)}</p><span class="tiny muted">${relative(item.at)}</span></div>
                      <span class="pts ${item.points > 0 ? 'plus' : 'minus'}">${item.points > 0 ? '+' : ''}${item.points.toLocaleString('id-ID')}</span>
                    </div>`,
                  )
                  .join('')
              : '<p class="muted small">Belum ada riwayat. Poin muncul setelah Anda menyelesaikan menginap.</p>'
          }
        </div>
      </div>

      <aside class="stack" style="gap:16px">
        <div class="panel">
          <h3 style="font-size:1rem">Cara kerja poin</h3>
          <ol class="instructions mt-8" style="padding:0">
            <li><b>1</b><span>Pesan dan selesaikan menginap di hotel mana pun.</span></li>
            <li><b>2</b><span>Poin masuk otomatis saat check-out, dihitung dari total pembayaran.</span></li>
            <li><b>3</b><span>Tukar poin saat checkout: 1 poin = ${money(data.pointsValueIdr)}, maksimal 50% subtotal kamar.</span></li>
          </ol>
        </div>
        <div class="panel" style="background:var(--brand-soft);border-color:#cfe2d9">
          <h3 style="font-size:1rem;color:var(--brand)">Bonus tier</h3>
          <p class="small" style="color:var(--brand)">Tier dihitung dari lifetime poin, jadi memakai poin tidak menurunkan level Anda. Naik ke ${data.next?.name || 'tier berikutnya'} untuk pengali poin lebih besar.</p>
          <a class="btn btn-primary btn-sm mt-12" href="#/search">Cari menginap berikutnya</a>
        </div>
        <div class="panel">
          <h3 style="font-size:1rem">Status keanggotaan</h3>
          <p class="small muted mt-4">${pill('active')} Aktif sejak ${dateLong(String(session.user.createdAt).slice(0, 10))}</p>
        </div>
      </aside>
    </div>
  </div>`;

  return { html, title: 'Poin & membership — Hotel Reserve', mount() {} };
}

const NOTIF_ICON = {
  booking_created: 'ticket',
  booking_request: 'ticket',
  booking_confirmed: 'check',
  booking_rejected: 'alert',
  booking_modified: 'calendar',
  checked_in: 'bed',
  checked_out: 'check',
  payment_failed: 'alert',
  refund: 'copy',
  refund_request: 'copy',
  hotel_verified: 'building',
  hotel_rejected: 'alert',
  new_review: 'star',
  review_report: 'alert',
  welcome: 'sparkle',
};

export async function notificationsView() {
  if (!session.user) return loginGate('Masuk untuk melihat notifikasi', 'Pembaruan reservasi, pembayaran, dan promo akan muncul di sini.');

  const data = await api('/notifications');

  const html = `<div class="wrap section-tight" style="padding-bottom:64px">
    <div class="section-head">
      <div><p class="eyebrow">Kotak masuk</p><h1 style="font-size:clamp(1.7rem,3vw,2.3rem)">Notifikasi</h1>
      <p class="muted small">${data.unread} belum dibaca dari ${data.items.length} notifikasi terbaru.</p></div>
      ${data.unread ? '<button class="btn btn-outline btn-sm" type="button" data-read-all>Tandai semua dibaca</button>' : ''}
    </div>
    <div class="panel" style="padding:0;overflow:hidden">
      ${
        data.items.length
          ? data.items
              .map(
                (item) => `<article class="notif-item${item.read ? '' : ' unread'}" data-notif="${item.id}" data-link="${esc(item.link || '')}">
                  <div class="notif-icon">${icon(NOTIF_ICON[item.type] || 'bell', 18)}</div>
                  <div class="grow">
                    <h4>${esc(item.title)}</h4>
                    <p>${esc(item.body)}</p>
                    <span class="when">${relative(item.createdAt)}</span>
                  </div>
                  ${item.link ? `<button class="btn btn-soft btn-xs" type="button" data-open>Buka</button>` : ''}
                </article>`,
              )
              .join('')
          : emptyState('bell', 'Belum ada notifikasi', 'Pembaruan tentang reservasi dan pembayaran akan muncul di sini.')
      }
    </div>
  </div>`;

  return {
    html,
    title: 'Notifikasi — Hotel Reserve',
    mount(root) {
      root.querySelector('[data-read-all]')?.addEventListener('click', async (event) => {
        setBusy(event.target, true, 'Memproses…');
        try {
          await api('/notifications/read-all', { method: 'POST' });
          toast('Semua notifikasi ditandai dibaca.');
          refreshShell();
          window.dispatchEvent(new Event('hr:refresh'));
        } catch (error) {
          toast(error.message, 'error');
          setBusy(event.target, false);
        }
      });

      root.querySelectorAll('[data-notif]').forEach((item) => {
        item.addEventListener('click', async (event) => {
          event.preventDefault();
          const id = item.dataset.notif;
          if (item.classList.contains('unread')) {
            try {
              await api(`/notifications/${id}/read`, { method: 'POST' });
            } catch {
              /* navigation still works if marking read fails */
            }
          }
          const link = item.dataset.link;
          if (link) {
            const target = link.startsWith('#') ? link : `#${link.replace(/^\/?#?/, '/')}`;
            location.hash = target;
          } else if (event.target.closest('[data-open]')) {
            window.dispatchEvent(new Event('hr:refresh'));
          }
        });
      });
    },
  };
}
