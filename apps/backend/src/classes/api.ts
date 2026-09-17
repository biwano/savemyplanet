/** Wire shape for GET /classes (docs/plan.md API contract). */
export type APICarbonClass = {
  carbonClass: string
  name: string
  description?: string
  /** Absolute URL to a display-sized AVIF (class art or backend default). */
  imageUrl: string
}

export type APIClassesResponse = {
  classes: APICarbonClass[]
}
