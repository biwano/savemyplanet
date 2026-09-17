/**
 * Curated UX copy + image filenames for Klima carbon classes.
 * Descriptions researched from public project/registry materials (UCR, City Forest
 * Credits / Regen, Puro biochar, Carbonmark / Limenet OAE) — not Klima wholesale.
 * Keyed by Klima `carbonClassId` (lowercase).
 */

/** Supported `?lang=` values for GET /classes (fallback: en). */
export const CARBON_CLASS_LANGS = ['en', 'fr'] as const
export type CarbonClassLang = (typeof CARBON_CLASS_LANGS)[number]
export const DEFAULT_CARBON_CLASS_LANG: CarbonClassLang = 'en'

export type CarbonClassMetadata = {
  /** Localized short descriptions; always include `en`. */
  description: Partial<Record<CarbonClassLang, string>> & { en: string }
  /** Filename under `static/carbonclasses/`. */
  imageFile: string
}

export const DEFAULT_CARBON_CLASS_IMAGE = 'default.avif'

/** Live discover ids as of research; extend when new named classes appear. */
export const CARBON_CLASS_METADATA: Readonly<
  Record<string, CarbonClassMetadata>
> = {
  // Wind Energy - Small Scale
  '0x0008f35758a4318942ecb5d5414116ce7b1ede2d': {
    description: {
      en: 'Small-scale wind farms that supply clean electricity and avoid fossil-fuel grid emissions. Credits are typically issued under the Universal Carbon Registry (UCR) for renewable energy projects under about 15 MW.',
      fr: 'Parcs éoliens de petite taille qui fournissent de l’électricité propre et évitent les émissions du réseau fossile. Les crédits sont généralement émis sous le Universal Carbon Registry (UCR) pour des projets renouvelables d’environ 15 MW ou moins.',
    },
    imageFile: 'wind-energy-small-scale.avif',
  },
  // Regen Network - City Forest Credits
  '0xf4699531e0a5f6e9351a36de3753deaad329bf45': {
    description: {
      en: 'Urban tree planting and forest preservation in cities and towns. City Forest Credits issues verified urban-forestry credits; Regen Network brings them on-chain so buyers can support canopy where people live.',
      fr: 'Plantation d’arbres et préservation de forêts en milieu urbain. City Forest Credits émet des crédits vérifiés de foresterie urbaine ; Regen Network les rend disponibles on-chain pour soutenir la canopée là où les gens vivent.',
    },
    imageFile: 'regen-network-city-forest-credits.avif',
  },
  // Ocean Alkalinity Enhancement
  '0x1b597da36afa2e88c3dca55b4143251d4eb0e3da': {
    description: {
      en: 'Ocean-based carbon removal that increases seawater alkalinity so the ocean can lock away CO₂ as stable bicarbonates for the long term, while helping counter ocean acidification. Associated with CMARK / Limenet-style projects.',
      fr: 'Retrait de carbone océanique qui augmente l’alcalinité de l’eau de mer pour stocker durablement le CO₂ sous forme de bicarbonates stables, tout en aidant à contrer l’acidification des océans. Associé à des projets de type CMARK / Limenet.',
    },
    imageFile: 'ocean-alkalinity-enhancement.avif',
  },
  // Biochar
  '0x4d6fce4eb76f093f5948dcb7ff4364427d70bcb8': {
    description: {
      en: 'Durable carbon removal: biomass is heated into biochar and stored in soil or other approved uses so carbon stays locked away for centuries. Commonly certified under Puro.earth as CO₂ Removal Certificates (CORCs).',
      fr: 'Retrait durable de carbone : la biomasse est transformée en biochar puis stockée dans le sol ou d’autres usages approuvés, pour verrouiller le carbone pendant des siècles. Souvent certifié sous Puro.earth (CORC).',
    },
    imageFile: 'biochar.avif',
  },
  // Solar PV - Small Scale
  '0x1ff9bd464155d32fd2f9d302008d38544c0ae371': {
    description: {
      en: 'Small-scale solar photovoltaic plants that generate clean electricity and avoid fossil-fuel grid emissions. Credits are typically issued under the Universal Carbon Registry (UCR) for renewable projects under about 15 MW.',
      fr: 'Centrales solaires photovoltaïques de petite taille qui produisent de l’électricité propre et évitent les émissions du réseau fossile. Les crédits sont généralement émis sous le Universal Carbon Registry (UCR) pour des projets renouvelables d’environ 15 MW ou moins.',
    },
    imageFile: 'solar-pv-small-scale.avif',
  },
}

export function parseCarbonClassLang(
  raw: string | undefined,
): CarbonClassLang {
  if (raw == null || raw.trim() === '') {
    return DEFAULT_CARBON_CLASS_LANG
  }
  const normalized = raw.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  const match = CARBON_CLASS_LANGS.find((lang) => lang === normalized)
  return match ?? DEFAULT_CARBON_CLASS_LANG
}

export function metadataForCarbonClass(
  carbonClassId: string,
): CarbonClassMetadata | undefined {
  return CARBON_CLASS_METADATA[carbonClassId.toLowerCase()]
}

export function descriptionForCarbonClass(
  carbonClassId: string,
  lang: CarbonClassLang,
): string | undefined {
  const meta = metadataForCarbonClass(carbonClassId)
  if (!meta) {
    return undefined
  }
  return meta.description[lang] ?? meta.description.en
}

export function imageFileForCarbonClass(carbonClassId: string): string {
  return (
    metadataForCarbonClass(carbonClassId)?.imageFile ??
    DEFAULT_CARBON_CLASS_IMAGE
  )
}
