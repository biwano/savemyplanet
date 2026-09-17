import type { KlimaCarbonClass } from '../klima/index'
import { markupBps } from '../pricing/config'
import { markedUpCentsFromUsdcDollarsFormatted } from '../pricing/markup'
import type { APICarbonClass } from './api'
import {
  descriptionForCarbonClass,
  imageFileForCarbonClass,
  type CarbonClassLang,
} from './metadata'

/** Map an already catalog-filtered discover list to the wire shape. */
export function toApiCarbonClasses(
  classes: KlimaCarbonClass[],
  imageUrlForFile: (imageFile: string) => string,
  lang: CarbonClassLang,
): APICarbonClass[] {
  const bps = markupBps()
  const out: APICarbonClass[] = []

  for (const cc of classes) {
    const name = cc.name?.trim()
    if (!name) {
      continue
    }

    const description = descriptionForCarbonClass(cc.carbonClassId, lang)
    const imageFile = imageFileForCarbonClass(cc.carbonClassId)
    const item: APICarbonClass = {
      carbonClass: cc.carbonClassId,
      name,
      imageUrl: imageUrlForFile(imageFile),
    }
    if (description) {
      item.description = description
    }
    const wholesale = cc.priceUsdcPerTonneFormatted
    if (wholesale != null) {
      const pricePerTonne = markedUpCentsFromUsdcDollarsFormatted(
        wholesale,
        bps,
      )
      if (pricePerTonne != null) {
        item.pricePerTonne = pricePerTonne
      }
    }
    out.push(item)
  }

  return out
}
