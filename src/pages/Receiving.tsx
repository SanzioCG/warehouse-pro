import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES, WAREHOUSE_PARAMS } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Receiving({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  // State-lar
  const [txs, setTxs] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mahsulot tanlash uchun state-lar
  const [productOpen, setProductOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const productBoxRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<any>({
    warehouse_id: role.warehouses[0],
    product_id: '',
    batch: '',
    batchNum: '',
    qty: '',
    cost_price: '',
    sell_price: '',
    note: '',
    attrs: {}
  })

  // Tashqariga bosilganda dropdownni yopish
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productBoxRef.current && !productBoxRef.current.contains(e.target as Node)) {
        setProductOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ma'lumotlarni yuklash (Optimallashtirilgan)
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: txData }, { data: prodData }] = await Promise.all([
        supabase
          .from('transactions')
          .select('*, products(name, unit)')
          .eq('type', 'receiving')
          .in('warehouse_id', role.warehouses)
          .order('created_at', { ascending: false })
          .limit(100), // Performance uchun limit qo'shildi
        supabase
          .from('products')
          .select('*')
          .in('warehouse_id', role.warehouses)
      ])

      setTxs(txData || [])
      setProducts(prodData || [])
    } catch (err) {
      console.error("Xatolik:", err)
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => { fetchData() }, [fetchData])

  // Omborga tegishli mahsulotlar va razmer parametrlari
  const whProducts = useMemo(() => products.filter(p => p.warehouse_id === form.warehouse_id), [products, form.warehouse_id])
  const warehouseParams = (WAREHOUSE_PARAMS[form.warehouse_id || ''] || []).filter((p: any) => p.key !== 'texture')

  // Mahsulot qidirish mantiqi
  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim()
    if (!q) return whProducts
    return whProducts.filter((p: any) => 
      String(p.sku || '').toLowerCase().includes(q) ||
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.attrs?.texture || '').toLowerCase().includes(q)
    )
  }, [whProducts, productSearch])

  const selectedProduct = whProducts.find((p: any) => p.id === form.product_id)
  const selectedProductLabel = selectedProduct
    ? `[${selectedProduct.sku}] ${selectedProduct.name}${selectedProduct.attrs?.texture ? ` • ${selectedProduct.attrs.texture}` : ''}`
    : '— Tanlang —'

  function openModal() {
    setForm({
      warehouse_id: role.warehouses[0],
      product_id: '',
      batch: '',
      batchNum: '',
      qty: '',
      cost_price: '',
      sell_price: '',
      note: '',
      attrs: {}
    })
    setProductOpen(false)
    setProductSearch('')
    setModal(true)
  }

  // Saqlash mantiqi (Xavfsiz va aniq)
  async function handleSubmit() {
    if (!form.product_id || !form.qty || saving) return
    setSaving(true)

    try {
      const prod = products.find(p => p.id === form.product_id)
      const qty = Number(form.qty)
      const costPrice = Number(form.cost_price) || 0
      const sellPrice = Number(form.sell_price) || 0
      const batchVal = form.batch || ''
      const currentAttrs = form.attrs || {}

      // 1. Tranzaksiyani yozish
      const { error: txError } = await supabase.from('transactions').insert([{
        type: 'receiving',
        warehouse_id: form.warehouse_id,
        product_id: form.product_id,
        qty,
        cost_price: costPrice,
        sell_price: sellPrice,
        batch: batchVal,
        note: form.note,
        user_role: user.role,
        attrs: currentAttrs,
      }])
      if (txError) throw txError

      // 2. Stockni aniqlash (Postgres JSONB contains ishlatildi)
      const { data: existingStock, error: stockFetchError } = await supabase
        .from('stock')
        .select('*')
        .eq('product_id', form.product_id)
        .eq('batch', batchVal)
        .contains('attrs', currentAttrs) // JSON ichidagi atributlarni aniq tekshirish
        .maybeSingle()

      if (stockFetchError) throw stockFetchError

      if (existingStock) {
        // Stock mavjud - Yangilash
        const { error: updateError } = await supabase.from('stock')
          .update({
            on_hand: existingStock.on_hand + qty,
            cost_price: costPrice,
            sell_price: sellPrice,
          })
          .eq('id', existingStock.id)
        if (updateError) throw updateError
      } else {
        // Yangi stock yaratish
        const { error: insertError } = await supabase.from('stock').insert([{
          product_id: form.product_id,
          on_hand: qty,
          reserved: 0,
          batch: batchVal,
          attrs: currentAttrs,
          cost_price: costPrice,
          sell_price: sellPrice,
        }])
        if (insertError) throw insertError
      }

      // 3. Audit log
      await supabase.from('audit_logs').insert([{
        user_role: user.role,
        user_name: user.name,
        action: 'stock_received',
        entity: 'product',
        record_id: form.product_id,
        detail: `Kirim: ${qty} ${prod?.unit} — ${prod?.name} | Partiya: ${batchVal} | Tan: $${costPrice}`,
      }])

      setModal(false)
      fetchData()
    } catch (err) {
      console.error("Saqlashda xatolik:", err)
      alert("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={openModal}
          className="px-5 py-3 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[14px] hover:bg-[#00f0c0] transition-all flex items-center gap-2 shadow-lg shadow-[#00d4aa]/10"
        >
          📥 {tr.newReceiving}
        </button>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[15px]">{tr.receiving} ({txs.length})</span>
        </div>

        {loading ? (
          <div className="text-center py-24 text-[#4a5568]">
            <div className="text-4xl mb-4 animate-bounce">📥</div>
            <div className="font-mono text-sm tracking-widest uppercase">Yuklanmoqda...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  {[tr.date, 'Ombor', tr.name, tr.batch, 'Razmerlar', tr.qty, tr.costPrice, 'Sotuv narxi', tr.note].map(h => (
                    <th key={h} className="px-4 py-3.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-widest bg-[#0d1018] border-b border-[#1e2535]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-20 text-[#4a5568]">{tr.noData}</td></tr>
                ) : txs.map(tx => {
                  const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
                  const attrsStr = Object.values(tx.attrs || {}).join(' × ') || '—'

                  return (
                    <tr key={tx.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all group">
                      <td className="px-4 py-4 text-[11px] font-mono text-[#4a5568]">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        {wh && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border" style={{ background: wh.color + '15', color: wh.color, borderColor: wh.color + '30' }}>
                            {wh.icon} {wh.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 font-bold text-[13px] text-white">{tx.products?.name}</td>
                      <td className="px-4 py-4 font-mono text-[12px] text-[#8896ae]">{tx.batch || '—'}</td>
                      <td className="px-4 py-4 font-mono text-[11px] text-[#4a5568]">{attrsStr}</td>
                      <td className="px-4 py-4 font-mono font-black text-[#00d4aa]">+{tx.qty} {tx.products?.unit}</td>
                      <td className="px-4 py-4 font-mono text-[12px] text-[#8896ae]">${tx.cost_price?.toLocaleString()}</td>
                      <td className="px-4 py-4 font-mono text-[12px] text-[#00d4aa] font-bold">${tx.sell_price?.toLocaleString() || '—'}</td>
                      <td className="px-4 py-4 text-[12px] text-[#4a5568] italic">{tx.note || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kirim Modali */}
      {modal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-md p-4" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-full max-w-[650px] shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="text-[18px] font-black mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
                {tr.newReceiving}
              </div>
              <button onClick={() => setModal(false)} className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Ombor</label>
                <select
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa] transition-all"
                  value={form.warehouse_id}
                  onChange={e => setForm((f: any) => ({ ...f, warehouse_id: e.target.value, product_id: '', attrs: {} }))}
                >
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
                </select>
              </div>

              <div ref={productBoxRef} className="relative">
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.name}</label>
                <button
                  type="button"
                  onClick={() => setProductOpen(prev => !prev)}
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none hover:border-[#00d4aa] transition-all flex items-center justify-between text-left"
                >
                  <span className={`truncate ${selectedProduct ? 'text-white' : 'text-[#4a5568]'}`}>{selectedProductLabel}</span>
                  <span className="text-[#4a5568]">▾</span>
                </button>

                {productOpen && (
                  <div className="absolute z-[60] mt-2 w-full rounded-xl border border-[#28324a] bg-[#0d1018] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="p-2 border-b border-[#1e2535]">
                      <input
                        autoFocus
                        type="text"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder="SKU yoki nom..."
                        className="w-full bg-[#131720] border border-[#1e2535] rounded-lg px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredProducts.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => { setForm((f: any) => ({ ...f, product_id: p.id })); setProductOpen(false); setProductSearch('') }}
                          className="w-full text-left px-4 py-3 text-[13px] text-white hover:bg-[#00d4aa]/10 transition-all border-b border-[#1e2535] last:border-0"
                        >
                          <div className="font-bold">[{p.sku}] {p.name}</div>
                          {p.attrs?.texture && <div className="text-[10px] text-[#4a5568] uppercase tracking-widest">{p.attrs.texture}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.batch}</label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black text-[#00d4aa] font-mono px-4 py-3 bg-[#131720] border border-[#1e2535] rounded-xl">P</span>
                  <input
                    type="number"
                    className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                    placeholder="001"
                    value={form.batchNum}
                    onChange={e => setForm((f: any) => ({ ...f, batchNum: e.target.value, batch: `P-${e.target.value}` }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.qty}</label>
                <input
                  type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  placeholder="0.00"
                  value={form.qty}
                  onChange={e => setForm((f: any) => ({ ...f, qty: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.costPrice} ($)</label>
                <input
                  type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  placeholder="0.00"
                  value={form.cost_price}
                  onChange={e => setForm((f: any) => ({ ...f, cost_price: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Sotuv narxi ($)</label>
                <input
                  type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  placeholder="0.00"
                  value={form.sell_price}
                  onChange={e => setForm((f: any) => ({ ...f, sell_price: e.target.value }))}
                />
              </div>
            </div>

            {warehouseParams.length > 0 && (
              <div className="mt-5 pt-5 border-t border-[#1e2535]">
                <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-4">📐 Razmerlar va parametrlar</div>
                <div className="grid grid-cols-3 gap-3">
                  {warehouseParams.map((param: any) => (
                    <div key={param.key}>
                      <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-2">{param.label}</label>
                      <input
                        type={param.type}
                        className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                        placeholder={param.label}
                        value={form.attrs[param.key] || ''}
                        onChange={e => setForm((f: any) => ({ ...f, attrs: { ...f.attrs, [param.key]: e.target.value } }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.note}</label>
              <textarea
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[13px] text-white outline-none focus:border-[#00d4aa] h-20 resize-none"
                placeholder="Ixtiyoriy izoh..."
                value={form.note}
                onChange={e => setForm((f: any) => ({ ...f, note: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 justify-end mt-7 pt-6 border-t border-[#1e2535]">
              <button onClick={() => setModal(false)} className="px-6 py-3 rounded-xl border border-[#1e2535] text-[#8896ae] text-[14px] font-semibold hover:border-[#ff4757] hover:text-[#ff4757] transition-all">{tr.cancel}</button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-8 py-3 bg-[#00d4aa] text-[#050e0c] font-black rounded-xl text-[14px] hover:bg-[#00f0c0] active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? '...' : tr.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}