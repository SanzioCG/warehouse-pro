import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function LowStock({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchLowStock() }, [])

  async function fetchLowStock() {
    setLoading(true)
    const { data } = await supabase
      .from('stock')
      .select('*, products(id, name, sku, unit, warehouse_id, threshold)')
    const low = (data || []).filter(r =>
      r.products &&
      role.warehouses.includes(r.products.warehouse_id) &&
      r.on_hand <= r.products.threshold
    )
    setRows(low)
    setLoading(false)
  }

  return (
    <div>
      {rows.length > 0 && (
        <div className="bg-[#ff4757]/8 border border-[#ff4757]/20 rounded-xl px-5 py-3 mb-5 flex items-center gap-3 text-[13px] text-[#ff4757]">
          <span className="text-xl">⚠️</span>
          <strong>{rows.length} ta mahsulot</strong> zaxira chegarasidan past yoki tugagan!
        </div>
      )}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#ff4757]" />
          <span className="font-bold text-[14px]">{tr.lowstock} ({rows.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">⚠️</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['SKU', tr.name, 'Ombor', tr.onHand, tr.threshold, 'Yetishmaydi', tr.status].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">✅</div>Barcha mahsulotlar yetarli!
                </td></tr>
              ) : rows.map(r => {
                const p = r.products
                const wh = WAREHOUSES.find(w => w.id === p?.warehouse_id)
                const missing = Math.max(0, (p?.threshold || 0) - r.on_hand)
                return (
                  <tr key={r.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{p?.sku}</td>
                    <td className="px-4 py-3 font-bold text-[13px]">{p?.name}</td>
                    <td className="px-4 py-3">
                      {wh && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border"
                          style={{ background: wh.color + '18', color: wh.color, borderColor: wh.color + '30' }}>
                          {wh.icon} {wh.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: r.on_hand === 0 ? '#ff4757' : '#ffa502' }}>{r.on_hand}</td>
                    <td className="px-4 py-3 font-mono text-[#4a5568]">{p?.threshold}</td>
                    <td className="px-4 py-3 font-mono text-[#ff4757] font-bold">−{missing}</td>
                    <td className="px-4 py-3">
                      {r.on_hand === 0
                        ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/20">{tr.finished}</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ffa502]/10 text-[#ffa502] border border-[#ffa502]/20">{tr.low}</span>
                      }
                    </td>
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