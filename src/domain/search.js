import { checkStayAvailability } from './availability.js';
import { nightsBetween } from './dates.js';
import { rateForNight } from './pricing.js';

export const RATING_BANDS = {
  excellent: 4.5,
  good: 4.0,
  average: 3.0,
};

export function hotelRating(db, hotel) {
  const reviews = db.reviews.filter((review) => review.hotelId === hotel.id && !review.hidden);
  const baseCount = hotel.baseReviewCount ?? 0;
  const baseSum = (hotel.baseRating ?? 0) * baseCount;
  const count = baseCount + reviews.length;
  if (!count) return { rating: 0, count: 0 };
  const sum = baseSum + reviews.reduce((total, review) => total + review.rating, 0);
  return { rating: Math.round((sum / count) * 10) / 10, count };
}

export function ratingBand(rating) {
  if (rating >= RATING_BANDS.excellent) return 'excellent';
  if (rating >= RATING_BANDS.good) return 'good';
  if (rating >= RATING_BANDS.average) return 'average';
  return 'low';
}

/** Cheapest bookable nightly rate for the requested stay. */
export function fromPrice(db, hotel, { checkIn, checkOut, rooms = 1 }, now = Date.now()) {
  const roomTypes = db.roomTypes.filter(
    (roomType) => roomType.hotelId === hotel.id && roomType.active !== false,
  );
  let best = null;
  for (const roomType of roomTypes) {
    if (checkIn && checkOut) {
      const stay = checkStayAvailability(db, roomType, checkIn, checkOut, rooms, now);
      if (!stay.available) continue;
    }
    const rate = checkIn ? rateForNight(roomType, checkIn) : roomType.basePrice;
    if (best === null || rate < best) best = rate;
  }
  return best;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSearchParams(query = {}) {
  return {
    q: (query.q ?? '').trim(),
    city: (query.city ?? '').trim(),
    stars: parseList(query.stars).map(Number).filter(Boolean),
    propertyType: parseList(query.propertyType),
    facilities: parseList(query.facilities),
    roomCategory: parseList(query.roomCategory),
    minPrice: query.minPrice ? Number(query.minPrice) : null,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : null,
    guestRating: query.guestRating ?? null,
    freeCancellation: query.freeCancellation === 'true',
    payAtHotel: query.payAtHotel === 'true',
    checkIn: query.checkIn || null,
    checkOut: query.checkOut || null,
    guests: Number(query.guests) || 2,
    rooms: Math.max(1, Number(query.rooms) || 1),
    sort: query.sort ?? 'recommended',
    limit: Math.min(50, Math.max(1, Number(query.limit) || 24)),
    offset: Math.max(0, Number(query.offset) || 0),
  };
}

export function searchHotels(db, params, now = Date.now()) {
  const {
    q, city, stars, propertyType, facilities, roomCategory,
    minPrice, maxPrice, guestRating, freeCancellation, payAtHotel,
    checkIn, checkOut, guests, rooms, sort,
  } = params;

  const guestsPerRoom = Math.ceil(guests / rooms);
  const results = [];

  for (const hotel of db.hotels) {
    if (hotel.status !== 'verified') continue;
    if (city && hotel.city.toLowerCase() !== city.toLowerCase()) continue;
    if (q) {
      const haystack = `${hotel.name} ${hotel.city} ${hotel.district} ${hotel.tagline} ${hotel.address}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) continue;
    }
    if (stars.length && !stars.includes(hotel.stars)) continue;
    if (propertyType.length && !propertyType.includes(hotel.propertyType)) continue;
    if (facilities.length && !facilities.every((facility) => hotel.facilities.includes(facility))) continue;

    const hotelRooms = db.roomTypes.filter(
      (roomType) => roomType.hotelId === hotel.id && roomType.active !== false,
    );

    if (roomCategory.length) {
      const hasCategory = hotelRooms.some(
        (roomType) => roomCategory.includes(roomType.category) && roomType.capacity >= guestsPerRoom,
      );
      if (!hasCategory) continue;
    }

    if (freeCancellation && !hotelRooms.some((roomType) => (roomType.freeCancellationDays ?? 0) > 0)) continue;
    if (payAtHotel && !hotel.policies?.payAtHotel) continue;

    const { rating, count } = hotelRating(db, hotel);
    if (guestRating && RATING_BANDS[guestRating] && rating < RATING_BANDS[guestRating]) continue;

    const price = fromPrice(db, hotel, { checkIn, checkOut, rooms }, now);
    if (price === null) continue;
    if (minPrice !== null && Number.isFinite(minPrice) && price < minPrice) continue;
    if (maxPrice !== null && Number.isFinite(maxPrice) && price > maxPrice) continue;

    results.push({
      hotel,
      rating,
      reviewCount: count,
      fromPrice: price,
      nights: checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null,
    });
  }

  const sorters = {
    price_asc: (a, b) => a.fromPrice - b.fromPrice,
    price_desc: (a, b) => b.fromPrice - a.fromPrice,
    rating: (a, b) => b.rating - a.rating || a.fromPrice - b.fromPrice,
    popularity: (a, b) => b.reviewCount - a.reviewCount || b.rating - a.rating,
    recommended: (a, b) =>
      b.rating * 20 + Math.min(b.reviewCount, 900) / 100 - b.fromPrice / 1_000_000
      - (a.rating * 20 + Math.min(a.reviewCount, 900) / 100 - a.fromPrice / 1_000_000),
  };
  results.sort(sorters[sort] ?? sorters.recommended);

  const total = results.length;
  return {
    total,
    items: results.slice(params.offset, params.offset + params.limit),
    cities: [...new Set(db.hotels.filter((hotel) => hotel.status === 'verified').map((hotel) => hotel.city))].sort(),
  };
}
