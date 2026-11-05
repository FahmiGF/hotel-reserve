import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from './src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');

const { server, store } = createApp({ file: DB_FILE });

server.listen(PORT, HOST, () => {
  const { hotels, roomTypes, bookings } = store.data;
  console.log(`Hotel Reserve berjalan di http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_FILE}`);
  console.log(`Data: ${hotels.length} hotel, ${roomTypes.length} tipe kamar, ${bookings.length} reservasi`);
  console.log('Akun demo: demo@hotelreserve.id / password123');
});

function shutdown(signal) {
  console.log(`\nMenerima ${signal}, menutup server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
