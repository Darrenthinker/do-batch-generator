import { describe, expect, it } from 'vitest'
import { extractConsigneeFromBillText, inferBillFields, reconstructPdfTextItems, shouldUseOcrFallback } from './billExtract'

describe('reconstructPdfTextItems', () => {
  it('keeps PDF text in visual line order instead of one long line', () => {
    const text = reconstructPdfTextItems([
      { str: 'NOTIFY PARTY', transform: [1, 0, 0, 1, 50, 640] },
      { str: 'ARCOSENTINOR GROUP CORP', transform: [1, 0, 0, 1, 50, 700] },
      { str: 'CONSIGNEE (Name and Address)', transform: [1, 0, 0, 1, 50, 720] },
      { str: '10101 SOUTHWEST FWY,', transform: [1, 0, 0, 1, 50, 684] },
      { str: 'HOUSTON, TX 77074, US', transform: [1, 0, 0, 1, 50, 668] },
    ])

    expect(text.split('\n')).toEqual([
      'CONSIGNEE (Name and Address)',
      'ARCOSENTINOR GROUP CORP',
      '10101 SOUTHWEST FWY,',
      'HOUSTON, TX 77074, US',
      'NOTIFY PARTY',
    ])
  })
})

describe('extractConsigneeFromBillText', () => {
  it('extracts only the consignee block before notify party', () => {
    const text = [
      'SHIPPER/EXPORTER SHENZHEN MEBON FURNITURE CO., LTD',
      'CONSIGNEE (Name and Address)',
      'ARCOSENTINOR GROUP CORP',
      '10101 SOUTHWEST FWY,',
      'HOUSTON, TX 77074, US',
      'EMAIL:ARCOSENTINOR@OUTLOOK.COM',
      'NOTIFY PARTY: SAME AS CONSIGNEE',
      "170 PACKAGES SHIPPER'S LOAD & COUNT",
    ].join('\n')

    expect(extractConsigneeFromBillText(text)).toBe(
      'ARCOSENTINOR GROUP CORP\n10101 SOUTHWEST FWY,\nHOUSTON, TX 77074, US\nEMAIL:ARCOSENTINOR@OUTLOOK.COM',
    )
  })

  it('stops flat text at cargo wording when notify party is missing', () => {
    const text =
      "CONSIGNEE (Name and Address) ARCOSENTINOR GROUP CORP 10101 SOUTHWEST FWY, HOUSTON, TX 77074, US 170 PACKAGES SHIPPER'S LOAD & COUNT FREIGHT PREPAID"

    expect(extractConsigneeFromBillText(text)).toBe(
      'ARCOSENTINOR GROUP CORP 10101 SOUTHWEST FWY, HOUSTON, TX 77074, US',
    )
  })
})

describe('inferBillFields', () => {
  it('detects common MAEU fields without falling back to sample values', () => {
    const fields = inferBillFields(
      [
        'CONSIGNEE (Name and Address)',
        'ARCOSENTINOR GROUP CORP',
        '10101 SOUTHWEST FWY,',
        'HOUSTON, TX 77074, US',
        'NOTIFY PARTY SAME AS CONSIGNEE',
        'MAEU264151150',
        '91PACKAGES',
        'CAAU9146654',
        "40'HQ",
        '3048.00KGS',
      ].join('\n'),
    )

    expect(fields.importer).toContain('ARCOSENTINOR GROUP CORP')
    expect(fields.billOfLadingNo).toBe('MAEU264151150')
    expect(fields.packages).toBe('91')
    expect(fields.containerNo).toBe('CAAU9146654')
    expect(fields.containerType).toBe("40'HQ")
    expect(fields.weight).toBe('3048.00KGS')
  })

  it('prefers last free day over ETA when both are present', () => {
    const fields = inferBillFields(
      [
        'CONSIGNEE',
        'ARCOSENTINOR GROUP CORP',
        'NOTIFY PARTY SAME AS CONSIGNEE',
        'ETA 08/28/25',
        'FREE TIME EXP. 09/04/25',
      ].join('\n'),
    )

    expect(fields.arrivalDate).toBe('09/04/25')
  })

  it('extracts the core commodity from STC cargo wording', () => {
    const fields = inferBillFields(
      [
        '91 PACKAGES',
        "2X40'HQ (F.C.L.) S.T.C CYCY SOFA SETS SHIPPED ON",
        'BOARD 9338KGS JAN 23,2026 TOTAL:TWO CONTAINERS ONLY.',
        'FREIGHT PREPAID',
      ].join('\n'),
    )

    expect(fields.description).toBe('SOFA SETS')
  })

  it('extracts goods after description labels and stops before packing notes', () => {
    const fields = inferBillFields(
      [
        'DESCRIPTION OF GOODS',
        'TENSION ROPE',
        'NO WOOD PACKING MATERIAL IS USED IN SHIPMENT',
      ].join('\n'),
    )

    expect(fields.description).toBe('TENSION ROPE')
  })
})

describe('shouldUseOcrFallback', () => {
  it('uses OCR when a PDF text layer is empty or too weak', () => {
    expect(shouldUseOcrFallback('')).toBe(true)
    expect(shouldUseOcrFallback('1 / 1')).toBe(true)
  })

  it('skips OCR when text contains bill of lading signals', () => {
    expect(
      shouldUseOcrFallback('CONSIGNEE ARCOSENTINOR GROUP CORP NOTIFY PARTY MAEU264151150 CAAU9146654 91 PACKAGES'),
    ).toBe(false)
  })
})
