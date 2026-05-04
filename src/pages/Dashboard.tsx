import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

interface StockItem {
  id: string; on_hand: number; cost_price: number; sell_price: number;
  batch?: string; product_id: string;
  products: { warehouse_id: string; threshold: number; name: string; unit: string; sku: string; }
}

export default function Dashboard({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  
  const [products, setProducts] = useState<any[]>([])
  const [stock, setStock] = useState<StockItem[]>([])
  const [freeTxs, setFreeTxs] = useState<any[]>([]) // Tekin chiqimlar uchun
  const [recentTx, setRecentTx] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWh, setSelectedWh] = useState<string | null>(null)
  const [batchFilter, setBatchFilter] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: prodData },
        { data: stockData },
        { data: freeData }, // Tekin chiqimlarni olamiz
        { data: recentData },
      ] = await Promise.all([
        supabase.from('products').select('*').in('warehouse_id', role.warehouses),
        supabase.from('stock').select('*, products!inner(warehouse_id, threshold, name, unit, sku)').in('products.warehouse_id', role.warehouses),
        
        // MUHIM: Tekin chiqimlarni transactions jadvalidan cost_price bilan birga olamiz
        supabase.from('transactions')
          .select('qty, cost_price, warehouse_id, batch')
          .eq('type', 'issuance')
          .eq('sale_type', 'free')
          .in('warehouse_id', role.warehouses),
        
        supabase.from('transactions').select('*, products(name, unit)').in('warehouse_id', role.warehouses).order('created_at', { ascending: false }).limit(6),
      ])

      setProducts(prodData || [])
      setStock((stockData as unknown as StockItem[]) || [])
      setFreeTxs(freeData || []) // Tekin chiqimlar savati
      setRecentTx(recentData || [])
    } catch (error) {
      console.error("Dashboard data fetch error:", error)
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => { fetchData() }, [fetchData])

  // 1. Umumiy statistikani xotirada saqlash
  const globalStats = useMemo(() => {
    if (!role.canSeeCost) return null;

    const jamiQiymat = stock.reduce((a, s) => a + (s.on_hand || 0) * (s.cost_price || 0), 0)
    const kutilayotganFoyda = stock.reduce((a, s) => 
      a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0)
    
    // TEKIN ZARAR: Faqat freeTxs ichidagi qty * cost_price ni hisoblaymiz
    const tekinZarar = freeTxs.reduce((acc, t) => acc + (Number(t.qty || 0) * Number(t.cost_price || 0)), 0)

    return { jamiQiymat, kutilayotganFoyda, tekinZarar }
  }, [stock, freeTxs, role.canSeeCost])

  // 2. Omborlar bo'yicha statistikani xotirada saqlash
  const warehouseStats = useMemo(() => {
    const stats: Record<string, any> = {}
    
    role.warehouses.forEach(wid => {
      const myStock = stock.filter(s => s.products?.warehouse_id === wid)
      const myFree = freeTxs.filter(t => t.warehouse_id === wid)

      stats[wid] = {
        value: myStock.reduce((a, s) => a + (s.on_hand || 0) * (s.cost_price || 0), 0),
        profit: myStock.reduce((a, s) => a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0),
        loss: myFree.reduce((a, t) => a + (Number(t.qty || 0) * Number(t.cost_price || 0)), 0),
        totalProducts: products.filter(p => p.warehouse_id === wid).length,
        lowCount: myStock.filter(s => (s.on_hand || 0) <= (s.products?.threshold || 0)).length,
        totalQty: myStock.reduce((a, s) => a + (s.on_hand || 0), 0)
      }
    })
    return stats
  }, [stock, freeTxs, products, role.warehouses])

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const i = useMemo(() => ({
    omborlar:       lang === 'ru' ? 'Склады' : 'Omborlar',
    mahsulot:        lang === 'ru' ? 'товаров' : 'mahsulot',
    jamiQiymat:      lang === 'ru' ? 'Общая стоимость' : 'Jami qiymat',
    kutFoyda:        lang === 'ru' ? 'Ожидаемая прибыль' : 'Kutilayotgan foyda',
    tekinZarar:      lang === 'ru' ? 'Убыток от бесплатных' : 'Tekin zarar',
    zaxira:          lang === 'ru' ? 'Запас' : 'Zaxira',
    jamiAktivlar:   lang === 'ru' ? 'Общие активы' : 'Jami aktivlar',
    foyda:           lang === 'ru' ? 'Прибыль' : 'Foyda',
    kamZaxira:       lang === 'ru' ? 'Мало остатков' : 'Kam zaxira',
    molHisobot:      lang === 'ru' ? 'Финансовый отчёт' : 'Moliyaviy hisobot',
    partiya:         lang === 'ru' ? 'Партия:' : 'Partiya:',
    barchasi:        lang === 'ru' ? 'Все' : 'Barchasi',
    hisob:           lang === 'ru' ? 'Расчёты на основе остатков' : 'Hisob-kitoblar jami qoldiq va tranzaksiyalarga asoslangan',
    taWarning:       lang === 'ru' ? '⚠️ Убыток от бесплатных' : '⚠️ Tekin zarar',
  }), [lang])

  if (loading) return <div className="flex items-center justify-center h-64 text-[#4a5568] font-mono animate-pulse uppercase tracking-widest">Yuklanmoqda...</div>

  return (
    <div className="pt-14 lg:pt-0">
      {/* Yuqori Kartochkalar */}
      {role.canSeeCost && globalStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
          <div className="bg-[#0d1018] border border-[#171c27] rounded-xl p-4 relative overflow-hidden shadow-lg shadow-black/40">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00d4aa]" />
            <div className="text-[12px] font-mono text-[#ddeaff] uppercase tracking-widest mb-2">{i.jamiQiymat}</div>
            <div className="text-xl font-black font-mono text-[#00d4aa]">{fmt(globalStats.jamiQiymat)}</div>
          </div>
          <div className="bg-[#0d1018] border border-[#171c27] rounded-xl p-4 relative overflow-hidden shadow-lg shadow-black/40">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#a55eea]" />
            <div className="text-[12px] font-mono text-[#ddeaff] uppercase tracking-widest mb-2">{i.kutFoyda}</div>
            <div className="text-xl font-black font-mono text-[#a55eea]">{fmt(globalStats.kutilayotganFoyda)}</div>
          </div>
          <div className="bg-[#0d1018] border border-[#171c27] rounded-xl p-4 relative overflow-hidden shadow-lg shadow-black/40">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ff4757]" />
            <div className="text-[12px] font-mono text-[#ddeaff] uppercase tracking-widest mb-2">{i.tekinZarar}</div>
            <div className="text-xl font-black font-mono text-[#ff4757]">−{fmt(globalStats.tekinZarar)}</div>
          </div>
        </div>
      )}

      {/* Omborlar sarlavhasi */}
      <div className="mb-6 text-[16px] font-black flex items-center gap-4 text-white uppercase tracking-tighter">
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
              className="bg-[#0d1018] border border-[#1e2535] rounded-xl p-4 hover:border-[#28324a] transition-all text-left w-full group shadow-lg"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-inner" style={{ background: wh.color + '15', border: `0.5px solid ${wh.color}30` }}>
                    {wh.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-black text-[14px] leading-tight truncate uppercase tracking-tight">{wh.name}</div>
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: wh.color }}>
                      {s.totalProducts} {i.mahsulot}
                    </div>
                  </div>
                </div>
                <span className="text-[#4a5568] group-hover:text-[#00d4aa] text-lg">↗</span>
              </div>

              {role.canSeeCost ? (
                <div className="space-y-1.5 font-bold">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#c7ccd4]">{i.jamiAktivlar}</span>
                    <span className="font-mono text-[13px] text-[#00d4aa]">{fmt(s.value)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#c7ccd4]">{i.foyda}</span>
                    <span className="font-mono text-[13px] text-[#a55eea]">{fmt(s.profit)}</span>
                  </div>
                  {s.loss > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-[#1e2535] mt-1 text-[#ff4757]">
                       <span className="text-[11px] uppercase tracking-tighter">Tekin Zarar</span>
                       <span className="font-mono text-[12px] font-black">−{fmt(s.loss)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center text-white font-bold uppercase">
                  <span className="text-[10px] text-[#4a5568]">{i.zaxira}</span>
                  <span className="font-mono text-[12px]">{s.totalQty}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Oxirgi operatsiyalar jadvali */}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2 text-white">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px] uppercase tracking-widest">{tr.recentOps}</span>
        </div>
        <div className="overflow-x-auto text-white">
          <table className="w-full border-collapse min-w-[600px]">
            <thead className="bg-[#0d1018] text-[#4a5568] font-mono text-[10px] uppercase tracking-widest">
              <tr>
                <th className="px-4 py-3 text-left">{tr.date}</th>
                <th className="px-4 py-3 text-left">{tr.type}</th>
                <th className="px-4 py-3 text-left">Ombor</th>
                <th className="px-4 py-3 text-left">{tr.product}</th>
                <th className="px-4 py-3 text-left">{tr.qty}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2535]">
              {recentTx.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-[#4a5568]">{tr.noData}</td></tr> : recentTx.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-[#131720] transition-all">
                  <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black border ${tx.type === 'receiving' ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20' : 'bg-[#ffa502]/10 text-[#ffa502] border-[#ffa502]/20'}`}>
                      {tx.type === 'receiving' ? '📥 KIRIM' : '📤 CHIQIM'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]">{WAREHOUSES.find(w => w.id === tx.warehouse_id)?.name}</td>
                  <td className="px-4 py-3 font-bold text-[13px]">{tx.products?.name}</td>
                  <td className="px-4 py-3 font-mono font-bold text-[13px]">{tx.qty} {tx.products?.unit}</td>
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
        const myFree = freeTxs.filter(t => t.warehouse_id === selectedWh)
        
        const batches = [...new Set(myStock.map(s => s.batch?.trim()).filter(Boolean))].sort() as string[]
        
        const displayData = batches
          .filter(b => batchFilter === 'all' || b === batchFilter)
          .map(batch => {
            const items = myStock.filter(s => (s.batch?.trim() || '') === batch)
            const loss = myFree.filter(t => (t.batch?.trim() || '') === batch)
              .reduce((acc, t) => acc + (Number(t.qty || 0) * Number(t.cost_price || 0)), 0)
            
            return {
              batch,
              value: items.reduce((a, s) => a + (s.on_hand * s.cost_price), 0),
              profit: items.reduce((a, s) => a + (s.on_hand * (s.sell_price - s.cost_price)), 0),
              loss,
              qty: items.reduce((a, s) => a + s.on_hand, 0)
            }
          })

        return (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && setSelectedWh(null)}>
            <div className="bg-[#0d1018] border border-[#28324a] rounded-3xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="sticky top-0 bg-[#0d1018] z-10 px-6 pt-6 pb-4 border-b border-[#1e2535] flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl shadow-inner" style={{ background: wh.color + '18', border: `1px solid ${wh.color}30` }}>{wh.icon}</div>
                  <div>
                    <div className="font-black text-[15px] uppercase tracking-wide">{wh.name}</div>
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase">{i.molHisobot}</div>
                  </div>
                </div>
                <button onClick={() => setSelectedWh(null)} className="w-8 h-8 rounded-lg border border-[#1e2535] hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">{i.partiya}</span>
                  <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="bg-[#00d4aa] text-[#0d1018] rounded-xl px-3 py-1 text-[11px] font-black outline-none border-none">
                    <option value="all">{i.barchasi}</option>
                    {batches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5 text-white">
                  <div className="p-3 bg-[#131720] rounded-2xl border border-[#1e2535]">
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{i.jamiAktivlar}</div>
                    <div className="text-xl font-black font-mono">{fmt(displayData.reduce((a, d) => a + d.value, 0))}</div>
                  </div>
                  <div className="p-3 bg-[#131720] rounded-2xl border border-[#1e2535]">
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{i.kutFoyda}</div>
                    <div className="text-xl font-black font-mono text-[#00d4aa]">{fmt(displayData.reduce((a, d) => a + d.profit, 0))}</div>
                  </div>
                </div>

                {/* MODAL ICHIDAGI TEKIN ZARAR */}
                {displayData.some(d => d.loss > 0) && (
                  <div className="bg-[#ff4757]/8 border border-[#ff4757]/20 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between text-[#ff4757]">
                    <span className="text-[12px] font-black uppercase tracking-tight">{i.taWarning}</span>
                    <span className="font-mono font-black text-lg">−{fmt(displayData.reduce((a,d)=>a+d.loss,0))}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {displayData.map(d => (
                    <div key={d.batch} className="flex flex-col sm:flex-row justify-between bg-[#131720] border border-[#1e2535] rounded-2xl px-4 py-4 gap-2 transition-all hover:border-[#28324a]">
                      <span className="font-mono text-[11px] text-[#8896ae] font-black uppercase tracking-widest">📦 Partiya: {d.batch} ({d.qty})</span>
                      <div className="flex gap-4">
                        <div className="text-center font-mono text-white"><div className="text-[8px] text-[#4a5568] uppercase mb-0.5">Qiymat</div><div className="text-[11px] font-bold">{fmt(d.value)}</div></div>
                        <div className="text-center font-mono text-white"><div className="text-[8px] text-[#4a5568] uppercase mb-0.5">Foyda</div><div className="text-[11px] font-bold text-[#a55eea]">+{fmt(d.profit)}</div></div>
                        {d.loss > 0 && <div className="text-center font-mono"><div className="text-[8px] text-[#4a5568] uppercase mb-0.5">Zarar</div><div className="text-[11px] text-[#ff4757] font-bold">−{fmt(d.loss)}</div></div>}
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