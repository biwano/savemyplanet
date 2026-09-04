/**
 * B5 smoke check: discover catalog + quote 1 t (read-only, no wallet).
 *
 * Usage (from apps/backend):
 *   pnpm klima:discover
 *   pnpm klima:discover -- --amount 0.1 --max-usdc-price 50
 */
import { parseArgs } from 'node:util'
import { AppError } from '../src/errors'
import { klimaBaseUrl, klimaChainId } from '../src/klima/config'
import { discover, quote, type KlimaCarbonClass } from '../src/klima/index'
import { pickCheapestLiquid } from '../src/pricing/pickClass'

const rawArgs = process.argv.slice(2)
// pnpm may forward a literal `--` used to separate script args.
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs

const { values } = parseArgs({
  args,
  options: {
    help: { type: 'boolean', short: 'h' },
    amount: { type: 'string' },
    'max-usdc-price': { type: 'string' },
    'carbon-class': { type: 'string' },
  },
})

if (values.help) {
  console.log(`Browse Klima catalog and price a retirement (read-only).

Usage: pnpm klima:discover -- [options]

Options:
  --amount <t>            tonnes to price (min 0.001)   [1]
  --max-usdc-price <n>    filter catalog to <= n USDC/t
  --carbon-class <0x…>    quote this class (else cheapest liquid)
  -h, --help              show this help`)
  process.exit(0)
}

const amount = values.amount ?? '1'
const maxUsdcPricePerTonne =
  values['max-usdc-price'] != null ? Number(values['max-usdc-price']) : undefined
const forcedClass = values['carbon-class']

function classLiquidity(cc: KlimaCarbonClass): number {
  return (cc.creditsDetailed ?? []).reduce(
    (sum, cr) => sum + Number(cr.liquidityFormatted ?? 0),
    0,
  )
}

async function main() {
  console.log(`Klima baseUrl=${klimaBaseUrl()} chainId=${klimaChainId()}\n`)

  const catalog = await discover(
    maxUsdcPricePerTonne != null ? { maxUsdcPricePerTonne } : {},
  )

  console.log(`Catalog (${catalog.carbonClasses.length} classes)\n`)
  for (const cc of catalog.carbonClasses) {
    const liquidity = classLiquidity(cc)
    console.log(
      `  ${cc.carbonClassId}  $${cc.priceUsdcPerTonneFormatted ?? '?'}/t` +
        `  ${cc.name ?? 'unnamed'}  (${liquidity.toFixed(1)} t liquid)`,
    )
  }

  let carbonClass: string
  let creditToken: string | undefined

  if (forcedClass) {
    carbonClass = forcedClass
    const match = catalog.carbonClasses.find((c) => c.carbonClassId === forcedClass)
    if (!match) {
      console.warn(`\nWarning: ${forcedClass} not in discover results; quoting anyway.`)
    }
  } else {
    const pick = pickCheapestLiquid(catalog.carbonClasses, Number(amount))
    if (!pick) {
      console.error(`\nNo credit has ${amount} t of liquidity. Lower --amount.`)
      process.exit(1)
    }
    carbonClass = pick.carbonClassId
    creditToken = pick.creditToken
    console.log(`\nCheapest liquid pick`)
    console.log(`  carbonClass  ${carbonClass}  (${pick.name ?? 'unnamed'})`)
    if (creditToken) {
      console.log(`  creditToken  ${creditToken}`)
    }
  }

  const q = await quote({
    amount,
    carbonClass,
    ...(creditToken ? { creditToken } : {}),
  })

  console.log(`\nQuote (amount=${amount}) — wholesale, server-only`)
  console.log(`  total         ${q.totalFormatted} USDC (raw ${q.total})`)
  console.log(`  humanSummary  ${q.humanSummary ?? '(none)'}`)
  if (q.resolvedCredit) {
    console.log(`  resolvedCredit ${JSON.stringify(q.resolvedCredit)}`)
  }
  console.log('')
}

main().catch((err) => {
  if (err instanceof AppError) {
    console.error(`\n✗ ${err.message} (${err.status})`)
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})
