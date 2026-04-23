import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

// TypeScript interfeyslari xatolarni oldini olish uchun
interface StockItem {
  id: string;
  on_hand: number;
  cost_price: number;
  sell_price: number;
  batch?: string;
  product_id: string;
  products: {
    warehouse_id: string;
    threshold: number;
    name: string;
    unit: string;
    sku: string;
  }
}

export default function Dashboard({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  
  // State-lar
  const [products, setProducts] = useState<any[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [freeTxs, setFreeTxs] = useState<any[]>([])
  const [recentTx, setRecentTx] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWh, setSelectedWh] = useState<string | null>(null)
  const [batchFilter, setBatchFilter] = useState('all')

  // Ma'lumotlarni yuklash funksiyasi
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: prodData },
        { data: stockData },
        { data: freeData },
        { data: recentData },
      ] = await Promise.all([
        // 1. Faqat ruxsat berilgan omborlardagi mahsulotlar
        supabase.from('products').select('*').in('warehouse_id', role.warehouses),
        
        // 2. Stockni serverda filterlash (!inner join orqali)
        supabase.from('stock')
          .select('*, products!inner(warehouse_id, threshold, name, unit, sku)')
          .in('products.warehouse_id', role.warehouses),
        
        // 3. Tekin chiqimlar
        supabase.from('transactions')
          .select('*, products!inner(cost_price, warehouse_id)')
          .eq('type', 'issuance')
          .eq('sale_type', 'free')
          .in('warehouse_id', role.warehouses),
        
        // 4. Oxirgi operatsiyalar
        supabase.from('transactions')
          .select('*, products(name, unit)')
          .in('warehouse_id', role.warehouses)
          .order('created_at', { ascending: false })
          .limit(6),
      ])

      setProducts(prodData || [])
      setStock((stockData as unknown as StockItem[]) || [])
      setFreeTxs(freeData || [])
      setRecentTx(recentData || [])
    } catch (error) {
      console.error("Data fetch error:", error)
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => { fetchData() }, [fetchData])

  // 1. Umumiy statistikani xotirada saqlash (useMemo)
  const globalStats = useMemo(() => {
    if (!role.canSeeCost) return null;

    const jamiQiymat = stock.reduce((a, s) => a + (s.on_hand || 0) * (s.cost_price || 0), 0)
    const kutilayotganFoyda = stock.reduce((a, s) => 
      a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0)
    const tekinZarar = freeTxs.reduce((a, t) => a + (t.qty || 0) * (t.products?.cost_price || 0), 0)

    return { jamiQiymat, kutilayotganFoyda, tekinZarar }
  }, [stock, freeTxs, role.canSeeCost])

  // 2. Omborlar bo'yicha statistikani xotirada saqlash
  const warehouseStats = useMemo(() => {
    const stats: Record<string, any> = {}
    
    role.warehouses.forEach(wid => {
      const myStock = stock.filter(s => s.products?.warehouse_id === wid)
      const myFree = freeTxs.filter(t => t.products?.warehouse_id === wid)

      stats[wid] = {
        value: myStock.reduce((a, s) => a + (s.on_hand || 0) * (s.cost_price || 0), 0),
        profit: myStock.reduce((a, s) => a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0),
        totalProducts: products.filter(p => p.warehouse_id === wid).length,
        lowCount: myStock.filter(s => (s.on_hand || 0) <= (s.products?.threshold || 0)).length,
        totalQty: myStock.reduce((a, s) => a + (s.on_hand || 0), 0)
      }
    })
    return stats
  }, [stock, freeTxs, products, role.warehouses])

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  // Tarjimalar obyektini tashqariga yoki useMemo ichiga olish mumkin
  const i = useMemo(() => ({
    omborlar:       lang === 'ru' ? 'Склады' : 'Omborlar',
    jamiAktivlar:   lang === 'ru' ? 'Общие активы' : 'Jami aktivlar',
    foyda:           lang === 'ru' ? 'Прибыyl' : 'Foyda',
    zarar:           lang === 'ru' ? 'Убыток' : 'Zarar',
    kamZaxira:       lang === 'ru' ? 'Мало остатков' : 'Kam zaxira',
    mahsulot:        lang === 'ru' ? 'товаров' : 'mahsulot',
    jamiQiymat:      lang === 'ru' ? 'Общая стоимость' : 'Jami qiymat',
    kutFoyda:        lang === 'ru' ? 'Ожидаемая прибыль' : 'Kutilayotgan foyda',
    tekinZarar:      lang === 'ru' ? 'Убыток от бесплатных' : 'Tekin zarar',
    molHisobot:      lang === 'ru' ? 'Финансовый отчёт' : 'Moliyaviy hisobot',
    partiya:         lang === 'ru' ? 'Партия:' : 'Partiya:',
    barchasi:        lang === 'ru' ? 'Все' : 'Barchasi',
    hisob:           lang === 'ru' ? 'Расчёты на основе остатков и цен' : 'Hisob-kitoblar jami qoldiq va narxga asoslangan',
    taWarning:       lang === 'ru' ? '⚠️ Убыток от бесплатных' : '⚠️ Tekin zarar',
    operYoq:         lang === 'ru' ? 'Операций нет' : "Operatsiyalar yo'q",
    zaxira:          lang === 'ru' ? 'Запас' : 'Zaxira',
  }), [lang])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#4a5568]">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">📦</div>
        <div className="font-mono text-sm">Loading...</div>
      </div>
    </div>
  )

  return (
    <div className="pt-14 lg:pt-0">
      {/* Yuqori Kartochkalar (Faqat narx ko'rish ruxsati bo'lsa) */}
      {role.canSeeCost && globalStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          {[
            { label: i.jamiQiymat, value: fmt(globalStats.jamiQiymat), accent: '#00d4aa' },
            { label: i.kutFoyda, value: fmt(globalStats.kutilayotganFoyda), accent: '#a55eea' },
            { label: i.tekinZarar, value: '−' + fmt(globalStats.tekinZarar), accent: '#ff4757' },
          ].map((c, idx) => (
            <div key={idx} className="bg-[#0d1018] border border-[#171c27] rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: c.accent }} />
              <div className="text-[12px] md:text-[14px] font-mono text-[#ddeaff] uppercase tracking-widest mb-2">{c.label}</div>
              <div className="text-lg md:text-xl font-black font-mono" style={{ color: c.accent }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Omborlar sarlavhasi */}
      <div className="mb-6 text-[16px] font-black flex items-center gap-4">
        <div className="w-1 h-5 rounded bg-[#00d4aa]" />
        {i.omborlar}
      </div>

      {/* Omborlar ro'yxati */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(wh => {
          const s = warehouseStats[wh.id]
          return (
            <button
              key={wh.id}
              onClick={() => { setSelectedWh(wh.id); setBatchFilter('all') }}
              className="bg-[#0d1018] border border-[#1e2535] rounded-xl p-4 hover:border-[#28324a] transition-all text-left w-full group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg" style={{ background: wh.color + '15', border: `0.5px solid ${wh.color}30` }}>
                    {wh.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-[14px] leading-tight truncate">{wh.name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: wh.color }}>
                      {s.totalProducts} {i.mahsulot}
                    </div>
                  </div>
                </div>
                <span className="text-[#4a5568] group-hover:text-[#00d4aa] text-lg">↗</span>
              </div>

              {role.canSeeCost ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#c7ccd4]">{i.jamiAktivlar}</span>
                    <span className="font-mono font-bold text-[13px] text-[#00d4aa]">{fmt(s.value)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#c7ccd4]">{i.foyda}</span>
                    <span className="font-mono font-bold text-[13px] text-[#a55eea]">{fmt(s.profit)}</span>
                  </div>
                  {s.lowCount > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-[#1e2535] mt-1">
                      <span className="text-[12px] text-[#ff4757]">{i.kamZaxira}</span>
                      <span className="font-mono font-bold text-[12px] text-[#ff4757]">{s.lowCount}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#4a5568]">{i.zaxira}</span>
                  <span className="font-mono font-bold text-[12px]" style={{ color: wh.color }}>{s.totalQty}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Oxirgi operatsiyalar jadvali */}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.recentOps}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr>
                {[tr.date, tr.type, tr.warehouse, tr.product, tr.qty, tr.user].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-[#4a5568]">{i.operYoq}</td></tr>
              ) : recentTx.map((tx: any) => (
                <tr key={tx.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                  <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${tx.type === 'receiving' ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20' : 'bg-[#ffa502]/10 text-[#ffa502] border-[#ffa502]/20'}`}>
                      {tx.type === 'receiving' ? '📥 ' + tr.receiving : '📤 ' + tr.issuance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]">{WAREHOUSES.find(w => w.id === tx.warehouse_id)?.name}</td>
                  <td className="px-4 py-3 font-bold text-[13px]">{tx.products?.name}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{tx.qty} {tx.products?.unit}</td>
                  <td className="px-4 py-3 text-[12px] text-[#4a5568]">{tx.user_role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ombor tafsilotlari (Batch/Partiya bo'yicha) */}
      {selectedWh && (() => {
        const wh = WAREHOUSES.find(w => w.id === selectedWh)!
        const myStock = stock.filter(s => s.products?.warehouse_id === selectedWh)
        const myFree = freeTxs.filter(t => t.products?.warehouse_id === selectedWh)
        
        // Partiyalarni aniqlash
        const batches = [...new Set(myStock.map(s => s.batch?.trim()).filter(Boolean))].sort() as string[]
        
        // Tanlangan partiya bo'yicha hisoblar
        const displayData = batches
          .filter(b => batchFilter === 'all' || b === batchFilter)
          .map(batch => {
            const items = myStock.filter(s => (s.batch?.trim() || '') === batch)
            const loss = myFree.filter(t => (t.batch?.trim() || '') === batch)
              .reduce((a, t) => a + (t.qty || 0) * (t.products?.cost_price || 0), 0)
            
            return {
              batch,
              value: items.reduce((a, s) => a + (s.on_hand || 0) * (s.cost_price || 0), 0),
              profit: items.reduce((a, s) => a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0),
              loss,
              qty: items.reduce((a, s) => a + (s.on_hand || 0), 0)
            }
          })

        const totalFilteredValue = displayData.reduce((a, d) => a + d.value, 0)
        const totalFilteredProfit = displayData.reduce((a, d) => a + d.profit, 0)
        const totalFilteredLoss = displayData.reduce((a, d) => a + d.loss, 0)

        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setSelectedWh(null)}>
            <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-[#0d1018] z-10 px-6 pt-6 pb-4 border-b border-[#1e2535] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl" style={{ background: wh.color + '18', border: `1px solid ${wh.color}30` }}>{wh.icon}</div>
                  <div>
                    <div className="font-black text-[15px] uppercase tracking-wide">{wh.name}</div>
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase">{i.molHisobot}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedWh(null)} className="w-8 h-8 rounded-lg border border-[#1e2535] text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] font-mono text-[#4a5568] uppercase">{i.partiya}</span>
                  <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="bg-[#00d4aa] text-black rounded px-3 py-1 text-[11px] font-bold">
                    <option value="all">{i.barchasi}</option>
                    {batches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="p-3 bg-[#131720] rounded-xl border border-[#1e2535]">
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{i.jamiAktivlar}</div>
                    <div className="text-2xl font-black text-white">{fmt(totalFilteredValue)}</div>
                  </div>
                  <div className="p-3 bg-[#131720] rounded-xl border border-[#1e2535]">
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{i.kutFoyda}</div>
                    <div className="text-2xl font-black text-[#00d4aa]">{fmt(totalFilteredProfit)}</div>
                  </div>
                </div>

                {totalFilteredLoss > 0 && (
                  <div className="bg-[#ff4757]/8 border border-[#ff4757]/20 rounded-xl px-4 py-3 mb-4 flex items-center justify-between text-[#ff4757]">
                    <span className="text-[12px] font-semibold">{i.taWarning}</span>
                    <span className="font-mono font-black">−{fmt(totalFilteredLoss)}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {displayData.map(d => (
                    <div key={d.batch} className="flex flex-col sm:flex-row justify-between bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 gap-2">
                      <span className="font-mono text-[11px] text-[#8896ae]">📦 {d.batch} ({d.qty})</span>
                      <div className="flex gap-4">
                        <div className="text-center"><div className="text-[9px] text-gray-500">Value</div><div className="font-mono text-[11px] text-[#00d4aa] font-bold">{fmt(d.value)}</div></div>
                        <div className="text-center"><div className="text-[9px] text-gray-500">Profit</div><div className="font-mono text-[11px] text-[#a55eea] font-bold">+{fmt(d.profit)}</div></div>
                        {d.loss > 0 && <div className="text-center"><div className="text-[9px] text-gray-500">Loss</div><div className="font-mono text-[11px] text-[#ff4757] font-bold">−{fmt(d.loss)}</div></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}