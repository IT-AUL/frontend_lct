import { fileExtension, guessKind, isContentFile, isIntakeFile, mergeIntakeFiles, roleLabel } from './kinds'

describe('fileExtension', () => {
  it('returns the lowercase extension', () => {
    expect(fileExtension('Deck.PPTX')).toBe('.pptx')
    expect(fileExtension('archive.tar.gz')).toBe('.gz')
    expect(fileExtension('no-extension')).toBe('')
  })
})

describe('isIntakeFile', () => {
  it('accepts all supported formats', () => {
    for (const name of ['a.pptx', 'a.potx', 'a.md', 'a.txt', 'a.docx', 'a.pdf', 'a.csv', 'a.xlsx', 'a.json', 'a.png', 'a.jpg', 'a.jpeg', 'a.svg']) {
      expect(isIntakeFile(name)).toBe(true)
    }
  })

  it('rejects unsupported formats', () => {
    for (const name of ['a.exe', 'a.zip', 'a.doc', 'a.xls', 'a', '.pptx']) {
      expect(isIntakeFile(name)).toBe(false)
    }
  })
})

describe('guessKind', () => {
  it('maps presentations to template', () => {
    expect(guessKind('corp.pptx')).toBe('template')
    expect(guessKind('corp.potx')).toBe('template')
  })

  it('maps tables to data', () => {
    expect(guessKind('sales.csv')).toBe('data')
    expect(guessKind('sales.xlsx')).toBe('data')
  })

  it('maps brand files to brandbook', () => {
    expect(guessKind('tokens.json')).toBe('brandbook')
    expect(guessKind('brand-guide.pdf')).toBe('brandbook')
  })

  it('maps everything else to content', () => {
    expect(guessKind('notes.md')).toBe('content')
    expect(guessKind('report.docx')).toBe('content')
    expect(guessKind('logo.png')).toBe('content')
  })
})

describe('isContentFile', () => {
  const file = (kind: 'template' | 'content' | 'data' | 'brandbook' | 'unknown', accepted = true) => ({ name: 'a', kind, detected_kind: kind, accepted, reason: null, size_bytes: 1 })

  it('counts accepted content and data files', () => {
    expect(isContentFile(file('content'))).toBe(true)
    expect(isContentFile(file('data'))).toBe(true)
  })

  it('ignores templates, brandbooks and rejected files', () => {
    expect(isContentFile(file('template'))).toBe(false)
    expect(isContentFile(file('brandbook'))).toBe(false)
    expect(isContentFile(file('content', false))).toBe(false)
  })
})

describe('mergeIntakeFiles', () => {
  const file = (name: string, kind: 'template' | 'content' | 'data' | 'brandbook' | 'unknown' = 'content') => ({ name, kind, detected_kind: kind, accepted: true, reason: null, size_bytes: 1 })

  it('appends new files and keeps existing order', () => {
    expect(mergeIntakeFiles([file('a')], [file('b')]).map((f) => f.name)).toEqual(['a', 'b'])
  })

  it('replaces a file with the same name', () => {
    expect(mergeIntakeFiles([file('a'), file('b')], [file('a', 'data')])).toEqual([file('b'), file('a', 'data')])
  })
})

describe('roleLabel', () => {
  it('translates known slide roles', () => {
    expect(roleLabel('title')).toBe('Обложки')
    expect(roleLabel('section')).toBe('Разделы')
    expect(roleLabel('content')).toBe('Рабочие')
    expect(roleLabel('closing')).toBe('Финал')
  })

  it('keeps unknown roles as-is', () => {
    expect(roleLabel('gallery')).toBe('gallery')
  })
})
