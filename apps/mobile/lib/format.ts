/** Format USD cents as a display string (e.g. 1234 → "$12.34"). */
export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}
