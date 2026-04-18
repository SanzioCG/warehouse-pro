import { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { printReceipt } from '../lib/pdf'
import type { User, Language, Transaction, Product, Client } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Stock {
  id: string; product_id: string; on_hand: number; reserved: number;
  batch: string | null; sell_price: number | null; cost_price: number;
  attrs: Record<string, any> | null; products?: { warehouse_id: string };
}

interface CartItem {
  tempId: string; warehouse_id: string; warehouse_name: string;
  product_id: string; product_name: string; unit: string;
  stock_id: string; batch: string | null; qty: number;
  sell_price: number; cost_price: number; variant_label: string;
}

export default function Issuance({ user, lang }: { user: User, lang: Language }) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [txs, setTxs] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [stockRows, setStockRows] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)

  const [modal, setModal] = useState(false)
  const [viewingGroup, setViewingGroup] = useState<any | null>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [saleType, setSaleType] = useState<'paid' | 'debt' | 'free'>('paid')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')

  const [activeWhId, setActiveWhId] = useState(role.warehouses[0] || '')
  const [activeProdId, setActiveProdId] = useState('')
  const [activeStockId, setActiveStockId] = useState('')
  const [activeQty, setActiveQty] = useState<number | ''>('')
  const [activePrice, setActivePrice] = useState<number | ''>('')
  const [prodSearch, setProdSearch] = useState('')
  const [prodDropOpen, setProdDropOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [tReq, pReq, cReq, sReq] = await Promise.all([
        supabase.from('transactions').select('*, products(name, unit), clients(name, id)').eq('type', 'issuance').in('warehouse_id', role.warehouses).order('created_at', { ascending: false }),
        supabase.from('products').select('*').in('warehouse_id', role.warehouses),
        supabase.from('clients').select('*').order('name'),
        supabase.from('stock').select('*, products!inner(warehouse_id)')
      ])
      setTxs(tReq.data || [])
      setProducts(pReq.data || [])
      setClients(cReq.data || [])
      setStockRows(sReq.data || [])
    } finally { setLoading(false) }
  }

  const groupedByClient = useMemo(() => {
    const groups: Record<string, any> = {}
    txs.forEach((tx: any) => {
      const key = tx.client_id || 'no_client'
      if (!groups[key]) {
        groups[key] = {
          id: key,
          client_name: tx.clients?.name || tr.noClient,
          items: [],
          total_qty: 0,
          total_amount: 0,
          last_date: tx.created_at
        }
      }
      groups[key].items.push(tx)
      groups[key].total_qty += (tx.qty || 0)
      groups[key].total_amount += ((tx.qty || 0) * (tx.sell_price || 0))
      if (new Date(tx.created_at) > new Date(groups[key].last_date)) groups[key].last_date = tx.created_at
    })
    return Object.values(groups).sort((a: any, b: any) => new Date(b.last_date).getTime() - new Date(a.last_date).getTime())
  }, [txs, tr.noClient])

  const filteredProducts = products.filter(p => p.warehouse_id === activeWhId && (p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(prodSearch.toLowerCase())))
  const currentProd = products.find(p => p.id === activeProdId)
  const currentStock = stockRows.find(s => s.id === activeStockId)
  const availableStock = stockRows.filter(s => s.product_id === activeProdId && s.on_hand > 0)

  const addToCart = () => {
    if (!activeStockId || !activeQty || Number(activeQty) <= 0) return
    if (Number(activeQty) > (currentStock?.on_hand || 0)) return alert(tr.noData)

    setCart([...cart, {
      tempId: Math.random().toString(),
      warehouse_id: activeWhId,
      warehouse_name: WAREHOUSES.find(w => w.id === activeWhId)?.name || '',
      product_id: activeProdId,
      product_name: currentProd?.name || '',
      unit: currentProd?.unit || '',
      stock_id: activeStockId,
      batch: currentStock?.batch || null,
      qty: Number(activeQty),
      sell_price: Number(activePrice || currentStock?.sell_price || 0),
      cost_price: currentStock?.cost_price || 0,
      variant_label: Object.values(currentStock?.attrs || {}).join(' × ')
    }])
    setActiveProdId(''); setActiveStockId(''); setActiveQty(''); setActivePrice('');
  }

  // BU YERDA: Xatolikni to'g'irlaydigan funksiya
  const removeFromCart = (id: string) => {
    setCart(cart.filter(i => i.tempId !== id));
  };

  const handleSubmit = async () => {
    if (cart.length === 0 || saving) return
    if (saleType === 'debt' && !selectedClientId) return alert(tr.roleRequired)

    setSaving(true)
    try {
      const { data: newTxs, error: txErr } = await supabase.from('transactions').insert(
        cart.map(i => ({
          type: 'issuance', warehouse_id: i.warehouse_id, product_id: i.product_id,
          stock_id: i.stock_id, qty: i.qty, sell_price: i.sell_price, cost_price: i.cost_price,
          sale_type: saleType, client_id: selectedClientId || null, batch: i.batch, note, user_role: user.role
        }))
      ).select()

      if (txErr) throw txErr

      for (const i of cart) {
        const s = stockRows.find(sr => sr.id === i.stock_id)
        await supabase.from('stock').update({ on_hand: (s?.on_hand || 0) - i.qty }).eq('id', i.stock_id)
      }

      if (saleType === 'debt' && selectedClientId) {
        await supabase.from('debts').insert([{ client_id: selectedClientId, total: cart.reduce((s, i) => s + (i.qty * i.sell_price), 0), paid: 0, status: 'open', due_date: dueDate || null }])
      }

      setModal(false); setCart([]); fetchData();
    } catch (e) { alert(tr.noAccess) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center px-4">
        <h2 className="text-2xl font-black text-white">{tr.issuanceByClient}</h2>
        <button onClick={() => { setModal(true); setCart([]); }} className="bg-[#ffa502] text-black font-black px-8 py-4 rounded-2xl shadow-lg hover:scale-105 transition-all">📤 {tr.newIssuance}</button>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-[32px] overflow-hidden shadow-2xl mx-4">
        <table className="w-full text-left">
          <thead className="bg-[#131720] border-b border-[#1e2535]">
            <tr className="text-[10px] font-mono text-[#4a5568] uppercase tracking-[0.2em]">
              <th className="p-6">{tr.client}</th>
              <th className="p-6 text-center">{tr.product}</th>
              <th className="p-6 text-center">{tr.totalQty}</th>
              <th className="p-6 text-right">{tr.total} ($)</th>
              <th className="p-6 text-center">{tr.details}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2535]">
            {groupedByClient.map((sale: any) => (
              <tr key={sale.id} onClick={() => setViewingGroup(sale)} className="hover:bg-[#131720] cursor-pointer transition-all group">
                <td className="p-6">
                  <div className="font-black text-white text-lg group-hover:text-[#ffa502] transition-colors">{sale.client_name}</div>
                  <div className="text-[10px] text-[#4a5568] font-mono mt-1">{tr.lastAction}: {new Date(sale.last_date).toLocaleDateString()}</div>
                </td>
                <td className="p-6 text-center"><span className="bg-[#1e2535] px-3 py-1 rounded-full text-xs text-[#8896ae]">{sale.items.length} {tr.itemsCount}</span></td>
                <td className="p-6 text-center font-bold text-white">{sale.total_qty}</td>
                <td className="p-6 text-right font-black text-[#00d4aa] text-2xl">{fmt(sale.total_amount)}</td>
                <td className="p-6 text-center text-[#ffa502]">🔍</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl p-6">
          <div className="bg-[#0d1018] w-full max-w-5xl rounded-[40px] border border-[#1e2535] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-[#1e2535] bg-[#131720] flex justify-between items-center">
              <div><p className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{tr.details}</p><h2 className="text-3xl font-black text-white">{viewingGroup.client_name}</h2></div>
              <button onClick={() => setViewingGroup(null)} className="w-12 h-12 rounded-2xl border border-[#1e2535] text-[#4a5568] hover:text-white transition-all">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
               <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-mono text-[#4a5568] uppercase border-b border-[#1e2535] pb-4">
                      <th className="pb-4">{tr.date}</th><th className="pb-4">{tr.product}</th><th className="pb-4">{tr.warehouse}</th><th className="pb-4 text-center">{tr.qty}</th><th className="pb-4 text-right">{tr.total}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2535]/50">
                    {viewingGroup.items.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="py-4 text-xs font-mono text-[#4a5568]">{new Date(item.created_at).toLocaleDateString()}</td>
                        <td className="py-4 font-bold text-white text-sm">{item.products?.name}</td>
                        <td className="py-4 text-xs text-[#8896ae]">{WAREHOUSES.find(w => w.id === item.warehouse_id)?.name}</td>
                        <td className="py-4 text-center font-black text-white">{item.qty} {item.products?.unit}</td>
                        <td className="py-4 text-right font-black text-[#00d4aa]">{fmt(item.qty * item.sell_price)}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
            <div className="p-8 bg-[#131720] border-t border-[#1e2535] flex justify-between items-center">
               <div><p className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{tr.total}:</p><p className="text-4xl font-black text-[#00d4aa]">{fmt(viewingGroup.total_amount)}</p></div>
               <button className="bg-[#ffa502] text-black font-black px-12 py-4 rounded-2xl hover:scale-105 transition-all">🖨️ {tr.confirm}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
          <div className="bg-[#0d1018] w-full max-w-6xl rounded-[40px] border border-[#1e2535] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-8 border-b border-[#1e2535] flex justify-between items-center bg-[#131720]">
              <h2 className="text-2xl font-black text-white">{tr.newIssuance}</h2>
              <button onClick={() => setModal(false)} className="w-12 h-12 rounded-2xl border border-[#1e2535] text-[#4a5568] hover:text-white transition-all">✕</button>
            </div>
            <div className="flex-1 overflow-hidden grid grid-cols-12">
              <div className="col-span-5 p-8 overflow-y-auto border-r border-[#1e2535] space-y-6">
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#ffa502]" value={activeWhId} onChange={e => {setActiveWhId(e.target.value); setActiveProdId('');}}>
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
                </select>
                <div className="relative">
                  <button onClick={() => setProdDropOpen(!prodDropOpen)} className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-left text-white flex justify-between items-center">{currentProd?.name || tr.search} <span>▼</span></button>
                  {prodDropOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#131720] border border-[#1e2535] rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto p-2">
                      <input type="text" autoFocus placeholder={tr.search} className="w-full bg-[#0d1018] p-3 rounded-xl mb-2 outline-none border border-[#1e2535] text-white" value={prodSearch} onChange={e => setProdSearch(e.target.value)}/>
                      {filteredProducts.map(p => <button key={p.id} onClick={() => {setActiveProdId(p.id); setProdDropOpen(false);}} className="w-full p-3 text-left rounded-xl hover:bg-[#ffa502] hover:text-black text-white">{p.name}</button>)}
                    </div>
                  )}
                </div>
                {activeProdId && (
                  <select className="w-full bg-[#ffa502]/5 border border-[#ffa502]/30 p-4 rounded-2xl text-[#ffa502] outline-none" value={activeStockId} onChange={e => {setActiveStockId(e.target.value); const s = stockRows.find(sr => sr.id === e.target.value); setActivePrice(s?.sell_price || '');}}>
                    <option value="">--- {tr.batch} ---</option>
                    {availableStock.map(s => <option key={s.id} value={s.id}>{Object.values(s.attrs || {}).join(' × ')} | {tr.onHand}: {s.on_hand}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#00d4aa]" value={activeQty} onChange={e => setActiveQty(Number(e.target.value))} placeholder={tr.qty}/>
                  <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#00d4aa]" value={activePrice} onChange={e => setActivePrice(Number(e.target.value))} placeholder={tr.sellPrice}/>
                </div>
                <button onClick={addToCart} className="w-full bg-[#00d4aa] text-black font-black py-5 rounded-2xl hover:shadow-[0_0_30px_rgba(0,212,170,0.3)] transition-all">+ {tr.add}</button>
                <div className="h-px bg-[#1e2535]" />
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#ffa502]" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                  <option value="">{tr.client}...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white" value={saleType} onChange={e => setSaleType(e.target.value as any)}>
                  <option value="paid">✅ {tr.paid}</option><option value="debt">🚩 {tr.debt}</option><option value="free">🎁 {tr.free}</option>
                </select>
              </div>
              <div className="col-span-7 flex flex-col bg-[#131720]/50 h-full">
                <div className="flex-1 p-8 space-y-4 overflow-y-auto">
                  {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center opacity-20">🛒 {tr.noData}</div> :
                    cart.map(item => (
                      <div key={item.tempId} className="bg-[#0d1018] border border-[#1e2535] p-5 rounded-3xl flex justify-between items-center group">
                        <div><p className="font-black text-white">{item.product_name}</p><p className="text-[10px] text-[#4a5568] uppercase">{item.variant_label}</p></div>
                        <div className="flex items-center gap-8">
                          <div className="text-right"><p className="text-xs font-mono text-[#8896ae]">{item.qty} {item.unit} x {fmt(item.sell_price)}</p><p className="font-black text-[#00d4aa] text-lg">{fmt(item.qty * item.sell_price)}</p></div>
                          <button onClick={() => removeFromCart(item.tempId)} className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all">✕</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
                <div className="p-8 bg-[#0d1018] border-t border-[#1e2535] flex justify-between items-center">
                  <div><p className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">{tr.total}</p><p className="text-4xl font-black text-[#00d4aa]">{fmt(cart.reduce((s, i) => s + (i.qty * i.sell_price), 0))}</p></div>
                  <button disabled={cart.length === 0 || saving} onClick={handleSubmit} className="bg-[#ffa502] text-black font-black px-12 py-5 rounded-[24px] text-lg hover:scale-105 transition-all disabled:opacity-10 shadow-2xl shadow-[#ffa502]/20">{saving ? "..." : tr.confirm}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}