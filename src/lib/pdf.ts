import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ReceiptData {
  id: string
  date: string

  client: string
  warehouse: string

  product: string
  productCode?: string
  batch?: string
  variant?: string

  qty: number
  unit: string

  price: number
  total: number

  saleType: 'paid' | 'debt' | 'free'

  note?: string
  seller: string
}

function safeText(value: unknown): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}

// jsPDF built-in helvetica Cyrillicni to'liq ko'tarmaydi.
// Shu sabab vaqtinchalik translit qilamiz, shunda text buzilib ketmaydi.
function normalizePdfText(value: unknown): string {
  const text = safeText(value)

  const map: Record<string, string> = {
    А: 'A', а: 'a',
    Б: 'B', б: 'b',
    В: 'V', в: 'v',
    Г: 'G', г: 'g',
    Д: 'D', д: 'd',
    Е: 'E', е: 'e',
    Ё: 'Yo', ё: 'yo',
    Ж: 'J', ж: 'j',
    З: 'Z', з: 'z',
    И: 'I', и: 'i',
    Й: 'Y', й: 'y',
    К: 'K', к: 'k',
    Л: 'L', л: 'l',
    М: 'M', м: 'm',
    Н: 'N', н: 'n',
    О: 'O', о: 'o',
    П: 'P', п: 'p',
    Р: 'R', р: 'r',
    С: 'S', с: 's',
    Т: 'T', т: 't',
    У: 'U', у: 'u',
    Ф: 'F', ф: 'f',
    Х: 'X', х: 'x',
    Ц: 'Ts', ц: 'ts',
    Ч: 'Ch', ч: 'ch',
    Ш: 'Sh', ш: 'sh',
    Щ: 'Sh', щ: 'sh',
    Ъ: '', ъ: '',
    Ы: 'I', ы: 'i',
    Ь: '', ь: '',
    Э: 'E', э: 'e',
    Ю: 'Yu', ю: 'yu',
    Я: 'Ya', я: 'ya',
    Қ: 'Q', қ: 'q',
    Ғ: "G'", ғ: "g'",
    Ҳ: 'H', ҳ: 'h',
    Ў: "O'", ў: "o'",
    Ҷ: 'J', ҷ: 'j',
    Ү: 'U', ү: 'u',
    Ө: "O'", ө: "o'",
    '№': 'No',
  }

  return Array.from(text).map(char => map[char] ?? char).join('')
}

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('uz-UZ')}`
}

export function printReceipt(data: ReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })

  const pageWidth = 148
  const pageHeight = 210
  const left = 14
  const right = 134

  const receiptId = `# ${safeText(data.id).slice(0, 8).toUpperCase()}`
  const receiptDate = normalizePdfText(data.date)

  const client = normalizePdfText(data.client)
  const warehouse = normalizePdfText(data.warehouse)
  const product = normalizePdfText(data.product)
  const productCode = normalizePdfText(data.productCode || '—')
  const batch = normalizePdfText(data.batch || '—')
  const variant = normalizePdfText(data.variant || '—')
  const seller = normalizePdfText(data.seller)
  const unit = normalizePdfText(data.unit)
  const note = data.note ? normalizePdfText(data.note) : ''

  const badgeColors: Record<ReceiptData['saleType'], [number, number, number]> = {
    paid: [0, 212, 170],
    debt: [255, 71, 87],
    free: [165, 94, 234],
  }

  const badgeLabels: Record<ReceiptData['saleType'], string> = {
    paid: 'NAQD',
    debt: 'QARZ',
    free: 'TEKIN',
  }

  doc.setFont('helvetica', 'normal')

  // Header
  doc.setFillColor(7, 9, 14)
  doc.rect(0, 0, pageWidth, 40, 'F')

  doc.setTextColor(0, 212, 170)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('WarehousePro', left, 18)

  doc.setTextColor(180, 180, 180)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('CHIQIM CHEKI / RASXOD NAKLADNOY', left, 26)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text(receiptId, left, 34)
  doc.text(receiptDate, right, 34, { align: 'right' })

  // Sale type badge
  const [r, g, b] = badgeColors[data.saleType]
  doc.setFillColor(r, g, b)
  doc.roundedRect(106, 6, 28, 10, 2, 2, 'F')
  doc.setTextColor(10, 10, 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(badgeLabels[data.saleType], 120, 12.5, { align: 'center' })

  // Info section
  const infoY = 50
  const col1 = 14
  const col2 = 80

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Mijoz:', col1, infoY)
  doc.text('Ombor:', col2, infoY)

  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  const clientLines = doc.splitTextToSize(client, 52)
  const warehouseLines = doc.splitTextToSize(warehouse, 52)
  doc.text(clientLines, col1, infoY + 6)
  doc.text(warehouseLines, col2, infoY + 6)

  const infoRowsHeight = Math.max(clientLines.length, warehouseLines.length) * 5
  const sellerY = infoY + infoRowsHeight + 10

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Sotuvchi:', col1, sellerY)

  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text(seller, col1, sellerY + 6)

  // Divider
  const dividerY = sellerY + 12
  doc.setDrawColor(220, 220, 220)
  doc.line(left, dividerY, right, dividerY)

  // Product info block
  const productInfoY = dividerY + 8

  doc.setFillColor(245, 247, 250)
  doc.roundedRect(left, productInfoY, 120, 24, 2, 2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.setFontSize(7)

  doc.text('Mahsulot:', left + 4, productInfoY + 5)
  doc.text('Kod:', left + 4, productInfoY + 11)
  doc.text('Razmer:', left + 60, productInfoY + 5)
  doc.text('Partiya:', left + 60, productInfoY + 11)

  doc.setTextColor(25, 25, 25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)

  const productNameLines = doc.splitTextToSize(product, 34)
  const productCodeLines = doc.splitTextToSize(productCode || '—', 34)
  const variantLines = doc.splitTextToSize(variant || '—', 38)
  const batchLines = doc.splitTextToSize(batch || '—', 38)

  doc.text(productNameLines, left + 20, productInfoY + 5)
  doc.text(productCodeLines, left + 20, productInfoY + 11)
  doc.text(variantLines, left + 78, productInfoY + 5)
  doc.text(batchLines, left + 78, productInfoY + 11)

  // Main table
  autoTable(doc, {
    startY: productInfoY + 30,
    head: [['Mahsulot', 'Miqdor', 'Narx', 'Jami']],
    body: [[
      product,
      `${Number(data.qty || 0)} ${unit}`,
      data.saleType === 'free' ? 'TEKIN' : money(data.price),
      data.saleType === 'free' ? '—' : money(data.total),
    ]],
    theme: 'striped',
    styles: {
      font: 'helvetica',
      fontStyle: 'normal',
      fontSize: 9,
      textColor: [45, 45, 45],
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle',
      halign: 'left',
      lineColor: [225, 230, 235],
      lineWidth: 0.1,
      minCellHeight: 12,
    },
    headStyles: {
      fillColor: [13, 16, 24],
      textColor: [0, 212, 170],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
    },
    margin: { left, right: pageWidth - right },
  })

  const lastAutoTable = (doc as any).lastAutoTable
  const finalY = lastAutoTable ? lastAutoTable.finalY + 8 : productInfoY + 60

  // Total box
  doc.setFillColor(7, 9, 14)
  doc.roundedRect(80, finalY, 54, 18, 3, 3, 'F')

  doc.setTextColor(120, 120, 120)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('JAMI SUMMA:', 107, finalY + 7, { align: 'center' })

  doc.setTextColor(0, 212, 170)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(
    data.saleType === 'free' ? 'TEKIN' : money(data.total),
    107,
    finalY + 14,
    { align: 'center' }
  )

  let currentY = finalY + 24

  // Note
  if (note && note !== '—') {
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    const noteLines = doc.splitTextToSize(`Izoh: ${note}`, 120)
    doc.text(noteLines, left, currentY)
    currentY += noteLines.length * 4 + 4
  }

  // Footer
  const footerY = Math.max(currentY + 6, pageHeight - 15)

  if (footerY < pageHeight) {
    doc.setFillColor(245, 247, 250)
    doc.rect(0, footerY, pageWidth, 15, 'F')

    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('WarehousePro — Avtomatik yaratilgan hujjat', 74, footerY + 8, {
      align: 'center',
    })
    doc.text(new Date().toLocaleString('uz-UZ'), 74, footerY + 13, {
      align: 'center',
    })
  }

  doc.autoPrint()
  window.open(doc.output('bloburl'), '_blank')
}