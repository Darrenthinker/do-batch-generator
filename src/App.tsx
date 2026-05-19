import { useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Download, FileInput, FileText, Upload } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc

type Order = {
  id: string
  importer: string
  orderDate: string
  refNo: string
  carrier: string
  location: string
  originDestination: string
  billOfLadingNo: string
  arrivalDate: string
  packages: string
  containerNo: string
  containerType: string
  weight: string
  description: string
  route: string
  deliveryTo: string
}

type Profile = {
  issuerName: string
  issuerAddress1: string
  issuerAddress2: string
  defaultLocation: string
  defaultDescription: string
  defaultRoute: string
}

const defaultProfile: Profile = {
  issuerName: 'AXINCHEN GROUP CORP',
  issuerAddress1: '404 SARATOGA AVE STE 200',
  issuerAddress2: 'SANTA CLARA CA 95050',
  defaultLocation: 'E416 MAHER TERMINALS',
  defaultDescription: 'TENSION ROPE',
  defaultRoute: 'LOCAL DELIVERY OR TRANSFER BY DELIVERY ORDER ISSUED TO:',
}

const sampleOrder: Order = {
  id: crypto.randomUUID(),
  importer: 'AXINCHEN GROUP CORP\n404 SARATOGA AVE STE 200\nSANTA CLARA CA 95050',
  orderDate: '08/21/25',
  refNo: '0053558',
  carrier: 'EGLV COSCO SHIPPING PEONY 034E',
  location: 'E416 MAHER TERMINALS',
  originDestination: 'YANTIAN,CN/NEW YORK, NY',
  billOfLadingNo: 'EGLV 146500620917',
  arrivalDate: '08/28/25',
  packages: '996',
  containerNo: 'EGHU9879531',
  containerType: "40'HQ",
  weight: '33,089LB',
  description: 'TENSION ROPE',
  route: defaultProfile.defaultRoute,
  deliveryTo: '',
}

const aliases: Record<keyof Omit<Order, 'id'>, string[]> = {
  importer: ['importer', 'consignee', 'notify party', '进口商', '收货人', '客户'],
  orderDate: ['date', 'order date', '时间', '日期', 'do日期'],
  refNo: ['ref', 'ref no', 'our ref no', '参考号'],
  carrier: ['carrier', 'vessel', 'voyage', '船名航次', '船名', '航次'],
  location: ['location', 'terminal', '码头', '提柜地点'],
  originDestination: ['origin/destination', 'port', '起运/目的港', '起运港', '目的港'],
  billOfLadingNo: ['mbl', 'bl', 'b/l', 'bill of lading', '主提单号', '提单号'],
  arrivalDate: ['arrival', 'eta', '到港时间', '到港日'],
  packages: ['packages', 'pkgs', 'quantity', '件数', '箱数'],
  containerNo: ['container', 'container no', 'cntr', '柜号'],
  containerType: ['container type', 'size', '柜型', '箱型'],
  weight: ['weight', 'gross weight', '重量', '毛重'],
  description: ['description', 'goods', 'commodity', '品名', '货描'],
  route: ['route', '路线'],
  deliveryTo: ['delivery to', 'for delivery to', 'delivery', '送货给'],
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[\s_：:./-]+/g, '')
}

function readCell(row: Record<string, unknown>, key: keyof Omit<Order, 'id'>) {
  const headers = Object.keys(row)
  const candidates = aliases[key].map(normalizeHeader)
  const matchedHeader = headers.find((header) => candidates.includes(normalizeHeader(header)))
  const value = matchedHeader ? row[matchedHeader] : ''
  return value == null ? '' : String(value).trim()
}

function rowToOrder(row: Record<string, unknown>, profile: Profile): Order {
  return {
    id: crypto.randomUUID(),
    importer: readCell(row, 'importer') || sampleOrder.importer,
    orderDate: readCell(row, 'orderDate') || new Date().toLocaleDateString('en-US'),
    refNo: readCell(row, 'refNo') || String(Date.now()).slice(-7),
    carrier: readCell(row, 'carrier'),
    location: readCell(row, 'location') || profile.defaultLocation,
    originDestination: readCell(row, 'originDestination'),
    billOfLadingNo: readCell(row, 'billOfLadingNo'),
    arrivalDate: readCell(row, 'arrivalDate'),
    packages: readCell(row, 'packages'),
    containerNo: readCell(row, 'containerNo'),
    containerType: readCell(row, 'containerType'),
    weight: readCell(row, 'weight'),
    description: readCell(row, 'description') || profile.defaultDescription,
    route: readCell(row, 'route') || profile.defaultRoute,
    deliveryTo: readCell(row, 'deliveryTo'),
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br />')
}

function doInnerHtml(order: Order, profile: Profile) {
  const issuer = `${escapeHtml(profile.issuerName)}<br />${escapeHtml(profile.issuerAddress1)}<br />${escapeHtml(
    profile.issuerAddress2,
  )}`

  return `
    <div class="do-top">
      <div></div>
      <div class="issuer">
        <h1>DELIVERY ORDER</h1>
        <p>${issuer}</p>
      </div>
      <span>Page 1 / 1</span>
    </div>
    <div class="do-grid header-grid">
      <div class="shipper-box">${escapeHtml(order.importer)}</div>
      <div class="ref-box">
        <div><span>DATE</span><strong>${escapeHtml(order.orderDate)}</strong></div>
        <div><span>OUR REF. NO.</span><strong>${escapeHtml(order.refNo)}</strong></div>
        <p>THE MERCHANDISE DESCRIBED BELOW<br />WILL BE ENTERED AND/OR FORWARDED<br />AS FOLLOWS:</p>
      </div>
    </div>
    <div class="do-grid info-grid">
      <div><span>CARRIER</span><strong>${escapeHtml(order.carrier)}</strong></div>
      <div><span>LOCATION</span><strong>${escapeHtml(order.location)}</strong></div>
      <div><span>ORIGIN/DESTINATION PORT</span><strong>${escapeHtml(order.originDestination)}</strong></div>
      <div><span>B/L OR AWB. NO.</span><strong>${escapeHtml(order.billOfLadingNo)}</strong></div>
      <div><span>FREE TIME EXP.</span><strong>${escapeHtml(order.arrivalDate)}</strong></div>
      <div><span>${escapeHtml(order.route)}</span><strong></strong></div>
    </div>
    <div class="delivery-route">
      <div><b>FOR DELIVERY TO</b><p>${escapeHtml(order.deliveryTo)}</p></div>
      <div><b>ROUTE</b><p></p></div>
    </div>
    <div class="cargo-table">
      <div class="cargo-head">
        <b>NO. OF PKGS.</b>
        <b>DESCRIPTION OF ARTICLES, SPECIAL MARKS & EXCEPTIONS</b>
        <b>WEIGHT</b>
        <b>DO NOT<br />USE</b>
      </div>
      <div class="cargo-body">
        <div class="pkgs">${escapeHtml(order.packages)}</div>
        <div class="desc">
          <p><span>Container No.</span><strong>${escapeHtml(order.containerNo)}</strong></p>
          <p><span>Container Size/Type</span><strong>${escapeHtml(order.containerType)}</strong></p>
          <p><span>Weight</span><strong></strong></p>
          <p><span>Quantity</span><strong></strong></p>
          <p><span>Seal Nos.</span><strong></strong></p>
          <p class="goods">${escapeHtml(order.description)}</p>
        </div>
        <div class="weight">${escapeHtml(order.weight)}</div>
        <div></div>
      </div>
    </div>
    <div class="do-footer">
      <b>INLAND FREIGHT</b>
      <span>PREPAID/COLLECT</span>
      <strong>Received in Good Order</strong>
    </div>
  `
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
  /** 非 g：避免全局 lastIndex；只取第一处「栏目标题」行 */
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
function extractConsigneeFromBillText(text: string): string {
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

function inferOrderFromText(text: string, profile: Profile): Order {
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
  const consignee =
    extractConsigneeFromBillText(text) ||
    compact
      .match(/CONSIGNEE\s*(?:\([^)]*\))?\s+(.+?)\s+(?:NOTIFY\s+PARTY|ALSO\s+NOTIFY|PRE[-\s]?CARRIAGE|PLACE\s+OF\s+RECEIPT)/i)?.[1]
      ?.trim() ||
    ''

  return {
    ...sampleOrder,
    id: crypto.randomUUID(),
    importer: consignee ? consignee.replace(/\s{2,}/g, '\n') : sampleOrder.importer,
    refNo: billOfLadingNo || containerNo || String(Date.now()).slice(-7),
    carrier: vessel ? `${vessel[1].trim()} ${vessel[2].trim()}` : '',
    location: profile.defaultLocation,
    originDestination: loading && discharge ? `${loading}/${discharge}` : '',
    billOfLadingNo,
    arrivalDate: '',
    packages,
    containerNo,
    containerType,
    weight,
    description: profile.defaultDescription,
    route: profile.defaultRoute,
    deliveryTo: '',
  }
}

function DoPage({ order, profile }: { order: Order; profile: Profile }) {
  return <div className="do-page" dangerouslySetInnerHTML={{ __html: doInnerHtml(order, profile) }} />
}

function newOrderFromSample(): Order {
  return { ...sampleOrder, id: crypto.randomUUID() }
}

export default function App() {
  const profile = defaultProfile
  const [order, setOrder] = useState<Order>(newOrderFromSample)
  const [ctrlWidth, setCtrlWidth] = useState(240)
  /** ~12cm at 96dpi — 信息核对栏默认宽度 */
  const [formWidth, setFormWidth] = useState(454)
  const [pasteText, setPasteText] = useState('')
  const [billText, setBillText] = useState('')
  const [pdfExtractHint, setPdfExtractHint] = useState('')
  const [previewScale, setPreviewScale] = useState(1)
  const [previewContentH, setPreviewContentH] = useState(1056)
  const previewRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)

  const startResize = (target: 'ctrl' | 'form') => (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startW = target === 'ctrl' ? ctrlWidth : formWidth
    const minW = target === 'ctrl' ? 160 : 400
    const maxW = target === 'ctrl' ? 480 : 720

    const handleMove = (ev: MouseEvent) => {
      const next = Math.max(minW, Math.min(maxW, startW + (ev.clientX - startX)))
      if (target === 'ctrl') setCtrlWidth(next)
      else setFormWidth(next)
    }

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useLayoutEffect(() => {
    const rail = previewRef.current
    const scrollEl = previewScrollRef.current
    if (!rail || !scrollEl) return

    const updateLayout = () => {
      const sheet = scrollEl.querySelector<HTMLElement>('.scaled-doc-sheet')
      const contentH = Math.max(1, sheet?.scrollHeight ?? 1056)
      setPreviewContentH(contentH)

      const w = Math.max(1, Math.floor(scrollEl.getBoundingClientRect().width))
      const scale = w / 816
      setPreviewScale(Math.max(0.12, Math.min(4, scale)))
    }

    const runLayout = () => {
      updateLayout()
      requestAnimationFrame(updateLayout)
    }

    runLayout()
    const observer = new ResizeObserver(runLayout)
    observer.observe(rail)
    observer.observe(scrollEl)
    const sheet = scrollEl.querySelector<HTMLElement>('.scaled-doc-sheet')
    if (sheet) observer.observe(sheet)
    const page = scrollEl.querySelector<HTMLElement>('.do-page')
    if (page) observer.observe(page)
    window.addEventListener('resize', runLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', runLayout)
    }
  }, [ctrlWidth, formWidth, order])

  const updateOrder = (patch: Partial<Order>) => {
    setOrder((current) => ({ ...current, ...patch }))
  }

  /** 仅处理一行：多行表格时取第一行填入当前表单 */
  const importFirstRow = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return
    setOrder((prev) => ({ ...rowToOrder(rows[0], profile), id: prev.id }))
  }

  const handleSheetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    importFirstRow(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }))
    event.target.value = ''
  }

  const handlePasteImport = () => {
    const workbook = XLSX.read(pasteText, { type: 'string' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    importFirstRow(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }))
  }

  const handleBillPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    setPdfExtractHint('正在读取 PDF…')
    try {
      const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      const pageTexts: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        pageTexts.push(content.items.map((item) => ('str' in item ? String(item.str) : '')).join(' '))
      }
      const extractedText = pageTexts.join('\n')
      setBillText(extractedText)
      if (!extractedText.trim()) {
        setPdfExtractHint('未识别到文字层（多为扫描件）。请手动粘贴提单文字或先 OCR。')
      } else {
        const inferred = inferOrderFromText(extractedText, profile)
        setOrder((prev) => ({ ...inferred, id: prev.id }))
        setPdfExtractHint(`已提取 ${document.numPages} 页文字，并已填入中间表单。`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setPdfExtractHint(`PDF 读取失败：${message}`)
    } finally {
      input.value = ''
    }
  }

  const addFromBillText = () => {
    const next = inferOrderFromText(billText, profile)
    setOrder((prev) => ({ ...next, id: prev.id }))
  }

  const exportElementToPdf = async (element: HTMLElement) => {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    const width = pdf.internal.pageSize.getWidth()
    const height = (canvas.height * width) / canvas.width
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height)
    return pdf.output('blob') as Blob
  }

  const downloadOrderPdf = async () => {
    const stage = document.createElement('div')
    stage.className = 'export-stage'
    const element = document.createElement('div')
    element.className = 'do-page'
    element.innerHTML = doInnerHtml(order, profile)
    stage.appendChild(element)
    document.body.appendChild(stage)
    const blob = await exportElementToPdf(element)
    document.body.removeChild(stage)
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${order.containerNo || order.billOfLadingNo || 'delivery-order'}-DO.pdf`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <main className="app-shell">
      <div
        className="workspace-grid"
        style={{ gridTemplateColumns: `${ctrlWidth}px 8px ${formWidth}px 8px minmax(320px, 1fr)` }}
      >
        <header className="topbar topbar-workspace">
          <div className="brand">
            <div className="brand-mark">DO</div>
            <div className="brand-text">
              <h1>DO 批量生成 · 提单信息转 Delivery Order</h1>
              <p className="brand-sub">从提单 PDF 或表格填入 DO，核对后导出 PDF · 拖动栏间分隔条调整宽度</p>
            </div>
          </div>
        </header>

        <aside className="control-panel control-workspace">
          <div className="panel-card">
            <h2><FileText size={16} /> 提单 / PDF 提取</h2>
            <label className="upload-box">
              <input accept="application/pdf" type="file" onChange={handleBillPdf} />
              <FileText size={18} />
              <span>上传 HBL / MBL PDF</span>
            </label>
            <textarea
              className="bill-text-textarea"
              value={billText}
              onChange={(event) => {
                setBillText(event.target.value)
                if (pdfExtractHint) setPdfExtractHint('')
              }}
              placeholder="粘贴提单文字后点「从提单文本生成」。扫描件需 OCR；柜号查 MBL/ETA 可再接船司 API。"
            />
            <button className="primary full" type="button" onClick={addFromBillText} disabled={!billText.trim()}>
              从提单文本生成
            </button>
            {pdfExtractHint ? <p className="pdf-extract-hint">{pdfExtractHint}</p> : null}
          </div>

          <div className="panel-card">
            <h2><Upload size={16} /> 表格导入</h2>
            <label className="upload-box">
              <input accept=".xlsx,.xls,.csv" type="file" onChange={handleSheetUpload} />
              <FileInput size={18} />
              <span>上传 Excel / CSV</span>
            </label>
            <textarea
              className="paste-grid-textarea"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={
                '可从 Excel 复制粘贴（需含表头）。列示例：进口商、时间、船名航次、起运/目的港、主提单号、到港时间、件数、柜号、柜型、重量。'
              }
            />
            <button type="button" onClick={handlePasteImport}>识别粘贴表格</button>
          </div>
        </aside>

        <div
          className="resizer resizer-col resizer-before-form"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize('ctrl')}
          title="拖动调整左栏宽度"
        />

        <section className="form-card form-workspace">
          <div className="section-title">
            <div className="section-title-main">
              <span>信息核对</span>
              <small>修改后右侧 DO 实时更新 · 多行表格仅取第一行</small>
            </div>
            <span className="section-title-ref" title="当前参考">
              {order.containerNo || order.billOfLadingNo || order.refNo || '—'}
            </span>
          </div>
          <div className="form-grid">
            {([
              ['importer', '进口商 / 收货人'],
              ['orderDate', '时间'],
              ['description', '品名'],
              ['carrier', '船名航次'],
              ['originDestination', '起运 / 目的港'],
              ['billOfLadingNo', '主提单号'],
              ['arrivalDate', '到港 / Free Time'],
              ['packages', '件数'],
              ['containerNo', '柜号'],
              ['containerType', '柜型'],
              ['weight', '重量'],
              ['location', '码头 / Location'],
            ] as const).map(([key, label]) => (
              <label key={key} className={key === 'importer' || key === 'carrier' ? 'wide' : ''}>
                <span>{label}</span>
                {key === 'importer' ? (
                  <textarea
                    className="importer-textarea"
                    value={order[key]}
                    onChange={(event) => updateOrder({ [key]: event.target.value })}
                    rows={3}
                  />
                ) : (
                  <input value={order[key]} onChange={(event) => updateOrder({ [key]: event.target.value })} />
                )}
              </label>
            ))}
          </div>
        </section>

        <div
          className="resizer resizer-col resizer-before-preview"
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize('form')}
          title="拖动调整中栏宽度"
        />

        <div className="preview-rail" ref={previewRef}>
          <div className="preview-chrome" aria-label="DO 预览操作">
            <div className="preview-chrome-text">
              <span className="preview-chrome-title">DO 预览</span>
              <span className="preview-chrome-meta">
                按当前信息生成 · {order.containerNo || order.billOfLadingNo || ''}
              </span>
            </div>
            <div className="preview-chrome-actions">
              <button className="primary" type="button" onClick={downloadOrderPdf}>
                <Download size={14} />
                导出 PDF
              </button>
            </div>
          </div>
          <aside className="preview-card">
            <div
              ref={previewScrollRef}
              className="preview-scroll"
              style={
                {
                  '--preview-scale': previewScale,
                  '--preview-content-h': `${previewContentH}px`,
                } as React.CSSProperties
              }
            >
              <div className="scaled-do-frame">
                <div className="scaled-doc-sheet">
                  <DoPage order={order} profile={profile} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
