import { useEffect, useState, useRef } from 'react'
import { supabase, uploadProductImage } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Products({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [whFilter, setWhFilter] = useState('all')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [zoomImg, setZoomImg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .in('warehouse_id', role.warehouses)
      .order('sku', { ascending: true })
    setProducts(data || [])
    setLoading(false)
  }

  const filtered = products.filter(p => {
    const matchW = whFilter === 'all' || p.warehouse_id === whFilter
    const matchS = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    return matchW && matchS
  })

  function openAdd() {
    setForm({
      warehouse_id: role.warehouses[0],
      sku: '', name: '', unit: 'dona',
      threshold: 0, attrs: {}, image_url: ''
    })
    setImageFile(null)
    setImagePreview('')
    setModal('add')
  }

  function openEdit(p: any) {
    setForm({ ...p, attrs: { ...p.attrs } })
    setImagePreview(p.image_url || '')
    setImageFile(null)
    setModal('edit')
  }

  function openDelete(p: any) { setForm(p); setModal('delete') }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function handleSave() {
    if (!form.name || !form.sku) return
    setSaving(true)

    let image_url = form.image_url || ''
    if (imageFile) {
      try {
        image_url = await uploadProductImage(imageFile)
      } catch (e) {
        console.error('Image upload failed:', e)
      }
    }

    // texture attrs dan ajratib olamiz
    const texture = (form.attrs || {}).texture || ''
    const attrsWithoutTexture = { ...form.attrs }
    delete attrsWithoutTexture.texture

    if (modal === 'add') {
      const { data } = await supabase.from('products').insert([{
        warehouse_id: form.warehouse_id,
        sku: form.sku, name: form.name, unit: form.unit,
        sell_price: 0, cost_price: 0,
        threshold: form.threshold,
        attrs: { texture, ...attrsWithoutTexture },
        image_url,
      }]).select()
      if (data) setProducts(prev => [...data, ...prev].sort((a, b) => a.sku.localeCompare(b.sku)))
      await supabase.from('audit_logs').insert([{
        user_role: user.role, user_name: user.name,
        action: 'product_created', entity: 'product',
        record_id: data?.[0]?.id, detail: `Mahsulot yaratildi: ${form.name}`,
      }])
    } else {
      await supabase.from('products').update({
        warehouse_id: form.warehouse_id, sku: form.sku,
        name: form.name, unit: form.unit,
        threshold: form.threshold,
        attrs: { texture, ...attrsWithoutTexture },
        image_url,
      }).eq('id', form.id)
      setProducts(prev => prev.map(p => p.id === form.id ? { ...p, ...form, image_url } : p))
    }
    setSaving(false)
    setModal(null)
  }

  async function handleDelete() {
    setSaving(true)
    await supabase.from('products').delete().eq('id', form.id)
    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'product_deleted', entity: 'product',
      record_id: form.id, detail: `Mahsulot o'chirildi: ${form.name}`,
    }])
    setProducts(prev => prev.filter(p => p.id !== form.id))
    setSaving(false)
    setModal(null)
  }

  

  return (
    <div>
      {/* Toolbar */}
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
          onChange={e => setWhFilter(e.target.value)}
        >
          <option value="all">{tr.allWarehouses}</option>
          {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
            <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
          )}
        </select>
        {role.canAddProduct && (
          <button
            onClick={openAdd}
            className="px-4 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] hover:-translate-y-0.5 transition-all flex items-center gap-2"
          >
            ＋ {tr.addProduct}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.products} ({filtered.length})</span>
        </div>
        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">📦</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['', tr.sku, tr.name, 'Texture', 'Ombor', tr.unit, tr.warehouseParams, ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-[#4a5568]">
                  <div className="text-3xl mb-2">📦</div>{tr.noData}
                </td></tr>
              ) : filtered.map((p: any) => {
                const wh = WAREHOUSES.find(w => w.id === p.warehouse_id)
                const texture = p.attrs?.texture || '—'
                const otherAttrs = Object.entries(p.attrs || {}).filter(([k]) => k !== 'texture')
                return (
                  <tr key={p.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    {/* Rasm */}
                    <td className="px-3 py-2">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          onClick={() => setZoomImg(p.image_url)}
                          className="w-10 h-10 rounded-lg object-cover border border-[#1e2535] cursor-zoom-in hover:border-[#00d4aa] hover:scale-110 transition-all"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#131720] border border-[#1e2535] flex items-center justify-center text-lg">
                          📦
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{p.sku}</td>
                    <td className="px-4 py-3 font-bold text-[13px]">{p.name}</td>
                    <td className="px-4 py-3 text-[12px] text-[#8896ae]">{texture}</td>
                    <td className="px-4 py-3">
                      {wh && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border"
                          style={{ background: wh.color + '18', color: wh.color, borderColor: wh.color + '30' }}>
                          {wh.icon} {wh.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#8896ae]">{p.unit}</td>
                    <td className="px-4 py-3">
                      {otherAttrs.map(([k, v]) => (
                        <span key={k} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-[#131720] text-[#8896ae] border border-[#1e2535] m-0.5">
                          {k}: {v as string}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      {role.canAddProduct && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openEdit(p)}
                            className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#0095ff] hover:bg-[#0095ff]/10 hover:border-[#0095ff] transition-all flex items-center justify-center text-xs">✎</button>
                          <button onClick={() => openDelete(p)}
                            className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#ff4757] hover:bg-[#ff4757]/10 hover:border-[#ff4757] transition-all flex items-center justify-center text-xs">✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Zoom Modal */}
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

      {/* Add/Edit Modal */}
      {modal && modal !== 'delete' && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[600px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <div className="text-[17px] font-black mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
                {modal === 'add' ? tr.newProduct : tr.editProduct}
              </div>
              <button onClick={() => setModal(null)}
                className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>

            {/* Image Upload */}
            <div className="mb-5">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-2">
                Mahsulot rasmi
              </label>
              <div className="flex items-center gap-4">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-24 h-24 rounded-xl border-2 border-dashed border-[#1e2535] hover:border-[#00d4aa] cursor-pointer flex items-center justify-center overflow-hidden transition-all group relative"
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white text-xs font-bold">
                        O'zgartirish
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <div className="text-3xl mb-1">📷</div>
                      <div className="text-[10px] text-[#4a5568]">Rasm</div>
                    </div>
                  )}
                </div>
                <div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="block px-4 py-2 rounded-lg border border-[#1e2535] text-[#8896ae] text-[12px] hover:border-[#00d4aa] hover:text-[#00d4aa] transition-all mb-2">
                    📂 Rasm tanlash
                  </button>
                  {imagePreview && (
                    <button type="button"
                      onClick={() => { setImagePreview(''); setImageFile(null); setForm((f: any) => ({ ...f, image_url: '' })) }}
                      className="block px-4 py-2 rounded-lg border border-[#1e2535] text-[#ff4757] text-[12px] hover:border-[#ff4757] transition-all mb-2">
                      🗑 Rasmni o'chirish
                    </button>
                  )}
                  <p className="text-[10px] text-[#4a5568]">JPG, PNG, WEBP • Max 2MB</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>

            <div className="border-t border-[#1e2535] mb-4" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Ombor</label>
                <select
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.warehouse_id || ''}
                  onChange={e => setForm((f: any) => ({ ...f, warehouse_id: e.target.value, attrs: {} }))}
                >
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w =>
                    <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.sku}</label>
                <input
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="DP-001"
                  value={form.sku || ''}
                  onChange={e => setForm((f: any) => ({ ...f, sku: e.target.value }))}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.name}</label>
              <input
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="Mahsulot nomi..."
                value={form.name || ''}
                onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.unit}</label>
                <select
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.unit || 'dona'}
                  onChange={e => setForm((f: any) => ({ ...f, unit: e.target.value }))}
                >
                  {['dona', 'm²', 'm', 'kg', 'litr', 'box', 'set'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">{tr.threshold} (Min zaxira)</label>
                <input type="number"
                  className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                  placeholder="0" value={form.threshold || ''}
                  onChange={e => setForm((f: any) => ({ ...f, threshold: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Texture */}
            <div className="mt-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">Texture</label>
              <input
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="Texture nomi..."
                value={(form.attrs || {}).texture || ''}
                onChange={e => setForm((f: any) => ({ ...f, attrs: { ...f.attrs, texture: e.target.value } }))}
              />
            </div>



            <div className="flex gap-2 justify-end mt-6 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setModal(null)} className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] hover:text-white transition-all">{tr.cancel}</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all disabled:opacity-50">
                {saving ? 'Saqlanmoqda...' : tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[420px]">
            <div className="text-[17px] font-black mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ff4757]" />
                {tr.deleteProduct}
              </div>
              <button onClick={() => setModal(null)}
                className="w-8 h-8 rounded-lg border border-[#1e2535] text-[#4a5568] hover:text-white hover:border-[#ff4757] transition-all flex items-center justify-center">✕</button>
            </div>
            <p className="text-[14px] text-[#8896ae]">
              <strong className="text-white">{form.name}</strong> {tr.deleteConfirm}
            </p>
            <p className="text-[12px] text-[#ff4757] mt-2">{tr.irreversible}</p>
            <div className="flex gap-2 justify-end mt-6 pt-5 border-t border-[#1e2535]">
              <button onClick={() => setModal(null)} className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all">{tr.cancel}</button>
              <button onClick={handleDelete} disabled={saving}
                className="px-5 py-2.5 bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#ff4757] font-bold rounded-xl text-[13px] hover:bg-[#ff4757]/30 transition-all disabled:opacity-50">
                {saving ? '...' : tr.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}