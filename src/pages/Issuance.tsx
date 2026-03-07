import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { printReceipt } from '../lib/pdf'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Issuance({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [txs, setTxs] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({
    warehouse_id: role.warehouses[0], product_id: '',
    qty: '', sell_price: '', sale_type: 'paid',
    client_id: '', due_date: '', note: ''
  })

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: txData }, { data: prodData }, { data: clientData }] = await Promise.all([
      supabase.from('transactions').select('*, products(name, unit), clients(name)')
        .eq('type', 'issuance')
        .in('warehouse_id', role.warehouses)
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*').in('warehouse_id', role.warehouses),
      supabase.from('clients').select('*').order('name')
    ])
    setTxs(txData || [])
    setProducts(prodData || [])
    setClients(clientData || [])
    setLoading(false)
  }

  const whProducts = products.filter(p => p.warehouse_id === form.warehouse_id)

  async function handleSubmit() {
    if (!form.product_id || !form.qty) return
    setSaving(true)
    const prod = products.find((p: any) => p.id === form.product_id)
    const client = clients.find((c: any) => c.id === form.client_id)
    const wh = WAREHOUSES.find(w => w.id === form.warehouse_id)
    const qty = Number(form.qty)
    const sellPrice = Number(form.sell_price) || prod?.sell_price || 0

    // Insert transaction
    const { data: txData } = await supabase.from('transactions').insert([{
      type: 'issuance',
      warehouse_id: form.warehouse_id,
      product_id: form.product_id,
      qty, sell_price: sellPrice,
      cost_price: prod?.cost_price,
      sale_type: form.sale_type,
      client_id: form.client_id || null,
      note: form.note, user_role: user.role,
    }]).select()

    // Update stock
    const { data: st } = await supabase
      .from('stock').select('*').eq('product_id', form.product_id).single()
    if (st) {
      await supabase.from('stock')
        .update({ on_hand: Math.max(0, st.on_hand - qty) })
        .eq('product_id', form.product_id)
    }

    // Create debt if needed
    if (form.sale_type === 'debt' && form.client_id) {
      await supabase.from('debts').insert([{
        client_id: form.client_id,
        product_id: form.product_id,
        warehouse_id: form.warehouse_id,
        qty, total: qty * sellPrice,
        paid: 0, status: 'open', due_date: form.due_date || null,
      }])
    }

    // Audit
    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'stock_issued', entity: 'product',
      record_id: form.product_id,
      detail: `Chiqim: ${qty} ${prod?.unit} — ${prod?.name} (${form.sale_type})`,
    }])

    // PDF chek
    if (txData?.[0]) {
      printReceipt({
        id: txData[0].id,
        date: new Date().toLocaleDateString('uz-UZ'),
        client: client?.name || '—',
        warehouse: wh?.name || '—',
        product: prod?.name || '—',
        qty,
        unit: prod?.unit || '',
        price: sellPrice,
        total: qty * sellPrice,
        saleType: form.sale_type,
        note: form.note,
        seller: user.name,
      })
    }

    setSaving(false)
    setModal(false)
    setForm({
      warehouse_id: role.warehouses[0], product_id: '',
      qty: '', sell_price: '', sale_type: 'paid',
      client_id: '', due_date: '', note: ''
    })
    fetchData()
  }

  const saleColors: Record<string, string> = { paid: '#00d4aa', debt: '#ff4757', free: '#8896ae' }
  const saleLabels: Record<string, string> = { paid: tr.paid, debt: tr.debt, free: tr.free }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setModal(true)}
          className="px-4 py-2.5 bg-[#ffa502] text-[#0c0800] font-bold rounded-xl text-[13px] hover:bg-[#ffb830] transition-all flex items-center gap-2"
        >
          📤 {tr.newIssuance}
        </button>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#ffa502]" />
          <span className="font-bold text-[14px]">{tr.issuance} ({txs.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">📤</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[tr.date, 'Ombor', tr.name, tr.qty, tr.saleType, tr.client, tr.sellPrice, tr.note, 'Chek'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">📤</div>{tr.noData}
                </td></tr>
              ) : txs.map(tx => {
                const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
                const c = saleColors[tx.sale_type] || '#8896ae'
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
                    <td className="px-4 py-3 font-mono font-bold text-[#ffa502]">−{tx.qty} {tx.products?.unit}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono border"
                        style={{ background: c + '18', color: c, borderColor: c + '30' }}>
                        {saleLabels[tx.sale_type] || tx.sale_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#8896ae]">{tx.clients?.name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#00d4aa]">${tx.sell_price?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[12px] text-[#4a5568]">{tx.note || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          const wh2 = WAREHOUSES.find(w => w.id === tx.warehouse_id)
                          printReceipt({
                            id: tx.id,
                            date: new Date(tx.created_at).toLocaleDateString('uz-UZ'),
                            client: tx.clients?.name || '—',
                            warehouse: wh2?.name || '—',
                            product: tx.products?.name || '—',
                            qty: tx.qty,
                            unit: tx.products?.unit || '',
                            price: tx.sell_price || 0,
                            total: tx.qty * (tx.sell_price || 0),
                            saleType: tx.sale_type,
                            note: tx.note,
                            seller: user.name,
                          })
                        }}
                        className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#8896ae] hover:bg-[#00d4aa]/10 hover:border-[#00d4aa] hover:text-[#00d4aa] transition-all flex items-center justify-center text-xs"
                      >
                        🖨
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[700px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <div className="text-[17px] font-black mb-5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ffa502]" />
              {tr.newIssuance}
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
                  {whProducts.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.qty}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.qty}
                  onChange={e => setForm((f: any) => ({ ...f, qty: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.sellPrice}</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.sell_price}
                  onChange={e => setForm((f: any) => ({ ...f, sell_price: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.saleType}</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.sale_type}
                  onChange={e => setForm((f: any) => ({ ...f, sale_type: e.target.value }))}>
                  <option value="paid">{tr.paid}</option>
                  <option value="debt">{tr.debt}</option>
                  <option value="free">{tr.free}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.client}</label>
                <select className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.client_id}
                  onChange={e => setForm((f: any) => ({ ...f, client_id: e.target.value }))}>
                  <option value="">— Tanlang —</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {form.sale_type === 'debt' && (
                <div className="col-span-2">
                  <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.dueDate}</label>
                  <input type="date" className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                    value={form.due_date}
                    onChange={e => setForm((f: any) => ({ ...f, due_date: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="mt-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.note}</label>
              <textarea className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568] resize-none h-20"
                placeholder="Ixtiyoriy..." value={form.note}
                onChange={e => setForm((f: any) => ({ ...f, note: e.target.value }))} />
            </div>
            <div className="flex gap-2 justify-end mt-5 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setModal(false)} className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all">{tr.cancel}</button>
              <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 bg-[#ffa502] text-[#0c0800] font-bold rounded-xl text-[13px] hover:bg-[#ffb830] transition-all disabled:opacity-50">
                {saving ? '...' : tr.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}