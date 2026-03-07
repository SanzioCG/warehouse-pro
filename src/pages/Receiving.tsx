import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

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
    product_id: '', batch: '', qty: '',
    cost_price: '', waste: '', note: ''
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

  async function handleSubmit() {
    if (!form.product_id || !form.qty) return
    setSaving(true)
    const prod = products.find(p => p.id === form.product_id)
    const qty = Number(form.qty)

    // Insert transaction
    await supabase.from('transactions').insert([{
      type: 'receiving',
      warehouse_id: form.warehouse_id,
      product_id: form.product_id,
      qty, cost_price: Number(form.cost_price) || prod?.cost_price,
      sell_price: prod?.sell_price,
      batch: form.batch, waste: Number(form.waste) || 0,
      note: form.note, user_role: user.role,
    }])

    // Update stock
    const { data: existingStock } = await supabase
      .from('stock').select('*').eq('product_id', form.product_id).single()

    if (existingStock) {
      await supabase.from('stock')
        .update({ on_hand: existingStock.on_hand + qty })
        .eq('product_id', form.product_id)
    } else {
      await supabase.from('stock').insert([{ product_id: form.product_id, on_hand: qty, reserved: 0 }])
    }

    // Audit
    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'stock_received', entity: 'product',
      record_id: form.product_id,
      detail: `Kirim: ${qty} ${prod?.unit} — ${prod?.name}`,
    }])

    setSaving(false)
    setModal(false)
    setForm({ warehouse_id: role.warehouses[0], product_id: '', batch: '', qty: '', cost_price: '', waste: '', note: '' })
    fetchData()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setModal(true)}
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
                {[tr.date, 'Ombor', tr.name, tr.batch, tr.qty, tr.waste, tr.costPrice, tr.note].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">📥</div>{tr.noData}
                </td></tr>
              ) : txs.map(tx => {
                const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
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
                    <td className="px-4 py-3 font-mono font-bold text-[#00d4aa]">+{tx.qty} {tx.products?.unit}</td>
                    <td className="px-4 py-3 font-mono text-[#ff4757]">{tx.waste || 0}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#8896ae]">{tx.cost_price?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[12px] text-[#4a5568]">{tx.note || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/65 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[700px] max-w-[95vw]">
            <div className="text-[17px] font-black mb-5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
              {tr.newReceiving}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Ombor</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.warehouse_id}
                  onChange={e => setForm((f: any) => ({ ...f, warehouse_id: e.target.value, product_id: '' }))}>
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
                    <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.name}</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.product_id}
                  onChange={e => setForm((f: any) => ({ ...f, product_id: e.target.value }))}>
                  <option value="">— Tanlang —</option>
                  {whProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.sku} {p.name} {Object.entries(p.attrs || {}).map(([, v]) => `• ${v}`).join(' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.batch}</label>
                <input className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="LOT-001" value={form.batch}
                  onChange={e => setForm((f: any) => ({ ...f, batch: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.qty}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.qty}
                  onChange={e => setForm((f: any) => ({ ...f, qty: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.costPrice}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.cost_price}
                  onChange={e => setForm((f: any) => ({ ...f, cost_price: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.waste}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.waste}
                  onChange={e => setForm((f: any) => ({ ...f, waste: e.target.value }))} />
              </div>
            </div>
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