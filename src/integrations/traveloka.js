/**
 * Traveloka integration — PLACEHOLDER / FUTURE API.
 *
 * Hotel Reserve must stay fully operational on its own. This adapter defines the
 * shape a real partnership integration would use, but it never fakes data:
 * unless credentials are configured, every call reports "not configured" and
 * the UI keeps using the internal inventory.
 *
 * Expected environment variables when a partnership exists:
 *   TRAVELOKA_API_KEY, TRAVELOKA_PARTNER_ID, TRAVELOKA_BASE_URL
 */
export function createTravelokaAdapter(env = process.env) {
  const apiKey = env.TRAVELOKA_API_KEY ?? '';
  const partnerId = env.TRAVELOKA_PARTNER_ID ?? '';
  const baseUrl = env.TRAVELOKA_BASE_URL ?? '';
  const configured = Boolean(apiKey && partnerId);

  const capabilities = [
    { key: 'property_search', label: 'Pencarian properti mitra', ready: false },
    { key: 'rate_parity_sync', label: 'Sinkronisasi harga & ketersediaan', ready: false },
    { key: 'reservation_push', label: 'Pengiriman reservasi ke mitra', ready: false },
    { key: 'content_import', label: 'Impor konten & foto hotel', ready: false },
  ];

  return {
    provider: 'Traveloka',
    mode: 'placeholder',
    configured,
    status: configured ? 'credentials_present_not_implemented' : 'not_configured',
    capabilities,
    docsNote:
      'Integrasi ini menunggu kerja sama resmi dan kredensial API Traveloka. Hotel Reserve tetap berjalan mandiri tanpa integrasi ini.',
    requiredEnvVars: ['TRAVELOKA_API_KEY', 'TRAVELOKA_PARTNER_ID', 'TRAVELOKA_BASE_URL'],
    async searchHotels() {
      throw new Error('Traveloka API belum tersedia: adaptor masih berupa placeholder.');
    },
    async pushAvailability() {
      throw new Error('Traveloka API belum tersedia: adaptor masih berupa placeholder.');
    },
  };
}

export function travelokaStatus(env = process.env) {
  const adapter = createTravelokaAdapter(env);
  return {
    provider: adapter.provider,
    mode: adapter.mode,
    configured: adapter.configured,
    status: adapter.status,
    capabilities: adapter.capabilities,
    docsNote: adapter.docsNote,
    requiredEnvVars: adapter.requiredEnvVars,
  };
}
