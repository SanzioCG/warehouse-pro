import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

export default function Profit({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfit()
  }, [])

  async function fetchProfit() {
    setLoading(true)

    const { data } = await supabase
      .from('transactions')
      .select(`
        *,
        products(name, unit, cost_price, sell_price, warehouse_id)
      `)
      .in('warehouse_id', role.warehouses)
      .order('created_at', { ascending: false })

    setRows(data || [])
    setLoading(false)
  }

  const sales = useMemo(() => {
    return rows.filter((row) => {
      const type = String(row.type || '').toLowerCase()
      return type === 'issuance' || type === 'sale' || type === 'sold'
    })
  }, [rows])

  const totalRevenue = useMemo(() => {
    return sales.reduce((acc, row) => {
      const qty = Number(row.qty || 0)
      const sellPrice =
        Number(row.sell_price ?? row.products?.sell_price ?? 0)
      return acc + qty * sellPrice
    }, 0)
  }, [sales])

  const totalCost = useMemo(() => {
    return sales.reduce((acc, row) => {
      const qty = Number(row.qty || 0)
      const costPrice =
        Number(row.cost_price ?? row.products?.cost_price ?? 0)
      return acc + qty * costPrice
    }, 0)
  }, [sales])

  const totalProfit = totalRevenue - totalCost

  // Dollar formatlash funksiyasi
  const fmt = (n: number) => 
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(n)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {/* Jami Foyda Kartasi */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00d4aa]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            {tr.totalProfit}
          </div>
          <div className={`text-xl font-black ${totalProfit >= 0 ? 'text-[#00d4aa]' : 'text-red-500'}`}>
            {fmt(totalProfit)}
          </div>
        </div>

        {/* Jami Daromad Kartasi */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#0095ff]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            {tr.totalRevenue}
          </div>
          <div className="text-xl font-black text-[#0095ff]">
            {fmt(totalRevenue)}
          </div>
        </div>

        {/* Sotuvlar soni */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffa502]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            {tr.salesCount}
          </div>
          <div className="text-xl font-black text-[#ffa502]">
            {sales.length}
          </div>
        </div>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">
            {tr.profit} ({sales.length})
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">💹</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2">💹</div>
            {tr.noData}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[tr.date, tr.product, tr.qty, tr.sellPrice, tr.costPrice, tr.profit].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => {
                const qty = Number(row.qty || 0)
                const sellPrice = Number(row.sell_price ?? row.products?.sell_price ?? 0)
                const costPrice = Number(row.cost_price ?? row.products?.cost_price ?? 0)
                const profit = qty * (sellPrice - costPrice)

                return (
                  <tr
                    key={row.id}
                    className="border-b border-[#1e2535] hover:bg-[#131720] transition-all"
                  >
                    <td className="px-4 py-3 text-[12px] font-mono text-[#8896ae]">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-bold">
                      {row.products?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      {qty} {row.products?.unit || ''}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {fmt(sellPrice)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {fmt(costPrice)}
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold ${profit >= 0 ? 'text-[#00d4aa]' : 'text-red-500'}`}>
                      {fmt(profit)}
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