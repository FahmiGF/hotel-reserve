import fs from 'node:fs';
import path from 'node:path';
import { seedData } from './seed.js';

/**
 * Tiny JSON store. The dataset is small enough to keep in memory, and every
 * mutation writes the whole document atomically (tmp file + rename) so a crash
 * can never leave a half-written database behind.
 */
export function createStore({ file = null, seed = true } = {}) {
  let db;
  if (file && fs.existsSync(file)) {
    try {
      db = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`Database ${file} tidak dapat dibaca: ${error.message}`);
    }
  } else {
    db = seed ? seedData() : emptyData();
  }

  // Schema drift guard for older files on disk.
  for (const key of ['users', 'hotels', 'roomTypes', 'bookings', 'holds', 'payments', 'reviews', 'favorites', 'promos', 'notifications', 'refunds', 'auditLog', 'wishlists']) {
    if (!Array.isArray(db[key])) db[key] = [];
  }

  function save() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  function reset() {
    db = seedData();
    save();
    return db;
  }

  return {
    get data() {
      return db;
    },
    save,
    reset,
  };
}

function emptyData() {
  return {
    meta: { version: 1, createdAt: new Date().toISOString() },
    users: [],
    hotels: [],
    roomTypes: [],
    bookings: [],
    holds: [],
    payments: [],
    reviews: [],
    favorites: [],
    promos: [],
    notifications: [],
    refunds: [],
    auditLog: [],
    wishlists: [],
  };
}
