import { z } from "zod";

/**
 * Stufe-2-JSON-Schema, woertlich aus docs/spezifikation.md §6 uebernommen.
 * Wird 1:1 als response_format.json_schema.schema an die Agent API gesendet.
 * NICHT eigenmaechtig aendern -- die Abweichungen vom Ursprungsentwurf sind
 * in der Spec (§6, Punkte 1-8) begruendet (z.B. keine minItems bei
 * evidence/sources, keine Score-Felder).
 */
export const STAGE2_JSON_SCHEMA = {
  name: "xortec_company_qualification",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "company_name",
      "website",
      "street",
      "postal_code",
      "city",
      "phone",
      "is_facherrichter",
      "company_type",
      "services",
      "target_segments",
      "manufacturer_mentions",
      "certifications",
      "size_indicators",
      "reference_projects",
      "evidence",
      "sources",
    ],
    properties: {
      company_name: { type: "string" },
      website: { type: ["string", "null"] },
      street: { type: ["string", "null"] },
      postal_code: { type: ["string", "null"], pattern: "^[0-9]{5}$" },
      city: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      is_facherrichter: { type: "boolean" },
      company_type: {
        type: "string",
        enum: [
          "security_systems_installer",
          "video_surveillance_installer",
          "alarm_security_installer",
          "electrical_installer",
          "it_system_integrator",
          "building_technology_installer",
          "mixed_security_integrator",
          "security_service_no_installation",
          "reseller_only",
          "other",
          "unknown",
        ],
      },
      services: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "video_surveillance",
            "video_management_system",
            "nvr_recording",
            "server_storage_raid",
            "network_poe",
            "fiber_optics",
            "access_control",
            "video_intercom",
            "intrusion_alarm",
            "fire_detection",
            "planning_design",
            "installation",
            "commissioning",
            "maintenance_service",
            "remote_maintenance",
            "monitoring_station",
            "license_plate_recognition",
            "video_analytics",
            "thermal_imaging",
            "other",
          ],
        },
      },
      target_segments: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "private_customers",
            "small_business",
            "commercial",
            "retail",
            "industry",
            "logistics",
            "property_management",
            "public_sector",
            "education",
            "healthcare",
            "critical_infrastructure",
            "other",
          ],
        },
      },
      manufacturer_mentions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["manufacturer", "relationship"],
          properties: {
            manufacturer: { type: "string" },
            relationship: { type: "string", enum: ["certified_partner", "mentioned_only"] },
          },
        },
      },
      certifications: {
        type: "array",
        items: {
          type: "string",
          enum: ["vds", "bhe", "din_14675", "iso_9001", "k_einbruch", "other"],
        },
      },
      size_indicators: { type: ["string", "null"] },
      reference_projects: { type: "array", items: { type: "string" } },
      evidence: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "title", "evidence"],
          properties: {
            url: { type: "string" },
            title: { type: "string" },
            evidence: { type: "string" },
          },
        },
      },
    },
  },
} as const;

const nullableString = z.string().nullable();

export const stage2ResponseSchema = z.object({
  company_name: z.string(),
  website: nullableString,
  street: nullableString,
  postal_code: z
    .string()
    .regex(/^[0-9]{5}$/)
    .nullable(),
  city: nullableString,
  phone: nullableString,
  is_facherrichter: z.boolean(),
  company_type: z.enum([
    "security_systems_installer",
    "video_surveillance_installer",
    "alarm_security_installer",
    "electrical_installer",
    "it_system_integrator",
    "building_technology_installer",
    "mixed_security_integrator",
    "security_service_no_installation",
    "reseller_only",
    "other",
    "unknown",
  ]),
  services: z.array(
    z.enum([
      "video_surveillance",
      "video_management_system",
      "nvr_recording",
      "server_storage_raid",
      "network_poe",
      "fiber_optics",
      "access_control",
      "video_intercom",
      "intrusion_alarm",
      "fire_detection",
      "planning_design",
      "installation",
      "commissioning",
      "maintenance_service",
      "remote_maintenance",
      "monitoring_station",
      "license_plate_recognition",
      "video_analytics",
      "thermal_imaging",
      "other",
    ])
  ),
  target_segments: z.array(
    z.enum([
      "private_customers",
      "small_business",
      "commercial",
      "retail",
      "industry",
      "logistics",
      "property_management",
      "public_sector",
      "education",
      "healthcare",
      "critical_infrastructure",
      "other",
    ])
  ),
  manufacturer_mentions: z.array(
    z.object({
      manufacturer: z.string(),
      relationship: z.enum(["certified_partner", "mentioned_only"]),
    })
  ),
  certifications: z.array(z.enum(["vds", "bhe", "din_14675", "iso_9001", "k_einbruch", "other"])),
  size_indicators: nullableString,
  reference_projects: z.array(z.string()),
  evidence: z.array(z.string()),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      evidence: z.string(),
    })
  ),
});

export type Stage2Response = z.infer<typeof stage2ResponseSchema>;
