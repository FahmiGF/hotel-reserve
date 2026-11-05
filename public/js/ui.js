/* Shared helpers, icons, and small UI primitives. */

export const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);

export const money = (value) => `Rp${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;

export const compactMoney = (value) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `Rp${(n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return money(n);
};

export const number = (value) => Number(value || 0).toLocaleString('id-ID');

export function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDaysKey(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const nightsBetween = (checkIn, checkOut) =>
  Math.max(0, Math.round((dateFromKey(checkOut) - dateFromKey(checkIn)) / 86_400_000));

export function dateLong(key) {
  if (!key) return '—';
  return dateFromKey(key).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateWithDay(key) {
  if (!key) return '—';
  return dateFromKey(key).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateRange(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 'Pilih tanggal';
  const a = dateFromKey(checkIn);
  const b = dateFromKey(checkOut);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString('id-ID', { day: 'numeric', month: sameMonth ? undefined : 'short' });
  const right = b.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
}

export function relative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return dateLong(String(iso).slice(0, 10));
}

export const initials = (name = '') =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'HR';

/* ------------------------------- icons ------------------------------- */

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  users: '<path d="M16 20v-1.6A4.4 4.4 0 0 0 11.6 14H8.4A4.4 4.4 0 0 0 4 18.4V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a4.4 4.4 0 0 0-3.3-4.3M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/>',
  bed: '<path d="M3 18v-7M21 18v-5a3 3 0 0 0-3-3h-8v8M3 13h18M6 9V6"/>',
  star: '<path d="m12 3 2.6 5.7 6.2.7-4.6 4.2 1.2 6.1L12 16.8 6.6 19.7l1.2-6.1L3.2 9.4l6.2-.7Z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M12 20s-7.2-4.4-7.2-9.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.2 3C19.2 15.6 12 20 12 20Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  check: '<path d="m5 13 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  wifi: '<path d="M4 9a13 13 0 0 1 16 0M7 12.6a8.5 8.5 0 0 1 10 0M9.8 16a4.2 4.2 0 0 1 4.4 0"/><circle cx="12" cy="19" r=".9" fill="currentColor"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M6 4v2M10 4v2M14 4v2"/>',
  shield: '<path d="M12 3 5 6v5c0 5 7 10 7 10s7-5 7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
  tag: '<path d="M20 13 13 20a2 2 0 0 1-2.8 0L4 13.8V4h9.8L20 10.2a2 2 0 0 1 0 2.8Z"/><circle cx="8.5" cy="8.5" r="1.5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M13 6v12" stroke-dasharray="2 3"/>',
  chart: '<path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M15 21V10h4a2 2 0 0 1 2 2v9M3 21h18"/><path d="M8 7h3M8 11h3M8 15h3"/>',
  logout: '<path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="M14 6l4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M18.5 15.5 19 17l1.5.5-1.5.5-.5 1.5-.5-1.5L16.5 17l1.5-.5Z"/>',
  waves: '<path d="M3 12c3-3 6-3 9 0s6 3 9 0M3 17c3-3 6-3 9 0s6 3 9 0"/>',
  car: '<path d="M4 16v-3l2-5h12l2 5v3M4 16h16M6 16v2M18 16v2"/><circle cx="8" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/>',
  plane: '<path d="M10.5 13.5 3 11V8.5l7.5 1L14 4h2.5l-2 6.5 5.5 2v2.5l-6-1-2 5H9.5Z"/>',
  utensils: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11M17 3c-1.5 2-2 4-2 6s.5 3 2 3 2-1 2-3-.5-4-2-6ZM17 12v9"/>',
  dumbbell: '<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V8a4 4 0 0 1 8 0v2M12 14v2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M6 3h3l1.5 4.5L8.5 9.5a12 12 0 0 0 6 6l2-2 4.5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-6a8 8 0 0 1 8-8h1a8 8 0 0 1 8 3Z"/><path d="M8.5 11.5h.5M12 11.5h.5M15.5 11.5h.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  home: '<path d="m4 10 8-6 8 6v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M9 21v-7h6v7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

export function icon(name, size = 18) {
  const path = ICONS[name] || ICONS.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const FACILITY_ICONS = [
  [/wifi|internet/i, 'wifi'],
  [/sarapan|restoran|bar|kuliner|kafe/i, 'coffee'],
  [/kolam|renang|pool/i, 'waves'],
  [/parkir|valet/i, 'car'],
  [/gym|fitness/i, 'dumbbell'],
  [/spa|wellness|massage/i, 'sparkle'],
  [/antar|jemput|bandara|shuttle/i, 'plane'],
  [/ac|pendingin/i, 'sun'],
  [/dapur|kitchen/i, 'utensils'],
  [/resepsionis|24 jam|lobby/i, 'clock'],
  [/keamanan|cctv|security/i, 'shield'],
  [/binatu|laundry/i, 'waves'],
];

export function facilityIcon(name) {
  const match = FACILITY_ICONS.find(([pattern]) => pattern.test(String(name)));
  return icon(match ? match[1] : 'check', 16);
}

export const stars = (count) =>
  `<span class="stars" aria-label="${count} bintang">${'★'.repeat(Number(count) || 0)}</span>`;

export function ratingBadge(rating, count) {
  const value = Number(rating) || 0;
  const low = value < 4;
  return `<span class="rating-line"><span class="rating-badge${low ? ' low' : ''}">${icon('star', 11)}${value.toFixed(1)}</span>${
    count === undefined || count === null ? '' : `<span class="tiny muted">${number(count)} ulasan</span>`
  }</span>`;
}

const SAFE_HEX = /^#[0-9a-f]{3,8}$/i;

export function art(image, { label = '', sub = '', className = '' } = {}) {
  const raw = Array.isArray(image?.colors) && image.colors.length >= 3 ? image.colors : [];
  const colors = raw.map((color) => (SAFE_HEX.test(String(color)) ? color : '#3f7d54'));
  while (colors.length < 3) colors.push(['#132e1f', '#3f7d54', '#a7f3d0'][colors.length]);
  return `<div class="art ${className}" style="--c1:${colors[0]};--c2:${colors[1]};--c3:${colors[2]}">${
    label ? `<div class="art-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>` : ''
  }</div>`;
}

export const hotelArt = (hotel, opts = {}) =>
  art(hotel?.images?.[0], { label: hotel?.city || 'Indonesia', ...opts });

/* ----------------------------- status pills -------------------------- */

const STATUS = {
  pending_payment: ['Menunggu pembayaran', 'warn'],
  pending_confirmation: ['Menunggu konfirmasi', 'info'],
  confirmed: ['Terkonfirmasi', 'ok'],
  checked_in: ['Sedang menginap', 'info'],
  completed: ['Selesai', 'neutral'],
  cancelled: ['Dibatalkan', 'danger'],
  expired: ['Kedaluwarsa', 'danger'],
  rejected: ['Ditolak', 'danger'],
  paid: ['Lunas', 'ok'],
  refunded: ['Direfund', 'gold'],
  refund: ['Refund', 'gold'],
  failed: ['Gagal', 'danger'],
  pending: ['Menunggu', 'warn'],
  on_arrival: ['Bayar di hotel', 'info'],
  active: ['Aktif', 'ok'],
  suspended: ['Dibekukan', 'danger'],
  verified: ['Terverifikasi', 'ok'],
  approved: ['Disetujui', 'ok'],
  processed: ['Diproses', 'ok'],
  open: ['Terbuka', 'warn'],
  hidden: ['Disembunyikan', 'neutral'],
  none: ['—', 'neutral'],
};

export function pill(status) {
  const [label, tone] = STATUS[status] || [String(status || '—').replace(/_/g, ' '), 'neutral'];
  return `<span class="pill pill-${tone}">${esc(label)}</span>`;
}

export const PHASES = {
  upcoming: 'Akan datang',
  active: 'Sedang berlangsung',
  past: 'Selesai',
  cancelled: 'Dibatalkan',
};

export const phaseLabel = (phase) => PHASES[phase] || 'Semua';

/* -------------------------------- toast ------------------------------ */

export function toast(message, type = 'ok', timeout = 4200) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${icon(type === 'error' ? 'alert' : 'check', 16)}</span><span>${esc(message)}</span>`;
  root.appendChild(node);
  const remove = () => node.remove();
  node.addEventListener('click', remove);
  setTimeout(remove, timeout);
}

/* -------------------------------- modal ------------------------------ */

export function modal({ title, subtitle = '', body = '', footer = '', wide = false, onMount, onClose }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal-card${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head">
      <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
      <button class="modal-close" type="button" aria-label="Tutup">${icon('x', 16)}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  root.appendChild(backdrop);

  const card = backdrop.querySelector('.modal-card');
  const previous = document.activeElement;

  const onKey = (event) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...card.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (previous instanceof HTMLElement) previous.focus();
    onClose?.();
  }

  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector('.modal-close').addEventListener('click', close);
  onMount?.(card, close);
  requestAnimationFrame(() => {
    const target = card.querySelector('input:not([type="hidden"]), select, textarea, button.btn-primary, button');
    target?.focus();
  });
  return { card, close };
}

export function confirmDialog({
  title = 'Konfirmasi',
  message = '',
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const dialog = modal({
      title,
      body: `<p class="prose">${esc(message)}</p>`,
      footer: `<button class="btn btn-soft" type="button" data-cancel>${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" type="button" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => finish(false),
    });
    dialog.card.querySelector('[data-cancel]').onclick = () => {
      finish(false);
      dialog.close();
    };
    dialog.card.querySelector('[data-ok]').onclick = () => {
      finish(true);
      dialog.close();
    };
  });
}

export function promptDialog({
  title,
  label = '',
  value = '',
  placeholder = '',
  confirmLabel = 'Simpan',
  multiline = false,
  hint = '',
  required = true,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const field = multiline
      ? `<textarea class="textarea" name="value" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input class="input" name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" />`;
    const dialog = modal({
      title,
      body: `<form data-form><div class="field"><label>${esc(label)}</label>${field}${
        hint ? `<span class="help">${esc(hint)}</span>` : ''
      }</div><div class="form-error hidden mt-12" data-error></div></form>`,
      footer: `<button class="btn btn-soft" type="button" data-cancel>Batal</button>
        <button class="btn btn-primary" type="button" data-ok>${esc(confirmLabel)}</button>`,
      onClose: () => finish(null),
    });
    const form = dialog.card.querySelector('[data-form]');
    const input = form.querySelector('[name="value"]');
    const error = dialog.card.querySelector('[data-error]');
    const submit = () => {
      const text = input.value.trim();
      if (required && text.length < 1) {
        error.textContent = 'Kolom ini wajib diisi.';
        error.classList.remove('hidden');
        input.focus();
        return;
      }
      finish(text);
      dialog.close();
    };
    dialog.card.querySelector('[data-ok]').onclick = submit;
    dialog.card.querySelector('[data-cancel]').onclick = () => {
      finish(null);
      dialog.close();
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submit();
    });
    requestAnimationFrame(() => input.focus());
  });
}

/* ------------------------------- helpers ----------------------------- */

export function setBusy(button, busy, label = 'Memproses…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

export function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 22)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action ? `<div class="mt-16">${action}</div>` : ''}
  </div>`;
}

export function skeletonCards(count = 6) {
  return `<div class="hotel-grid">${Array.from(
    { length: count },
    () => `<div class="card" style="overflow:hidden"><div class="skeleton" style="height:190px;border-radius:0"></div><div class="card-pad"><div class="skeleton skeleton-line" style="width:40%"></div><div class="skeleton skeleton-line" style="width:75%"></div><div class="skeleton skeleton-line" style="width:55%"></div></div></div>`,
  ).join('')}</div>`;
}

export function qrMock(seed) {
  const size = 21;
  let hash = 2166136261;
  const text = String(seed || 'hotel-reserve');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const cells = new Array(size * size).fill(false);
  for (let i = 0; i < cells.length; i += 1) {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    cells[i] = ((hash >>> 15) & 100) < 45;
  }
  const set = (x, y, value) => {
    if (x >= 0 && y >= 0 && x < size && y < size) cells[y * size + x] = value;
  };
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        set(ox + x, oy + y, edge || core);
      }
    }
    for (let i = 8; i < 12; i += 1) {
      set(ox + (ox ? 0 : 7), oy + i, false);
      set(ox + i, oy + (oy ? 0 : 7), false);
    }
  }
  return `<div class="qr-demo" role="img" aria-label="Kode QR e-voucher (demo)">${cells
    .map((on) => `<i class="${on ? 'on' : ''}"></i>`)
    .join('')}</div>`;
}

export async function copyText(text, message = 'Disalin ke papan klip.') {
  try {
    await navigator.clipboard.writeText(String(text));
    toast(message);
  } catch {
    const area = document.createElement('textarea');
    area.value = String(text);
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast(message);
  }
}

export function bookingHref(booking) {
  return `#/trips/${booking.id}`;
}

export function hotelHref(id, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return `#/hotel/${id}${text ? `?${text}` : ''}`;
}

export function searchHref(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return `#/search${text ? `?${text}` : ''}`;
}

export function values(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export const starsInput = (name, value = 5) => `<div class="field"><label>${esc(name)}</label>
  <select class="select" name="rating">
    ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === Number(value) ? 'selected' : ''}>${'★'.repeat(n)} ${n}</option>`).join('')}
  </select></div>`;
