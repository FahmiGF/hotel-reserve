import { api, getMeta, session } from '../api.js';
import { ensureSession, openAuth } from '../shell.js';
import {
  addDaysKey,
  art,
  copyText,
  dateLong,
  dateRange,
  emptyState,
  esc,
  facilityIcon,
  hotelArt,
  hotelHref,
  icon,
  money,
  nightsBetween,
  pill,
  promptDialog,
  ratingBadge,
  searchHref,
  setBusy,
  skeletonCards,
  stars,
  toast,
  todayKey,
  values,
} from '../ui.js';

const tomorrow = () => addDaysKey(todayKey(), 1);

const PROPERTY_LABELS = {
  hotel: 'Hotel',
  villa: 'Vila',
  resort: 'Resor',
  hostel: 'Hostel',
  homestay: 'Homestay',
  apartment: 'Apartemen',
  guesthouse: 'Guest house',
};

const label = (value) =>
  PROPERTY_LABELS[value] ||
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function searchFormHtml({
  q = '',
  checkIn = tomorrow(),
  checkOut = addDaysKey(tomorrow(), 2),
  guests = 2,
  rooms = 1,
  cities = [],
  compact = false,
} = {}) {
  return `<form class="search-card${compact ? ' search-compact' : ''}" data-search-form>
    <div class="search-field">
      <label for="search-q">Tujuan</label>
      <input id="search-q" name="q" list="city-list" placeholder="Kota, area, atau nama hotel" value="${esc(q)}" autocomplete="off" />
      <datalist id="city-list">${cities.map((city) => `<option value="${esc(city)}"></option>`).join('')}</datalist>
    </div>
    <div class="search-field">
      <label for="search-in">Check-in</label>
      <input id="search-in" name="checkIn" type="date" min="${todayKey()}" value="${esc(checkIn)}" />
    </div>
    <div class="search-field">
      <label for="search-out">Check-out</label>
      <input id="search-out" name="checkOut" type="date" min="${addDaysKey(todayKey(), 1)}" value="${esc(checkOut)}" />
    </div>
    <div class="search-field">
      <label for="search-guests">Tamu</label>
      <select id="search-guests" name="guests" class="guests-select">
        ${Array.from({ length: 8 }, (_, index) => index + 1)
          .map((count) => `<option value="${count}" ${count === Number(guests) ? 'selected' : ''}>${count} tamu</option>`)
          .join('')}
      </select>
    </div>
    <input type="hidden" name="rooms" value="${Number(rooms) || 1}" />
    <button class="btn btn-primary search-submit" type="submit">${icon('search', 16)} Cari hotel</button>
  </form>`;
}

export function bindSearchForm(root, onNavigate) {
  const form = root.querySelector('[data-search-form]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = values(form);
    if (!data.checkIn || !data.checkOut) {
      toast('Lengkapi tanggal check-in dan check-out.', 'error');
      return;
    }
    if (data.checkOut <= data.checkIn) {
      toast('Tanggal check-out harus setelah check-in.', 'error');
      return;
    }
    const params = {
      q: data.q?.trim() || '',
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      guests: data.guests,
      rooms: data.rooms,
    };
    const href = searchHref(params);
    if (onNavigate) onNavigate(href);
    else location.hash = href;
  });
}

function hotelCard(item, params = {}) {
  const href = hotelHref(item.id, params);
  const favorite = Boolean(item.favorite);
  return `<article class="hotel-card">
    <div class="hotel-card__media">
      <a href="${href}" aria-label="Lihat ${esc(item.name)}">
        ${hotelArt(item, { sub: item.district })}
      </a>
      <div class="art-badge">${ratingBadge(item.rating, item.reviewCount)}</div>
      <button class="art-heart${favorite ? ' on' : ''}" type="button" data-fav="${item.id}" aria-label="Simpan ${esc(item.name)} ke wishlist" aria-pressed="${favorite}">${icon('heart', 16)}</button>
    </div>
    <div class="hotel-card__body">
      <p class="eyebrow">${esc(label(item.propertyType))} · ${esc(item.city)}</p>
      <h3><a href="${href}">${esc(item.name)}</a></h3>
      <div class="amenity-chips">${(item.facilities || [])
        .slice(0, 3)
        .map((facility) => `<span class="chip">${esc(facility)}</span>`)
        .join('')}</div>
      <p class="hotel-card__desc">${esc(item.tagline || '')}</p>
      <div class="row" style="gap:6px">
        ${item.freeCancellation ? '<span class="chip chip-ok">Batal gratis</span>' : ''}
        ${item.payAtHotel ? '<span class="chip chip-line">Bayar di hotel</span>' : ''}
      </div>
      <div class="hotel-card__foot">
        <div>
          <span class="tiny muted">Mulai dari</span>
          <div class="price">${money(item.fromPrice)} <small>/malam</small></div>
        </div>
        <a class="btn btn-outline btn-xs" href="${href}">Lihat kamar</a>
      </div>
    </div>
  </article>`;
}

function bindFavorites(root) {
  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-fav]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (!(await ensureSession('Masuk untuk menyimpan hotel ke wishlist.'))) return;
    button.disabled = true;
    try {
      const result = await api(`/favorites/${button.dataset.fav}`, { method: 'POST' });
      button.classList.toggle('on', result.favorite);
      button.setAttribute('aria-pressed', String(result.favorite));
      toast(result.favorite ? 'Hotel disimpan ke wishlist.' : 'Hotel dihapus dari wishlist.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
}

function promoCard(promo) {
  return `<div class="promo-card">
    <p class="eyebrow" style="color:#e9d8a6">Promo</p>
    <h3>${esc(promo.title)}</h3>
    <p>${esc(promo.description || '')}</p>
    <button class="code" type="button" data-copy="${esc(promo.code)}" title="Salin kode promo">${esc(promo.code)} ${icon('copy', 12)}</button>
  </div>`;
}

function bindCopy(root) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    copyText(button.dataset.copy, `Kode ${button.dataset.copy} disalin.`);
  });
}

/* --------------------------------- home -------------------------------- */

export async function homeView() {
  const data = await api('/home');
  const cities = data.destinations.map((item) => item.city);
  const picks = data.featured.slice(0, 3);
  const heroMain = picks[0];
  const heroSmall = picks[1];

  const html = `
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Reservasi langsung · Tanpa perantara</p>
          <h1>Menginap yang berkesan,<br /><em>dimulai dari sini.</em></h1>
          <p>Hotel, vila, dan penginapan terkurasi di kota-kota terbaik Indonesia. Harga akhir terlihat sejak awal, konfirmasi cepat, dan setiap malam mengumpulkan poin.</p>
          ${searchFormHtml({ cities })}
          <div class="hero-stats">
            <div><strong>${data.stats.hotels}</strong><span>Properti terverifikasi</span></div>
            <div><strong>${data.stats.cities}</strong><span>Kota &amp; destinasi</span></div>
            <div><strong>${data.stats.bookings}+</strong><span>Menginap selesai</span></div>
          </div>
        </div>
        <div class="hero-art">
          ${
            heroMain
              ? art(heroMain.images?.[0], {
                  className: 'art-main',
                  label: heroMain.city,
                  sub: heroMain.name,
                })
              : ''
          }
          ${
            heroSmall
              ? art(heroSmall.images?.[0], { className: 'art-small', label: heroSmall.city })
              : ''
          }
          ${
            picks[2]
              ? art(picks[2].images?.[1] || picks[2].images?.[0], { className: 'art-small two', label: picks[2].city })
              : ''
          }
          ${
            heroMain
              ? `<div class="float-card">
                  <div class="stars">★★★★★</div>
                  <strong>${heroMain.rating.toFixed(1)} / 5</strong>
                  <span class="muted">${heroMain.reviewCount} ulasan tamu</span>
                </div>`
              : ''
          }
        </div>
      </div>
    </section>

    ${
      data.promos.length
        ? `<section class="wrap section-tight"><div class="promo-rail">${data.promos.slice(0, 3).map(promoCard).join('')}</div></section>`
        : ''
    }

    <section class="wrap section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Destinasi pilihan</p>
          <h2>Ke mana minggu ini?</h2>
          <p>Dari hiruk-pikuk Jakarta sampai tenangnya Ubud, pilih kota dan biarkan kami menunjukkan penginapan terbaiknya.</p>
        </div>
        <a class="btn btn-outline btn-sm" href="#/search">Jelajahi semua ${icon('arrow', 15)}</a>
      </div>
      <div class="dest-grid">
        ${data.destinations
          .slice(0, 8)
          .map(
            (item) => `<a class="dest-card" href="${searchHref({ city: item.city })}">
              ${art(item.image, { label: '', className: '' })}
              <div class="dest-meta">
                <strong>${esc(item.city)}</strong>
                <span>${item.count} properti · mulai ${money(item.minPrice)}</span>
              </div>
            </a>`,
          )
          .join('')}
      </div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="section-head">
        <div>
          <p class="eyebrow">Terbaik bulan ini</p>
          <h2>Menginap yang paling disukai tamu</h2>
        </div>
        <a class="btn-link" href="#/search?sort=rating">Lihat peringkat tertinggi</a>
      </div>
      <div class="hotel-grid">${data.featured.map((item) => hotelCard(item)).join('')}</div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="feature-grid">
        <div class="feature">
          <div class="icon-badge">${icon('tag', 20)}</div>
          <h3>Harga transparan</h3>
          <p>Pajak, biaya layanan, dan diskon promo dihitung di muka — tanpa kejutan saat membayar.</p>
        </div>
        <div class="feature">
          <div class="icon-badge">${icon('shield', 20)}</div>
          <h3>Kamar ditahan untuk Anda</h3>
          <p>Inventori dikunci 15 menit saat Anda mulai memesan, sehingga kamar terakhir tidak direbut orang lain.</p>
        </div>
        <div class="feature">
          <div class="icon-badge">${icon('ticket', 20)}</div>
          <h3>E-voucher &amp; check-in mudah</h3>
          <p>Kode booking dan voucher digital langsung tersedia; hotel memverifikasi dalam hitungan detik.</p>
        </div>
        <div class="feature">
          <div class="icon-badge">${icon('star', 20)}</div>
          <h3>Poin setiap menginap</h3>
          <p>Kumpulkan poin dari setiap malam, naik tier Bronze hingga Platinum, dan tukar poin jadi diskon.</p>
        </div>
      </div>
    </section>

    <section class="wrap section" style="padding-top:0">
      <div class="partner-cta">
        <div>
          <p class="eyebrow" style="color:#e9d8a6">Untuk pemilik properti</p>
          <h2>Tampilkan hotel Anda di Hotel Reserve</h2>
          <p>Kelola kamar, harga musiman, inventori, dan reservasi dari satu dashboard. Komisi transparan, pembayaran tercatat otomatis, ulasan tamu dapat dibalas langsung.</p>
        </div>
        <a class="btn btn-gold btn-lg" href="#/partner">Buka dashboard mitra ${icon('arrow', 16)}</a>
      </div>
    </section>`;

  return {
    html,
    title: 'Hotel Reserve — Menginap yang berkesan',
    mount(root) {
      bindSearchForm(root);
      bindFavorites(root);
      bindCopy(root);
    },
  };
}

/* -------------------------------- search ------------------------------- */

const SORT_OPTIONS = [
  ['recommended', 'Rekomendasi'],
  ['price_asc', 'Harga terendah'],
  ['price_desc', 'Harga tertinggi'],
  ['rating', 'Rating tertinggi'],
  ['popularity', 'Paling populer'],
];

export async function searchView({ query }) {
  const meta = await getMeta();
  const params = {
    q: query.q || '',
    city: query.city || '',
    checkIn: query.checkIn || '',
    checkOut: query.checkOut || '',
    guests: query.guests || '2',
    rooms: query.rooms || '1',
    stars: query.stars || '',
    propertyType: query.propertyType || '',
    facilities: query.facilities || '',
    minPrice: query.minPrice || '',
    maxPrice: query.maxPrice || '',
    guestRating: query.guestRating || '',
    freeCancellation: query.freeCancellation || '',
    payAtHotel: query.payAtHotel || '',
    sort: query.sort || 'recommended',
  };

  const apiParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ''));
  const data = await api(`/hotels${new URLSearchParams(apiParams).toString() ? `?${new URLSearchParams(apiParams)}` : ''}`);

  const facilityList = meta.facilities || [];
  const selectedFacilities = params.facilities ? params.facilities.split(',') : [];
  const hasFilters = ['stars', 'propertyType', 'facilities', 'minPrice', 'maxPrice', 'guestRating', 'freeCancellation', 'payAtHotel'].some(
    (key) => params[key],
  );
  const contextParams = {
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests: params.guests,
    rooms: params.rooms,
  };

  const activeChips = [];
  if (params.q) activeChips.push(['q', `“${params.q}”`]);
  if (params.city) activeChips.push(['city', params.city]);
  if (params.stars) activeChips.push(['stars', `${params.stars} bintang`]);
  if (params.propertyType) activeChips.push(['propertyType', label(params.propertyType)]);
  if (params.facilities)
    activeChips.push(['facilities', `${selectedFacilities.length} fasilitas`]);
  if (params.minPrice) activeChips.push(['minPrice', `Min ${money(params.minPrice)}`]);
  if (params.maxPrice) activeChips.push(['maxPrice', `Maks ${money(params.maxPrice)}`]);
  if (params.guestRating) activeChips.push(['guestRating', `Rating ${params.guestRating}`]);
  if (params.freeCancellation) activeChips.push(['freeCancellation', 'Batal gratis']);
  if (params.payAtHotel) activeChips.push(['payAtHotel', 'Bayar di hotel']);

  const heading = params.city
    ? `Hotel di ${params.city}`
    : params.q
      ? `Hasil untuk “${params.q}”`
      : 'Semua hotel & penginapan';

  const html = `
    <div class="wrap page-head">
      <div class="breadcrumb"><a href="#/">Beranda</a><span>/</span><span>${esc(heading)}</span></div>
      <div class="between mt-12">
        <h1 style="font-size:clamp(1.7rem,3.4vw,2.4rem)">${esc(heading)}</h1>
        <span class="muted small">${data.total} properti ditemukan</span>
      </div>
      <div class="mt-16">${searchFormHtml({
        q: params.q,
        checkIn: params.checkIn || tomorrow(),
        checkOut: params.checkOut || addDaysKey(tomorrow(), 2),
        guests: params.guests,
        rooms: params.rooms,
        cities: data.cities || [],
        compact: true,
      })}</div>
    </div>

    <div class="wrap search-layout mt-24">
      <form class="filters" data-filter-form>
        <div class="filter-card">
          <div class="between mb-8"><h4 style="margin:0">Filter</h4>${hasFilters ? '<a class="btn-link tiny" href="#/search">Reset</a>' : ''}</div>
          <div class="filter-list">
            <div class="field"><label for="f-sort">Urutkan</label>
              <select class="select" id="f-sort" name="sort">
                ${SORT_OPTIONS.map(([value, text]) => `<option value="${value}" ${params.sort === value ? 'selected' : ''}>${text}</option>`).join('')}
              </select>
            </div>
            <div class="field mt-8"><label>Harga per malam</label>
              <div class="price-inputs">
                <input class="input" name="minPrice" type="number" min="0" step="50000" placeholder="Min" value="${esc(params.minPrice)}" />
                <input class="input" name="maxPrice" type="number" min="0" step="50000" placeholder="Maks" value="${esc(params.maxPrice)}" />
              </div>
            </div>
            <div class="field mt-8"><label for="f-stars">Klasifikasi bintang</label>
              <select class="select" id="f-stars" name="stars">
                <option value="">Semua bintang</option>
                ${[5, 4, 3].map((n) => `<option value="${n}" ${params.stars === String(n) ? 'selected' : ''}>${n} bintang</option>`).join('')}
              </select>
            </div>
            <div class="field"><label for="f-type">Jenis properti</label>
              <select class="select" id="f-type" name="propertyType">
                <option value="">Semua jenis</option>
                ${(meta.propertyTypes || [])
                  .map((type) => `<option value="${esc(type)}" ${params.propertyType === type ? 'selected' : ''}>${esc(label(type))}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="field"><label for="f-rating">Rating tamu</label>
              <select class="select" id="f-rating" name="guestRating">
                <option value="">Semua rating</option>
                <option value="excellent" ${params.guestRating === 'excellent' ? 'selected' : ''}>Luar biasa (4,5+)</option>
                <option value="good" ${params.guestRating === 'good' ? 'selected' : ''}>Sangat baik (4+)</option>
                <option value="average" ${params.guestRating === 'average' ? 'selected' : ''}>Baik (3+)</option>
              </select>
            </div>
            <label class="check mt-8"><input type="checkbox" name="freeCancellation" value="true" ${params.freeCancellation ? 'checked' : ''} /> Bebas pembatalan</label>
            <label class="check"><input type="checkbox" name="payAtHotel" value="true" ${params.payAtHotel ? 'checked' : ''} /> Bayar di hotel</label>
          </div>
        </div>

        <div class="filter-card">
          <h4>Fasilitas</h4>
          <div class="filter-list" style="max-height:230px;overflow:auto">
            ${facilityList
              .map(
                (facility) => `<label class="check"><input type="checkbox" name="facilities" value="${esc(facility)}" ${selectedFacilities.includes(facility) ? 'checked' : ''} /> ${esc(facility)}</label>`,
              )
              .join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-block" type="submit">Terapkan filter</button>
        ${params.checkIn && params.checkOut ? `<p class="help center">Menginap ${nightsBetween(params.checkIn, params.checkOut)} malam · ${esc(params.rooms)} kamar · ${esc(params.guests)} tamu</p>` : ''}
      </form>

      <div>
        <div class="results-head">
          <div>
            <strong>${data.total} properti</strong>
            <span class="muted small">· harga sebelum pajak, sudah termasuk diskon</span>
          </div>
          <div class="row" style="gap:8px">
            <label class="small muted" for="sort-top">Urutkan</label>
            <select class="select" id="sort-top" data-sort style="width:auto;min-height:38px;padding-block:7px">
              ${SORT_OPTIONS.map(([value, text]) => `<option value="${value}" ${params.sort === value ? 'selected' : ''}>${text}</option>`).join('')}
            </select>
          </div>
        </div>

        ${
          activeChips.length
            ? `<div class="active-filters">${activeChips
                .map(([key, text]) => {
                  const next = { ...params };
                  delete next[key];
                  return `<a class="chip chip-brand" href="${searchHref(Object.fromEntries(Object.entries(next).filter(([, value]) => value !== '')))}">${esc(text)} ${icon('x', 12)}</a>`;
                })
                .join('')}
                <a class="chip chip-line" href="#/search">Hapus semua</a></div>`
            : ''
        }

        ${
          data.items.length
            ? `<div class="result-list">${data.items
                .map(
                  (item) => `<article class="result-card">
                    <a href="${hotelHref(item.id, contextParams)}" aria-label="Lihat ${esc(item.name)}">${hotelArt(item, { sub: item.district })}</a>
                    <div class="result-card__body">
                      <div class="between" style="align-items:flex-start">
                        <div>
                          <p class="eyebrow">${esc(label(item.propertyType))} · ${esc(item.city)}</p>
                          <h3><a href="${hotelHref(item.id, contextParams)}">${esc(item.name)}</a></h3>
                          <p class="muted small">${esc(item.tagline || '')}</p>
                        </div>
                        <div class="right">${ratingBadge(item.rating, item.reviewCount)}${stars(item.stars)}</div>
                      </div>
                      <div class="amenity-chips mt-8">${(item.facilities || []).slice(0, 4).map((facility) => `<span class="chip">${esc(facility)}</span>`).join('')}</div>
                      <div class="result-badges">
                        ${item.freeCancellation ? '<span class="chip chip-ok">Bebas pembatalan</span>' : ''}
                        ${item.payAtHotel ? '<span class="chip chip-line">Bayar di hotel</span>' : ''}
                        ${item.policies?.freeCancellationDays ? `<span class="chip chip-line">Batal gratis H-${item.policies.freeCancellationDays}</span>` : ''}
                      </div>
                      <div class="result-card__foot">
                        <div>
                          <span class="tiny muted">${params.checkIn && params.checkOut ? `Total ${nightsBetween(params.checkIn, params.checkOut)} malam` : 'Harga mulai'}</span>
                          <div class="price">${money(item.fromPrice * (params.checkIn && params.checkOut ? nightsBetween(params.checkIn, params.checkOut) * (Number(params.rooms) || 1) : 1))} <small>${params.checkIn && params.checkOut ? 'sebelum pajak' : '/malam'}</small></div>
                        </div>
                        <a class="btn btn-primary btn-sm" href="${hotelHref(item.id, contextParams)}">Pilih kamar</a>
                      </div>
                    </div>
                  </article>`,
                )
                .join('')}</div>`
            : emptyState(
                'search',
                'Belum ada hotel yang cocok',
                'Coba ubah tanggal, longgarkan filter harga, atau jelajahi kota lain.',
                '<a class="btn btn-primary btn-sm" href="#/search">Reset pencarian</a>',
              )
        }
      </div>
    </div>`;

  return {
    html,
    title: `${heading} — Hotel Reserve`,
    mount(root) {
      bindSearchForm(root);
      bindFavorites(root);

      const filterForm = root.querySelector('[data-filter-form]');
      filterForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const raw = values(filterForm);
        const facilities = [...filterForm.querySelectorAll('input[name="facilities"]:checked')].map((input) => input.value);
        const next = {
          q: params.q,
          city: params.city,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          guests: params.guests,
          rooms: params.rooms,
          sort: raw.sort,
          stars: raw.stars,
          propertyType: raw.propertyType,
          guestRating: raw.guestRating,
          minPrice: raw.minPrice,
          maxPrice: raw.maxPrice,
          facilities: facilities.join(','),
          freeCancellation: filterForm.freeCancellation.checked ? 'true' : '',
          payAtHotel: filterForm.payAtHotel.checked ? 'true' : '',
        };
        location.hash = searchHref(Object.fromEntries(Object.entries(next).filter(([, value]) => value !== '')));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      root.querySelector('[data-sort]')?.addEventListener('change', (event) => {
        location.hash = searchHref({ ...params, sort: event.target.value });
      });
    },
  };
}

/* ----------------------------- hotel detail ---------------------------- */

const POLICY_LABELS = {
  checkIn: 'Waktu check-in',
  checkOut: 'Waktu check-out',
  freeCancellationDays: 'Pembatalan gratis hingga (hari sebelum check-in)',
  payAtHotel: 'Pembayaran di hotel',
  children: 'Anak diperbolehkan',
  pets: 'Hewan peliharaan',
  smoking: 'Area merokok',
  cancellation: 'Kebijakan pembatalan',
  extraBed: 'Extra bed',
  minAge: 'Usia minimum check-in',
};

function policyValue(key, value) {
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (key === 'freeCancellationDays') return value > 0 ? `${value} hari` : 'Tidak ada';
  return String(value);
}

export async function hotelView({ params, query }) {
  const checkIn = query.checkIn || tomorrow();
  const checkOut = query.checkOut && query.checkOut > checkIn ? query.checkOut : addDaysKey(checkIn, 2);
  const rooms = Math.min(4, Math.max(1, Number(query.rooms) || 1));
  const guests = Math.min(8, Math.max(1, Number(query.guests) || 2));
  const nights = nightsBetween(checkIn, checkOut);
  const stayParams = { checkIn, checkOut, rooms, guests };

  const data = await api(
    `/hotels/${encodeURIComponent(params.id)}?${new URLSearchParams(stayParams)}`,
  );
  const hotel = data.hotel;

  const cheapest = data.rooms.reduce((min, room) => {
    if (!room.quote) return min;
    return min === null || room.quote.total < min ? room.quote.total : min;
  }, null);

  const images = hotel.images || [];
  const gallery = images.slice(0, 4);

  const html = `
    <div class="wrap page-head" style="padding-bottom:0">
      <div class="breadcrumb">
        <a href="#/">Beranda</a><span>/</span>
        <a href="${searchHref({ city: hotel.city })}">${esc(hotel.city)}</a><span>/</span>
        <span>${esc(hotel.name)}</span>
      </div>
      <div class="between mt-12" style="align-items:flex-end">
        <div>
          <div class="row" style="gap:8px">${pill('verified')}<span class="muted small">${esc(label(hotel.propertyType))} · ${esc(hotel.district)}</span></div>
          <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);margin-top:6px">${esc(hotel.name)}</h1>
          <div class="row mt-8">
            ${stars(hotel.stars)}
            <a href="#reviews" class="row" style="gap:6px">${ratingBadge(data.rating, data.reviewCount)}</a>
            <span class="muted small row" style="gap:5px">${icon('pin', 14)} ${esc(hotel.address)}</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-outline btn-sm" type="button" data-fav="${hotel.id}" aria-pressed="${data.favorite}">
            ${icon('heart', 15)} <span>${data.favorite ? 'Tersimpan' : 'Simpan'}</span>
          </button>
          <a class="btn btn-soft btn-sm" href="#/search?city=${encodeURIComponent(hotel.city)}">Hotel lain di ${esc(hotel.city)}</a>
        </div>
      </div>
    </div>

    <div class="wrap mt-16">
      <div class="gallery">
        ${gallery
          .map(
            (image, index) =>
              art(image, {
                className: index === 0 ? 'gallery-main' : '',
                label: image.label || 'Galeri',
                sub: index === 0 ? hotel.name : '',
              }),
          )
          .join('')}
      </div>
    </div>

    <div class="wrap detail-layout">
      <div>
        <section class="detail-section">
          <h2>Tentang ${esc(hotel.name)}</h2>
          <p class="prose">${esc(hotel.description)}</p>
          <div class="row mt-16" style="gap:8px">
            ${(hotel.facilities || []).slice(0, 6).map((facility) => `<span class="chip">${facilityIcon(facility)} ${esc(facility)}</span>`).join('')}
          </div>
        </section>

        <section class="detail-section" id="rooms">
          <div class="between mb-16">
            <div>
              <h2 style="margin-bottom:4px">Pilih kamar</h2>
              <p class="muted small">${nights} malam · ${dateRange(checkIn, checkOut)} · ${rooms} kamar · ${guests} tamu</p>
            </div>
            <button class="btn btn-soft btn-sm" type="button" data-edit-stay>Ubah tanggal</button>
          </div>
          ${
            checkIn && checkOut
              ? data.rooms
                  .map((room, index) => {
                    const disabled = room.available === false || room.fitsGuests === false;
                    const reason =
                      room.fitsGuests === false
                        ? `Kapasitas ${room.capacity} tamu/kamar — tambah kamar`
                        : room.available === false
                          ? 'Penuh untuk tanggal ini'
                          : '';
                    return `<div class="room-row">
                      ${art(images[index % Math.max(images.length, 1)] || images[0], { className: 'art-sm', label: room.category ? label(room.category) : 'Kamar' })}
                      <div class="room-info">
                        <h3>${esc(room.name)}</h3>
                        <p class="muted small">${esc(room.beds)} · ${room.size} m² · maks. ${room.capacity} tamu${room.breakfastIncluded ? ' · sarapan termasuk' : ''}</p>
                        <div class="room-amenities">
                          ${(room.amenities || []).slice(0, 5).map((amenity) => `<span class="chip">${esc(amenity)}</span>`).join('')}
                        </div>
                        <div class="row mt-8" style="gap:6px">
                          ${room.freeCancellationDays ? `<span class="chip chip-ok">Batal gratis H-${room.freeCancellationDays}</span>` : '<span class="chip chip-warn">Non-refundable</span>'}
                          ${room.available !== false && room.remaining !== null ? `<span class="chip chip-line">Sisa ${room.remaining} kamar</span>` : ''}
                          ${reason ? `<span class="chip chip-danger">${esc(reason)}</span>` : ''}
                        </div>
                      </div>
                      <div class="room-buy">
                        <div>
                          <span class="tiny muted">${money(room.nightlyRate)} / malam</span>
                          <div class="price">${money(room.quote?.total ?? room.nightlyRate * nights * rooms)}</div>
                          <span class="tiny muted">${nights} malam, ${rooms} kamar · termasuk pajak</span>
                        </div>
                        <button class="btn btn-primary btn-sm" type="button" data-book-room="${room.id}" ${disabled ? 'disabled' : ''}>
                          ${disabled ? 'Tidak tersedia' : 'Pilih kamar'}
                        </button>
                      </div>
                    </div>`;
                  })
                  .join('')
              : emptyState('calendar', 'Pilih tanggal menginap', 'Masukkan tanggal check-in dan check-out untuk melihat kamar yang tersedia.')
          }
        </section>

        <section class="detail-section">
          <h2>Fasilitas</h2>
          <div class="facility-grid">
            ${(hotel.facilities || [])
              .map((facility) => `<div class="facility">${facilityIcon(facility)}<span>${esc(facility)}</span></div>`)
              .join('')}
          </div>
        </section>

        <section class="detail-section">
          <h2>Lokasi</h2>
          <div class="map-panel"><span class="map-pin">${icon('pin', 14)} ${esc(hotel.district)}, ${esc(hotel.city)}</span></div>
          <p class="prose mt-12">${esc(hotel.address)}</p>
          ${
            (hotel.nearby || []).length
              ? `<div class="stub-grid mt-16">${hotel.nearby
                  .map((place) => `<div class="panel"><span class="tiny muted">Di sekitar</span><p class="small strong">${esc(place)}</p></div>`)
                  .join('')}</div>`
              : ''
          }
        </section>

        <section class="detail-section" id="reviews">
          <div class="between mb-16">
            <h2 style="margin:0">Ulasan tamu</h2>
            <span class="muted small">${data.reviewCount} ulasan terverifikasi</span>
          </div>
          <div class="review-summary">
            <div class="review-score">
              <strong>${data.reviewSummary.rating.toFixed(1)}</strong>
              <div class="stars">${'★'.repeat(Math.round(data.reviewSummary.rating))}</div>
              <p class="small muted mt-4">${data.reviewCount} ulasan</p>
            </div>
            <div class="review-bars">
              ${[
                ['Kebersihan', data.reviewSummary.cleanliness],
                ['Pelayanan', data.reviewSummary.service],
                ['Lokasi', data.reviewSummary.location],
              ]
                .map(
                  ([name, value]) => `<div class="review-bar">
                    <span>${name}</span>
                    <span class="track"><span class="fill" style="width:${Math.min(100, (Number(value) / 5) * 100)}%"></span></span>
                    <span>${Number(value).toFixed(1)}</span>
                  </div>`,
                )
                .join('')}
            </div>
          </div>
          <div class="mt-24">
            ${
              data.reviews.length
                ? data.reviews
                    .map(
                      (review) => `<article class="review-item">
                        <div class="between">
                          <div class="row">
                            <span class="avatar" style="width:32px;height:32px;font-size:0.7rem">${esc(review.guestName.slice(0, 2).toUpperCase())}</span>
                            <div><h4>${esc(review.guestName)} ${review.verifiedStay ? '<span class="chip chip-ok tiny">Tamu terverifikasi</span>' : ''}</h4>
                            <span class="tiny muted">${dateLong(String(review.createdAt).slice(0, 10))}</span></div>
                          </div>
                          ${ratingBadge(review.rating)}
                        </div>
                        <h4 class="mt-8">${esc(review.title)}</h4>
                        <p class="review-body">${esc(review.body)}</p>
                        ${review.response ? `<div class="review-response"><strong>Balasan ${esc(review.response.by)}</strong><p>${esc(review.response.body)}</p></div>` : ''}
                        ${session.user ? `<button class="btn-link tiny mt-8" type="button" data-report="${review.id}">Laporkan ulasan</button>` : ''}
                      </article>`,
                    )
                    .join('')
                : '<p class="muted small">Belum ada ulasan. Jadilah tamu pertama yang berbagi pengalaman.</p>'
            }
          </div>
        </section>

        <section class="detail-section">
          <h2>Kebijakan &amp; informasi</h2>
          <div class="stub-grid">
            ${Object.entries(hotel.policies || {})
              .filter(([key]) => POLICY_LABELS[key])
              .map(
                ([key, value]) => `<div class="panel"><span class="tiny muted">${esc(POLICY_LABELS[key])}</span><p class="small strong">${esc(policyValue(key, value))}</p></div>`,
              )
              .join('')}
          </div>
        </section>
      </div>

      <aside class="booking-widget">
        <form class="widget-card" data-stay-form>
          <div class="widget-body">
            <div class="widget-price">
              <span class="price">${money(Math.min(...data.rooms.map((room) => room.nightlyRate)))}</span>
              <span class="muted small">/ malam</span>
            </div>
            <div class="widget-dates">
              <div class="field"><label for="w-in">Check-in</label><input class="input" id="w-in" name="checkIn" type="date" min="${todayKey()}" value="${checkIn}" /></div>
              <div class="field"><label for="w-out">Check-out</label><input class="input" id="w-out" name="checkOut" type="date" min="${addDaysKey(checkIn, 1)}" value="${checkOut}" /></div>
            </div>
            <div class="widget-guests">
              <div class="field"><label for="w-rooms">Kamar</label>
                <select class="select" id="w-rooms" name="rooms">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === rooms ? 'selected' : ''}>${n} kamar</option>`).join('')}</select>
              </div>
              <div class="field"><label for="w-guests">Tamu</label>
                <select class="select" id="w-guests" name="guests">${Array.from({ length: 8 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === guests ? 'selected' : ''}>${n} tamu</option>`).join('')}</select>
              </div>
            </div>
            <button class="btn btn-soft btn-block" type="submit">Perbarui ketersediaan</button>
            <div class="divider" style="margin-block:2px"></div>
            <div class="price-lines">
              <div><span>${nights} malam × ${rooms} kamar</span><span>${cheapest ? money(cheapest) : '—'}</span></div>
              <div class="muted"><span>Termasuk biaya layanan &amp; pajak</span><span>✓</span></div>
              <div class="total"><span>Total menginap</span><span>${cheapest ? money(cheapest) : '—'}</span></div>
            </div>
            <a class="btn btn-primary btn-block" href="#rooms">Pilih kamar ${icon('arrow', 15)}</a>
            ${data.paymentMethods.some((method) => method.key === 'pay_at_hotel') ? '<p class="help center">Bisa bayar di hotel untuk properti ini.</p>' : ''}
            <div class="widget-note">${icon('shield', 14)} Kamar ditahan 15 menit saat Anda melanjutkan ke pembayaran.</div>
          </div>
        </form>
        ${
          data.promos.length
            ? `<div class="panel mt-16">
                <h3 style="font-size:0.95rem">Promo tersedia</h3>
                ${data.promos
                  .slice(0, 2)
                  .map(
                    (promo) => `<div class="between mt-8"><div><p class="small strong">${esc(promo.title)}</p><span class="tiny muted">${esc(promo.description || '')}</span></div>
                      <button class="chip chip-gold" type="button" data-copy="${esc(promo.code)}">${esc(promo.code)}</button></div>`,
                  )
                  .join('')}
              </div>`
            : ''
        }
      </aside>
    </div>`;

  return {
    html,
    title: `${hotel.name}, ${hotel.city} — Hotel Reserve`,
    mount(root) {
      bindFavorites(root);
      bindCopy(root);

      const stayForm = root.querySelector('[data-stay-form]');
      stayForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const dataForm = values(stayForm);
        if (dataForm.checkOut <= dataForm.checkIn) {
          toast('Tanggal check-out harus setelah check-in.', 'error');
          return;
        }
        location.hash = hotelHref(hotel.id, dataForm);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      root.querySelector('[data-edit-stay]')?.addEventListener('click', () => {
        stayForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        stayForm.querySelector('input[name="checkIn"]')?.focus();
      });

      const favorite = root.querySelector(`[data-fav="${hotel.id}"]`);
      if (favorite) {
        const original = favorite.innerHTML;
        favorite.addEventListener('click', (event) => {
          event.preventDefault();
        });
        const observer = new MutationObserver(() => {
          const on = favorite.classList.contains('on');
          favorite.querySelector('span')?.replaceChildren(document.createTextNode(on ? 'Tersimpan' : 'Simpan'));
        });
        observer.observe(favorite, { attributes: true, attributeFilter: ['class'] });
        favorite.dataset.original = original;
      }

      root.querySelectorAll('[data-book-room]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!(await ensureSession('Masuk untuk menahan kamar dan melanjutkan pemesanan.'))) return;
          setBusy(button, true, 'Menahan kamar…');
          try {
            const hold = await api('/holds', {
              method: 'POST',
              body: {
                roomTypeId: button.dataset.bookRoom,
                checkIn,
                checkOut,
                rooms,
                adults: Math.min(guests, rooms * 4),
                children: 0,
              },
            });
            location.hash = `#/checkout/${hold.hold.id}`;
          } catch (error) {
            toast(error.message, 'error');
            setBusy(button, false);
          }
        });
      });

      root.querySelectorAll('[data-report]').forEach((button) => {
        button.addEventListener('click', async () => {
          if (!(await ensureSession('Masuk untuk melaporkan ulasan.'))) return;
          const reason = await promptDialog({
            title: 'Laporkan ulasan',
            label: 'Alasan laporan',
            placeholder: 'Contoh: berisi ujaran kebencian atau spam',
            confirmLabel: 'Kirim laporan',
            multiline: true,
          });
          if (!reason) return;
          try {
            await api(`/reviews/${button.dataset.report}/report`, { method: 'POST', body: { reason } });
            toast('Laporan dikirim ke admin. Terima kasih.');
          } catch (error) {
            toast(error.message, 'error');
          }
        });
      });
    },
  };
}

/* ------------------------------- wishlist ------------------------------ */

export async function wishlistView() {
  if (!session.user) {
    return {
      html: `<div class="wrap section">${emptyState(
        'heart',
        'Wishlist masih kosong',
        'Masuk untuk menyimpan hotel favorit dan membandingkannya nanti.',
        '<button class="btn btn-primary btn-sm" type="button" data-login-cta>Masuk ke akun</button>',
      )}</div>`,
      title: 'Wishlist — Hotel Reserve',
      mount(root) {
        root.querySelector('[data-login-cta]')?.addEventListener('click', async () => {
          if (await ensureSession('Masuk untuk melihat wishlist Anda.')) {
            window.dispatchEvent(new Event('hr:refresh'));
          }
        });
      },
    };
  }

  const data = await api('/favorites');
  return {
    html: `<div class="wrap section">
      <div class="section-head">
        <div><p class="eyebrow">Disimpan untuk nanti</p><h2>Wishlist Anda</h2><p>${data.items.length} properti tersimpan.</p></div>
        <a class="btn btn-outline btn-sm" href="#/search">${icon('search', 15)} Cari hotel lain</a>
      </div>
      ${
        data.items.length
          ? `<div class="hotel-grid" id="wishlist-grid">${data.items.map((item) => hotelCard(item)).join('')}</div>`
          : emptyState('heart', 'Belum ada yang disimpan', 'Tekan ikon hati pada hotel untuk menyimpannya di sini.', '<a class="btn btn-primary btn-sm" href="#/search">Jelajahi hotel</a>')
      }
    </div>`,
    title: 'Wishlist — Hotel Reserve',
    mount(root) {
      bindFavorites(root);
      root.addEventListener('click', (event) => {
        if (event.target.closest('[data-fav]')) {
          const card = event.target.closest('.hotel-card');
          setTimeout(() => {
            if (card && card.querySelector('.art-heart.on')) return;
            card?.remove();
            if (!root.querySelector('.hotel-card')) window.dispatchEvent(new Event('hr:refresh'));
          }, 400);
        }
      });
    },
  };
}

export { hotelCard as cardHtml, label as propertyLabel };
