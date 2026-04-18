import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// Savatdagi har bir mahsulot uchun tip
interface ReceiptItem {
  product: string
  productCode?: string
  batch?: string
  variant?: string
  qty: number
  unit: string
  price: number
  total: number
}

// Umumiy chek ma'lumotlari
interface ReceiptData {
  id: string
  date: string
  client: string
  warehouse: string
  items: ReceiptItem[] // Endi massiv ko'rinishida
  saleType: 'paid' | 'debt' | 'free'
  note?: string
  seller: string
}

function safeText(value: unknown): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}

function normalizePdfText(value: unknown): string {
  const text = safeText(value)
  const map: Record<string, string> = {
    А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g', Д: 'D', д: 'd',
    Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'J', ж: 'j', З: 'Z', з: 'z', И: 'I', и: 'i',
    Й: 'Y', й: 'y', К: 'K', к: 'k', Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n',
    О: 'O', о: 'o', П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
    У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'X', х: 'x', Ц: 'Ts', ц: 'ts', Ч: 'Ch', ч: 'ch',
    Ш: 'Sh', ш: 'sh', Щ: 'Sh', щ: 'sh', Ъ: '', ъ: '', Ы: 'I', ы: 'i', Ь: '', ь: '',
    Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya', Қ: 'Q', қ: 'q', Ғ: "G'", ғ: "g'",
    Ҳ: 'H', ҳ: 'h', Ў: "O'", ў: "o'", '№': 'No',
  }
  return Array.from(text).map(char => map[char] ?? char).join('')
}

function money(value: number): string {
  return `$${Number(value || 0).toLocaleString('uz-UZ')}`
}

export function printReceipt(data: ReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })

  const pageWidth = 148
  const left = 14
  const right = 134

  const receiptId = `# ${safeText(data.id).slice(0, 8).toUpperCase()}`
  const receiptDate = normalizePdfText(data.date)
  const client = normalizePdfText(data.client)
  const warehouse = normalizePdfText(data.warehouse)
  const seller = normalizePdfText(data.seller)
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

  // Header qismi
  doc.setFillColor(7, 9, 14)
  doc.rect(0, 0, pageWidth, 35, 'F')

  doc.setTextColor(0, 212, 170)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('WarehousePro', left, 15)

  doc.setTextColor(180, 180, 180)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('CHIQIM CHEKI / SALES RECEIPT', left, 21)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text(receiptId, left, 29)
  doc.text(receiptDate, right, 29, { align: 'right' })

  // Badge (To'lov turi)
  const [r, g, b] = badgeColors[data.saleType]
  doc.setFillColor(r, g, b)
  doc.roundedRect(110, 5, 24, 8, 2, 2, 'F')
  doc.setTextColor(10, 10, 10)
  doc.setFontSize(8)
  doc.text(badgeLabels[data.saleType], 122, 10.5, { align: 'center' })

  // Mijoz va Ombor ma'lumotlari
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text('Mijoz:', left, 45)
  doc.text('Ombor:', 80, 45)

  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text(client, left, 51)
  doc.text(warehouse, 80, 51)

  // Jadval (Mahsulotlar ro'yxati)
  const tableData = data.items.map(item => [
    `${normalizePdfText(item.product)}\n[${normalizePdfText(item.variant || '')}]`,
    normalizePdfText(item.batch || '—'),
    `${item.qty} ${normalizePdfText(item.unit)}`,
    data.saleType === 'free' ? 'TEKIN' : money(item.price),
    data.saleType === 'free' ? '—' : money(item.total)
  ])

  autoTable(doc, {
    startY: 60,
    head: [['Mahsulot / Razmer', 'Partiya', 'Miqdor', 'Narx', 'Jami']],
    body: tableData,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [13, 16, 24], textColor: [0, 212, 170] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 20 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
    }
  })

  const finalY = (doc as any).lastAutoTable.finalY + 10
  const grandTotal = data.items.reduce((sum, item) => sum + item.total, 0)

  // Jami summa qutisi
  doc.setFillColor(7, 9, 14)
  doc.roundedRect(84, finalY, 50, 15, 2, 2, 'F')
  doc.setTextColor(120, 120, 120)
  doc.setFontSize(7)
  doc.text('JAMI SUMMA:', 109, finalY + 5, { align: 'center' })
  doc.setTextColor(0, 212, 170)
  doc.setFontSize(11)
  doc.text(data.saleType === 'free' ? 'TEKIN' : money(grandTotal), 109, finalY + 11, { align: 'center' })

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(`Sotuvchi: ${seller}`, left, finalY + 5)
  if (note) doc.text(`Izoh: ${note}`, left, finalY + 10)

  doc.autoPrint()
  window.open(doc.output('bloburl'), '_blank')
}