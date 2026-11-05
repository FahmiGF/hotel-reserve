import { session } from './api.js';
import { refreshShell } from './shell.js';
import { esc, icon, toast } from './ui.js';
import { homeView, hotelView, searchView, wishlistView } from './views/discover.js';
import {
  checkoutView,
  paymentView,
  tripDetailView,
  tripsView,
} from './views/booking.js';
import { accountView, loyaltyView, notificationsView } from './views/account.js';
import { partnerView } from './views/partner.js';
import { adminView } from './views/admin.js';

const ROUTES = [
  { pattern: /^\/$/, view: homeView },
  { pattern: /^\/search$/, view: searchView },
  { pattern: /^\/hotel\/([^/]+)$/, view: hotelView, keys: ['id'] },
  { pattern: /^\/checkout\/([^/]+)$/, view: checkoutView, keys: ['id'] },
  { pattern: /^\/pay\/([^/]+)$/, view: paymentView, keys: ['id'] },
  { pattern: /^\/trips$/, view: tripsView },
  { pattern: /^\/trips\/([^/]+)$/, view: tripDetailView, keys: ['id'] },
  { pattern: /^\/wishlist$/, view: wishlistView },
  { pattern: /^\/account$/, view: accountView },
  { pattern: /^\/loyalty$/, view: loyaltyView },
  { pattern: /^\/notifications$/, view: notificationsView },
  { pattern: /^\/partner$/, view: partnerView },
  { pattern: /^\/admin$/, view: adminView },
];

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const path = (pathPart || '/').replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { path, query };
}

export function navigate(href, { replace = false } = {}) {
  if (replace) {
    const url = new URL(location.href);
    url.hash = href.startsWith('#') ? href : `#${href}`;
    history.replaceState(null, '', url);
    renderRoute();
    return;
  }
  location.hash = href.startsWith('#') ? href : `#${href}`;
}

function notFound() {
  return `<div class="wrap section">
    <div class="empty" style="padding:70px 20px">
      <div class="empty-icon">${icon('search', 24)}</div>
      <h1 style="font-size:1.8rem">Halaman tidak ditemukan</h1>
      <p class="mt-8">Tautan yang Anda buka tidak tersedia. Mulai lagi dari beranda atau cari penginapan.</p>
      <div class="row mt-24" style="justify-content:center">
        <a class="btn btn-primary" href="#/">Ke beranda</a>
        <a class="btn btn-outline" href="#/search">Cari hotel</a>
      </div>
    </div>
  </div>`;
}

function errorView(error) {
  const status = error?.status;
  const message =
    error?.message ||
    'Terjadi kesalahan saat memuat halaman ini. Coba muat ulang.';
  return `<div class="wrap section">
    <div class="error-panel">
      <div class="empty-icon" style="margin:0 auto 12px">${icon('alert', 24)}</div>
      <h1 style="font-size:1.6rem">${status === 404 ? 'Data tidak ditemukan' : 'Ada yang tidak beres'}</h1>
      <p class="muted mt-8">${esc(message)}</p>
      <div class="row mt-24" style="justify-content:center">
        <button class="btn btn-primary" type="button" data-retry>Muat ulang halaman</button>
        <a class="btn btn-outline" href="#/">Ke beranda</a>
      </div>
    </div>
  </div>`;
}

let currentToken = 0;

async function renderRoute({ scroll = true } = {}) {
  const token = ++currentToken;
  const { path, query } = parseHash();
  const root = document.getElementById('app');

  refreshShell();

  const route = ROUTES.find((entry) => entry.pattern.test(path));
  if (!route) {
    root.innerHTML = notFound();
    document.title = 'Tidak ditemukan — Hotel Reserve';
    if (scroll) window.scrollTo({ top: 0 });
    return;
  }

  if (!root.querySelector('.boot')) {
    root.innerHTML = `<div class="wrap section">
      <div class="skeleton skeleton-line" style="width:26%;height:22px"></div>
      <div class="skeleton skeleton-line" style="width:52%;height:38px;margin-top:14px"></div>
      <div class="skeleton" style="height:270px;margin-top:24px"></div>
    </div>`;
  }

  const match = path.match(route.pattern);
  const params = {};
  (route.keys || []).forEach((key, index) => {
    params[key] = decodeURIComponent(match[index + 1] || '');
  });

  try {
    const result = await route.view({ params, query, path });
    if (token !== currentToken) return;
    root.innerHTML = result.html;
    document.title = result.title || 'Hotel Reserve';
    result.mount?.(root, { params, query });
    if (scroll) window.scrollTo({ top: 0 });
  } catch (error) {
    if (token !== currentToken) return;
    console.error('[hotel-reserve]', error);
    root.innerHTML = errorView(error);
    document.title = 'Kesalahan — Hotel Reserve';
    root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  }
}

window.addEventListener('hashchange', () => renderRoute());
window.addEventListener('hr:refresh', () => renderRoute({ scroll: false }));
window.addEventListener('hr:session', () => refreshShell());
window.addEventListener('hr:unauthorized', () => {
  toast('Sesi Anda berakhir. Silakan masuk kembali.', 'error');
  refreshShell();
  renderRoute({ scroll: false });
});

if (!location.hash) {
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
}

renderRoute();

/* Useful for debugging the demo from the console. */
window.hotelReserve = { session, renderRoute };
