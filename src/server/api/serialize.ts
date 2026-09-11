import type { CompanyRow } from "../db/types.js";

export function serializeCompany(row: CompanyRow, distanceKm?: number) {
  return {
    id: row.id,
    domain: row.domain,
    companyName: row.company_name,
    website: row.website,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    phone: row.phone,
    lat: row.lat,
    lon: row.lon,
    geocodeSource: row.geocode_source,
    companyType: row.company_type,
    services: JSON.parse(row.services) as string[],
    targetSegments: JSON.parse(row.target_segments) as string[],
    manufacturerMentions: JSON.parse(row.manufacturer_mentions) as unknown[],
    certifications: JSON.parse(row.certifications) as string[],
    scoreFachlichkeit: row.score_fachlichkeit,
    scorePotenzial: row.score_potenzial,
    scoreDatenqualitaet: row.score_datenqualitaet,
    priority: row.priority,
    verificationStatus: row.verification_status,
    status: row.status,
    note: row.note,
    salesFeedback: row.sales_feedback,
    feedbackNote: row.feedback_note,
    lastUpdated: row.last_updated,
    ...(distanceKm !== undefined ? { distanceKm: Math.round(distanceKm * 10) / 10 } : {}),
  };
}
