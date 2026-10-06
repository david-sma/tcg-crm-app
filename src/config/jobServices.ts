export interface JobServiceOption {
  id: string;
  label: string;
  /** Regional synonyms shown as secondary hints (NZ / AU / UK / US / CA). */
  hints?: string[];
}

export interface JobServiceCategory {
  id: string;
  label: string;
  services: JobServiceOption[];
}

export interface JobTypeOption {
  id: string;
  label: string;
}

export const JOB_TYPE_OPTIONS: JobTypeOption[] = [
  { id: 'residential_clean', label: 'Residential clean' },
  { id: 'commercial_clean', label: 'Commercial / office clean' },
  { id: 'end_of_tenancy', label: 'End of tenancy / move-out clean' },
  { id: 'move_in_clean', label: 'Move-in clean' },
  { id: 'post_builders', label: 'Post-builders / after-construction clean' },
  { id: 'deep_clean', label: 'Deep clean' },
  { id: 'carpet_upholstery', label: 'Carpet & upholstery' },
  { id: 'windows_exterior', label: 'Windows & exterior' },
  { id: 'common_areas', label: 'Common areas / body corporate' },
  { id: 'specialty', label: 'Specialty / remediation' },
  { id: 'other', label: 'Other' },
];

export const JOB_SERVICE_CATEGORIES: JobServiceCategory[] = [
  {
    id: 'general',
    label: 'General cleaning',
    services: [
      { id: 'regular_house_clean', label: 'Regular house clean' },
      { id: 'deep_clean', label: 'Deep clean' },
      { id: 'end_of_tenancy', label: 'End of tenancy / move-out clean', hints: ['US/CA: move-out clean'] },
      { id: 'move_in_clean', label: 'Move-in clean' },
      { id: 'spring_clean', label: 'Spring clean' },
      { id: 'pre_inspection', label: 'Pre-inspection / rental touch-up' },
      { id: 'holiday_home_turnover', label: 'Holiday home / Airbnb turnover', hints: ['US: vacation rental turnover'] },
      { id: 'post_builders_clean', label: 'Post-builders clean', hints: ['after-construction clean'] },
      { id: 'renovation_clean', label: 'Renovation clean' },
      { id: 'declutter_hoarding', label: 'Declutter / hoarding support' },
    ],
  },
  {
    id: 'carpet_floors',
    label: 'Carpet & floors',
    services: [
      { id: 'carpet_steam', label: 'Carpet steam / hot water extraction' },
      { id: 'carpet_dry', label: 'Carpet dry / encapsulation clean' },
      { id: 'upholstery_clean', label: 'Upholstery clean' },
      { id: 'rug_clean', label: 'Rug clean' },
      { id: 'floor_strip_seal', label: 'Hard floor strip & seal' },
      { id: 'floor_scrub_polish', label: 'Floor scrub / machine polish' },
      { id: 'tile_grout_clean', label: 'Tile & grout clean' },
      { id: 'stain_protection', label: 'Stain protection (Scotchgard)' },
    ],
  },
  {
    id: 'windows_exterior',
    label: 'Windows & exterior',
    services: [
      { id: 'windows_interior', label: 'Windows — interior' },
      { id: 'windows_exterior', label: 'Windows — exterior' },
      { id: 'windows_full', label: 'Windows — full inside & out' },
      { id: 'gutter_clean', label: 'Gutter cleaning' },
      { id: 'house_wash', label: 'House wash / soft wash' },
      { id: 'water_blasting', label: 'Water blasting / pressure washing', hints: ['US/CA: pressure washing', 'UK: jet washing'] },
      { id: 'roof_wash', label: 'Roof wash / moss treatment' },
      { id: 'deck_clean', label: 'Deck clean & treatment' },
      { id: 'conservatory_clean', label: 'Conservatory / glass roof' },
      { id: 'solar_panel_clean', label: 'Solar panel cleaning' },
      { id: 'graffiti_removal', label: 'Graffiti removal' },
      { id: 'gum_removal', label: 'Chewing gum removal' },
    ],
  },
  {
    id: 'kitchen_appliances',
    label: 'Kitchen & appliances',
    services: [
      { id: 'oven_clean', label: 'Oven clean' },
      { id: 'rangehood_clean', label: 'Rangehood / exhaust clean' },
      { id: 'fridge_deep_clean', label: 'Fridge / freezer deep clean' },
      { id: 'dishwasher_deep_clean', label: 'Dishwasher deep clean' },
    ],
  },
  {
    id: 'bathroom_sanitisation',
    label: 'Bathrooms & sanitisation',
    services: [
      { id: 'bathroom_deep_clean', label: 'Bathroom deep clean' },
      { id: 'mould_treatment', label: 'Mould treatment', hints: ['US: mold treatment'] },
      { id: 'sugar_soaping', label: 'Sugar soaping (walls & ceilings)', hints: ['US/CA: wall washing / TSP clean'] },
      { id: 'sanitisation', label: 'Sanitisation / disinfection', hints: ['US: sanitization'] },
      { id: 'fogging', label: 'Fogging' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    services: [
      { id: 'office_clean', label: 'Office clean' },
      { id: 'medical_facility', label: 'Medical / healthcare touch-point disinfection' },
      { id: 'school_childcare', label: 'School / childcare clean' },
      { id: 'gym_fitness', label: 'Gym / fitness clean' },
      { id: 'retail_clean', label: 'Retail clean' },
      { id: 'warehouse_factory', label: 'Warehouse / factory clean' },
      { id: 'common_areas', label: 'Body corporate / common areas', hints: ['US: HOA common areas', 'AU: strata'] },
      { id: 'bin_waste_area', label: 'Bin / waste area clean' },
      { id: 'waste_removal', label: 'Waste removal / skip loading', hints: ['US: trash/garbage removal'] },
    ],
  },
  {
    id: 'specialty',
    label: 'Specialty',
    services: [
      { id: 'biohazard_trauma', label: 'Biohazard / trauma clean' },
      { id: 'flood_dry_out', label: 'Flood / water damage dry-out' },
      { id: 'fire_soot_clean', label: 'Fire / soot damage clean' },
      { id: 'mould_remediation', label: 'Mould remediation', hints: ['US: mold remediation'] },
      { id: 'carpet_stain_treatment', label: 'Carpet stain treatment' },
    ],
  },
];

export const LEAD_SOURCE_OPTIONS: { id: string; label: string }[] = [
  { id: 'manual', label: 'Manual entry' },
  { id: 'phone', label: 'Phone enquiry' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'website', label: 'Website' },
  { id: 'referral', label: 'Referral' },
  { id: 'other', label: 'Other' },
];

const SERVICE_INDEX = new Map<string, string>();
for (const category of JOB_SERVICE_CATEGORIES) {
  for (const service of category.services) {
    SERVICE_INDEX.set(service.id, service.label);
  }
}

export function getJobServiceLabel(serviceId: string): string {
  return SERVICE_INDEX.get(serviceId) || serviceId;
}

export function getJobServiceLabels(serviceIds: string[]): string[] {
  return serviceIds.map(getJobServiceLabel);
}

export function getJobTypeLabel(typeId: string): string {
  return JOB_TYPE_OPTIONS.find((option) => option.id === typeId)?.label || typeId;
}

export function getLeadSourceLabel(sourceId: string): string {
  return LEAD_SOURCE_OPTIONS.find((option) => option.id === sourceId)?.label || sourceId;
}
