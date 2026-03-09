import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Dashboard({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [products, setProducts] = useState<any[]>([])
  const [stock, setStock] = useState<any[]>([])
  const [txs, setTxs] = useState<any[]>([])
  const [freeTxs, setFreeTxs] = useState<any[]>([])
  const [recentTx, setRecentTx] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWh, setSelectedWh] = useState<string | null>(null)
  const [batchFilter, setBatchFilter] = useState('all')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [
      { data: prodData },
      { data: stockData },
      { data: txData },
      { data: freeData },
      { data: recentData },
    ] = await Promise.all([
      supabase.from('products').select('*').in('warehouse_id', role.warehouses),
      supabase.from('stock').select('*, products(warehouse_id, threshold, name, unit, sku)'),
      supabase.from('transactions').select('*').in('warehouse_id', role.warehouses),
      supabase.from('transactions').select('*, products(cost_price, warehouse_id)').eq('type', 'issuance').eq('sale_type', 'free').in('warehouse_id', role.warehouses),
      supabase.from('transactions').select('*, products(name, unit)').in('warehouse_id', role.warehouses).order('created_at', { ascending: false }).limit(6),
    ])

    setProducts(prodData || [])
    setStock(stockData || [])
    setTxs(txData || [])
    setFreeTxs(freeData || [])
    setRecentTx(recentData || [])
    setLoading(false)
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  function getWhStats(wid: string) {
    const myStock = stock.filter((s: any) => s.products?.warehouse_id === wid)
    const myFree = freeTxs.filter((t: any) => t.products?.warehouse_id === wid)

    const value = myStock.reduce((a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0), 0)
    const profit = myStock.reduce((a: number, s: any) => {
      const margin = (s.sell_price || 0) - (s.cost_price || 0)
      return a + (s.on_hand || 0) * margin
    }, 0)
    const loss = myFree.reduce((a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0), 0)
    const totalProducts = products.filter(p => p.warehouse_id === wid).length
    const lowCount = myStock.filter((s: any) => (s.on_hand || 0) <= (s.products?.threshold || 0)).length

    return { value, profit, loss, totalProducts, lowCount }
  }

  function getModalData(wid: string) {
    const myStock = stock.filter((s: any) => s.products?.warehouse_id === wid)
    const myFree = freeTxs.filter((t: any) => t.products?.warehouse_id === wid)

    const batches = [
      ...new Set(
        myStock
          .map((s: any) => s.batch?.trim())
          .filter(Boolean)
      ),
    ].sort() as string[]

    const stockFiltered =
      batchFilter === 'all'
        ? myStock
        : myStock.filter((s: any) => (s.batch?.trim() || '') === batchFilter)

    const filteredValue = stockFiltered.reduce(
      (a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0),
      0
    )

    const filteredProfit = stockFiltered.reduce(
      (a: number, s: any) =>
        a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)),
      0
    )

    const filteredLoss = myFree
      .filter((t: any) =>
        batchFilter === 'all' ? true : (t.batch?.trim() || '') === batchFilter
      )
      .reduce(
        (a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0),
        0
      )

    const totalValue = myStock.reduce(
      (a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0),
      0
    )

    const totalProfit = myStock.reduce(
      (a: number, s: any) =>
        a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)),
      0
    )

    const totalLoss = myFree.reduce(
      (a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0),
      0
    )

    const filtered =
      batchFilter === 'all'
        ? batches.map((batch) => {
            const items = myStock.filter((s: any) => (s.batch?.trim() || '') === batch)
            const batchLoss = myFree
              .filter((t: any) => (t.batch?.trim() || '') === batch)
              .reduce(
                (a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0),
                0
              )

            return [
              batch,
              {
                value: items.reduce(
                  (a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0),
                  0
                ),
                profit: items.reduce(
                  (a: number, s: any) =>
                    a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)),
                  0
                ),
                loss: batchLoss,
                qty: items.reduce((a: number, s: any) => a + (s.on_hand || 0), 0),
              },
            ]
          })
        : batches
            .filter((b) => b === batchFilter)
            .map((batch) => {
              const items = myStock.filter((s: any) => (s.batch?.trim() || '') === batch)
              const batchLoss = myFree
                .filter((t: any) => (t.batch?.trim() || '') === batch)
                .reduce(
                  (a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0),
                  0
                )

              return [
                batch,
                {
                  value: items.reduce(
                    (a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0),
                    0
                  ),
                  profit: items.reduce(
                    (a: number, s: any) =>
                      a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)),
                    0
                  ),
                  loss: batchLoss,
                  qty: items.reduce((a: number, s: any) => a + (s.on_hand || 0), 0),
                },
              ]
            })

    return {
      batches,
      totalValue,
      totalProfit,
      totalLoss,
      filtered,
      filteredValue,
      filteredProfit,
      filteredLoss,
    }
  }

  const i = {
    omborlar:       lang === 'ru' ? 'Склады' : 'Omborlar',
    jamiAktivlar:   lang === 'ru' ? 'Общие активы' : 'Jami aktivlar',
    foyda:          lang === 'ru' ? 'Прибыль' : 'Foyda',
    zarar:          lang === 'ru' ? 'Убыток' : 'Zarar',
    kamZaxira:      lang === 'ru' ? 'Мало остатков' : 'Kam zaxira',
    mahsulot:       lang === 'ru' ? 'товаров' : 'mahsulot',
    jamiQiymat:     lang === 'ru' ? 'Общая стоимость' : 'Jami qiymat',
    kutFoyda:       lang === 'ru' ? 'Ожидаемая прибыль' : 'Kutilayotgan foyda',
    tekinZarar:     lang === 'ru' ? 'Убыток от бесплатных' : 'Tekin zarar',
    aktivQiymati:   lang === 'ru' ? '$ Стоимость активов' : '$ Aktiv qiymati',
    sofRent:        lang === 'ru' ? '💹 Чистая рентабельность' : '💹 Sof rentabellik',
    molHisobot:     lang === 'ru' ? 'Финансовый отчёт' : 'Moliyaviy hisobot',
    partiya:        lang === 'ru' ? 'Партия:' : 'Partiya:',
    barchasi:       lang === 'ru' ? 'Все' : 'Barchasi',
    hisob:          lang === 'ru' ? 'Расчёты на основе остатков и цен' : 'Hisob-kitoblar jami qoldiq va narxga asoslangan',
    taWarning:      lang === 'ru' ? '⚠️ Убыток от бесплатных' : '⚠️ Tekin zarar',
    operYoq:        lang === 'ru' ? 'Операций нет' : "Operatsiyalar yo'q",
    zaxira:         lang === 'ru' ? 'Запас' : 'Zaxira',
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#4a5568]">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">📦</div>
        <div className="font-mono text-sm">Loading...</div>
      </div>
    </div>
  )

  return (
    <div>
      {role.canSeeCost && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            {
              label: i.jamiQiymat,
              value: fmt(stock.filter((s: any) => role.warehouses.includes(s.products?.warehouse_id))
                .reduce((a: number, s: any) => a + (s.on_hand || 0) * (s.cost_price || 0), 0)),
              accent: '#00d4aa',
            },
            {
              label: i.kutFoyda,
              value: fmt(stock.filter((s: any) => role.warehouses.includes(s.products?.warehouse_id))
                .reduce((a: number, s: any) => a + (s.on_hand || 0) * ((s.sell_price || 0) - (s.cost_price || 0)), 0)),
              accent: '#a55eea',
            },
            {
              label: i.tekinZarar,
              value: '−' + fmt(freeTxs.reduce((a: number, t: any) => a + (t.qty || 0) * (t.products?.cost_price || 0), 0)),
              accent: '#ff4757',
            },
          ].map((c, idx) => (
            <div key={idx} className="bg-[#0d1018] border border-[#171c27] rounded-xl p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: c.accent }} />
              <div className="text-[14px] font-mono text-[#ddeaff] uppercase tracking-widest mb-2">{c.label}</div>
              <div className="text-xl font-black font-mono" style={{ color: c.accent }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-8 text-[16px] font-black flex items-center gap-5">
        <div className="w-1 h-5 rounded bg-[#00d4aa]" />
        {i.omborlar}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(wh => {
          const s = getWhStats(wh.id)
          return (
            <button
              key={wh.id}
              onClick={() => { setSelectedWh(wh.id); setBatchFilter('all') }}
              className="bg-[#0d1018] border border-[#1e2535] rounded-xl p-4 hover:border-[#28324a] hover:-translate-y-0.5 transition-all text-left w-full group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: wh.color + '15', border: `0.5px solid ${wh.color}30` }}
                  >
                    {wh.icon}
                  </div>
                  <div>
                    <div className="font-black text-[14px] leading-tight">{wh.name}</div>
                    <div className="text-[12px] font-mono mt-0.8" style={{ color: wh.color }}>
                      {s.totalProducts} {i.mahsulot}
                    </div>
                  </div>
                </div>
                <span className="text-[#4a5568] group-hover:text-[#00d4aa] transition-all text-lg">↗</span>
              </div>

              {role.canSeeCost ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#c7ccd4]">{i.jamiAktivlar}</span>
                    <span className="font-mono font-bold text-[14px] text-[#00d4aa]">{fmt(s.value)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[14px] text-[#c7ccd4]">{i.foyda}</span>
                    <span className="font-mono font-bold text-[14px] text-[#a55eea]">{fmt(s.profit)}</span>
                  </div>
                  {s.loss > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[14px] text-[#c7ccd4]">{i.zarar}</span>
                      <span className="font-mono font-bold text-[14px] text-[#ff4757]">−{fmt(s.loss)}</span>
                    </div>
                  )}
                  {s.lowCount > 0 && (
                    <div className="flex justify-between items-center pt-1 border-t border-[#1e2535]">
                      <span className="text-[14px] text-[#ff4757]">{i.kamZaxira}</span>
                      <span className="font-mono font-bold text-[14px] text-[#ff4757]">{s.lowCount} {lang === 'ru' ? 'шт' : 'ta'}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#4a5568]">{i.zaxira}</span>
                  <span
                    className="font-mono font-bold text-[12px]"
                    style={{ color: wh.color }}
                  >
                    {stock.filter((st: any) => st.products?.warehouse_id === wh.id)
                      .reduce((a: number, st: any) => a + (st.on_hand || 0), 0)}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.recentOps}</span>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[tr.date, tr.type, tr.warehouse, tr.product, tr.qty, tr.user].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTx.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#4a5568]">
                  <div className="text-3xl mb-2">📋</div>
                  {i.operYoq}
                </td>
              </tr>
            ) : recentTx.map((tx: any) => {
              const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
              return (
                <tr key={tx.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                  <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                    {new Date(tx.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                      tx.type === 'receiving'
                        ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20'
                        : 'bg-[#ffa502]/10 text-[#ffa502] border-[#ffa502]/20'
                    }`}>
                      {tx.type === 'receiving' ? '📥 ' + tr.receiving : '📤 ' + tr.issuance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: wh?.color }}>
                    {wh?.icon} {wh?.name}
                  </td>
                  <td className="px-4 py-3 font-bold text-[13px]">{tx.products?.name}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{tx.qty} {tx.products?.unit}</td>
                  <td className="px-4 py-3 text-[12px] text-[#4a5568]">{tx.user_role}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selectedWh && (() => {
        const wh = WAREHOUSES.find(w => w.id === selectedWh)!
        const d = getModalData(selectedWh)

        return (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm"
            onClick={e => e.target === e.currentTarget && setSelectedWh(null)}
          >
            <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl w-[520px] max-w-[95vw] overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-[#1e2535]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                      style={{ background: wh.color + '18', border: `1px solid ${wh.color}30` }}
                    >
                      {wh.icon}
                    </div>
                    <div>
                      <div className="font-black text-[16px] uppercase tracking-wide">{wh.name}</div>
                      <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mt-0.5">{i.molHisobot}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedWh(null)}
                    className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">
                    {i.partiya}
                  </span>

                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="bg-[#00d4aa] text-black rounded px-3 py-1 text-[11px] font-mono"
                  >
                    <option value="all">{i.barchasi}</option>
                    {d.batches.map((b: string) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-[#1e2535] mb-5" />

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{i.jamiAktivlar}</div>
                    <div className="text-4xl font-black text-white">{fmt(d.filteredValue)}</div>
                    <div className="text-[10px] font-mono text-[#00d4aa] mt-1">{i.aktivQiymati}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{i.kutFoyda}</div>
                    <div className="text-4xl font-black text-[#00d4aa]">{fmt(d.filteredProfit)}</div>
                    <div className="text-[10px] font-mono text-[#00d4aa] mt-1">{i.sofRent}</div>
                  </div>
                </div>

                {d.filteredLoss > 0 && (
                  <div className="bg-[#ff4757]/8 border border-[#ff4757]/20 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                    <span className="text-[12px] text-[#ff4757]">{i.taWarning}</span>
                    <span className="font-mono font-black text-[#ff4757]">−{fmt(d.filteredLoss)}</span>
                  </div>
                )}

                {d.filtered.length > 1 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {d.filtered.map(([batch, val]: any) => (
                      <div key={batch} className="flex items-center justify-between bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-2.5">
                        <span className="font-mono text-[11px] text-[#8896ae]">📦 {batch}</span>
                        <div className="flex gap-3">
                          <span className="font-mono text-[11px] text-[#00d4aa]">{fmt(val.value)}</span>
                          <span className="font-mono text-[11px] text-[#a55eea]">+{fmt(val.profit)}</span>
                          {val.loss > 0 && (
                            <span className="font-mono text-[11px] text-[#ff4757]">−{fmt(val.loss)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-[#1e2535] mt-5 pt-3 text-center">
                  <span className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">{i.hisob}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}