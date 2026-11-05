import test from 'node:test';
import assert from 'node:assert/strict';

import { seedData } from '../src/seed.js';
import { parseSearchParams, searchHotels } from '../src/domain/search.js';

const db = seedData(new Date());

test('city and text filters narrow the catalogue', () => {
  const bali = searchHotels(db, parseSearchParams({ city: 'Bali' }));
  assert.ok(bali.total >= 2);
  assert.ok(bali.items.every((item) => item.hotel.city === 'Bali'));

  const ubud = searchHotels(db, parseSearchParams({ q: 'ubud' }));
  assert.equal(ubud.total, 1);
  assert.equal(ubud.items[0].hotel.name, 'Ubud Cliff Retreat');
});

test('price, star, facility, and property type filters are enforced', () => {
  const cheap = searchHotels(db, parseSearchParams({ maxPrice: 400_000 }));
  assert.ok(cheap.total > 0);
  assert.ok(cheap.items.every((item) => item.fromPrice <= 400_000));

  const fiveStars = searchHotels(db, parseSearchParams({ stars: '5' }));
  assert.ok(fiveStars.items.every((item) => item.hotel.stars === 5));

  const withPool = searchHotels(db, parseSearchParams({ facilities: 'Kolam Renang,Gym' }));
  assert.ok(withPool.items.every((item) => item.hotel.facilities.includes('Kolam Renang')));

  const hostels = searchHotels(db, parseSearchParams({ propertyType: 'hostel' }));
  assert.equal(hostels.total, 1);
  assert.equal(hostels.items[0].hotel.propertyType, 'hostel');
});

test('sorting by price is ascending and dates hide sold-out stays', () => {
  const sorted = searchHotels(db, parseSearchParams({ sort: 'price_asc' }));
  for (let i = 1; i < sorted.items.length; i += 1) {
    assert.ok(sorted.items[i].fromPrice >= sorted.items[i - 1].fromPrice);
  }

  const checkIn = '2026-12-10';
  const checkOut = '2026-12-12';
  const available = searchHotels(db, parseSearchParams({ checkIn, checkOut, rooms: 1 }), Date.parse('2026-11-05T00:00:00Z'));
  assert.ok(available.total > 0);
  assert.ok(available.items.every((item) => item.fromPrice > 0));
});

test('unverified hotels never appear in search results', () => {
  db.hotels[0].status = 'pending';
  const results = searchHotels(db, parseSearchParams({}));
  assert.ok(results.items.every((item) => item.hotel.id !== db.hotels[0].id));
  db.hotels[0].status = 'verified';
});
