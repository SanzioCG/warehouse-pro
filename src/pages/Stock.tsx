import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Stock({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [whFilter, setWhFilter] = useState('all')
  const [batchFilter, setBatchFilter] = useState('all')
  const [editRow, setEditRow] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const canEdit = ['leader', 'manager_saidaziz', 'manager_eldor'].includes(user.role)
  const [deleteRow, setDeleteRow] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [zoomImg, setZoomImg] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteRow) return
    setDeleting(true)
    await supabase.from('stock').delete().eq('id', deleteRow.id)
    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'stock_deleted', entity: 'stock',
      record_id: deleteRow.id,
      detail: `Stock o'chirildi: ${deleteRow.products?.name}`,
    }])
    setRows(prev => prev.filter(r => r.id !== deleteRow.id))
    setDeleting(false)
    setDeleteRow(null)
  }

  useEffect(() => { fetchStock() }, [])

  async function fetchStock() {
    setLoading(true)
    const { data } = await supabase
      .from('stock')
      .select('*, products(id, name, sku, unit, warehouse_id, threshold, cost_price, sell_price, image_url, attrs)')
    setRows(data || [])
    setLoading(false)
  }

  const batchOptions = useMemo(() => {
    return Array.from(
      new Set(
        (rows || [])
          .filter(r => r.products && role.warehouses.includes(r.products.warehouse_id))
          .filter(r => whFilter === 'all' || r.products.warehouse_id === whFilter)
          .map(r => r.batch)
          .filter((b: string) => !!b)
      )
    ).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  }, [rows, role.warehouses, whFilter])

  const filtered = rows
  .filter(r => {
    if (!r.products || !role.warehouses.includes(r.products.warehouse_id)) return false

    const matchW = whFilter === 'all' || r.products.warehouse_id === whFilter
    const matchB = batchFilter === 'all' || (r.batch || '') === batchFilter
    const q = search.toLowerCase()

    const matchS =
      r.products.name.toLowerCase().includes(q) ||
      String(r.products.sku || '').toLowerCase().includes(q)

    return matchW && matchB && matchS
  })
  .sort((a, b) =>
    String(a.products?.sku || '').localeCompare(
      String(b.products?.sku || ''),
      undefined,
      { numeric: true, sensitivity: 'base' }
    )
  )

  function openEdit(r: any) {
    setEditRow(r)
    setEditForm({
      on_hand: r.on_hand,
      reserved: r.reserved,
      cost_price: r.cost_price || 0,
      sell_price: r.sell_price || 0,
      threshold: r.products?.threshold || 0,
    })
    setSavedMsg(false)
  }

  async function handleSave() {
    if (!editRow) return
    setSaving(true)

    await supabase.from('stock').update({
      on_hand: Number(editForm.on_hand),
      reserved: Number(editForm.reserved),
      cost_price: Number(editForm.cost_price),
      sell_price: Number(editForm.sell_price),
    }).eq('id', editRow.id)

    await supabase.from('products').update({
      threshold: Number(editForm.threshold),
    }).eq('id', editRow.products?.id)

    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'stock_edited', entity: 'stock',
      record_id: editRow.id,
      detail: `Stock tahrirlandi: ${editRow.products?.name} | on_hand: ${editForm.on_hand}`,
    }])

    setRows(prev => prev.map(r => r.id === editRow.id ? {
      ...r,
      on_hand: Number(editForm.on_hand),
      reserved: Number(editForm.reserved),
      cost_price: Number(editForm.cost_price),
      sell_price: Number(editForm.sell_price),
      products: {
        ...r.products,
        threshold: Number(editForm.threshold),
      }
    } : r))

    setSaving(false)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  const fmt = (n: number) => n?.toLocaleString('uz-UZ')

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568] text-sm">🔍</span>
          <input
            className="w-full bg-[#0d1018] border border-[#1e2535] rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] transition-all placeholder:text-[#4a5568]"
            placeholder={tr.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="bg-[#0d1018] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={whFilter}
          onChange={e => {
            setWhFilter(e.target.value)
            setBatchFilter('all')
          }}
        >
          <option value="all">{tr.allWarehouses}</option>
          {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
            <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
          )}
        </select>

        <select
          className="bg-[#0d1018] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={batchFilter}
          onChange={e => setBatchFilter(e.target.value)}
        >
          <option value="all">Barcha partiyalar</option>
          {batchOptions.map(batch => (
            <option key={batch} value={batch}>{batch}</option>
          ))}
        </select>
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.stock} ({filtered.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">🗃️</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['', tr.sku, tr.name, 'Razmer', 'Partiya', 'Ombor', tr.onHand, tr.reserved, tr.available,
                  ...(role.canSeeCost ? [tr.costPrice, 'Sotuv narxi'] : []),
                  tr.threshold, tr.status,
                  ...(canEdit ? [''] : [])
                ].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">🗃️</div>{tr.noData}
                </td></tr>
              ) : filtered.map(r => {
                const p = r.products
                const available = r.on_hand - r.reserved
                const isLow = r.on_hand <= (p?.threshold || 0)
                const wh = WAREHOUSES.find(w => w.id === p?.warehouse_id)
                return (
                  <tr key={r.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    <td className="px-3 py-2">
                      {p?.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          onClick={() => setZoomImg(p.image_url)}
                          className="w-10 h-10 rounded-lg object-cover border border-[#1e2535] cursor-zoom-in hover:border-[#00d4aa] hover:scale-110 transition-all"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#131720] border border-[#1e2535] flex items-center justify-center text-lg">📦</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{p?.sku}</td>
                    <td className="px-4 py-3 font-bold text-[13px]">{p?.name}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-[#8896ae]">
                      {r.attrs && Object.keys(r.attrs).length > 0
                        ? Object.values(r.attrs).join(' × ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{r.batch || '—'}</td>
                    <td className="px-4 py-3">
                      {wh && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border"
                          style={{ background: wh.color + '18', color: wh.color, borderColor: wh.color + '30' }}>
                          {wh.icon} {wh.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[13px]">{r.on_hand}</td>
                    <td className="px-4 py-3 font-mono text-[#ffa502] text-[13px]">{r.reserved}</td>
                    <td className="px-4 py-3 font-mono font-bold text-[13px]"
                      style={{ color: available <= 0 ? '#ff4757' : '#00d4aa' }}>
                      {available}
                    </td>
                    {role.canSeeCost && (
                      <>
                        <td className="px-4 py-3 font-mono text-[12px] text-[#8896ae]">${fmt(r.cost_price)}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-[#00d4aa]">${fmt(r.sell_price)}</td>
                      </>
                    )}
                    <td className="px-4 py-3 font-mono text-[12px] text-[#4a5568]">{p?.threshold}</td>
                    <td className="px-4 py-3">
                      {r.on_hand === 0
                        ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ff4757]/10 text-[#ff4757] border border-[#ff4757]/20">{tr.finished}</span>
                        : isLow
                        ? <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#ffa502]/10 text-[#ffa502] border border-[#ffa502]/20">{tr.low}</span>
                        : <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20">{tr.normal}</span>
                      }
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(r)}
                            className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#0095ff] hover:bg-[#0095ff]/10 hover:border-[#0095ff] transition-all flex items-center justify-center text-xs">✎</button>
                          <button onClick={() => setDeleteRow(r)}
                            className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#ff4757] hover:bg-[#ff4757]/10 hover:border-[#ff4757] transition-all flex items-center justify-center text-xs">✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {zoomImg && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center backdrop-blur-sm cursor-zoom-out"
          onClick={() => setZoomImg(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={zoomImg}
              alt="zoom"
              className="max-w-[85vw] max-h-[85vh] rounded-2xl object-contain shadow-[0_0_80px_rgba(0,212,170,0.2)] border border-[#1e2535]"
            />
            <button
              onClick={() => setZoomImg(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-[#131720] border border-[#1e2535] text-[#8896ae] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center text-sm"
            >✕</button>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[460px] max-w-[95vw]">
            <div className="text-[17px] font-black mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#0095ff]" />
                Stock tahrirlash
              </div>
              <button onClick={() => setEditRow(null)}
                className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>
            <div className="text-[12px] text-[#4a5568] mb-5 font-mono">
              {editRow.products?.sku} — {editRow.products?.name}
            </div>

            {savedMsg && (
              <div className="bg-[#00d4aa]/10 border border-[#00d4aa]/25 rounded-xl px-4 py-2.5 mb-4 text-[13px] text-[#00d4aa]">
                ✅ Saqlandi!
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Qoldiq (on hand)</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={editForm.on_hand}
                  onChange={e => setEditForm((f: any) => ({ ...f, on_hand: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Rezerv</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={editForm.reserved}
                  onChange={e => setEditForm((f: any) => ({ ...f, reserved: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Tan narxi ($)</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={editForm.cost_price}
                  onChange={e => setEditForm((f: any) => ({ ...f, cost_price: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Sotuv narxi ($)</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={editForm.sell_price}
                  onChange={e => setEditForm((f: any) => ({ ...f, sell_price: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Min zaxira (threshold)</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={editForm.threshold}
                  onChange={e => setEditForm((f: any) => ({ ...f, threshold: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setEditRow(null)}
                className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all">
                Yopish
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 bg-[#0095ff] text-white font-bold rounded-xl text-[13px] hover:bg-[#1aa3ff] transition-all disabled:opacity-50">
                {saving ? 'Saqlanmoqda...' : '💾 Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[420px] max-w-[95vw]">
            <div className="text-[17px] font-black mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ff4757]" />
                Stock yozuvini o'chirish
              </div>
              <button onClick={() => setDeleteRow(null)} className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>
            <p className="text-[14px] text-[#8896ae] mb-1"><strong className="text-white">{deleteRow.products?.name}</strong> stock yozuvi o'chiriladi!</p>
            <p className="text-[12px] text-[#ff4757]">Bu amalni qaytarib bo'lmaydi.</p>
            <div className="flex gap-2 justify-end mt-6 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setDeleteRow(null)} className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all">Bekor</button>
              <button onClick={handleDelete} disabled={deleting} className="px-5 py-2.5 bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#ff4757] font-bold rounded-xl text-[13px] hover:bg-[#ff4757]/30 transition-all disabled:opacity-50">{deleting ? "..." : "O'chirish"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}