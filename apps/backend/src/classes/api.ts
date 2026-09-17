/** Wire shape for GET /classes (docs/plan.md API contract). */
export type APICarbonClass = {
  carbonClass: string
  name: string
  description?: string
  /** Absolute URL to a display-sized AVIF (class art or backend default). */
  imageUrl: string
  /**
   * Indicative marked-up USD cents per tonne (discover reference × markup).
   * Omitted when discover has no usable wholesale reference.
   */
  pricePerTonne?: number
}

export type APIClassesResponse = {
  classes: APICarbonClass[]
}
