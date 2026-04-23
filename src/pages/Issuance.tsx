import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { printReceipt } from '../lib/pdf'
import type { User, Language, Product, Client } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

// Interfeyslar
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
  const [saving, setSaving] = useState(false)

  const [modal, setModal] = useState(false)
  const [viewingGroup, setViewingGroup] = useState<any | null>(null)
  
  const [editItem, setEditItem] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({ qty: 0, sell_price: 0, note: '' })

  const [cart, setCart] = useState<CartItem[]>([])
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

  // Narxni formatlash funksiyasi
  const fmt = (n: number) => {
    return '$' + n.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 2 
    });
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tReq, pReq, cReq, sReq] = await Promise.all([
        supabase.from('transactions').select('*, products(name, unit, cost_price), clients(name, id)').eq('type', 'issuance').in('warehouse_id', role.warehouses).order('created_at', { ascending: false }),
        supabase.from('products').select('*').in('warehouse_id', role.warehouses),
        supabase.from('clients').select('*').order('name'),
        supabase.from('stock').select('*, products!inner(warehouse_id)')
      ])
      setTxs(tReq.data || [])
      setProducts(pReq.data || [])
      setClients(cReq.data || [])
      setStockRows(sReq.data as unknown as Stock[] || [])
    } finally { setLoading(false) }
  }, [role.warehouses])

  useEffect(() => { fetchData() }, [fetchData])

  // EDIT FUNKSIYASI
  const handleUpdateItem = async () => {
    if (!editItem || saving) return
    const diff = editForm.qty - editItem.qty 
    const currentStock = stockRows.find(s => s.id === editItem.stock_id)

    if (diff > (currentStock?.on_hand || 0)) {
      alert("Omborda yetarli mahsulot yo'q!")
      return
    }

    setSaving(true)
    try {
      await supabase.from('transactions').update({
        qty: editForm.qty,
        sell_price: editForm.sell_price,
        note: editForm.note
      }).eq('id', editItem.id)

      await supabase.from('stock').update({ on_hand: (currentStock?.on_hand || 0) - diff }).eq('id', editItem.stock_id)

      setEditItem(null); setViewingGroup(null); fetchData()
    } catch (e) { alert("Xatolik!") } finally { setSaving(false) }
  }

  // SAVAT FUNKSIYALARI
  const addToCart = () => {
    if (!activeStockId || !activeQty || Number(activeQty) <= 0) return
    const currentStock = stockRows.find(s => s.id === activeStockId)
    const inCartQty = cart.filter(i => i.stock_id === activeStockId).reduce((s, i) => s + i.qty, 0)
    const realAvailable = (currentStock?.on_hand || 0) - inCartQty

    if (Number(activeQty) > realAvailable) return alert(`Yetarli emas: ${realAvailable}`)

    const product = products.find(p => p.id === activeProdId)
    setCart([...cart, {
      tempId: Math.random().toString(36).substr(2, 9),
      warehouse_id: activeWhId,
      warehouse_name: WAREHOUSES.find(w => w.id === activeWhId)?.name || '',
      product_id: activeProdId,
      product_name: product?.name || '',
      unit: product?.unit || '',
      stock_id: activeStockId,
      batch: currentStock?.batch || null,
      qty: Number(activeQty),
      sell_price: Number(activePrice || currentStock?.sell_price || 0),
      cost_price: currentStock?.cost_price || 0,
      variant_label: Object.values(currentStock?.attrs || {}).join(' × ') || '—'
    }])
    setActiveProdId(''); setActiveStockId(''); setActiveQty(''); setActivePrice('');
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.tempId !== id))
  }

  const handleSubmit = async () => {
    if (cart.length === 0 || saving) return
    setSaving(true)
    try {
      await supabase.from('transactions').insert(
        cart.map(i => ({
          type: 'issuance', warehouse_id: i.warehouse_id, product_id: i.product_id,
          stock_id: i.stock_id, qty: i.qty, sell_price: i.sell_price, cost_price: i.cost_price,
          sale_type: saleType, client_id: selectedClientId || null, batch: i.batch, note, user_role: user.role
        }))
      )
      for (const i of cart) {
        const s = stockRows.find(sr => sr.id === i.stock_id)
        await supabase.from('stock').update({ on_hand: (s?.on_hand || 0) - i.qty }).eq('id', i.stock_id)
      }
      setModal(false); setCart([]); fetchData();
    } catch (e) { alert("Xatolik!") } finally { setSaving(false) }
  }

  // GURUHLASH
  const groupedByClient = useMemo(() => {
    const groups: Record<string, any> = {}
    txs.forEach((tx: any) => {
      const key = tx.client_id || 'no_client'
      if (!groups[key]) {
        groups[key] = { id: key, client_name: tx.clients?.name || tr.noClient, items: [], total_qty: 0, total_amount: 0 }
      }
      groups[key].items.push(tx); 
      groups[key].total_qty += tx.qty; 
      groups[key].total_amount += (tx.qty * tx.sell_price)
    })
    return Object.values(groups)
  }, [txs, tr.noClient])

  const filteredProducts = products.filter(p => p.warehouse_id === activeWhId && (p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku || '').toLowerCase().includes(prodSearch.toLowerCase())))
  const availableStock = stockRows.filter(s => s.product_id === activeProdId && s.on_hand > 0)

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex justify-between items-center px-4">
        <h2 className="text-2xl font-black text-white">{tr.issuanceByClient}</h2>
        <button onClick={() => { setModal(true); setCart([]); }} className="bg-[#ffa502] text-[#0d1018] font-black px-8 py-4 rounded-2xl shadow-lg hover:scale-105 transition-all">📤 {tr.newIssuance}</button>
      </div>

      {/* Main Table */}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-[32px] overflow-hidden mx-4 shadow-2xl">
        <table className="w-full text-left">
          <thead className="bg-[#131720] border-b border-[#1e2535]">
            <tr className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">
              <th className="p-6">{tr.client}</th>
              <th className="p-6 text-center">{tr.totalQty}</th>
              <th className="p-6 text-right">{tr.total}</th>
              <th className="p-6 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2535]">
            {groupedByClient.map((sale: any) => (
              <tr key={sale.id} onClick={() => setViewingGroup(sale)} className="hover:bg-[#131720] cursor-pointer group transition-all">
                <td className="p-6 font-black text-white text-lg group-hover:text-[#ffa502]">{sale.client_name}</td>
                <td className="p-6 text-center font-bold text-white font-mono">{sale.total_qty}</td>
                <td className="p-6 text-right font-black text-[#00d4aa] text-xl font-mono">{fmt(sale.total_amount)}</td>
                <td className="p-6 text-center text-[#ffa502]">🔍</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* VIEW DETAILS MODAL (SIZ SO'RAGAN QISM) */}
      {viewingGroup && (() => {
        // Mijoz uchun statistikani hisoblash
        let totalRevenue = 0;
        let totalProfit = 0;
        let totalFreeLoss = 0;

        viewingGroup.items.forEach((item: any) => {
          const sellPrice = Number(item.sell_price || 0);
          const costPrice = Number(item.cost_price || item.products?.cost_price || 0);
          const qty = Number(item.qty || 0);

          if (item.sale_type === 'free') {
            totalFreeLoss += (qty * costPrice);
          } else {
            totalRevenue += (qty * sellPrice);
            totalProfit += qty * (sellPrice - costPrice);
          }
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
            <div className="bg-[#0d1018] w-full max-w-5xl rounded-[40px] border border-[#1e2535] shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-8 border-b border-[#1e2535] bg-[#131720] rounded-t-[40px]">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">{viewingGroup.client_name}</h2>
                    
                    {/* MIJOZ STATISTIKASI (Ismi tagida) */}
                    <div className="flex gap-6 mt-3">
                       <div className="flex flex-col">
                         <span className="text-[9px] font-mono text-[#4a5568] uppercase">Umumiy Savdo</span>
                         <span className="text-sm font-black text-white font-mono">{fmt(totalRevenue)}</span>
                       </div>
                       <div className="flex flex-col">
                         <span className="text-[9px] font-mono text-[#4a5568] uppercase">Sof Foyda</span>
                         <span className={`text-sm font-black font-mono ${totalProfit >= 0 ? 'text-[#00d4aa]' : 'text-[#ff4757]'}`}>
                           {totalProfit > 0 ? '+' : ''}{fmt(totalProfit)}
                         </span>
                       </div>
                       {totalFreeLoss > 0 && (
                         <div className="flex flex-col">
                           <span className="text-[9px] font-mono text-[#ff4757] uppercase">Tekin (Zarar)</span>
                           <span className="text-sm font-black text-[#ff4757] font-mono">-{fmt(totalFreeLoss)}</span>
                         </div>
                       )}
                    </div>
                  </div>
                  <button onClick={() => setViewingGroup(null)} className="w-12 h-12 rounded-2xl border border-[#1e2535] text-[#4a5568] hover:text-white transition-all flex items-center justify-center">✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                 <table className="w-full text-left">
                    <thead className="text-[10px] font-mono text-[#4a5568] uppercase border-b border-[#1e2535]">
                      <tr>
                        <th className="pb-4">Mahsulot</th>
                        <th className="pb-4 text-center">Miqdor</th>
                        <th className="pb-4 text-right">Jami</th>
                        <th className="pb-4 text-center">Tahrir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingGroup.items.map((item: any, i: number) => (
                        <tr key={i} className="border-b border-[#1e2535]/50">
                          <td className="py-4 font-bold text-white text-sm">
                            {item.products?.name}
                            <div className="text-[9px] text-[#4a5568] font-mono mt-0.5">
                              {item.sale_type === 'free' ? '🎁 TEKIN' : item.sale_type === 'debt' ? '🚩 QARZ' : '✅ NAQD'}
                            </div>
                          </td>
                          <td className="py-4 text-center font-black text-white font-mono">{item.qty} {item.products?.unit}</td>
                          <td className="py-4 text-right font-black text-[#00d4aa] font-mono">{fmt(item.qty * item.sell_price)}</td>
                          <td className="py-4 text-center">
                            <button onClick={(e) => { e.stopPropagation(); setEditItem(item); setEditForm({ qty: item.qty, sell_price: item.sell_price, note: item.note || '' }); }} className="text-[#ffa502] hover:bg-[#ffa502]/10 p-2 rounded-lg transition-all">✎</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* TAHRIRLASH MODALI */}
      {editItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" onClick={(e) => e.target === e.currentTarget && setEditItem(null)}>
          <div className="bg-[#0d1018] w-full max-w-md rounded-[32px] border border-[#1e2535] p-8 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-black text-white mb-6">Tahrirlash: {editItem.products?.name}</h3>
            
            <div className="bg-[#131720] border border-[#1e2535] p-5 rounded-3xl mb-6 flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <p className="font-black text-white truncate">{editItem.products?.name}</p>
                <p className="text-[10px] text-[#4a5568] uppercase font-mono tracking-widest">{Object.values(editItem.attrs || {}).join(' × ') || '—'}</p>
              </div>
              <div className="text-right ml-4">
                <p className="text-[11px] font-mono text-[#8896ae]">{editForm.qty} dona × {fmt(editForm.sell_price)}</p>
                <p className="font-black text-[#00d4aa] text-2xl font-mono">{fmt(editForm.qty * editForm.sell_price)}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <label className="text-[10px] font-mono text-[#4a5568] uppercase block mb-2 font-bold">📦 MAHSULOT MIQDORI (SONI)</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#ffa502] font-black text-xl" value={editForm.qty} onChange={e => setEditForm({ ...editForm, qty: Number(e.target.value) })}/>
              </div>
              <div className="relative">
                <label className="text-[10px] font-mono text-[#4a5568] uppercase block mb-2 font-bold">💰 SOTUV NARXI ($)</label>
                <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none focus:border-[#ffa502] font-black text-xl" value={editForm.sell_price} onChange={e => setEditForm({ ...editForm, sell_price: Number(e.target.value) })}/>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setEditItem(null)} className="flex-1 px-6 py-4 rounded-2xl border border-[#1e2535] text-[#8896ae] font-bold">Bekor</button>
              <button onClick={handleUpdateItem} disabled={saving} className="flex-1 bg-[#00d4aa] text-[#0d1018] font-black px-6 py-4 rounded-2xl hover:bg-[#00f0c0] transition-all">Saqlash</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW ISSUANCE MODAL (Savat tizimi) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
          <div className="bg-[#0d1018] w-full max-w-6xl h-[90vh] rounded-[40px] border border-[#1e2535] flex overflow-hidden shadow-2xl">
            {/* Bu qism o'zgarishsiz qoldi (Cart tizimi) */}
            <div className="p-8 border-r border-[#1e2535] w-5/12 space-y-5 overflow-y-auto bg-[#0d1018]">
                <h2 className="text-2xl font-black text-white mb-6">{tr.newIssuance}</h2>
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none" value={activeWhId} onChange={e => {setActiveWhId(e.target.value); setActiveProdId('');}}>
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
                </select>
                <div className="relative">
                  <button onClick={() => setProdDropOpen(!prodDropOpen)} className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-left text-white flex justify-between">{products.find(p => p.id === activeProdId)?.name || tr.search} <span>▼</span></button>
                  {prodDropOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#131720] border border-[#1e2535] rounded-2xl z-50 max-h-60 overflow-y-auto p-2 shadow-2xl">
                      <input type="text" autoFocus className="w-full bg-[#0d1018] p-3 rounded-xl mb-2 text-white border border-[#1e2535]" value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder={tr.search}/>
                      {filteredProducts.map(p => <button key={p.id} onClick={() => {setActiveProdId(p.id); setProdDropOpen(false);}} className="w-full p-3 text-left rounded-xl hover:bg-[#ffa502] hover:text-black text-white font-bold">{p.name}</button>)}
                    </div>
                  )}
                </div>
                {activeProdId && (
                  <select className="w-full bg-[#ffa502]/10 border border-[#ffa502]/30 p-4 rounded-2xl text-[#ffa502] outline-none font-bold" value={activeStockId} onChange={e => {setActiveStockId(e.target.value); const s = stockRows.find(sr => sr.id === e.target.value); setActivePrice(s?.sell_price || '');}}>
                    <option value="">--- {tr.batch} ---</option>
                    {availableStock.map(s => <option key={s.id} value={s.id}>{Object.values(s.attrs || {}).join(' × ') || s.batch} | {tr.onHand}: {s.on_hand}</option>)}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none" value={activeQty} onChange={e => setActiveQty(Number(e.target.value))} placeholder={tr.qty}/>
                  <input type="number" className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none" value={activePrice} onChange={e => setActivePrice(Number(e.target.value))} placeholder={tr.sellPrice}/>
                </div>
                <button onClick={addToCart} className="w-full bg-[#00d4aa] text-[#0d1018] font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">+ {tr.add}</button>
                <div className="h-px bg-[#1e2535] my-4" />
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                  <option value="">{tr.client}...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="w-full bg-[#131720] border border-[#1e2535] p-4 rounded-2xl text-white outline-none" value={saleType} onChange={e => setSaleType(e.target.value as any)}>
                  <option value="paid">✅ {tr.paid}</option><option value="debt">🚩 {tr.debt}</option><option value="free">🎁 {tr.free}</option>
                </select>
            </div>
            <div className="w-7/12 bg-[#131720]/40 p-8 flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {cart.map(item => (
                    <div key={item.tempId} className="bg-[#0d1018] p-5 rounded-3xl border border-[#1e2535] flex justify-between items-center group animate-in slide-in-from-right duration-300">
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-white truncate">{item.product_name}</p>
                        <small className="text-[#4a5568] uppercase font-mono tracking-widest text-[9px]">{item.variant_label}</small>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right font-mono">
                          <p className="text-[10px] text-[#8896ae]">{item.qty} x {fmt(item.sell_price)}</p>
                          <p className="font-black text-[#00d4aa] text-lg">{fmt(item.qty * item.sell_price)}</p>
                        </div>
                        <button onClick={() => removeFromCart(item.tempId)} className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-8 border-t border-[#1e2535] flex justify-between items-center">
                  <div><p className="text-[10px] font-mono text-[#4a5568] uppercase mb-1">Jami</p><p className="text-4xl font-black text-[#00d4aa] font-mono">{fmt(cart.reduce((s, i) => s + (i.qty * i.sell_price), 0))}</p></div>
                  <button onClick={handleSubmit} disabled={cart.length === 0 || saving} className="bg-[#ffa502] text-[#0d1018] font-black px-12 py-5 rounded-3xl hover:scale-105 transition-all shadow-2xl shadow-[#ffa502]/20">{saving ? "..." : tr.confirm}</button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}