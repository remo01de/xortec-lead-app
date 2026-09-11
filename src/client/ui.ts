export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; }
  catch { return null; }
}

export function navigationUrl(c: { street: string | null; postalCode: string | null; city: string | null; lat: number | null; lon: number | null; companyName: string }): string | null {
  const address = [c.street, c.postalCode, c.city].filter(Boolean).join(', ');
  // Postal-code centroids are not an accurate navigation destination: prefer the street address.
  const destination = c.street && (c.city || c.postalCode) ? `${c.companyName}, ${address}` : null;
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export const STATUS_LABELS = { neu: 'Neu', angerufen: 'Angerufen', kein_interesse: 'Kein Interesse', in_salesforce: 'In Salesforce', bestandskunde: 'Bestandskunde' };

export const SIGNAL_LABELS: Record<string, string> = {
  video_surveillance: 'Videoüberwachung', video_management_system: 'Videomanagement (VMS)', nvr_recording: 'NVR-Aufzeichnung', server_storage_raid: 'Server / Storage / RAID', network_poe: 'Netzwerk / PoE', fiber_optics: 'Glasfaser', access_control: 'Zutrittskontrolle', video_intercom: 'Video-Gegensprechanlagen', intrusion_alarm: 'Einbruchmeldeanlagen', fire_detection: 'Brandmeldetechnik', planning_design: 'Planung', installation: 'Installation', commissioning: 'Inbetriebnahme', maintenance_service: 'Wartung / Service', remote_maintenance: 'Fernwartung', monitoring_station: 'Leitstelle', license_plate_recognition: 'Kennzeichenerkennung', video_analytics: 'Videoanalyse', thermal_imaging: 'Wärmebildtechnik', other: 'Sonstige', private_customers: 'Privatkunden', small_business: 'Kleinunternehmen', commercial: 'Gewerbe', retail: 'Handel', industry: 'Industrie', logistics: 'Logistik', property_management: 'Immobilienverwaltung', public_sector: 'Öffentliche Hand', education: 'Bildung', healthcare: 'Gesundheitswesen', critical_infrastructure: 'KRITIS', vds: 'VdS', bhe: 'BHE', din_14675: 'DIN 14675', iso_9001: 'ISO 9001', k_einbruch: 'K-Einbruch',
};
