export type PdfTextLike = {
  str: string
  transform?: readonly number[]
  width?: number
  height?: number
}

export type BillFields = {
  importer: string
  refNo: string
  carrier: string
  originDestination: string
  billOfLadingNo: string
  packages: string
  containerNo: string
  containerType: string
  weight: string
}

type TextLine = {
  y: number
  items: Array<{ x: number; text: string }>
}

export function reconstructPdfTextItems(items: PdfTextLike[]): string {
  const lines: TextLine[] = []
  const yTolerance = 3

  for (const item of items) {
    const text = item.str.trim()
    if (!text) continue
    const transform = item.transform ?? []
    const x = Number(transform[4] ?? 0)
    const y = Number(transform[5] ?? 0)
    const line = lines.find((candidate) => Math.abs(candidate.y - y) <= yTolerance)
    if (line) {
      line.items.push({ x, text })
      line.y = (line.y + y) / 2
    } else {
      lines.push({ y, items: [{ x, text }] })
    }
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')
}

export function shouldUseOcrFallback(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length < 40) return true
  const billSignals = [
    /\bCONSIGNEE\b/i,
    /\bNOTIFY\s+PARTY\b/i,
    /\b[A-Z]{4}\d{7}\b/,
    /\b(?:MAEU|ONEY|EGLV|COSU|CMDU|HLCU|OOLU|MEDU|MSCU)[A-Z0-9]{8,15}\b/,
    /\b\d{1,6}\s*(?:PACKAGES|PKGS|CARTONS|CTNS)\b/i,
  ]
  return billSignals.filter((signal) => signal.test(normalized)).length < 2
}

/** 收货人块结束：标准分区 + 货描/运费等（PDF 阅读顺序常把货描接在地址后且尚无 NOTIFY） */
function consigneeBlockEndIndex(tail: string): number {
  const stopAt = (re: RegExp) => {
    const i = tail.search(re)
    return i >= 0 ? i : tail.length
  }
  return Math.min(
    stopAt(/\bNOTIFY\s+PARTY\b/i),
    stopAt(/\bALSO\s+NOTIFY\b/i),
    stopAt(/\bFORWARDING\s+AGENT\b/i),
    stopAt(/\bPLACE\s+OF\s+RECEIPT\b/i),
    stopAt(/\bPRE[-\s]?CARRIAGE\b/i),
    stopAt(/\bEXPORT\s+REFERENCES\b/i),
    stopAt(/\bMARKS\s+AND\s+NUMBERS\b/i),
    stopAt(/\bSHIPPER'?S\s+(?:LOAD|COUNT|WEIGHT|STOWAGE)\b/i),
    stopAt(/\b\d{1,6}\s+PACKAGES\b/i),
    stopAt(/\b\d{1,3}\s*[Xx]\s*\d{1,2}'?\s*(?:HQ|HC|GP|RF|OT)\b/i),
    stopAt(/\bS\.?\s*T\.?\s*C\.?\b/i),
    stopAt(/\bSAID\s+TO\s+CONTAIN\b/i),
    stopAt(/\bFREIGHT\s+(?:PREPAID|COLLECT|PAYABLE)\b/i),
    stopAt(/\bSHIPPED\s+ON\s+BOARD\b/i),
    stopAt(/\bSAY\s+TOTAL\b/i),
    stopAt(/\bNO\s+WOOD\s+PACKING\b/i),
    stopAt(/\bPARTICULARS\s+FURNISHED\b/i),
    stopAt(/\bDESCRIPTION\s+OF\s+GOODS\b/i),
    stopAt(/\bTOTAL\s+NUMBER\s+OF\s+CONTAINERS\b/i),
  )
}

/** 从「CONSIGNEE」起跳到真实内容起点；跳过 SAME AS CONSIGNEE、CONSIGNEE'S */
function consigneeContentStartIndex(raw: string): number {
  const section = raw.match(/(?:^|[\n\r\u2028\u2029])\s*CONSIGNEE(?:\s*\([^)]{0,400}\))?\s*:?\s*/im)
  if (section?.index != null) return section.index + section[0].length

  const lower = raw.toLowerCase()
  let pos = 0
  while (pos < raw.length) {
    const i = lower.indexOf('consignee', pos)
    if (i < 0) return -1
    const prev = raw.slice(Math.max(0, i - 8), i)
    if (/\bAS\s+$/i.test(prev)) {
      pos = i + 9
      continue
    }
    if (/^CONSIGNEE'S\b/i.test(raw.slice(i, i + 12))) {
      pos = i + 12
      continue
    }
    const rest = raw.slice(i)
    const hdr = rest.match(/^CONSIGNEE\s*(?:\([^)]{0,400}\))?\s*:?\s*/i)
    return i + (hdr?.[0]?.length ?? 9)
  }
  return -1
}

const CONSIGNEE_HARD_CAP = 900

/** 单行/压扁文本中的 CONSIGNEE（pdf.js 常把整页拼成少换行，行首 CONSIGNEE 正则会失效） */
function extractConsigneeFlat(compact: string): string {
  const lower = compact.toLowerCase()
  let pos = 0
  while (pos < compact.length) {
    const i = lower.indexOf('consignee', pos)
    if (i < 0) return ''
    const near = compact.slice(Math.max(0, i - 3), Math.min(compact.length, i + 14))
    if (/\bAS\s+CONSIGNEE\b/i.test(near)) {
      pos = i + 9
      continue
    }
    if (/^CONSIGNEE'S\b/i.test(compact.slice(i, i + 12))) {
      pos = i + 12
      continue
    }
    const rest = compact.slice(i)
    const hdr = rest.match(/^CONSIGNEE\s*(?:\([^)]{0,400}\))?\s*:?\s*/i)
    const start = i + (hdr?.[0]?.length ?? 9)
    const tail = compact.slice(start)
    let end = consigneeBlockEndIndex(tail)
    if (end > CONSIGNEE_HARD_CAP) end = CONSIGNEE_HARD_CAP
    let block = tail.slice(0, end).trim()
    if (block.length >= CONSIGNEE_HARD_CAP) block = block.slice(0, CONSIGNEE_HARD_CAP)
    const tidied = tidyConsigneeBlock(block.replace(/\s{2,}/g, '\n'))
    if (tidied.length > 0) return tidied
    pos = i + 9
  }
  return ''
}

/** 从提单正文中截取收货人块（保留换行）；兼容 CONSIGNEE (Name and Address) 及 PDF 乱序空格 */
export function extractConsigneeFromBillText(text: string): string {
  const raw = text.replace(/\r\n/g, '\n')
  const compact = raw.replace(/\s+/g, ' ')
  const start = consigneeContentStartIndex(raw)
  if (start < 0) {
    const cjk = raw.search(/(?:收货人|收货单位)\s*[:：]?\s*/i)
    if (cjk >= 0) {
      const tail = raw.slice(cjk).replace(/^(?:收货人|收货单位)\s*[:：]?\s*/i, '')
      const stop = tail.search(/\n\s*(?:通知方|NOTIFY)/i)
      const t = tidyConsigneeBlock(stop >= 0 ? tail.slice(0, stop) : tail)
      if (t) return t
    }
    return extractConsigneeFlat(compact)
  }

  let tail = raw.slice(start)
  let end = consigneeBlockEndIndex(tail)
  if (end > CONSIGNEE_HARD_CAP) end = CONSIGNEE_HARD_CAP
  let block = tail.slice(0, end)
  if (block.length >= CONSIGNEE_HARD_CAP) {
    const cut = block.lastIndexOf('\n', CONSIGNEE_HARD_CAP)
    if (cut > 120) block = block.slice(0, cut)
  }
  const tidied = tidyConsigneeBlock(block)
  if (tidied.length > 0) return tidied
  return extractConsigneeFlat(compact)
}

function tidyConsigneeBlock(block: string): string {
  const junkLine = (l: string) =>
    /^(?:NOTIFY|ALSO\s+NOTIFY|M\/B|MARKS)\b/i.test(l) ||
    /^\d+\s+PACKAGES\b/i.test(l) ||
    /\bSHIPPER'?S\s+LOAD\b/i.test(l) ||
    /^\d+\s*X\s*\d{1,2}'?\s*(?:HQ|HC|GP|RF)\b/i.test(l) ||
    /^S\.?\s*T\.?\s*C\.?\b/i.test(l) ||
    /^FREIGHT\s+(?:PREPAID|COLLECT|PAYABLE)\b/i.test(l) ||
    /^SHIPPED\s+ON\s+BOARD\b/i.test(l) ||
    /^SAY\s+TOTAL\b/i.test(l) ||
    /^NO\s+WOOD\s+PACKING\b/i.test(l)
  return block
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !junkLine(l))
    .slice(0, 14)
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function inferBillFields(text: string): BillFields {
  const compact = text.replace(/\s+/g, ' ')
  const containerNo = compact.match(/\b[A-Z]{4}\d{7}\b/)?.[0] ?? ''
  const billOfLadingNo =
    compact.match(/\b(?:ONEY|MAEU|EGLV|COSU|CMDU|HLCU|OOLU|MEDU|MSCU)[A-Z0-9]{8,15}\b/)?.[0] ??
    compact.match(/(?:B\/L|BL|BILL OF LADING|MBL)\s*(?:NO\.?|NUMBER)?\s*[:#-]?\s*([A-Z0-9 -]{8,24})/i)?.[1]?.trim() ??
    ''
  const packages =
    compact.match(/\b(\d{1,6})\s*(?:CARTONS|CTNS|PACKAGES|PKGS)\b/i)?.[1] ??
    compact.match(/\b(\d{1,6})(?:CARTONS|CTNS|PACKAGES|PKGS)\b/i)?.[1] ??
    ''
  const weight =
    compact.match(/\b(\d{1,7}(?:,\d{3})*(?:\.\d+)?)\s*(KGS|KG|LBS|LB)\b/i)?.slice(1).join('').toUpperCase() ??
    ''
  const containerType = compact.match(/\b(20GP|40GP|40HQ|40HC|45HQ|20'GP|40'HQ|40'HC)\b/i)?.[1] ?? ''
  const loading = compact.match(/PORT OF LOADING\s+([A-Z ,.-]+?)\s+PORT OF DISCHARGE/i)?.[1]?.trim()
  const discharge = compact.match(/PORT OF DISCHARGE\s+([A-Z ,.-]+?)\s+(?:PLACE OF DELIVERY|PARTICULARS|CONTAINER)/i)?.[1]?.trim()
  const vessel = compact.match(/(?:OCEAN VESSEL|VESSEL)\s+([A-Z0-9 -]+?)\s+(?:VOYAGE|VOY)\s*([A-Z0-9-]+)/i)
  const importer =
    extractConsigneeFromBillText(text) ||
    compact
      .match(/CONSIGNEE\s*(?:\([^)]*\))?\s+(.+?)\s+(?:NOTIFY\s+PARTY|ALSO\s+NOTIFY|PRE[-\s]?CARRIAGE|PLACE\s+OF\s+RECEIPT)/i)?.[1]
      ?.trim() ||
    ''

  return {
    importer: importer ? importer.replace(/\s{2,}/g, '\n') : '',
    refNo: billOfLadingNo || containerNo,
    carrier: vessel ? `${vessel[1].trim()} ${vessel[2].trim()}` : '',
    originDestination: loading && discharge ? `${loading}/${discharge}` : '',
    billOfLadingNo,
    packages,
    containerNo,
    containerType,
    weight,
  }
}
