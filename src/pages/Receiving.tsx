import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES, WAREHOUSE_PARAMS } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Receiving({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [txs, setTxs] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({
    warehouse_id: role.warehouses[0],
    product_id: '', batch: '', batchNum: '', qty: '',
    cost_price: '', sell_price: '', note: '',
    attrs: {}
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: txData }, { data: prodData }] = await Promise.all([
      supabase.from('transactions').select('*, products(name, unit)')
        .eq('type', 'receiving')
        .in('warehouse_id', role.warehouses)
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*').in('warehouse_id', role.warehouses)
    ])
    setTxs(txData || [])
    setProducts(prodData || [])
    setLoading(false)
  }

  const whProducts = products.filter(p => p.warehouse_id === form.warehouse_id)
  const warehouseParams = (WAREHOUSE_PARAMS[form.warehouse_id || ''] || []).filter((p: any) => p.key !== 'texture')

  function openModal() {
    setForm({
      warehouse_id: role.warehouses[0],
      product_id: '', batch: '', batchNum: '', qty: '',
      cost_price: '', sell_price: '', note: '',
      attrs: {}
    })
    setModal(true)
  }

  async function handleSubmit() {
    if (!form.product_id || !form.qty) return
    setSaving(true)
    const prod = products.find(p => p.id === form.product_id)
    const qty = Number(form.qty)
    const costPrice = Number(form.cost_price) || 0
    const sellPrice = Number(form.sell_price) || 0
    const batchVal = form.batch || ''

    await supabase.from('transactions').insert([{
      type: 'receiving',
      warehouse_id: form.warehouse_id,
      product_id: form.product_id,
      qty,
      cost_price: costPrice,
      sell_price: sellPrice,
      batch: batchVal,
      note: form.note,
      user_role: user.role,
      attrs: form.attrs,
    }])

    // product_id + batch + attrs bo'yicha aniq qator topish
    const attrsJson = JSON.stringify(form.attrs || {})
    const { data: allStock } = await supabase
      .from('stock')
      .select('*')
      .eq('product_id', form.product_id)
      .eq('batch', batchVal)

    const existingStock = (allStock || []).find(
      s => JSON.stringify(s.attrs || {}) === attrsJson
    ) || null

    if (existingStock) {
      await supabase.from('stock')
        .update({
          on_hand: existingStock.on_hand + qty,
          cost_price: costPrice,
          sell_price: sellPrice,
        })
        .eq('id', existingStock.id)
    } else {
      await supabase.from('stock').insert([{
        product_id: form.product_id,
        on_hand: qty,
        reserved: 0,
        batch: batchVal,
        attrs: form.attrs || {},
        cost_price: costPrice,
        sell_price: sellPrice,
      }])
    }

    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'stock_received', entity: 'product',
      record_id: form.product_id,
      detail: `Kirim: ${qty} ${prod?.unit} — ${prod?.name} | Partiya: ${batchVal} | Tan: $${costPrice} | Sotuv: $${sellPrice}`,
    }])

    setSaving(false)
    setModal(false)
    fetchData()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={openModal}
          className="px-4 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all flex items-center gap-2"
        >
          📥 {tr.newReceiving}
        </button>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.receiving} ({txs.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">📥</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[tr.date, 'Ombor', tr.name, tr.batch, 'Razmerlar', tr.qty, tr.costPrice, 'Sotuv narxi', tr.note].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">📥</div>{tr.noData}
                </td></tr>
              ) : txs.map(tx => {
                const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
                const attrs = tx.attrs || {}
                const attrsStr = Object.entries(attrs).map(([_, v]) => `${v}`).join(' × ') || '—'
                return (
                  <tr key={tx.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {wh && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border"
                          style={{ background: wh.color + '18', color: wh.color, borderColor: wh.color + '30' }}>
                          {wh.icon} {wh.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-[13px]">{tx.products?.name}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#4a5568]">{tx.batch || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#8896ae]">{attrsStr}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[#00d4aa]">+{tx.qty} {tx.products?.unit}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#8896ae]">${tx.cost_price?.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#00d4aa]">${tx.sell_price?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3 text-[12px] text-[#4a5568]">{tx.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <div className="text-[17px] font-black mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
                {tr.newReceiving}
              </div>
              <button onClick={() => setModal(false)}
                className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Ombor */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Ombor</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.warehouse_id}
                  onChange={e => setForm((f: any) => ({ ...f, warehouse_id: e.target.value, product_id: '', attrs: {} }))}>
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
                    <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                  )}
                </select>
              </div>

              {/* Mahsulot */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.name}</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.product_id}
                  onChange={e => setForm((f: any) => ({ ...f, product_id: e.target.value }))}>
                  <option value="">— Tanlang —</option>
                  {whProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.sku}] {p.name} {p.attrs?.texture ? `• ${p.attrs.texture}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Partiya */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.batch}</label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black text-[#00d4aa] font-mono px-3 py-2.5 bg-[#131720] border border-[#1e2535] rounded-xl select-none">P</span>
                  <input
                    type="number"
                    className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                    placeholder="001"
                    min="1"
                    value={form.batchNum || ''}
                    onChange={e => setForm((f: any) => ({ ...f, batchNum: e.target.value, batch: `P-${e.target.value}` }))}
                  />
                </div>
              </div>

              {/* Miqdor */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.qty}</label>
                <input
                  type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0"
                  min="1"
                  value={form.qty || ''}
                  onChange={e => setForm((f: any) => ({ ...f, qty: e.target.value }))}
                />
              </div>

              {/* Tan narxi */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.costPrice}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.cost_price}
                  onChange={e => setForm((f: any) => ({ ...f, cost_price: e.target.value }))} />
              </div>

              {/* Sotuv narxi */}
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Sotuv narxi</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.sell_price}
                  onChange={e => setForm((f: any) => ({ ...f, sell_price: e.target.value }))} />
              </div>
            </div>

            {/* Razmerlar */}
            {warehouseParams.length > 0 && (
              <>
                <div className="border-t border-[#1e2535] my-4" />
                <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-3">📐 Razmerlar</div>
                <div className="grid grid-cols-3 gap-3">
                  {warehouseParams.map((param: any) => (
                    <div key={param.key}>
                      <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{param.label}</label>
                      <input type={param.type}
                        className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                        placeholder={param.label}
                        value={(form.attrs || {})[param.key] || ''}
                        onChange={e => setForm((f: any) => ({ ...f, attrs: { ...f.attrs, [param.key]: e.target.value } }))} />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.note}</label>
              <textarea className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568] resize-none h-20"
                placeholder="Ixtiyoriy..." value={form.note}
                onChange={e => setForm((f: any) => ({ ...f, note: e.target.value }))} />
            </div>

            <div className="flex gap-2 justify-end mt-5 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all">{tr.cancel}</button>
              <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all disabled:opacity-50">
                {saving ? '...' : tr.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}