import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES, WAREHOUSE_PARAMS } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

interface Product {
  id: string
  name: string
  sku: string
  unit: string
  warehouse_id: string
  threshold: number
  image_url: string | null
  attrs: Record<string, string> | null
}

interface StockRow {
  id: string
  on_hand: number
  reserved: number
  solded: number
  batch: string | null
  cost_price: number | null
  sell_price: number | null
  attrs: Record<string, string> | null
  products: Product | null
}

interface EditFormData {
  on_hand: number
  reserved: number
  cost_price: number
  sell_price: number
  threshold: number
  attrs: Record<string, string>
}

const STOCK_COLS_STORAGE_KEY = 'stock-table-col-widths-v5'

const defaultColWidths = {
  no: 58,
  image: 68,
  sku: 150,
  name: 260,
  size: 180,
  batch: 110,
  warehouse: 170,
  onHand: 90,
  reserved: 90,
  available: 90,
  solded: 95,
  cost: 110,
  sell: 120,
  threshold: 100,
  status: 100,
  actions: 88,
}

type ColKey = keyof typeof defaultColWidths

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringOrNull(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function toNumberOrZero(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toRecordString(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null

  const out: Record<string, string> = {}

  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue
    out[k] = String(v)
  }

  return out
}

function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null

  return {
    id: String(value.id ?? ''),
    name: String(value.name ?? ''),
    sku: String(value.sku ?? ''),
    unit: String(value.unit ?? ''),
    warehouse_id: String(value.warehouse_id ?? ''),
    threshold: toNumberOrZero(value.threshold),
    image_url: toStringOrNull(value.image_url),
    attrs: toRecordString(value.attrs),
  }
}

function normalizeStockRow(value: unknown): StockRow | null {
  if (!isRecord(value)) return null

  return {
    id: String(value.id ?? ''),
    on_hand: toNumberOrZero(value.on_hand),
    reserved: toNumberOrZero(value.reserved),
    solded: 0,
    batch: toStringOrNull(value.batch),
    cost_price: toNumberOrNull(value.cost_price),
    sell_price: toNumberOrNull(value.sell_price),
    attrs: toRecordString(value.attrs),
    products: normalizeProduct(value.products),
  }
}

function normalizeStockRows(value: unknown): StockRow[] {
  if (!Array.isArray(value)) return []

  return value
    .map(normalizeStockRow)
    .filter((row): row is StockRow => row !== null)
}

export default function Stock({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [whFilter, setWhFilter] = useState('all')
  const [batchFilter, setBatchFilter] = useState('all')

  const [editRow, setEditRow] = useState<StockRow | null>(null)
  const [editForm, setEditForm] = useState<EditFormData>({
    on_hand: 0,
    reserved: 0,
    cost_price: 0,
    sell_price: 0,
    threshold: 0,
    attrs: {},
  })

  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleteRow, setDeleteRow] = useState<StockRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [zoomImg, setZoomImg] = useState<string | null>(null)

  const canEdit = ['leader', 'manager_saidaziz', 'manager_eldor'].includes(user.role)

  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const saved = localStorage.getItem(STOCK_COLS_STORAGE_KEY)
      if (!saved) return defaultColWidths

      const parsed = JSON.parse(saved)
      if (!isRecord(parsed)) return defaultColWidths

      return {
        ...defaultColWidths,
        ...Object.fromEntries(
          Object.entries(defaultColWidths).map(([key, fallback]) => {
            const raw = parsed[key]
            const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
            return [key, value]
          })
        ),
      } as Record<ColKey, number>
    } catch {
      return defaultColWidths
    }
  })

  const tableWrapRef = useRef<HTMLDivElement | null>(null)
  const resizeLineRef = useRef<HTMLDivElement | null>(null)
  const resizeRef = useRef<{
    key: ColKey
    startX: number
    startWidth: number
  } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STOCK_COLS_STORAGE_KEY, JSON.stringify(colWidths))
    } catch (err) {
      console.warn('LocalStorage saqlashda xatolik:', err)
    }
  }, [colWidths])

  const resetColWidths = useCallback(() => {
    setColWidths(defaultColWidths)
    try {
      localStorage.removeItem(STOCK_COLS_STORAGE_KEY)
    } catch (err) {
      console.warn('LocalStorage tozalashda xatolik:', err)
    }
  }, [])

  const showResizeLine = useCallback((clientX: number) => {
    const wrap = tableWrapRef.current
    const line = resizeLineRef.current
    if (!wrap || !line) return

    const rect = wrap.getBoundingClientRect()
    const left = Math.max(0, Math.min(clientX - rect.left + wrap.scrollLeft, wrap.scrollWidth))
    line.style.opacity = '1'
    line.style.transform = `translateX(${left}px)`
  }, [])

  const hideResizeLine = useCallback(() => {
    const line = resizeLineRef.current
    if (!line) return
    line.style.opacity = '0'
  }, [])

  const startResize = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>, key: ColKey) => {
      e.preventDefault()
      e.stopPropagation()

      resizeRef.current = {
        key,
        startX: e.clientX,
        startWidth: colWidths[key],
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      showResizeLine(e.clientX)
    },
    [colWidths, showResizeLine]
  )

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return

      const { key, startX, startWidth } = resizeRef.current
      const diff = e.clientX - startX
      const nextWidth = Math.max(60, Math.min(520, startWidth + diff))

      showResizeLine(e.clientX)

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        setColWidths(prev => {
          if (prev[key] === nextWidth) return prev
          return { ...prev, [key]: nextWidth }
        })
      })
    }

    const onMouseUp = () => {
      resizeRef.current = null
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      hideResizeLine()
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [hideResizeLine, showResizeLine])

  const fetchStock = useCallback(async () => {
  setLoading(true)
  setError(null)

  try {
    const { data: stockData, error: stockError } = await supabase
      .from('stock')
      .select(`
        id,
        on_hand,
        reserved,
        batch,
        cost_price,
        sell_price,
        attrs,
        products:product_id (
          id,
          name,
          sku,
          unit,
          warehouse_id,
          threshold,
          image_url,
          attrs
        )
      `)

    if (stockError) throw stockError

    const normalizedRows = normalizeStockRows(stockData)

    const soldMap = new Map<string, number>()

    try {
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('stock_id, qty, type')
        .eq('type', 'issuance')

      if (txError) {
        console.warn('Transactions yuklashda xatolik:', txError)
      } else if (Array.isArray(txData)) {
        for (const tx of txData) {
          if (!isRecord(tx)) continue

          const stockId = String(tx.stock_id ?? '')
          const qty = toNumberOrZero(tx.qty)

          if (!stockId) continue

          soldMap.set(stockId, (soldMap.get(stockId) ?? 0) + qty)
        }
      }
    } catch (txErr) {
      console.warn('Transactions parse/yuklash xatoligi:', txErr)
    }

    const mergedRows: StockRow[] = normalizedRows.map(row => ({
      ...row,
      solded: soldMap.get(row.id) ?? 0,
    }))

    setRows(mergedRows)
  } catch (err) {
    console.error('Stock yuklanmadi:', err)
    setError("Ma'lumotlarni yuklashda xatolik yuz berdi")
  } finally {
    setLoading(false)
  }
}, [])

  useEffect(() => {
    fetchStock()
  }, [fetchStock, user.role])

  const openEdit = useCallback((row: StockRow) => {
    setEditRow(row)
    setEditForm({
      on_hand: row.on_hand,
      reserved: row.reserved,
      cost_price: row.cost_price ?? 0,
      sell_price: row.sell_price ?? 0,
      threshold: row.products?.threshold ?? 0,
      attrs: row.attrs ?? {},
    })
    setSavedMsg(false)
    setSaveError(null)
  }, [])

  const handleEditFormChange = useCallback(
    (field: keyof Omit<EditFormData, 'attrs'>, value: string) => {
      setEditForm(prev => ({
        ...prev,
        [field]: value === '' ? 0 : Number(value),
      }))
    },
    []
  )

  const handleAttrChange = useCallback((key: string, value: string) => {
    setEditForm(prev => ({
      ...prev,
      attrs: {
        ...prev.attrs,
        [key]: value,
      },
    }))
  }, [])

  const handleSave = async () => {
    if (!editRow) return

    setSaving(true)
    setSaveError(null)

    try {
      const { error: stockError } = await supabase
        .from('stock')
        .update({
          on_hand: editForm.on_hand,
          reserved: editForm.reserved,
          cost_price: editForm.cost_price,
          sell_price: editForm.sell_price,
          attrs: editForm.attrs,
        })
        .eq('id', editRow.id)

      if (stockError) throw stockError

      if (editRow.products?.id) {
        const { error: productError } = await supabase
          .from('products')
          .update({
            threshold: editForm.threshold,
          })
          .eq('id', editRow.products.id)

        if (productError) throw productError
      }

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([
          {
            user_role: user.role,
            user_name: user.name,
            action: 'stock_edited',
            entity: 'stock',
            record_id: editRow.id,
            detail: `Stock tahrirlandi: ${editRow.products?.name || 'Unknown'} | on_hand: ${editForm.on_hand}`,
          },
        ])

      if (auditError) throw auditError

      setRows(prev =>
        prev.map(row =>
          row.id === editRow.id
            ? {
                ...row,
                on_hand: editForm.on_hand,
                reserved: editForm.reserved,
                cost_price: editForm.cost_price,
                sell_price: editForm.sell_price,
                attrs: editForm.attrs,
                products: row.products
                  ? {
                      ...row.products,
                      threshold: editForm.threshold,
                    }
                  : null,
              }
            : row
        )
      )

      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      console.error('Saqlashda xatolik:', err)
      setSaveError('Saqlashda xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)

    try {
      const { error: deleteError } = await supabase
        .from('stock')
        .delete()
        .eq('id', deleteRow.id)

      if (deleteError) throw deleteError

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([
          {
            user_role: user.role,
            user_name: user.name,
            action: 'stock_deleted',
            entity: 'stock',
            record_id: deleteRow.id,
            detail: `Stock o'chirildi: ${deleteRow.products?.name || 'Unknown'}`,
          },
        ])

      if (auditError) throw auditError

      setRows(prev => prev.filter(row => row.id !== deleteRow.id))
      setDeleteRow(null)
    } catch (err) {
      console.error("O'chirishda xatolik:", err)
      alert("O'chirishda xatolik yuz berdi")
    } finally {
      setDeleting(false)
    }
  }

  const batchOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .filter(r => r.products && role.warehouses.includes(r.products.warehouse_id))
          .filter(r => whFilter === 'all' || r.products?.warehouse_id === whFilter)
          .map(r => r.batch)
          .filter((b): b is string => Boolean(b))
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [rows, role.warehouses, whFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return rows
      .filter(r => {
        const p = r.products
        if (!p) return false
        if (!role.warehouses.includes(p.warehouse_id)) return false

        const matchW = whFilter === 'all' || p.warehouse_id === whFilter
        const matchB = batchFilter === 'all' || (r.batch || '') === batchFilter
        const matchS =
          q === '' ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)

        return matchW && matchB && matchS
      })
      .sort((a, b) => {
        const skuCompare = String(a.products?.sku || '').localeCompare(
          String(b.products?.sku || ''),
          undefined,
          { numeric: true, sensitivity: 'base' }
        )

        if (skuCompare !== 0) return skuCompare

        return String(a.batch || '').localeCompare(String(b.batch || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      })
  }, [rows, role.warehouses, whFilter, batchFilter, search])

  const fmt = useCallback((n: number | null | undefined): string => {
    if (n == null) return '0'
    return n.toLocaleString('uz-UZ')
  }, [])

  const formatAttrs = useCallback((attrs: Record<string, string> | null): string => {
    if (!attrs) return '—'
    const values = Object.values(attrs).filter(v => String(v).trim())
    return values.length ? values.join(' × ') : '—'
  }, [])

  const renderWarehouseParams = useCallback(
    (warehouseId: string, attrs: Record<string, string>) => {
      const params = WAREHOUSE_PARAMS[warehouseId] || []
      if (!params.length) return null

      return (
        <>
          <div className="my-4 border-t border-[#1e2535]" />

          <div className="mb-3 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#4a5568]">
            <span>📐 Razmerlar</span>
            <span className="text-[#8896ae]">({warehouseId})</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {params.map((param: { key: string; label: string; type?: string }) => (
              <div key={param.key}>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {param.label}
                </label>
                <input
                  type={param.type || 'text'}
                  value={attrs[param.key] || ''}
                  onChange={e => handleAttrChange(param.key, e.target.value)}
                  placeholder={param.label}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#4a5568] focus:border-[#00d4aa]"
                />
              </div>
            ))}
          </div>
        </>
      )
    },
    [handleAttrChange]
  )

  const totalCols = 11 + (role.canSeeCost ? 2 : 0) + 2 + (canEdit ? 1 : 0)

  const renderTH = useCallback(
    (label: string, key: ColKey, hasRightBorder = true) => {
      const width = colWidths[key]

      return (
        <th
          key={key}
          style={{ width, minWidth: width, maxWidth: width }}
          className={`group relative bg-[#0d1018] px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-wider text-[#4a5568] border-b border-[#1e2535] ${
            hasRightBorder ? 'border-r' : ''
          }`}
        >
          <div className="truncate pr-3">{label}</div>

          <button
            type="button"
            onMouseDown={e => startResize(e, key)}
            className="absolute right-0 top-0 h-full w-3 cursor-col-resize bg-transparent outline-none"
            aria-label={`${label || 'column'} resize`}
            title="Resize column"
          >
            <span className="absolute bottom-[18%] right-[5px] top-[18%] w-px bg-[#253047] transition-all group-hover:bg-[#00d4aa]" />
          </button>
        </th>
      )
    },
    [colWidths, startResize]
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[180px] flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#4a5568]">🔍</span>
          <input
            className="w-full rounded-xl border border-[#1e2535] bg-[#0d1018] py-2.5 pl-9 pr-4 text-[13px] text-white outline-none transition-all placeholder:text-[#4a5568] focus:border-[#00d4aa]"
            placeholder={tr.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="rounded-xl border border-[#1e2535] bg-[#0d1018] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={whFilter}
          onChange={e => {
            setWhFilter(e.target.value)
            setBatchFilter('all')
          }}
        >
          <option value="all">{tr.allWarehouses}</option>
          {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w => (
            <option key={w.id} value={w.id}>
              {w.icon} {w.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border border-[#1e2535] bg-[#0d1018] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
          value={batchFilter}
          onChange={e => setBatchFilter(e.target.value)}
        >
          <option value="all">Barcha partiyalar</option>
          {batchOptions.map(batch => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </select>

        <button
          onClick={resetColWidths}
          className="rounded-xl border border-[#1e2535] px-4 py-2.5 text-[13px] font-semibold text-[#8896ae] transition-all hover:border-[#00d4aa] hover:text-[#00d4aa]"
        >
          Ustunlarni tiklash
        </button>
      </div>

      <div
        ref={tableWrapRef}
        className="relative overflow-auto rounded-2xl border border-[#1e2535] bg-[#0d1018]"
      >
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#1e2535] bg-[#131720] px-5 py-3">
          <div className="h-4 w-0.5 rounded bg-[#00d4aa]" />
          <span className="text-[14px] font-bold">
            {tr.stock} ({filtered.length})
          </span>
        </div>

        <div
          ref={resizeLineRef}
          className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-[#00d4aa] opacity-0 shadow-[0_0_12px_rgba(0,212,170,0.55)] transition-opacity"
        />

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[#131720]" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[#ff4757]">
            <div className="mb-2 text-3xl">⚠️</div>
            <div className="text-sm font-mono">{error}</div>
            <button
              onClick={fetchStock}
              className="mt-4 rounded-xl bg-[#0095ff] px-4 py-2 text-white"
            >
              Qayta urinish
            </button>
          </div>
        ) : (
          <table className="min-w-max table-fixed border-collapse">
            <thead>
              <tr>
                {renderTH('№', 'no')}
                {renderTH('', 'image')}
                {renderTH(tr.sku, 'sku')}
                {renderTH(tr.name, 'name')}
                {renderTH('Razmer', 'size')}
                {renderTH('Partiya', 'batch')}
                {renderTH('Ombor', 'warehouse')}
                {renderTH(tr.onHand, 'onHand')}
                {renderTH(tr.reserved, 'reserved')}
                {renderTH(tr.available, 'available')}
                {renderTH('Sotilgan', 'solded')}

                {role.canSeeCost && (
                  <>
                    {renderTH(tr.costPrice, 'cost')}
                    {renderTH('Sotuv narxi', 'sell')}
                  </>
                )}

                {renderTH(tr.threshold, 'threshold')}
                {renderTH(tr.status, 'status')}
                {canEdit && renderTH('', 'actions', false)}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="py-16 text-center text-[#4a5568]">
                    <div className="mb-2 text-3xl">🗃️</div>
                    {tr.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((r, index) => {
                  const p = r.products
                  const available = r.on_hand - r.reserved
                  const isLow = r.on_hand <= (p?.threshold || 0)
                  const wh = WAREHOUSES.find(w => w.id === p?.warehouse_id)

                  const cellBase = 'px-4 py-3 border-b border-r border-[#1e2535] align-middle'
                  const lastCellBase = 'px-4 py-3 border-b border-[#1e2535] align-middle'

                  return (
                    <tr key={r.id} className="transition-all hover:bg-[#131720]">
                      <td
                        style={{
                          width: colWidths.no,
                          minWidth: colWidths.no,
                          maxWidth: colWidths.no,
                        }}
                        className="border-b border-r border-[#1e2535] px-3 py-2 align-middle text-center text-[12px] font-mono text-[#8896ae]"
                      >
                        {index + 1}
                      </td>

                      <td
                        style={{
                          width: colWidths.image,
                          minWidth: colWidths.image,
                          maxWidth: colWidths.image,
                        }}
                        className="border-b border-r border-[#1e2535] px-3 py-2 align-middle"
                      >
                        {p?.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            onClick={() => setZoomImg(p.image_url)}
                            className="h-10 w-10 cursor-zoom-in rounded-lg border border-[#1e2535] object-cover transition-all hover:scale-110 hover:border-[#00d4aa]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#1e2535] bg-[#131720] text-lg">
                            📦
                          </div>
                        )}
                      </td>

                      <td
                        style={{ width: colWidths.sku, minWidth: colWidths.sku, maxWidth: colWidths.sku }}
                        className={`${cellBase} text-[11px] font-mono text-[#4a5568]`}
                      >
                        {p?.sku || '—'}
                      </td>

                      <td
                        style={{ width: colWidths.name, minWidth: colWidths.name, maxWidth: colWidths.name }}
                        className={`${cellBase} text-[13px] font-bold`}
                      >
                        {p?.name || '—'}
                      </td>

                      <td
                        style={{ width: colWidths.size, minWidth: colWidths.size, maxWidth: colWidths.size }}
                        className={`${cellBase} text-[11px] font-mono text-[#8896ae]`}
                      >
                        {formatAttrs(r.attrs)}
                      </td>

                      <td
                        style={{ width: colWidths.batch, minWidth: colWidths.batch, maxWidth: colWidths.batch }}
                        className={`${cellBase} text-[11px] font-mono text-[#4a5568]`}
                      >
                        {r.batch || '—'}
                      </td>

                      <td
                        style={{
                          width: colWidths.warehouse,
                          minWidth: colWidths.warehouse,
                          maxWidth: colWidths.warehouse,
                        }}
                        className={cellBase}
                      >
                        {wh ? (
                          <span
                            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold"
                            style={{
                              background: `${wh.color}18`,
                              color: wh.color,
                              borderColor: `${wh.color}30`,
                            }}
                          >
                            {wh.icon} {wh.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#4a5568]">—</span>
                        )}
                      </td>

                      <td
                        style={{
                          width: colWidths.onHand,
                          minWidth: colWidths.onHand,
                          maxWidth: colWidths.onHand,
                        }}
                        className={`${cellBase} text-[13px] font-mono font-bold`}
                      >
                        {r.on_hand}
                      </td>

                      <td
                        style={{
                          width: colWidths.reserved,
                          minWidth: colWidths.reserved,
                          maxWidth: colWidths.reserved,
                        }}
                        className={`${cellBase} text-[13px] font-mono text-[#ffa502]`}
                      >
                        {r.reserved}
                      </td>

                      <td
                        style={{
                          width: colWidths.available,
                          minWidth: colWidths.available,
                          maxWidth: colWidths.available,
                          color: available <= 0 ? '#ff4757' : '#00d4aa',
                        }}
                        className={`${cellBase} text-[13px] font-mono font-bold`}
                      >
                        {available}
                      </td>

                      <td
                        style={{
                          width: colWidths.solded,
                          minWidth: colWidths.solded,
                          maxWidth: colWidths.solded,
                        }}
                        className={`${cellBase} text-[13px] font-mono font-bold text-[#ff9f43]`}
                      >
                        {r.solded}
                      </td>

                      {role.canSeeCost && (
                        <>
                          <td
                            style={{
                              width: colWidths.cost,
                              minWidth: colWidths.cost,
                              maxWidth: colWidths.cost,
                            }}
                            className={`${cellBase} text-[12px] font-mono text-[#8896ae]`}
                          >
                            ${fmt(r.cost_price)}
                          </td>
                          <td
                            style={{
                              width: colWidths.sell,
                              minWidth: colWidths.sell,
                              maxWidth: colWidths.sell,
                            }}
                            className={`${cellBase} text-[12px] font-mono text-[#00d4aa]`}
                          >
                            ${fmt(r.sell_price)}
                          </td>
                        </>
                      )}

                      <td
                        style={{
                          width: colWidths.threshold,
                          minWidth: colWidths.threshold,
                          maxWidth: colWidths.threshold,
                        }}
                        className={`${cellBase} text-[12px] font-mono text-[#4a5568]`}
                      >
                        {p?.threshold ?? 0}
                      </td>

                      <td
                        style={{
                          width: colWidths.status,
                          minWidth: colWidths.status,
                          maxWidth: colWidths.status,
                        }}
                        className={canEdit ? cellBase : lastCellBase}
                      >
                        {r.on_hand === 0 ? (
                          <span className="inline-flex rounded border border-[#ff4757]/20 bg-[#ff4757]/10 px-2 py-0.5 text-[11px] font-mono font-bold text-[#ff4757]">
                            {tr.finished}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex rounded border border-[#ffa502]/20 bg-[#ffa502]/10 px-2 py-0.5 text-[11px] font-mono font-bold text-[#ffa502]">
                            {tr.low}
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-[#00d4aa]/20 bg-[#00d4aa]/10 px-2 py-0.5 text-[11px] font-mono font-bold text-[#00d4aa]">
                            {tr.normal}
                          </span>
                        )}
                      </td>

                      {canEdit && (
                        <td
                          style={{
                            width: colWidths.actions,
                            minWidth: colWidths.actions,
                            maxWidth: colWidths.actions,
                          }}
                          className={lastCellBase}
                        >
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => openEdit(r)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1e2535] text-xs text-[#0095ff] transition-all hover:border-[#0095ff] hover:bg-[#0095ff]/10"
                              title="Tahrirlash"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => setDeleteRow(r)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#1e2535] text-xs text-[#ff4757] transition-all hover:border-[#ff4757] hover:bg-[#ff4757]/10"
                              title="O'chirish"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {zoomImg && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setZoomImg(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={zoomImg}
              alt="zoom"
              className="max-h-[85vh] max-w-[85vw] rounded-2xl border border-[#1e2535] object-contain shadow-[0_0_80px_rgba(0,212,170,0.2)]"
            />
            <button
              onClick={() => setZoomImg(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-[#1e2535] bg-[#131720] text-sm text-[#8896ae] transition-all hover:border-[#ff4757] hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="max-h-[90vh] w-[600px] max-w-[95vw] overflow-y-auto rounded-2xl border border-[#28324a] bg-[#0d1018] p-7">
            <div className="mb-1 flex items-center justify-between text-[17px] font-black">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#0095ff]" />
                Stock tahrirlash
              </div>
              <button
                onClick={() => setEditRow(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2535] text-[#4a5568] transition-all hover:border-[#ff4757] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-5 text-[12px] font-mono text-[#4a5568]">
              {editRow.products?.sku || '—'} — {editRow.products?.name || 'Unknown'}
            </div>

            {savedMsg && (
              <div className="mb-4 rounded-xl border border-[#00d4aa]/25 bg-[#00d4aa]/10 px-4 py-2.5 text-[13px] text-[#00d4aa]">
                ✅ Saqlandi!
              </div>
            )}

            {saveError && (
              <div className="mb-4 rounded-xl border border-[#ff4757]/25 bg-[#ff4757]/10 px-4 py-2.5 text-[13px] text-[#ff4757]">
                ⚠️ {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Qoldiq (on hand)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.on_hand}
                  onChange={e => handleEditFormChange('on_hand', e.target.value)}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Rezerv
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.reserved}
                  onChange={e => handleEditFormChange('reserved', e.target.value)}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Tan narxi ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.cost_price}
                  onChange={e => handleEditFormChange('cost_price', e.target.value)}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Sotuv narxi ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.sell_price}
                  onChange={e => handleEditFormChange('sell_price', e.target.value)}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                />
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Min zaxira (threshold)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editForm.threshold}
                  onChange={e => handleEditFormChange('threshold', e.target.value)}
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                />
              </div>
            </div>

            {editRow.products && renderWarehouseParams(editRow.products.warehouse_id, editForm.attrs)}

            <div className="mt-6 flex justify-end gap-2 border-t border-[#1e2535] pt-5">
              <button
                onClick={() => setEditRow(null)}
                className="rounded-xl border border-[#1e2535] px-5 py-2.5 text-[13px] font-semibold text-[#8896ae] transition-all hover:border-[#28324a]"
              >
                Yopish
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-[#0095ff] px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:bg-[#1aa3ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saqlanmoqda...' : '💾 Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="w-[420px] max-w-[95vw] rounded-2xl border border-[#28324a] bg-[#0d1018] p-7">
            <div className="mb-4 flex items-center justify-between text-[17px] font-black">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#ff4757]" />
                Stock yozuvini o'chirish
              </div>
              <button
                onClick={() => setDeleteRow(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2535] text-[#4a5568] transition-all hover:border-[#ff4757] hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="mb-1 text-[14px] text-[#8896ae]">
              <strong className="text-white">{deleteRow.products?.name || 'Unknown'}</strong> stock yozuvi
              o'chiriladi!
            </p>
            <p className="text-[12px] text-[#ff4757]">Bu amalni qaytarib bo'lmaydi.</p>

            <div className="mt-6 flex justify-end gap-2 border-t border-[#1e2535] pt-5">
              <button
                onClick={() => setDeleteRow(null)}
                className="rounded-xl border border-[#1e2535] px-5 py-2.5 text-[13px] font-semibold text-[#8896ae] transition-all hover:border-[#28324a]"
              >
                Bekor
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl border border-[#ff4757]/30 bg-[#ff4757]/20 px-5 py-2.5 text-[13px] font-bold text-[#ff4757] transition-all hover:bg-[#ff4757]/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "O'chirilmoqda..." : "O'chirish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}