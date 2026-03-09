import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Props { lang: Language }

const ACTION_INFO: Record<string, { label: string; color: string }> = {
  product_created: { label: 'Mahsulot yaratildi', color: '#0095ff' },
  product_updated: { label: 'Mahsulot yangilandi', color: '#8896ae' },
  product_deleted: { label: "Mahsulot o'chirildi", color: '#ff4757' },
  stock_received: { label: 'Kirim', color: '#00d4aa' },
  stock_issued: { label: 'Chiqim', color: '#ffa502' },
  stock_edited: { label: 'Stock tahrirlandi', color: '#a55eea' },
  stock_deleted: { label: "Stock o'chirildi", color: '#ff4757' },
  debt_created: { label: 'Qarz yaratildi', color: '#ff4757' },
  debt_paid: { label: "To'lov qilindi", color: '#00d4aa' },
  client_created: { label: "Mijoz qo'shildi", color: '#0095ff' },
  client_deleted: { label: "Mijoz o'chirildi", color: '#ff4757' },
}

export default function Audit({ lang }: Props) {
  const tr = t(lang)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('all')

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs(data || [])
    setLoading(false)
  }

  const filtered = logs.filter(l => actionFilter === 'all' || l.action === actionFilter)

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })

    doc.setFillColor(13, 16, 24)
    doc.rect(0, 0, 297, 25, 'F')
    doc.setTextColor(0, 212, 170)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('PROCONCEPT', 14, 10)
    doc.setFontSize(9)
    doc.setTextColor(138, 150, 174)
    doc.text('Audit Log', 14, 17)
    doc.setTextColor(74, 85, 104)
    doc.text(`Sana: ${new Date().toLocaleString()}`, 180, 10)
    doc.text(`Jami: ${filtered.length} ta yozuv`, 180, 17)

    autoTable(doc, {
      startY: 30,
      head: [['Vaqt', 'Foydalanuvchi', 'Rol', 'Harakat', 'Tafsilot']],
      body: filtered.map(log => {
        const roleInfo = ROLES[log.user_role as keyof typeof ROLES]
        const action = ACTION_INFO[log.action] || { label: log.action, color: '#8896ae' }
        return [
          new Date(log.created_at).toLocaleString(),
          log.user_name || '—',
          roleInfo?.label || log.user_role || '—',
          action.label,
          log.detail || '—',
        ]
      }),
      styles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: [226, 232, 244],
        fillColor: [13, 16, 24],
        lineColor: [30, 37, 53],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [19, 23, 32],
        textColor: [74, 85, 104],
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: { fillColor: [19, 23, 32] },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 30 },
        2: { cellWidth: 35 },
        3: { cellWidth: 40 },
        4: { cellWidth: 'auto' },
      },
    })

    doc.save(`audit-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  return (
    <div>
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select
          className="bg-[#0d1018] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="all">Barcha harakatlar</option>
          {Object.entries(ACTION_INFO).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <button
          onClick={exportPDF}
          className="px-4 py-2.5 bg-[#0d1018] border border-[#1e2535] text-[#8896ae] font-bold rounded-xl text-[13px] hover:border-[#0095ff] hover:text-[#0095ff] transition-all flex items-center gap-2"
        >
          📄 PDF export
        </button>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#0095ff]" />
          <span className="font-bold text-[14px]">{tr.audit} ({filtered.length})</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">🔍</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Vaqt', 'Foydalanuvchi', 'Harakat', 'Tafsilot'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">🔍</div>{tr.noData}
                </td></tr>
              ) : filtered.map(log => {
                const roleInfo = ROLES[log.user_role as keyof typeof ROLES]
                const action = ACTION_INFO[log.action] || { label: log.action, color: '#8896ae' }
                return (
                  <tr key={log.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-[12px]" style={{ color: roleInfo?.color || '#8896ae' }}>
                        {roleInfo?.icon} {log.user_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono border"
                        style={{ background: action.color + '18', color: action.color, borderColor: action.color + '30' }}>
                        {action.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#8896ae]">{log.detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}