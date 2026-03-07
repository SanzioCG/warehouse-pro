import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

export default function Stock({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [whFilter, setWhFilter] = useState('all')

  useEffect(() => { fetchStock() }, [])

  async function fetchStock() {
    setLoading(true)
    const { data } = await supabase
      .from('stock')
      .select('*, products(id, name, sku, unit, warehouse_id, threshold, cost_price, sell_price)')
    setRows(data || [])
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    if (!r.products || !role.warehouses.includes(r.products.warehouse_id)) return false
    const matchW = whFilter === 'all' || r.products.warehouse_id === whFilter
    const matchS = r.products.name.toLowerCase().includes(search.toLowerCase())
    return matchW && matchS
  })

  const fmt = (n: number) => n?.toLocaleString('uz-UZ')

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568] text-sm">🔍</span>
          <input
            className="w-full bg-[#0d1018] border border-[#1e2535] rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] transition-all placeholder:text-[#4a5568]"
            placeholder={tr.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="bg-[#0d1018] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={whFilter}
          onChange={e => setWhFilter(e.target.value)}
        >
          <option value="all">{tr.allWarehouses}</option>
          {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
            <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
          )}
        </select>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.stock} ({filtered.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">🗃️</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[tr.sku, tr.name, 'Ombor', tr.onHand, tr.reserved, tr.available,
                  ...(role.canSeeCost ? [tr.costPrice] : []),
                  tr.threshold, tr.status].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">🗃️</div>{tr.noData}
                </td></tr>
              ) : filtered.map(r => {
                const p = r.products
                const available = r.on_hand - r.reserved
                const isLow = r.on_hand <= (p?.threshold || 0)
                const wh = WAREHOUSES.find(w => w.id === p?.warehouse_id)
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
                    <td className="px-4 py-3 font-mono font-bold text-[13px]">{r.on_hand}</td>
                    <td className="px-4 py-3 font-mono text-[#ffa502] text-[13px]">{r.reserved}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[13px]"
                      style={{ color: available <= 0 ? '#ff4757' : '#00d4aa' }}>
                      {available}
                    </td>
                    {role.canSeeCost && (
                      <td className="px-4 py-3 font-mono text-[12px] text-[#8896ae]">{fmt(p?.cost_price)}</td>
                    )}
                    <td className="px-4 py-3 font-mono text-[12px] text-[#4a5568]">{p?.threshold}</td>
                    <td className="px-4 py-3">
                      {r.on_hand === 0
                        ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/20">{tr.finished}</span>
                        : isLow
                        ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ffa502]/10 text-[#ffa502] border border-[#ffa502]/20">{tr.low}</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20">{tr.normal}</span>
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