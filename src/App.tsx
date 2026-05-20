import { useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Download, FileInput, FileText, Upload } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import * as XLSX from 'xlsx'
import { inferBillFields, reconstructPdfTextItems, shouldUseOcrFallback } from './lib/billExtract'

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

function inferOrderFromText(text: string, profile: Profile): Order {
  const fields = inferBillFields(text)

  return {
    ...sampleOrder,
    id: crypto.randomUUID(),
    importer: fields.importer || sampleOrder.importer,
    refNo: fields.refNo || String(Date.now()).slice(-7),
    carrier: fields.carrier,
    location: profile.defaultLocation,
    originDestination: fields.originDestination,
    billOfLadingNo: fields.billOfLadingNo,
    arrivalDate: '',
    packages: fields.packages,
    containerNo: fields.containerNo,
    containerType: fields.containerType,
    weight: fields.weight,
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

async function renderPdfPageToCanvas(page: pdfjsLib.PDFPageProxy, scale = 2) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建 OCR 画布')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvasContext: context, viewport } as Parameters<typeof page.render>[0]).promise
  return canvas
}

async function extractPdfTextByOcr(
  document: pdfjsLib.PDFDocumentProxy,
  onProgress: (message: string) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', undefined, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress(`正在 OCR 识别扫描件… ${Math.round(message.progress * 100)}%`)
      }
    },
  })

  try {
    const texts: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      onProgress(`正在渲染第 ${pageNumber}/${document.numPages} 页用于 OCR…`)
      const page = await document.getPage(pageNumber)
      const canvas = await renderPdfPageToCanvas(page)
      const result = await worker.recognize(canvas)
      texts.push(result.data.text)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
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
  const [isExtractingBill, setIsExtractingBill] = useState(false)
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
    setIsExtractingBill(true)
    setPdfExtractHint('正在读取 PDF…')
    try {
      const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      const pageTexts: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        const textItems = content.items
          .filter((item) => 'str' in item)
          .map((item) => ({
            str: String(item.str),
            transform: 'transform' in item ? item.transform : undefined,
          }))
        pageTexts.push(reconstructPdfTextItems(textItems))
      }
      let extractedText = pageTexts.join('\n')
      let usedOcr = false
      if (shouldUseOcrFallback(extractedText)) {
        setPdfExtractHint('PDF 文字层太少，正在尝试扫描件 OCR…')
        const ocrText = await extractPdfTextByOcr(document, setPdfExtractHint)
        if (ocrText.trim()) {
          extractedText = ocrText
          usedOcr = true
        }
      }
      setBillText(extractedText)
      if (!extractedText.trim()) {
        setPdfExtractHint('未识别到可用文字。请确认 PDF 清晰，或先用专业 OCR 后再上传。')
      } else {
        const inferred = inferOrderFromText(extractedText, profile)
        setOrder((prev) => ({ ...inferred, id: prev.id }))
        setPdfExtractHint(`已${usedOcr ? '通过 OCR ' : ''}提取 ${document.numPages} 页文字，并已填入中间表单。`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setPdfExtractHint(`PDF 读取失败：${message}`)
    } finally {
      setIsExtractingBill(false)
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
              <input accept="application/pdf" type="file" onChange={handleBillPdf} disabled={isExtractingBill} />
              <FileText size={18} />
              <span>{isExtractingBill ? '正在识别 PDF…' : '上传 HBL / MBL PDF'}</span>
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
            <button className="primary full" type="button" onClick={addFromBillText} disabled={!billText.trim() || isExtractingBill}>
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
