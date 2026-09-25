import { parsePassport } from '@/entities/passport'
import { resolveDeckFiles } from '@/entities/variant'
import { FIXTURE_STRATEGIES, passportFixture, variantFixtures } from '@/shared/api/mocks'
import { currentRevisionOf, exportFileName, htmlExportSupported, pickVariantId, serverSkillVersion, withPassportMeta } from './exportPage'

const variants = FIXTURE_STRATEGIES.map((strategy) => variantFixtures[strategy].variant)

describe('export page helpers', () => {
  it('defaults to the balanced variant and respects an explicit choice', () => {
    expect(pickVariantId(variants, undefined)).toBe(variantFixtures.balanced.variant.id)
    expect(pickVariantId(variants, variantFixtures.visual.variant.id)).toBe(variantFixtures.visual.variant.id)
    expect(pickVariantId(variants, 'var_unknown')).toBe(variantFixtures.balanced.variant.id)
    expect(pickVariantId([], undefined)).toBeNull()
  })

  it('enables HTML only when capabilities say so', () => {
    expect(htmlExportSupported({ exports: { pptx: true, pdf: true, html: false, formats: ['pptx', 'pdf', 'quality_passport'] } })).toBe(false)
    expect(htmlExportSupported({ exports: { html: true } })).toBe(true)
    expect(htmlExportSupported({ export_formats: ['pptx', 'html'] })).toBe(true)
    expect(htmlExportSupported(undefined)).toBe(false)
  })

  it('reads the server skill version from the manifest or version info', () => {
    expect(serverSkillVersion({ name: 'deckdna', version: '0.2.0' }, null)).toBe('0.2.0')
    expect(serverSkillVersion(null, { skill_version: '0.1.0' })).toBe('0.1.0')
    expect(serverSkillVersion({}, {})).toBeNull()
  })

  it('names files by strategy, format and revision', () => {
    expect(exportFileName('balanced', 'pptx', 2)).toBe('deckdna_balanced_r2.pptx')
    expect(exportFileName('visual', 'quality_passport', 1)).toBe('passport_r1.json')
    expect(exportFileName('faithful', 'html', null)).toBe('deckdna_faithful.html')
  })

  it('fills PPTX size and checksum from a fresh passport only', () => {
    const { variant, export: record } = variantFixtures.balanced
    const files = resolveDeckFiles(variant, [record])
    const passport = parsePassport(passportFixture)

    expect(withPassportMeta(files.pptx, passport, true)).toMatchObject({ sizeBytes: 17057765, sha256: passportFixture.exports[0]?.sha256 })
    expect(withPassportMeta(files.pptx, passport, false)).toMatchObject({ sizeBytes: null, sha256: null })
  })

  it('takes the newest known revision', () => {
    const { variant, export: record } = variantFixtures.balanced
    const files = resolveDeckFiles(variant, [record])

    expect(currentRevisionOf(2, [files.pdf, files.quality_passport])).toBe(2)
    expect(currentRevisionOf(undefined, [files.pdf, null])).toBe(1)
    expect(currentRevisionOf(null, [])).toBeNull()
  })
})
