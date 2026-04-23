import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Profit({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]) // Default: Bugun

  const fetchProfit = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          products(name, unit, cost_price, sell_price, warehouse_id)
        `)
        .in('warehouse_id', role.warehouses)
        .eq('type', 'issuance') // Faqat chiqimlarni olamiz
        .order('created_at', { ascending: false })

      if (dateFilter) {
        query = query.gte('created_at', `${dateFilter}T00:00:00`).lte('created_at', `${dateFilter}T23:59:59`)
      }

      const { data } = await query
      setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [role.warehouses, dateFilter])

  useEffect(() => { fetchProfit() }, [fetchProfit])

  // Moliyaviy hisob-kitoblar
  const stats = useMemo(() => {
    let revenue = 0
    let cost = 0
    let lossFromFree = 0

    rows.forEach((row) => {
      const qty = Number(row.qty || 0)
      const sellPrice = Number(row.sell_price ?? 0)
      const costPrice = Number(row.cost_price ?? row.products?.cost_price ?? 0)

      if (row.sale_type === 'free') {
        // Tekin berilgan bo'lsa - bu sof zarar (tan narxi bo'yicha)
        lossFromFree += (qty * costPrice)
      } else {
        revenue += (qty * sellPrice)
        cost += (qty * costPrice)
      }
    })

    return {
      revenue,
      cost,
      lossFromFree,
      netProfit: revenue - cost - lossFromFree
    }
  }, [rows])

  // Narx formatlash (Nuqtadan keyin ortiqcha nollarsiz)
  const fmt = (n: number) => 
    '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })

  return (
    <div className="space-y-6 pt-4">
      {/* Sarlavha va Sana Filtri */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-2">
        <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
          <div className="w-1 h-5 bg-[#00d4aa] rounded" />
          {tr.profit}
        </h2>
        
        <div className="flex items-center gap-2 bg-[#0d1018] p-2 rounded-xl border border-[#1e2535]">
          <span className="text-[10px] font-mono text-[#4a5568] uppercase ml-2">Sana:</span>
          <input 
            type="date" 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-transparent text-white text-[13px] font-bold outline-none px-2"
          />
        </div>
      </div>

      {/* Statistika kartalari */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Sof Foyda */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00d4aa]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Sof Foyda</div>
          <div className={`text-2xl font-black font-mono ${stats.netProfit >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4757]'}`}>
            {fmt(stats.netProfit)}
          </div>
        </div>

        {/* Jami Daromad */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#0095ff]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Umumiy Savdo</div>
          <div className="text-2xl font-black text-[#0095ff] font-mono">{fmt(stats.revenue)}</div>
        </div>

        {/* Tekin (Zarar) */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ff4757]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Tekin (Zarar)</div>
          <div className="text-2xl font-black text-[#ff4757] font-mono">-{fmt(stats.lossFromFree)}</div>
        </div>

        {/* Operatsiyalar soni */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffa502]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Sotuvlar soni</div>
          <div className="text-2xl font-black text-[#ffa502] font-mono">{rows.length} ta</div>
        </div>
      </div>

      {/* Operatsiyalar jadvali */}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2535] bg-[#131720] flex items-center justify-between">
          <span className="font-bold text-[14px] text-white">Batafsil hisobot</span>
          <button onClick={fetchProfit} className="text-[11px] text-[#8896ae] hover:text-white transition-all uppercase font-mono tracking-tighter">Yangilash ↻</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                {[tr.date, tr.product, tr.qty, 'Sotuv narxi', 'Tan narxi', 'Sof Foyda'].map((h) => (
                  <th key={h} className="px-5 py-4 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-widest bg-[#0d1018] border-b border-[#1e2535]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-20 animate-pulse text-[#4a5568]">Hisoblanmoqda...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-[#4a5568] font-mono">{tr.noData}</td></tr>
              ) : rows.map((row) => {
                const qty = Number(row.qty || 0)
                const sellPrice = Number(row.sell_price ?? 0)
                const costPrice = Number(row.cost_price ?? row.products?.cost_price ?? 0)
                
                // Tekin bo'lsa foyda minusda bo'ladi
                const profit = row.sale_type === 'free' ? -(qty * costPrice) : qty * (sellPrice - costPrice)

                return (
                  <tr key={row.id} className="border-b border-[#1e2535] hover:bg-[#131720]/50 transition-all">
                    <td className="px-5 py-4 text-[11px] font-mono text-[#4a5568]">
                      {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-[13px] text-white">{row.products?.name}</div>
                      <div className="text-[10px] text-[#4a5568] font-mono">{row.sale_type === 'free' ? '🎁 TEKIN' : row.sale_type === 'debt' ? '🚩 QARZ' : '✅ NAQD'}</div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[13px] text-white">
                      {qty} {row.products?.unit}
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#8896ae]">
                      {row.sale_type === 'free' ? '$0' : fmt(sellPrice)}
                    </td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#4a5568]">
                      {fmt(costPrice)}
                    </td>
                    <td className={`px-5 py-4 font-mono font-black text-[14px] ${profit >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4757]'}`}>
                      {profit > 0 ? '+' : ''}{fmt(profit)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}