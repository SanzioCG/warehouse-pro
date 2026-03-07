import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ReceiptData {
  id: string
  date: string
  client: string
  warehouse: string
  product: string
  qty: number
  unit: string
  price: number
  total: number
  saleType: 'paid' | 'debt' | 'free'
  note?: string
  seller: string
}

export function printReceipt(data: ReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })

  // Fonts
  doc.setFont('helvetica')

  // Header
  doc.setFillColor(7, 9, 14)
  doc.rect(0, 0, 148, 40, 'F')

  doc.setTextColor(0, 212, 170)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('WarehousePro', 14, 18)

  doc.setTextColor(180, 180, 180)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('CHIQIM CHEKI / РАСХОДНАЯ НАКЛАДНАЯ', 14, 26)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text(`# ${data.id.slice(0, 8).toUpperCase()}`, 14, 34)
  doc.text(data.date, 120, 34)

  // Sale type badge
  const badgeColors: Record<string, [number, number, number]> = {
    paid: [0, 212, 170],
    debt: [255, 71, 87],
    free: [165, 94, 234],
  }
  const badgeLabels: Record<string, string> = {
    paid: 'NAQD',
    debt: 'QARZ',
    free: 'TEKIN',
  }
  const [r, g, b] = badgeColors[data.saleType]
  doc.setFillColor(r, g, b)
  doc.roundedRect(106, 6, 28, 10, 2, 2, 'F')
  doc.setTextColor(10, 10, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(badgeLabels[data.saleType], 120, 12.5, { align: 'center' })

  // Info section
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  const infoY = 50
  const col1 = 14, col2 = 80

  doc.setTextColor(120, 120, 120)
  doc.text('Mijoz:', col1, infoY)
  doc.text('Ombor:', col2, infoY)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text(data.client, col1, infoY + 6)
  doc.text(data.warehouse, col2, infoY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text('Sotuvchi:', col1, infoY + 14)
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.text(data.seller, col1, infoY + 20)

  // Divider
  doc.setDrawColor(220, 220, 220)
  doc.line(14, infoY + 26, 134, infoY + 26)

  // Table
  autoTable(doc, {
    startY: infoY + 30,
    head: [['Mahsulot', 'Miqdor', 'Narx', 'Jami']],
    body: [
      [
        data.product,
        `${data.qty} ${data.unit}`,
        data.saleType === 'free' ? 'TEKIN' : `$${data.price.toLocaleString()}`,
        data.saleType === 'free' ? '—' : `$${data.total.toLocaleString()}`,
      ]
    ],
    styles: {
      fontSize: 9,
      cellPadding: 4,
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
      0: { cellWidth: 60 },
      1: { cellWidth: 25 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc as any).lastAutoTable.finalY + 8

  // Total box
  doc.setFillColor(7, 9, 14)
  doc.roundedRect(80, finalY, 54, 18, 3, 3, 'F')
  doc.setTextColor(120, 120, 120)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('JAMI SUMMA:', 107, finalY + 7, { align: 'center' })
  doc.setTextColor(0, 212, 170)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(
    data.saleType === 'free' ? 'TEKIN' : `$${data.total.toLocaleString()}`,
    107, finalY + 14, { align: 'center' }
  )

  // Note
  if (data.note) {
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(`Izoh: ${data.note}`, 14, finalY + 10)
  }

  // Footer
  doc.setFillColor(245, 247, 250)
  doc.rect(0, 185, 148, 15, 'F')
  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('WarehousePro — Avtomatik yaratilgan hujjat', 74, 193, { align: 'center' })
  doc.text(new Date().toLocaleString('uz-UZ'), 74, 198, { align: 'center' })

  // Print
  doc.autoPrint()
  window.open(doc.output('bloburl'), '_blank')
}