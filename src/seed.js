import { randomUUID } from 'node:crypto';
import { hashPassword } from './domain/auth.js';
import { addDays, dateKey } from './domain/dates.js';
import { quoteStay } from './domain/pricing.js';

export const DEMO_PASSWORD = 'password123';

const PALETTES = {
  teal: ['#083344', '#0e7490', '#67e8f9'],
  forest: ['#132e1f', '#3f7d54', '#a7f3d0'],
  plum: ['#2b1235', '#8b3a72', '#f5c2e7'],
  amber: ['#3d2412', '#a16207', '#fcd34d'],
  jade: ['#0f2e27', '#0f766e', '#99f6e4'],
  steel: ['#151f2b', '#33526e', '#bae6fd'],
  ocean: ['#062a4a', '#0369a1', '#7dd3fc'],
  sand: ['#2b2416', '#92702a', '#fde68a'],
  violet: ['#231430', '#5b21b6', '#ddd6fe'],
  slate: ['#16202b', '#475569', '#e2e8f0'],
};

const PHOTO_LABELS = ['Lobby', 'Kamar', 'Kolam Renang', 'Pemandangan', 'Sarapan', 'Area Bersantai'];

let hotelSeq = 0;

function makeHotel(spec, roomSpecs, { today, ownerId, verifiedAt }) {
  hotelSeq += 1;
  const hotelId = randomUUID();
  const basePriceFreeDays = spec.policies.freeCancellationDays;
  const roomTypes = roomSpecs.map((room) =>
    normalizeRoom(hotelId, room, basePriceFreeDays, hotelId),
  );
  return {
    hotel: {
      id: hotelId,
      ownerId,
      code: `HTL-${String(hotelSeq).padStart(3, '0')}`,
      status: 'verified',
      verifiedAt,
      commissionRate: 0.1,
      createdAt: new Date(`${addDays(today, -120)}T09:00:00.000Z`).toISOString(),
      nearby: [],
      ...spec,
      // palettes are deterministic abstract art so the demo works fully offline
      images: PHOTO_LABELS.slice(0, 4).map((label, index) => ({
        id: `${hotelId}-${index}`,
        label,
        colors: PALETTES[spec.paletteName].map((color, colorIndex) =>
          colorIndex === 0 && index % 2 === 1 ? PALETTES[spec.paletteName][1] : color,
        ),
      })),
    },
    roomTypes,
  };
}

function normalizeRoom(hotelId, room, freeDays, seedTag) {
  return {
    id: randomUUID(),
    hotelId,
    active: true,
    breakfastIncluded: true,
    weekendMultiplier: 1.15,
    amenities: ['AC', 'Wi-Fi', 'TV', 'Air panas', 'Perlengkapan mandi'],
    dateOverrides: [],
    blocks: [],
    photos: [],
    freeCancellationDays: freeDays,
    description: `${room.name} dengan ${room.beds}, cocok untuk ${room.capacity} tamu.`,
    seedTag,
    ...room,
  };
}

export function seedData(now = new Date()) {
  const today = dateKey(now);
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const nowIso = now.toISOString();

  const users = [
    {
      id: randomUUID(),
      name: 'Sari Wulandari',
      email: 'admin@hotelreserve.id',
      phone: '081100000001',
      passwordHash,
      role: 'admin',
      status: 'active',
      points: 0,
      lifetimePoints: 0,
      createdAt: nowIso,
    },
    {
      id: randomUUID(),
      name: 'Budi Santoso',
      email: 'partner@hotelreserve.id',
      phone: '081100000002',
      passwordHash,
      role: 'partner',
      status: 'active',
      points: 0,
      lifetimePoints: 0,
      createdAt: nowIso,
    },
    {
      id: randomUUID(),
      name: 'Rina Kartika',
      email: 'staff@hotelreserve.id',
      phone: '081100000003',
      passwordHash,
      role: 'staff',
      status: 'active',
      points: 0,
      lifetimePoints: 0,
      createdAt: nowIso,
    },
    {
      id: randomUUID(),
      name: 'Demo Guest',
      email: 'demo@hotelreserve.id',
      phone: '081100000004',
      passwordHash,
      role: 'customer',
      status: 'active',
      points: 420,
      lifetimePoints: 620,
      createdAt: nowIso,
    },
    {
      id: randomUUID(),
      name: 'Tama Pratama',
      email: 'tama@example.com',
      phone: '081100000005',
      passwordHash,
      role: 'customer',
      status: 'active',
      points: 1830,
      lifetimePoints: 1830,
      createdAt: nowIso,
    },
  ];

  const [admin, partner, staff, demo, tama] = users;

  const h1 = makeHotel({
    name: 'The Grand Meridian Jakarta',
    city: 'Jakarta',
    district: 'Menteng',
    address: 'Jl. Jenderal Sudirman Kav. 21, Menteng, Jakarta Pusat',
    lat: -6.2088,
    lng: 106.8231,
    stars: 5,
    propertyType: 'hotel',
    paletteName: 'teal',
    tagline: 'Hotel bisnis ikonik dengan rooftop pool di jantung Sudirman.',
    description:
      'Menara 27 lantai dengan kamar lapang bernuansa kayu hangat, rooftop infinity pool, dan akses langsung ke kawasan bisnis Sudirman. Cocok untuk perjalanan bisnis maupun akhir pekan keluarga.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Gym', 'Parkir', 'Restoran', 'Spa', 'AC', 'Resepsionis 24 Jam', 'Sarapan', 'Antar-Jemput Bandara'],
    policies: {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      freeCancellationDays: 2,
      payAtHotel: true,
      note: 'Tamu di bawah 18 tahun harus didampingi orang tua. Identitas asli wajib ditunjukkan saat check-in.',
    },
    baseRating: 4.6,
    baseReviewCount: 1840,
    nearby: [
      { name: 'Bundaran HI', distance: '1,2 km', type: 'Landmark' },
      { name: 'Grand Indonesia', distance: '1,8 km', type: 'Belanja' },
      { name: 'Stasiun MRT Dukuh Atas', distance: '600 m', type: 'Transportasi' },
    ],
  }, [
    { name: 'Superior Room', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 32, basePrice: 850000, inventory: 12 },
    { name: 'Deluxe King', category: 'double', capacity: 2, beds: '1 King Bed', size: 40, basePrice: 1250000, inventory: 8, dateOverrides: [] },
    { name: 'Executive Suite', category: 'suite', capacity: 3, beds: '1 King + Sofa Bed', size: 62, basePrice: 2100000, inventory: 3 },
    { name: 'Family Room', category: 'family', capacity: 4, beds: '2 Queen Bed', size: 48, basePrice: 1850000, inventory: 4 },
  ], { today, ownerId: partner.id, verifiedAt: nowIso });

  const h2 = makeHotel({
    name: 'Ubud Cliff Retreat',
    city: 'Bali',
    district: 'Ubud',
    address: 'Jl. Raya Sanggingan, Ubud, Gianyar, Bali',
    lat: -8.5075,
    lng: 115.2626,
    stars: 4,
    propertyType: 'resort',
    paletteName: 'forest',
    tagline: 'Vila tepi lembah dengan kolam privat dan sarapan organik.',
    description:
      'Resort butik tersembunyi di atas lembah Ayung. Setiap vila memiliki teras pribadi menghadap hutan tropis, kolam privat, dan akses jalur trekking pagi bersama pemandu lokal.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Restoran', 'Spa', 'Parkir', 'AC', 'Sarapan', 'Antar-Jemput Bandara'],
    policies: {
      checkInTime: '15:00',
      checkOutTime: '11:00',
      freeCancellationDays: 5,
      payAtHotel: false,
      note: 'Resort bebas asap rokok. Tidak menerima hewan peliharaan.',
    },
    baseRating: 4.8,
    baseReviewCount: 920,
    nearby: [
      { name: 'Puri Lukisan Museum', distance: '2,4 km', type: 'Budaya' },
      { name: 'Tegalalang Rice Terrace', distance: '9 km', type: 'Alam' },
      { name: 'Pasar Seni Ubud', distance: '2,9 km', type: 'Belanja' },
    ],
  }, [
    { name: 'Garden Villa', category: 'double', capacity: 2, beds: '1 King Bed', size: 55, basePrice: 1650000, inventory: 6, freeCancellationDays: 5 },
    { name: 'Cliff Pool Villa', category: 'suite', capacity: 2, beds: '1 King Bed', size: 78, basePrice: 2750000, inventory: 4, freeCancellationDays: 5 },
    { name: 'Family Pool Villa', category: 'family', capacity: 4, beds: '2 King Bed', size: 110, basePrice: 3400000, inventory: 3, freeCancellationDays: 5 },
  ], { today, ownerId: partner.id, verifiedAt: nowIso });

  const h3 = makeHotel({
    name: 'Seminyak Surf House',
    city: 'Bali',
    district: 'Seminyak',
    address: 'Jl. Kayu Aya No. 88, Seminyak, Badung, Bali',
    lat: -8.6833,
    lng: 115.1667,
    stars: 4,
    propertyType: 'hotel',
    paletteName: 'plum',
    tagline: 'Dua menit jalan kaki ke pantai, cocok untuk surfer dan digital nomad.',
    description:
      'Hotel santai dengan rooftop bar, kelas surf gratis setiap pagi, dan co-working lounge. Lokasi strategis di jantung Seminyak dekat butik dan kafe terkenal.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Restoran', 'AC', 'Parkir', 'Resepsionis 24 Jam', 'Sarapan'],
    policies: {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      freeCancellationDays: 1,
      payAtHotel: true,
      note: 'Check-in dini bergantung ketersediaan. Area rooftop dibatasi untuk tamu 17+.',
    },
    baseRating: 4.4,
    baseReviewCount: 1250,
    nearby: [
      { name: 'Pantai Seminyak', distance: '250 m', type: 'Pantai' },
      { name: 'Seminyak Village', distance: '850 m', type: 'Belanja' },
      { name: 'Petitenget Temple', distance: '1,4 km', type: 'Budaya' },
    ],
  }, [
    { name: 'Twin Room', category: 'twin', capacity: 2, beds: '2 Single Bed', size: 26, basePrice: 620000, inventory: 14, freeCancellationDays: 1 },
    { name: 'Double Room', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 28, basePrice: 680000, inventory: 10, freeCancellationDays: 1 },
    { name: 'Loft Suite', category: 'suite', capacity: 3, beds: '1 King + Sofa Bed', size: 52, basePrice: 1150000, inventory: 4, freeCancellationDays: 2 },
  ], { today, ownerId: partner.id, verifiedAt: nowIso });

  const h4 = makeHotel({
    name: 'Yogyakarta Heritage Inn',
    city: 'Yogyakarta',
    district: 'Gondomanan',
    address: 'Jl. Malioboro No. 47, Gondomanan, Yogyakarta',
    lat: -7.7956,
    lng: 110.3695,
    stars: 3,
    propertyType: 'hotel',
    paletteName: 'amber',
    tagline: 'Kamar bergaya klasik Jawa, 3 menit dari Malioboro.',
    description:
      'Bangunan cagar budaya yang dirawat dengan baik, beranda berpilar, dan sarapan gudeg tradisional. Semua kamar ber-AC dengan air panas 24 jam.',
    facilities: ['Wi-Fi Gratis', 'AC', 'Restoran', 'Parkir', 'Resepsionis 24 Jam', 'Sarapan'],
    policies: {
      checkInTime: '13:00',
      checkOutTime: '12:00',
      freeCancellationDays: 2,
      payAtHotel: true,
      note: 'Tersedia sewa sepeda dan tur Candi Borobudur dari lobi.',
    },
    baseRating: 4.3,
    baseReviewCount: 760,
    nearby: [
      { name: 'Malioboro', distance: '300 m', type: 'Belanja' },
      { name: 'Keraton Yogyakarta', distance: '1,6 km', type: 'Budaya' },
      { name: 'Stasiun Tugu', distance: '1,1 km', type: 'Transportasi' },
    ],
  }, [
    { name: 'Standard Room', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 20, basePrice: 350000, inventory: 18 },
    { name: 'Deluxe Room', category: 'double', capacity: 2, beds: '1 King Bed', size: 26, basePrice: 480000, inventory: 10 },
    { name: 'Family Room', category: 'family', capacity: 4, beds: '2 Queen Bed', size: 34, basePrice: 720000, inventory: 5 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  const h5 = makeHotel({
    name: 'Bandung Highland Lodge',
    city: 'Bandung',
    district: 'Dago',
    address: 'Jl. Haji Juanda No. 210, Dago, Bandung',
    lat: -6.8858,
    lng: 107.6134,
    stars: 4,
    propertyType: 'hotel',
    paletteName: 'jade',
    tagline: 'Udara sejuk Dago dengan balkon menghadap kota.',
    description:
      'Lodge bergaya Skandinavia di ketinggian 1.100 mdpl. Pemanas ruangan, api unggun sore, dan menu sarapan lokal menjadi favorit tamu keluarga.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Gym', 'Restoran', 'Parkir', 'AC', 'Sarapan', 'Spa'],
    policies: {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      freeCancellationDays: 2,
      payAtHotel: true,
      note: 'Menerima hewan peliharaan kecil di kamar tipe Suite dengan biaya tambahan.',
    },
    baseRating: 4.6,
    baseReviewCount: 1010,
    nearby: [
      { name: 'Dago Pakar', distance: '3,2 km', type: 'Alam' },
      { name: 'Gedung Sate', distance: '4,1 km', type: 'Landmark' },
      { name: 'Cihampelas Walk', distance: '3,6 km', type: 'Belanja' },
    ],
  }, [
    { name: 'Superior Twin', category: 'twin', capacity: 2, beds: '2 Single Bed', size: 28, basePrice: 540000, inventory: 12 },
    { name: 'Deluxe View', category: 'double', capacity: 2, beds: '1 King Bed', size: 32, basePrice: 690000, inventory: 9, dateOverrides: [
      { from: addDays(today, 20), to: addDays(today, 27), multiplier: 1.3, label: 'Libur panjang' },
    ] },
    { name: 'Highland Suite', category: 'suite', capacity: 3, beds: '1 King + Sofa Bed', size: 48, basePrice: 1050000, inventory: 3 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  const h6 = makeHotel({
    name: 'Surabaya Business Central',
    city: 'Surabaya',
    district: 'Genteng',
    address: 'Jl. Basuki Rahmat No. 101, Genteng, Surabaya',
    lat: -7.2658,
    lng: 112.7419,
    stars: 4,
    propertyType: 'hotel',
    paletteName: 'steel',
    tagline: 'Hotel efisien dekat pusat bisnis dan mal Tunjungan Plaza.',
    description:
      'Kamar kedap suara dengan meja kerja ergonomis, ruang rapat 24 jam, dan koneksi internet fiber. Sarapan disajikan mulai pukul 05.00 untuk tamu dengan penerbangan pagi.',
    facilities: ['Wi-Fi Gratis', 'Gym', 'Restoran', 'Parkir', 'AC', 'Resepsionis 24 Jam', 'Sarapan'],
    policies: {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      freeCancellationDays: 1,
      payAtHotel: true,
      note: 'Early check-in tersedia dengan biaya 50% harga kamar.',
    },
    baseRating: 4.2,
    baseReviewCount: 640,
    nearby: [
      { name: 'Tunjungan Plaza', distance: '500 m', type: 'Belanja' },
      { name: 'Monumen Kapal Selam', distance: '1,3 km', type: 'Landmark' },
      { name: 'Stasiun Gubeng', distance: '1,9 km', type: 'Transportasi' },
    ],
  }, [
    { name: 'Smart Room', category: 'single', capacity: 1, beds: '1 Single Bed', size: 18, basePrice: 420000, inventory: 20 },
    { name: 'Business Double', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 26, basePrice: 610000, inventory: 12 },
    { name: 'Meeting Suite', category: 'suite', capacity: 3, beds: '1 King + Sofa', size: 44, basePrice: 980000, inventory: 3 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  const h7 = makeHotel({
    name: 'Lombok Beachfront Villas',
    city: 'Lombok',
    district: 'Senggigi',
    address: 'Jl. Raya Senggigi, Batu Layar, Lombok Barat',
    lat: -8.4912,
    lng: 116.0419,
    stars: 5,
    propertyType: 'villa',
    paletteName: 'ocean',
    tagline: 'Vila tepi pantai dengan akses langsung ke laut dan Gili.',
    description:
      'Delapan vila privat tersebar di taman tropis seluas satu hektar. Sarapan di tepi pantai, kayak gratis, dan pemandangan Gunung Agung saat langit cerah.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Restoran', 'Spa', 'Parkir', 'AC', 'Sarapan', 'Antar-Jemput Bandara', 'Antar-Jemput Pelabuhan'],
    policies: {
      checkInTime: '15:00',
      checkOutTime: '11:00',
      freeCancellationDays: 7,
      payAtHotel: false,
      note: 'Antar-jemput pelabuhan gratis untuk tamu minimal 2 malam.',
    },
    baseRating: 4.9,
    baseReviewCount: 410,
    nearby: [
      { name: 'Pantai Senggigi', distance: '0 m', type: 'Pantai' },
      { name: 'Pelabuhan Bangsal', distance: '12 km', type: 'Transportasi' },
      { name: 'Bukit Malimbu', distance: '8 km', type: 'Alam' },
    ],
  }, [
    { name: 'Ocean Villa', category: 'double', capacity: 2, beds: '1 King Bed', size: 70, basePrice: 2450000, inventory: 5, freeCancellationDays: 7 },
    { name: 'Private Pool Villa', category: 'suite', capacity: 2, beds: '1 King Bed', size: 95, basePrice: 3200000, inventory: 3, freeCancellationDays: 7 },
    { name: 'Two Bedroom Villa', category: 'family', capacity: 4, beds: '2 King Bed', size: 140, basePrice: 4500000, inventory: 2, freeCancellationDays: 7 },
  ], { today, ownerId: partner.id, verifiedAt: nowIso });

  const h8 = makeHotel({
    name: 'Labuan Bajo Bay Hostel',
    city: 'Labuan Bajo',
    district: 'Komodo',
    address: 'Jl. Soekarno Hatta, Labuan Bajo, Manggarai Barat',
    lat: -8.4964,
    lng: 119.8877,
    stars: 3,
    propertyType: 'hostel',
    paletteName: 'sand',
    tagline: 'Hostel ramah backpacker dengan teras menghadap teluk.',
    description:
      'Dorm dan kamar privat bersih dengan kolam kecil, dapur bersama, dan agen tur Kapal Komodo di lobi. Kopi Flores gratis setiap pagi.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Parkir', 'AC', 'Sarapan', 'Resepsionis 24 Jam'],
    policies: {
      checkInTime: '13:00',
      checkOutTime: '11:00',
      freeCancellationDays: 1,
      payAtHotel: true,
      note: 'Dorm campur. Kunci loker tersedia dengan deposit Rp50.000.',
    },
    baseRating: 4.1,
    baseReviewCount: 380,
    nearby: [
      { name: 'Pelabuhan Labuan Bajo', distance: '700 m', type: 'Transportasi' },
      { name: 'Bukit Cinta', distance: '3,1 km', type: 'Alam' },
      { name: 'Pasar Wae Kesambi', distance: '1,2 km', type: 'Belanja' },
    ],
  }, [
    { name: 'Mixed Dorm Bed', category: 'single', capacity: 1, beds: '1 Bunk Bed', size: 8, basePrice: 185000, inventory: 24, breakfastIncluded: false },
    { name: 'Private Twin', category: 'twin', capacity: 2, beds: '2 Single Bed', size: 18, basePrice: 395000, inventory: 8 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  const h9 = makeHotel({
    name: 'Medan City Apartment',
    city: 'Medan',
    district: 'Polonia',
    address: 'Jl. Gatot Subroto KM 5, Polonia, Medan',
    lat: 3.5897,
    lng: 98.6717,
    stars: 4,
    propertyType: 'apartment',
    paletteName: 'violet',
    tagline: 'Apartemen servis dengan dapur lengkap untuk menginap lama.',
    description:
      'Unit studio dan dua kamar dengan dapur, mesin cuci, dan ruang kerja. Ideal untuk perjalanan dinas lebih dari seminggu atau keluarga yang butuh ruang ekstra.',
    facilities: ['Wi-Fi Gratis', 'Kolam Renang', 'Gym', 'Parkir', 'AC', 'Resepsionis 24 Jam'],
    policies: {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      freeCancellationDays: 3,
      payAtHotel: false,
      note: 'Biaya kebersihan mingguan Rp150.000 untuk menginap lebih dari 7 malam.',
    },
    baseRating: 4.0,
    baseReviewCount: 290,
    nearby: [
      { name: 'Bandara Kualanamu', distance: '28 km', type: 'Transportasi' },
      { name: 'Sun Plaza', distance: '3,4 km', type: 'Belanja' },
      { name: 'Istana Maimun', distance: '7,2 km', type: 'Budaya' },
    ],
  }, [
    { name: 'Studio Apartment', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 34, basePrice: 430000, inventory: 10 },
    { name: 'Two Bedroom Apartment', category: 'family', capacity: 4, beds: '2 Queen Bed', size: 62, basePrice: 780000, inventory: 6 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  const h10 = makeHotel({
    name: 'Jakarta Airport Transit Hotel',
    city: 'Jakarta',
    district: 'Tangerang',
    address: 'Kawasan Bandara Soekarno-Hatta, Terminal 3, Tangerang',
    lat: -6.1256,
    lng: 106.6559,
    stars: 3,
    propertyType: 'hotel',
    paletteName: 'slate',
    tagline: 'Kamar nyaman 5 menit dari gate keberangkatan.',
    description:
      'Hotel transit dengan check-in 24 jam, kamar kedap suara, dan antar-jemput terminal gratis. Paket singkat 6 jam tersedia untuk penerbangan tengah malam.',
    facilities: ['Wi-Fi Gratis', 'AC', 'Resepsionis 24 Jam', 'Antar-Jemput Bandara', 'Restoran'],
    policies: {
      checkInTime: '00:00',
      checkOutTime: '12:00',
      freeCancellationDays: 1,
      payAtHotel: true,
      note: 'Check-in fleksibel 24 jam. Identitas dan tiket pesawat diperlukan saat check-in.',
    },
    baseRating: 4.0,
    baseReviewCount: 520,
    nearby: [
      { name: 'Terminal 3 Soekarno-Hatta', distance: '400 m', type: 'Transportasi' },
      { name: 'SkyTrain Station', distance: '350 m', type: 'Transportasi' },
    ],
  }, [
    { name: 'Transit Single', category: 'single', capacity: 1, beds: '1 Single Bed', size: 16, basePrice: 320000, inventory: 16 },
    { name: 'Transit Double', category: 'double', capacity: 2, beds: '1 Queen Bed', size: 22, basePrice: 445000, inventory: 12 },
  ], { today, ownerId: null, verifiedAt: nowIso });

  staff.hotelIds = [h1.hotel.id];
  partner.hotelIds = [h1.hotel.id, h2.hotel.id, h3.hotel.id, h7.hotel.id];

  const hotelMap = { h1, h2, h3, h4, h5, h6, h7, h8, h9, h10 };

  // Maintenance block: 2 deluxe rooms at Grand Meridian are out of order next week.
  const deluxe = h1.roomTypes[1];
  deluxe.blocks.push({
    id: randomUUID(),
    from: addDays(today, 7),
    to: addDays(today, 9),
    units: 2,
    reason: 'Renovasi kamar mandi',
    createdAt: nowIso,
  });

  const hotels = Object.values(hotelMap).map((entry) => entry.hotel);
  const roomTypes = Object.values(hotelMap).flatMap((entry) => entry.roomTypes);

  const reviewSeeds = [
    { hotelId: h1.hotel.id, guestName: 'Andi Saputra', rating: 5, cleanliness: 5, service: 5, location: 5, title: 'Lokasi sangat strategis', body: 'Sarapan enak, staf ramah, dan rooftop pool-nya luar biasa saat malam. Lift agak ramai jam 8 pagi tapi masih wajar.' },
    { hotelId: h1.hotel.id, guestName: 'Melati Putri', rating: 4, cleanliness: 5, service: 4, location: 5, title: 'Nyaman untuk perjalanan bisnis', body: 'Meja kerja luas dan internet cepat. Kamar mandi bersih, hanya saja AC sedikit berisik di kamar saya.' },
    { hotelId: h2.hotel.id, guestName: 'Kevin Halim', rating: 5, cleanliness: 5, service: 5, location: 4, title: 'Vila paling tenang di Ubud', body: 'Kolam privat hangat dan pemandangan lembah luar biasa. Sarapan organik disajikan di teras vila.' },
    { hotelId: h2.hotel.id, guestName: 'Nadia Rahma', rating: 5, cleanliness: 5, service: 5, location: 5, title: 'Bali seperti yang dibayangkan', body: 'Trekking pagi bersama pemandu lokal jadi pengalaman favorit kami. Staf sangat membantu mengatur transport.' },
    { hotelId: h3.hotel.id, guestName: 'Yoga Pratama', rating: 4, cleanliness: 4, service: 4, location: 5, title: 'Dekat pantai dan kafe', body: 'Kelas surf gratisnya seru. Kamar cukup kecil tapi bersih dan cocok untuk solo traveler.' },
    { hotelId: h4.hotel.id, guestName: 'Sri Lestari', rating: 5, cleanliness: 4, service: 5, location: 5, title: 'Gudeg terbaik untuk sarapan', body: 'Bangunan klasik yang terawat. Jalan kaki ke Malioboro hanya 3 menit.' },
    { hotelId: h5.hotel.id, guestName: 'Dimas Arya', rating: 5, cleanliness: 5, service: 4, location: 4, title: 'Sejuk dan tenang', body: 'Api unggun sore hari menyenangkan untuk anak-anak. Sarapan lokalnya bervariasi.' },
    { hotelId: h7.hotel.id, guestName: 'Clara Wijaya', rating: 5, cleanliness: 5, service: 5, location: 5, title: 'Vila impian di Senggigi', body: 'Bangun tidur langsung melihat laut. Antar-jemput pelabuhan tepat waktu dan gratis.' },
    { hotelId: h8.hotel.id, guestName: 'Rizky Maulana', rating: 4, cleanliness: 4, service: 5, location: 4, title: 'Hostel terbaik untuk tur Komodo', body: 'Agen tur di lobi membantu mengatur trip 2 hari 1 malam. Kopi Flores gratis!' },
    { hotelId: h9.hotel.id, guestName: 'Intan Permata', rating: 4, cleanliness: 4, service: 4, location: 3, title: 'Cocok untuk menginap lama', body: 'Dapur lengkap dan mesin cuci berfungsi baik. Lokasi agak jauh dari pusat kota.' },
    { hotelId: h10.hotel.id, guestName: 'Bagus Setiawan', rating: 4, cleanliness: 4, service: 4, location: 5, title: 'Penyelamat penerbangan pagi', body: 'Check-in tengah malam lancar, antar-jemput terminal cepat.' },
  ];

  const reviews = reviewSeeds.map((review) => ({
    id: randomUUID(),
    hotelId: review.hotelId,
    userId: null,
    guestName: review.guestName,
    rating: review.rating,
    cleanliness: review.cleanliness,
    service: review.service,
    location: review.location,
    title: review.title,
    body: review.body,
    verifiedStay: true,
    createdAt: new Date(`${addDays(today, -30 - Math.floor(Math.random() * 120))}T10:00:00.000Z`).toISOString(),
    response: null,
    hidden: false,
  }));

  reviews.push({
    id: randomUUID(),
    hotelId: h2.hotel.id,
    userId: tama.id,
    guestName: 'Tama Pratama',
    rating: 5,
    cleanliness: 5,
    service: 5,
    location: 5,
    title: 'Sudah dua kali kembali',
    body: 'Konsisten: pelayanan hangat, vila bersih, dan sarapan selalu segar. Tempat favorit keluarga kami di Ubud.',
    verifiedStay: true,
    createdAt: new Date(`${addDays(today, -12)}T08:30:00.000Z`).toISOString(),
    response: { by: 'Ubud Cliff Retreat', body: 'Terima kasih banyak, Tama! Sampai jumpa lagi.', at: nowIso },
    hidden: false,
  });

  const promos = [
    {
      id: randomUUID(),
      code: 'HEMAT10',
      title: 'Hemat 10% semua hotel',
      description: 'Diskon 10% hingga Rp200.000 untuk semua destinasi.',
      type: 'percent',
      value: 10,
      maxDiscount: 200000,
      minSpend: 500000,
      city: null,
      validUntil: addDays(today, 90),
      usageLimit: 1000,
      usedCount: 0,
      active: true,
    },
    {
      id: randomUUID(),
      code: 'WEEKEND50',
      title: 'Potongan Rp50.000 akhir pekan',
      description: 'Potongan langsung Rp50.000 dengan minimum transaksi Rp750.000.',
      type: 'fixed',
      value: 50000,
      maxDiscount: 50000,
      minSpend: 750000,
      city: null,
      validUntil: addDays(today, 45),
      usageLimit: 500,
      usedCount: 0,
      active: true,
    },
    {
      id: randomUUID(),
      code: 'UBUD15',
      title: 'Liburan Bali 15%',
      description: 'Diskon 15% hingga Rp400.000 khusus hotel di Bali.',
      type: 'percent',
      value: 15,
      maxDiscount: 400000,
      minSpend: 1000000,
      city: 'Bali',
      validUntil: addDays(today, 60),
      usageLimit: 200,
      usedCount: 0,
      active: true,
    },
  ];

  const holds = [];

  function makeBooking({ code, userId, hotel, roomType, checkIn, checkOut, rooms = 1, adults = 2, children = 0, status, paymentStatus, paymentMethod, specialRequests = '', createdAt, pointsAwarded = false }) {
    const price = quoteStay({
      roomType,
      checkIn,
      checkOut,
      rooms,
      earnMultiplier: 1,
    });
    return {
      id: randomUUID(),
      code,
      userId,
      hotelId: hotel.id,
      roomTypeId: roomType.id,
      rooms,
      adults,
      children,
      checkIn,
      checkOut,
      guest: { name: users.find((user) => user.id === userId)?.name ?? 'Tamu', email: users.find((user) => user.id === userId)?.email ?? '', phone: users.find((user) => user.id === userId)?.phone ?? '' },
      specialRequests,
      price,
      status,
      paymentStatus,
      paymentMethod,
      qrToken: randomUUID(),
      roomNumber: null,
      reservationExpiresAt: status === 'pending_payment' ? new Date(now.getTime() + 30 * 60_000).toISOString() : null,
      requestExpiresAt: status === 'pending_confirmation' ? new Date(now.getTime() + 24 * 3600_000).toISOString() : null,
      pointsAwarded,
      createdAt,
      updatedAt: createdAt,
      checkedInAt: null,
      checkedOutAt: null,
      reviewId: null,
      cancellation: null,
      modification: null,
    };
  }

  const hotelById = (id) => hotels.find((hotel) => hotel.id === id);
  const roomById = (id) => roomTypes.find((room) => room.id === id);

  const bookings = [
    makeBooking({
      code: 'HR-9F2K7Q',
      userId: demo.id,
      hotel: hotelById(h1.hotel.id),
      roomType: roomById(h1.roomTypes[0].id),
      checkIn: addDays(today, -40),
      checkOut: addDays(today, -37),
      status: 'completed',
      paymentStatus: 'paid',
      paymentMethod: 'qris',
      createdAt: new Date(`${addDays(today, -50)}T09:12:00.000Z`).toISOString(),
      pointsAwarded: true,
    }),
    makeBooking({
      code: 'HR-4M8XP2',
      userId: demo.id,
      hotel: hotelById(h2.hotel.id),
      roomType: roomById(h2.roomTypes[0].id),
      checkIn: addDays(today, 5),
      checkOut: addDays(today, 8),
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'bca_va',
      specialRequests: 'Kamar lantai atas dengan pemandangan lembah bila memungkinkan.',
      createdAt: new Date(`${addDays(today, -3)}T14:20:00.000Z`).toISOString(),
      pointsAwarded: false,
    }),
    makeBooking({
      code: 'HR-7QZ3ND',
      userId: demo.id,
      hotel: hotelById(h3.hotel.id),
      roomType: roomById(h3.roomTypes[1].id),
      checkIn: addDays(today, 21),
      checkOut: addDays(today, 23),
      status: 'pending_confirmation',
      paymentStatus: 'on_arrival',
      paymentMethod: 'pay_at_hotel',
      createdAt: new Date(now.getTime() - 2 * 3600_000).toISOString(),
      pointsAwarded: false,
    }),
    makeBooking({
      code: 'HR-2WJ5HT',
      userId: tama.id,
      hotel: hotelById(h1.hotel.id),
      roomType: roomById(h1.roomTypes[2].id),
      checkIn: addDays(today, 1),
      checkOut: addDays(today, 3),
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'gopay',
      createdAt: new Date(`${addDays(today, -6)}T11:05:00.000Z`).toISOString(),
    }),
  ];

  const payments = bookings
    .filter((booking) => booking.paymentStatus === 'paid' || booking.paymentStatus === 'on_arrival')
    .map((booking) => {
      const method = {
        qris: { label: 'QRIS', kind: 'qris' },
        bca_va: { label: 'Virtual Account BCA', kind: 'va' },
        gopay: { label: 'GoPay', kind: 'ewallet' },
        pay_at_hotel: { label: 'Bayar di Hotel', kind: 'on_arrival' },
      }[booking.paymentMethod] ?? { label: 'QRIS', kind: 'qris' };
      return {
        id: randomUUID(),
        orderId: `${booking.code}-SEED`,
        bookingId: booking.id,
        bookingCode: booking.code,
        userId: booking.userId,
        provider: 'hotelreserve-sandbox',
        method: booking.paymentMethod,
        methodLabel: method.label,
        kind: method.kind,
        amount: booking.price.total,
        currency: 'IDR',
        status: booking.paymentStatus === 'paid' ? 'paid' : 'on_arrival',
        expiresAt: null,
        paidAt: booking.createdAt,
        failedAt: null,
        refundedAt: null,
        refundAmount: 0,
        idempotencyKey: `${booking.id}:seed`,
        instructions: [],
        createdAt: booking.createdAt,
      };
    });

  const notifications = [
    {
      id: randomUUID(),
      userId: demo.id,
      type: 'welcome',
      title: 'Selamat datang di Hotel Reserve',
      body: 'Akun Anda aktif. Kumpulkan poin setiap menginap dan naikkan tier membership Anda.',
      link: '#/account',
      read: false,
      createdAt: nowIso,
    },
    {
      id: randomUUID(),
      userId: demo.id,
      type: 'booking_confirmed',
      title: 'Reservasi Ubud Cliff Retreat terkonfirmasi',
      body: 'Kode booking HR-4M8XP2. Tunjukkan e-voucher saat check-in.',
      link: '#/trips',
      read: false,
      createdAt: new Date(now.getTime() - 3 * 3600_000).toISOString(),
    },
    {
      id: randomUUID(),
      userId: demo.id,
      type: 'checkin_reminder',
      title: 'Persiapan check-in',
      body: 'Perjalanan Anda ke Ubud Cliff Retreat dimulai 5 hari lagi.',
      link: '#/trips',
      read: false,
      createdAt: new Date(now.getTime() - 6 * 3600_000).toISOString(),
    },
  ];

  return {
    meta: { version: 1, createdAt: nowIso, seededAt: nowIso },
    users,
    hotels,
    roomTypes,
    bookings,
    holds,
    payments,
    reviews,
    favorites: [
      { id: randomUUID(), userId: demo.id, hotelId: h2.hotel.id, createdAt: nowIso },
      { id: randomUUID(), userId: demo.id, hotelId: h7.hotel.id, createdAt: nowIso },
    ],
    promos,
    notifications,
    refunds: [],
    auditLog: [],
    wishlists: [],
  };
}
