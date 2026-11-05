import { api, clearSession, session, setSession } from './api.js';
import { esc, icon, initials, modal, setBusy, toast } from './ui.js';

const DASHBOARD = {
  partner: { href: '#/partner', label: 'Dashboard mitra', icon: 'building' },
  staff: { href: '#/partner', label: 'Dashboard hotel', icon: 'building' },
  admin: { href: '#/admin', label: 'Admin panel', icon: 'shield' },
};

function currentPath() {
  return (location.hash.replace(/^#/, '').split('?')[0] || '/').replace(/\/$/, '') || '/';
}

function navClass(href) {
  const path = href.replace(/^#/, '').split('?')[0];
  const active = path === '/' ? currentPath() === '/' : currentPath().startsWith(path.split('/').slice(0, 2).join('/'));
  return `nav-link${active ? ' active' : ''}`;
}

function headerHtml() {
  const user = session.user;
  const dashboard = DASHBOARD[user?.role];
  return `<div class="wrap header-inner">
    <a class="logo" href="#/" aria-label="Hotel Reserve, ke beranda">
      <span class="logo-mark">HR</span>
      <span class="logo-text">Hotel Reserve<span>Stay, collected</span></span>
    </a>
    <nav class="main-nav" aria-label="Navigasi utama">
      <a class="${navClass('#/search')}" href="#/search">Jelajahi</a>
      ${user ? `<a class="${navClass('#/trips')}" href="#/trips">Perjalanan</a>
        <a class="${navClass('#/wishlist')}" href="#/wishlist">Wishlist</a>
        <a class="${navClass('#/loyalty')}" href="#/loyalty">Poin</a>` : ''}
      ${dashboard ? `<a class="${navClass(dashboard.href)}" href="${dashboard.href}">${dashboard.label}</a>` : ''}
    </nav>
    <div class="header-actions">
      ${
        user
          ? `<a class="icon-btn" href="#/notifications" aria-label="Notifikasi">${icon('bell', 17)}<span class="dot hidden" data-notif-dot></span></a>
             <div class="user-menu">
               <button class="avatar" type="button" data-user-toggle aria-label="Menu akun ${esc(user.name)}" aria-expanded="false">${esc(initials(user.name))}</button>
             </div>`
          : `<button class="btn btn-outline btn-sm" type="button" data-login>Masuk</button>
             <button class="btn btn-primary btn-sm" type="button" data-register>Daftar</button>`
      }
    </div>
  </div>`;
}

export function renderFooter() {
  return `<div class="wrap footer-grid">
    <div class="footer-brand">
      <a class="logo" href="#/" style="color:#f4efe0">
        <span class="logo-mark">HR</span>
        <span class="logo-text">Hotel Reserve<span style="color:#9db3a8">Stay, collected</span></span>
      </a>
      <p>Platform reservasi hotel independen untuk hotel, vila, dan penginapan terkurasi di Indonesia. Harga transparan, konfirmasi jelas, poin setiap menginap.</p>
    </div>
    <div>
      <h4>Jelajahi</h4>
      <a href="#/search?city=Bali">Hotel di Bali</a>
      <a href="#/search?city=Jakarta">Hotel di Jakarta</a>
      <a href="#/search?city=Yogyakarta">Hotel di Yogyakarta</a>
      <a href="#/search">Semua properti</a>
    </div>
    <div>
      <h4>Akun</h4>
      <a href="#/trips">Perjalanan saya</a>
      <a href="#/wishlist">Wishlist</a>
      <a href="#/loyalty">Poin &amp; membership</a>
      <a href="#/notifications">Notifikasi</a>
    </div>
    <div>
      <h4>Untuk mitra</h4>
      <a href="#/partner">Dashboard hotel</a>
      <a href="#/partner?tab=properti">Daftarkan properti</a>
      <a href="#/admin">Admin platform</a>
      <a href="#/account">Pusat akun</a>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} Hotel Reserve. Prototipe demo — pembayaran disimulasikan.</span>
    <span>Integrasi Traveloka: placeholder (belum aktif)</span>
  </div>`;
}

export function refreshShell() {
  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  if (header) {
    header.innerHTML = headerHtml();
    bindHeader();
    loadUnread();
  }
  if (footer) footer.innerHTML = renderFooter();
}

function bindHeader() {
  const header = document.getElementById('site-header');
  header.querySelector('[data-login]')?.addEventListener('click', () => openAuth({ mode: 'login' }));
  header.querySelector('[data-register]')?.addEventListener('click', () => openAuth({ mode: 'register' }));

  const toggle = header.querySelector('[data-user-toggle]');
  if (toggle) {
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const existing = header.querySelector('.menu-pop');
      if (existing) {
        existing.remove();
        toggle.setAttribute('aria-expanded', 'false');
        return;
      }
      const user = session.user;
      const dashboard = DASHBOARD[user.role];
      const menu = document.createElement('div');
      menu.className = 'menu-pop';
      menu.innerHTML = `
        <div class="menu-head">
          <strong>${esc(user.name)}</strong>
          <span>${esc(user.email)}</span>
          <span class="role-tag">${esc(user.role === 'customer' ? 'Tamu' : user.role === 'staff' ? 'Staf hotel' : user.role === 'partner' ? 'Mitra hotel' : 'Administrator')}</span>
        </div>
        <a href="#/trips">${icon('ticket', 16)} Perjalanan saya</a>
        <a href="#/wishlist">${icon('heart', 16)} Wishlist</a>
        <a href="#/loyalty">${icon('star', 16)} Poin &amp; membership</a>
        <a href="#/account">${icon('user', 16)} Pengaturan akun</a>
        ${dashboard ? `<a href="${dashboard.href}">${icon(dashboard.icon, 16)} ${dashboard.label}</a>` : ''}
        <button type="button" data-logout>${icon('logout', 16)} Keluar</button>`;
      header.querySelector('.user-menu').appendChild(menu);
      toggle.setAttribute('aria-expanded', 'true');
      menu.querySelector('[data-logout]').addEventListener('click', () => {
        clearSession();
        refreshShell();
        toast('Anda sudah keluar.');
        location.hash = '#/';
        window.dispatchEvent(new CustomEvent('hr:session', { detail: null }));
      });
      const close = (event) => {
        if (!menu.contains(event.target) && event.target !== toggle) {
          menu.remove();
          toggle.setAttribute('aria-expanded', 'false');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    });
  }
}

async function loadUnread() {
  if (!session.token) return;
  try {
    const data = await api('/notifications');
    const dot = document.querySelector('[data-notif-dot]');
    if (dot) dot.classList.toggle('hidden', !data.unread);
  } catch {
    /* silent; the bell still links to the notification page */
  }
}

/* ------------------------------- auth -------------------------------- */

export function openAuth({ mode = 'login', message = '', onSuccess, onClose } = {}) {
  let finished = false;
  let currentMode = mode;

  const body = `
    <div class="auth-switch" role="tablist">
      <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}" role="tab">Masuk</button>
      <button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}" role="tab">Daftar</button>
    </div>
    <div class="form-error hidden" data-error></div>
    <form data-login-form class="${mode === 'login' ? '' : 'hidden'}">
      <div class="field"><label for="login-email">Email</label><input class="input" id="login-email" name="email" type="email" autocomplete="email" placeholder="nama@email.com" required /></div>
      <div class="field mt-12"><label for="login-password">Kata sandi</label><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required /></div>
      <button class="btn btn-primary btn-block mt-16" type="submit">Masuk</button>
    </form>
    <form data-register-form class="${mode === 'register' ? '' : 'hidden'}">
      <div class="field"><label for="reg-name">Nama lengkap</label><input class="input" id="reg-name" name="name" autocomplete="name" placeholder="Nama sesuai identitas" required /></div>
      <div class="form-grid mt-12">
        <div class="field span-2"><label for="reg-email">Email</label><input class="input" id="reg-email" name="email" type="email" autocomplete="email" placeholder="nama@email.com" required /></div>
        <div class="field"><label for="reg-phone">Nomor HP</label><input class="input" id="reg-phone" name="phone" inputmode="tel" placeholder="0812xxxxxxx" required /></div>
        <div class="field"><label for="reg-password">Kata sandi</label><input class="input" id="reg-password" name="password" type="password" autocomplete="new-password" placeholder="Min. 8 karakter" minlength="8" required /></div>
      </div>
      <button class="btn btn-primary btn-block mt-16" type="submit">Buat akun</button>
      <p class="help mt-8">Dengan mendaftar Anda menyetujui ketentuan demo Hotel Reserve. Data disimpan lokal di perangkat server ini.</p>
    </form>
    <div class="demo-accounts mt-16">
      <strong>Akun demo</strong>
      <button type="button" data-demo="demo@hotelreserve.id"><span>Tamu · demo@hotelreserve.id</span><code>password123</code></button>
      <button type="button" data-demo="partner@hotelreserve.id"><span>Mitra · partner@hotelreserve.id</span><code>password123</code></button>
      <button type="button" data-demo="admin@hotelreserve.id"><span>Admin · admin@hotelreserve.id</span><code>password123</code></button>
    </div>`;

  const dialog = modal({
    title: mode === 'login' ? 'Masuk ke Hotel Reserve' : 'Buat akun Hotel Reserve',
    subtitle: message || 'Simpan perjalanan, kumpulkan poin, dan kelola reservasi Anda.',
    body,
    onClose: () => {
      if (!finished) onClose?.();
    },
  });

  const root = dialog.card;
  const errorBox = root.querySelector('[data-error]');
  const loginForm = root.querySelector('[data-login-form]');
  const registerForm = root.querySelector('[data-register-form]');

  const setMode = (next) => {
    currentMode = next;
    root.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === next);
    });
    loginForm.classList.toggle('hidden', next !== 'login');
    registerForm.classList.toggle('hidden', next !== 'register');
    root.querySelector('.modal-head h3').textContent =
      next === 'login' ? 'Masuk ke Hotel Reserve' : 'Buat akun Hotel Reserve';
    errorBox.classList.add('hidden');
  };

  root.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  const fail = (messageText) => {
    errorBox.textContent = messageText;
    errorBox.classList.remove('hidden');
  };

  const authenticate = async (path, payload) => {
    const data = await api(path, { method: 'POST', body: payload, auth: false });
    setSession({ token: data.token, user: data.user });
    finished = true;
    dialog.close();
    refreshShell();
    toast(`Selamat datang, ${data.user.name.split(' ')[0]}.`);
    onSuccess?.(data.user);
    window.dispatchEvent(new CustomEvent('hr:session', { detail: data.user }));
  };

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = loginForm.querySelector('button[type="submit"]');
    errorBox.classList.add('hidden');
    setBusy(button, true, 'Memeriksa…');
    try {
      await authenticate('/auth/login', {
        email: loginForm.email.value.trim(),
        password: loginForm.password.value,
      });
    } catch (error) {
      fail(error.message);
    } finally {
      setBusy(button, false);
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = registerForm.querySelector('button[type="submit"]');
    errorBox.classList.add('hidden');
    setBusy(button, true, 'Mendaftarkan…');
    try {
      await authenticate('/auth/register', {
        name: registerForm.name.value.trim(),
        email: registerForm.email.value.trim(),
        phone: registerForm.phone.value.trim(),
        password: registerForm.password.value,
      });
    } catch (error) {
      fail(error.message);
    } finally {
      setBusy(button, false);
    }
  });

  root.querySelectorAll('[data-demo]').forEach((button) => {
    button.addEventListener('click', async () => {
      setMode('login');
      loginForm.email.value = button.dataset.demo;
      loginForm.password.value = 'password123';
      errorBox.classList.add('hidden');
      const submit = loginForm.querySelector('button[type="submit"]');
      setBusy(submit, true, 'Masuk sebagai demo…');
      try {
        await authenticate('/auth/login', { email: button.dataset.demo, password: 'password123' });
      } catch (error) {
        fail(error.message);
      } finally {
        setBusy(submit, false);
      }
    });
  });
}

export function ensureSession(reason = 'Masuk dulu untuk melanjutkan.') {
  if (session.user) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openAuth({ mode: 'login', message: reason, onSuccess: () => done(true), onClose: () => done(false) });
  });
}

export function ensureRole(roles, reason) {
  if (session.user && roles.includes(session.user.role)) return true;
  return false;
}

