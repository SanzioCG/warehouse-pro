import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { printReceipt } from '../lib/pdf'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

interface Transaction {
  id: string
  type: string
  warehouse_id: string
  product_id: string
  stock_id: string | null
  qty: number
  sell_price: number
  cost_price: number
  sale_type: 'paid' | 'debt' | 'free'
  client_id: string | null
  batch: string | null
  note: string | null
  created_at: string
  products: {
    name: string
    unit: string
  } | null
  clients: {
    name: string
  } | null
}

interface Product {
  id: string
  name: string
  unit: string
  warehouse_id: string
  cost_price: number
  sku?: string | null
}

interface Client {
  id: string
  name: string
  phone?: string
}

interface Stock {
  id: string
  product_id: string
  on_hand: number
  reserved: number
  batch: string | null
  attrs: Record<string, string> | null
  cost_price: number
  sell_price: number | null
  products?: {
    warehouse_id: string
  }
}

interface FormData {
  warehouse_id: string
  product_id: string
  stock_id: string
  qty: number | ''
  sell_price: number | ''
  sale_type: 'paid' | 'debt' | 'free'
  client_id: string
  due_date: string
  note: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toAttrs(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null

  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}

export default function Issuance({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [txs, setTxs] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [stockRows, setStockRows] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const productDropdownRef = useRef<HTMLDivElement | null>(null)

  const [form, setForm] = useState<FormData>({
    warehouse_id: role.warehouses[0] || '',
    product_id: '',
    stock_id: '',
    qty: '',
    sell_price: '',
    sale_type: 'paid',
    client_id: '',
    due_date: '',
    note: '',
  })

  //const canDelete = ['leader', 'manager_saidaziz', 'manager_eldor'].includes(user.role)

  useEffect(() => {
    fetchData()
  }, [user.role])

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!productDropdownRef.current) return
      if (!productDropdownRef.current.contains(e.target as Node)) {
        setProductDropdownOpen(false)
      }
    }

    if (productDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [productDropdownOpen])

  async function fetchData() {
    setLoading(true)
    setError(null)

    try {
      const [
        { data: txData, error: txError },
        { data: prodData, error: prodError },
        { data: clientData, error: clientError },
        { data: stockData, error: stockError },
      ] = await Promise.all([
        supabase
          .from('transactions')
          .select('*, products(name, unit), clients(name)')
          .eq('type', 'issuance')
          .in('warehouse_id', role.warehouses)
          .order('created_at', { ascending: false }),

        supabase
          .from('products')
          .select('id, name, unit, warehouse_id, cost_price, sku')
          .in('warehouse_id', role.warehouses),

        supabase
          .from('clients')
          .select('id, name')
          .order('name'),

        supabase
          .from('stock')
          .select('id, product_id, on_hand, reserved, batch, attrs, cost_price, sell_price, products!inner(warehouse_id)'),
      ])

      if (txError) throw txError
      if (prodError) throw prodError
      if (clientError) throw clientError
      if (stockError) throw stockError

      const normalizedTxs: Transaction[] = Array.isArray(txData)
        ? txData.map((tx: any) => ({
            id: String(tx.id),
            type: String(tx.type ?? ''),
            warehouse_id: String(tx.warehouse_id ?? ''),
            product_id: String(tx.product_id ?? ''),
            stock_id: tx.stock_id ? String(tx.stock_id) : null,
            qty: Number(tx.qty ?? 0),
            sell_price: Number(tx.sell_price ?? 0),
            cost_price: Number(tx.cost_price ?? 0),
            sale_type: (tx.sale_type ?? 'paid') as 'paid' | 'debt' | 'free',
            client_id: tx.client_id ? String(tx.client_id) : null,
            batch: tx.batch ? String(tx.batch) : null,
            note: tx.note ? String(tx.note) : null,
            created_at: String(tx.created_at ?? ''),
            products: tx.products
              ? {
                  name: String(tx.products.name ?? ''),
                  unit: String(tx.products.unit ?? ''),
                }
              : null,
            clients: tx.clients
              ? {
                  name: String(tx.clients.name ?? ''),
                }
              : null,
          }))
        : []

      const normalizedProducts: Product[] = Array.isArray(prodData)
        ? prodData.map((p: any) => ({
            id: String(p.id),
            name: String(p.name ?? ''),
            unit: String(p.unit ?? ''),
            warehouse_id: String(p.warehouse_id ?? ''),
            cost_price: Number(p.cost_price ?? 0),
            sku: p.sku ? String(p.sku) : null,
          }))
        : []

      const normalizedClients: Client[] = Array.isArray(clientData)
        ? clientData.map((c: any) => ({
            id: String(c.id),
            name: String(c.name ?? ''),
            phone: c.phone ? String(c.phone) : undefined,
          }))
        : []

      const normalizedStock: Stock[] = Array.isArray(stockData)
        ? stockData.map((s: any) => ({
            id: String(s.id),
            product_id: String(s.product_id ?? ''),
            on_hand: Number(s.on_hand ?? 0),
            reserved: Number(s.reserved ?? 0),
            batch: s.batch ? String(s.batch) : null,
            attrs: toAttrs(s.attrs),
            cost_price: Number(s.cost_price ?? 0),
            sell_price: s.sell_price != null ? Number(s.sell_price) : null,
            products: {
              warehouse_id: String(s.products?.warehouse_id ?? ''),
            },
          }))
        : []

      setTxs(normalizedTxs)
      setProducts(normalizedProducts)
      setClients(normalizedClients)
      setStockRows(normalizedStock)
    } catch (err) {
      console.error("Ma'lumotlarni yuklashda xatolik:", err)
      setError("Ma'lumotlarni yuklashda xatolik yuz berdi")
    } finally {
      setLoading(false)
    }
  }

  const whProducts = useMemo(
    () => products.filter(p => p.warehouse_id === form.warehouse_id),
    [products, form.warehouse_id]
  )

  const filteredWhProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()

    return whProducts.filter(p => {
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      )
    })
  }, [whProducts, productSearch])

  const productStockRows = useMemo(
    () => stockRows.filter(s => s.product_id === form.product_id && s.on_hand > 0),
    [stockRows, form.product_id]
  )

  const selectedStock = useMemo(
    () => stockRows.find(s => s.id === form.stock_id),
    [stockRows, form.stock_id]
  )

  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id) || null,
    [products, form.product_id]
  )

  const getVariantLabel = useCallback((s: Stock) => {
    const attrs = s.attrs || {}
    const parts = Object.values(attrs).filter(Boolean)
    const razmer = parts.length > 0 ? parts.join(' × ') : ''
    const batch = s.batch ? `LOT: ${s.batch}` : ''
    const price = s.sell_price ? `$${s.sell_price.toLocaleString()}` : ''
    const qty = `${s.on_hand} dona`
    return [razmer, batch, price, qty].filter(Boolean).join(' | ')
  }, [])

  const onProductChange = useCallback((product_id: string) => {
    const rows = stockRows.filter(s => s.product_id === product_id && s.on_hand > 0)

    if (rows.length === 1) {
      setForm(prev => ({
        ...prev,
        product_id,
        stock_id: rows[0].id,
        sell_price: rows[0].sell_price || '',
      }))
    } else {
      setForm(prev => ({
        ...prev,
        product_id,
        stock_id: '',
        sell_price: '',
      }))
    }

    setProductDropdownOpen(false)
    setProductSearch('')
  }, [stockRows])

  const onStockChange = useCallback((stock_id: string) => {
    const stock = stockRows.find(r => r.id === stock_id)
    setForm(prev => ({
      ...prev,
      stock_id,
      sell_price: stock?.sell_price || '',
    }))
  }, [stockRows])

  const handleFormChange = useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }, [])

  const resetForm = useCallback(() => {
    setForm({
      warehouse_id: role.warehouses[0] || '',
      product_id: '',
      stock_id: '',
      qty: '',
      sell_price: '',
      sale_type: 'paid',
      client_id: '',
      due_date: '',
      note: '',
    })
    setSubmitError(null)
    setProductDropdownOpen(false)
    setProductSearch('')
  }, [role.warehouses])

  const openModal = useCallback(() => {
    resetForm()
    setModal(true)
  }, [resetForm])

  const closeModal = useCallback(() => {
    setModal(false)
    setProductDropdownOpen(false)
    setProductSearch('')
    setSubmitError(null)
  }, [])

  const validateForm = useCallback((): string | null => {
    if (!form.product_id) return 'Mahsulot tanlanmagan'
    if (!form.stock_id) return 'Variant tanlanmagan'
    if (!form.qty) return 'Miqdor kiritilmagan'

    const qty = Number(form.qty)
    if (isNaN(qty) || qty <= 0) return "Miqdor noto'g'ri"

    if (selectedStock && qty > selectedStock.on_hand) {
      return "Mavjud miqdordan ko'p kiritildi"
    }

    if (form.sale_type === 'debt' && !form.client_id) {
      return 'Qarz uchun mijoz tanlanishi kerak'
    }

    return null
  }, [form, selectedStock])

  const handleSubmit = async () => {
    const validationError = validateForm()
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    setSaving(true)
    setSubmitError(null)

    try {
      const prod = products.find(p => p.id === form.product_id)
      if (!prod) throw new Error('Mahsulot topilmadi')
      if (!selectedStock) throw new Error('Stock varianti topilmadi')

      const client = clients.find(c => c.id === form.client_id)
      const wh = WAREHOUSES.find(w => w.id === form.warehouse_id)

      const qty = Number(form.qty)
      const sellPrice =
        form.sell_price === ''
          ? (selectedStock.sell_price || 0)
          : Number(form.sell_price)

      const costPrice = selectedStock.cost_price || prod.cost_price || 0

      if (isNaN(qty) || isNaN(sellPrice)) {
        throw new Error("Noto'g'ri son format")
      }

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert([
          {
            type: 'issuance',
            warehouse_id: form.warehouse_id,
            product_id: form.product_id,
            stock_id: selectedStock.id,
            qty,
            sell_price: sellPrice,
            cost_price: costPrice,
            sale_type: form.sale_type,
            client_id: form.client_id || null,
            batch: selectedStock.batch || null,
            note: form.note || null,
            user_role: user.role,
          },
        ])
        .select()

      if (txError) throw txError

      const newOnHand = Math.max(0, selectedStock.on_hand - qty)

      const { error: stockError } = await supabase
        .from('stock')
        .update({ on_hand: newOnHand })
        .eq('id', selectedStock.id)

      if (stockError) throw stockError

      if (form.sale_type === 'debt' && form.client_id) {
        const { error: debtError } = await supabase
          .from('debts')
          .insert([
            {
              client_id: form.client_id,
              product_id: form.product_id,
              warehouse_id: form.warehouse_id,
              qty,
              total: qty * sellPrice,
              paid: 0,
              status: 'open',
              due_date: form.due_date || null,
            },
          ])

        if (debtError) throw debtError
      }

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([
          {
            user_role: user.role,
            user_name: user.name,
            action: 'stock_issued',
            entity: 'product',
            record_id: form.product_id,
            detail: `Chiqim: ${qty} ${prod.unit} — ${prod.name} (${form.sale_type}) | Partiya: ${selectedStock.batch || '—'}`,
          },
        ])

      if (auditError) throw auditError

      if (txData?.[0]) {
        try {
          const attrs = selectedStock?.attrs || {}

          const variantText = Object.values(attrs)
            .filter(v => v != null && String(v).trim() !== '')
            .map(v => String(v))
            .join(' × ')

          const productCode = prod.sku || prod.id

          printReceipt({
            id: txData[0].id,
            date: new Date().toLocaleDateString('uz-UZ'),

            client: client?.name || '—',
            warehouse: wh?.name || '—',

            product: prod.name,
            productCode: productCode || '—',
            batch: selectedStock?.batch || '—',
            variant: variantText || '—',

            qty,
            unit: prod.unit,
            price: sellPrice,
            total: qty * sellPrice,

            saleType: form.sale_type,
            note: form.note,
            seller: user.name,
          })
        } catch (pdfError) {
          console.warn('PDF yaratishda xatolik:', pdfError)
        }
      }

      closeModal()
      resetForm()
      await fetchData()
    } catch (err) {
      console.error('Chiqim yaratishda xatolik:', err)
      setSubmitError("Xatolik yuz berdi. Qayta urinib ko'ring.")
    } finally {
      setSaving(false)
    }
  }

  const printFromHistory = useCallback((tx: Transaction) => {
    const wh2 = WAREHOUSES.find(w => w.id === tx.warehouse_id)
    const txProduct = products.find(p => p.id === tx.product_id)
    const txStock = stockRows.find(s => s.id === tx.stock_id)

    const attrs = txStock?.attrs || {}
    const variantText = Object.values(attrs)
      .filter(v => v != null && String(v).trim() !== '')
      .map(v => String(v))
      .join(' × ')

    const productCode =
      txProduct?.sku ||
      txProduct?.id ||
      tx.product_id

    try {
      printReceipt({
        id: tx.id,
        date: new Date(tx.created_at).toLocaleDateString('uz-UZ'),
        client: tx.clients?.name || '—',
        warehouse: wh2?.name || '—',

        product: tx.products?.name || txProduct?.name || '—',
        productCode: productCode || '—',
        batch: tx.batch || txStock?.batch || '—',
        variant: variantText || '—',

        qty: tx.qty,
        unit: tx.products?.unit || txProduct?.unit || '',
        price: tx.sell_price || 0,
        total: tx.qty * (tx.sell_price || 0),
        saleType: tx.sale_type,
        note: tx.note || '',
        seller: user.name,
      })
    } catch (err) {
      console.error('PDF yaratishda xatolik:', err)
    }
  }, [products, stockRows, user.name])

  const deleteIssuance = useCallback(async (tx: Transaction) => {
    const ok = window.confirm("Haqiqatan ham bu chiqimni o‘chirmoqchimisiz?")
    if (!ok) return

    setDeletingId(tx.id)

    try {
      if (!tx.stock_id) {
        throw new Error("Bu transactionda stock_id yo'q. Stockga qaytarib bo'lmaydi.")
      }

      const { data: stockRow, error: stockReadError } = await supabase
        .from('stock')
        .select('id, on_hand')
        .eq('id', tx.stock_id)
        .single()

      if (stockReadError) throw stockReadError
      if (!stockRow) throw new Error('Stock topilmadi')

      const restoredOnHand = Number(stockRow.on_hand ?? 0) + Number(tx.qty ?? 0)

      const { error: stockUpdateError } = await supabase
        .from('stock')
        .update({ on_hand: restoredOnHand })
        .eq('id', tx.stock_id)

      if (stockUpdateError) throw stockUpdateError

      const { error: txDeleteError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', tx.id)

      if (txDeleteError) throw txDeleteError

      if (tx.sale_type === 'debt' && tx.client_id) {
        await supabase
          .from('debts')
          .delete()
          .eq('client_id', tx.client_id)
          .eq('product_id', tx.product_id)
          .eq('warehouse_id', tx.warehouse_id)
          .eq('qty', tx.qty)
          .eq('status', 'open')
      }

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert([
          {
            user_role: user.role,
            user_name: user.name,
            action: 'issuance_deleted',
            entity: 'transactions',
            record_id: tx.id,
            detail: `Chiqim o'chirildi: ${tx.products?.name || 'Unknown'} | qty: ${tx.qty} | stock qaytarildi`,
          },
        ])

      if (auditError) throw auditError

      await fetchData()
    } catch (err) {
      console.error("Chiqimni o'chirishda xatolik:", err)
      alert(err instanceof Error ? err.message : "Chiqimni o'chirishda xatolik yuz berdi")
    } finally {
      setDeletingId(null)
    }
  }, [user.role, user.name])

  const saleColors: Record<string, string> = {
    paid: '#00d4aa',
    debt: '#ff4757',
    free: '#8896ae',
  }

  const saleLabels: Record<string, string> = {
    paid: tr.paid,
    debt: tr.debt,
    free: tr.free,
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-xl bg-[#ffa502] px-4 py-2.5 text-[13px] font-bold text-[#0c0800] transition-all hover:bg-[#ffb830]"
        >
          📤 {tr.newIssuance}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#ff4757]/30 bg-[#ff4757]/10 p-4 text-[13px] text-[#ff4757]">
          ⚠️ {error}
          <button
            onClick={fetchData}
            className="ml-4 rounded-lg bg-[#ff4757]/20 px-3 py-1 hover:bg-[#ff4757]/30"
          >
            Qayta urinish
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#1e2535] bg-[#0d1018]">
        <div className="flex items-center gap-2 border-b border-[#1e2535] bg-[#131720] px-5 py-3">
          <div className="h-4 w-0.5 rounded bg-[#ffa502]" />
          <span className="text-[14px] font-bold">{tr.issuance} ({txs.length})</span>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[#131720]" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="py-16 text-center text-[#4a5568]">
            <div className="mb-2 text-3xl">📤</div>
            {tr.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse">
              <thead>
                <tr>
                  {[tr.date, 'Ombor', tr.name, 'Partiya', tr.qty, tr.saleType, tr.client, tr.sellPrice, 'Chek', 'Delete'].map(h => (
                    <th
                      key={h}
                      className="border-b border-[#1e2535] bg-[#0d1018] px-4 py-3 text-left text-[10px] font-mono uppercase tracking-wider text-[#4a5568]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {txs.map(tx => {
                  const wh = WAREHOUSES.find(w => w.id === tx.warehouse_id)
                  const color = saleColors[tx.sale_type] || '#8896ae'
                  const label = saleLabels[tx.sale_type] || tx.sale_type

                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-[#1e2535] transition-all hover:bg-[#131720]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                        {new Date(tx.created_at).toLocaleDateString('uz-UZ')}
                      </td>

                      <td className="px-4 py-3">
                        {wh ? (
                          <span
                            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
                            style={{
                              background: wh.color + '18',
                              color: wh.color,
                              borderColor: wh.color + '30',
                            }}
                          >
                            {wh.icon} {wh.name}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[#4a5568]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-[13px] font-bold text-white">
                        {tx.products?.name || '—'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                        {tx.batch || '—'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-[#ffa502]">
                        −{tx.qty} {tx.products?.unit || ''}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className="inline-flex rounded border px-2 py-0.5 text-[11px] font-mono font-bold whitespace-nowrap"
                          style={{
                            background: color + '18',
                            color,
                            borderColor: color + '30',
                          }}
                        >
                          {label}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[12px] text-[#8896ae]">
                        {tx.clients?.name || '—'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[#00d4aa]">
                        ${tx.sell_price?.toLocaleString('uz-UZ')}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => printFromHistory(tx)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2535] text-sm text-[#8896ae] transition-all hover:border-[#00d4aa] hover:bg-[#00d4aa]/10 hover:text-[#00d4aa]"
                          title="Chek chop etish"
                        >
                          🖨️
                        </button>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteIssuance(tx)}
                          disabled={deletingId === tx.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2535] text-sm text-[#ff4757] transition-all hover:border-[#ff4757] hover:bg-[#ff4757]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Chiqimni o‘chirish"
                        >
                          {deletingId === tx.id ? '…' : '✕'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="max-h-[90vh] w-[700px] max-w-[95vw] overflow-y-auto rounded-2xl border border-[#28324a] bg-[#0d1018] p-7">
            <div className="mb-5 flex items-center justify-between text-[17px] font-black">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#ffa502]" />
                {tr.newIssuance}
              </div>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e2535] text-[#4a5568] transition-all hover:border-[#ff4757] hover:text-white"
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div className="mb-4 rounded-xl border border-[#ff4757]/30 bg-[#ff4757]/10 p-3 text-[12px] text-[#ff4757]">
                ⚠️ {submitError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  Ombor
                </label>
                <select
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.warehouse_id}
                  onChange={e => {
                    const nextWarehouse = e.target.value
                    setForm(prev => ({
                      ...prev,
                      warehouse_id: nextWarehouse,
                      product_id: '',
                      stock_id: '',
                      sell_price: '',
                    }))
                    setProductDropdownOpen(false)
                    setProductSearch('')
                  }}
                >
                  {WAREHOUSES.filter(w => role.warehouses.includes(w.id)).map(w => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative" ref={productDropdownRef}>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {tr.name}
                </label>

                <button
                  type="button"
                  onClick={() => setProductDropdownOpen(prev => !prev)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none transition-all hover:border-[#00d4aa]"
                >
                  <span className={form.product_id ? 'text-white' : 'text-[#8896ae]'}>
                    {form.product_id
                      ? selectedProduct?.name || '— Tanlang —'
                      : '— Tanlang —'}
                  </span>
                  <span className="text-[10px] text-[#8896ae]">▼</span>
                </button>

                {productDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#1e2535] bg-[#0f1522] shadow-2xl">
                    <div className="border-b border-[#1e2535] p-2">
                      <input
                        type="text"
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        placeholder="SKU / nom / texture qidirish..."
                        className="w-full rounded-xl border border-[#00d4aa] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#4a5568]"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-[260px] overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setForm(prev => ({
                            ...prev,
                            product_id: '',
                            stock_id: '',
                            sell_price: '',
                          }))
                          setProductDropdownOpen(false)
                          setProductSearch('')
                        }}
                        className="w-full border-b border-[#1e2535] px-3 py-2.5 text-left text-[13px] text-[#8896ae] hover:bg-[#131720]"
                      >
                        — Tanlang —
                      </button>

                      {filteredWhProducts.length === 0 ? (
                        <div className="px-3 py-4 text-[12px] text-[#4a5568]">
                          Hech narsa topilmadi
                        </div>
                      ) : (
                        filteredWhProducts.map(p => {
                          const isActive = form.product_id === p.id
                          const labelSku = p.sku || p.id

                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => onProductChange(p.id)}
                              className={`w-full border-b border-[#1e2535] px-3 py-2.5 text-left text-[13px] transition-all ${
                                isActive
                                  ? 'bg-[#0095ff] text-white'
                                  : 'text-white hover:bg-[#131720]'
                              }`}
                            >
                              <span className="font-bold">[{labelSku}]</span> {p.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {form.product_id && productStockRows.length > 0 && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                    📐 Razmer / Partiya tanlang
                  </label>
                  <select
                    className="w-full rounded-xl border border-[#ffa502]/40 bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#ffa502]"
                    value={form.stock_id}
                    onChange={e => onStockChange(e.target.value)}
                  >
                    <option value="">— Variant tanlang —</option>
                    {productStockRows.map(s => (
                      <option key={s.id} value={s.id}>
                        {getVariantLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.product_id && productStockRows.length === 0 && (
                <div className="col-span-2 rounded-xl border border-[#ff4757]/20 bg-[#ff4757]/10 px-4 py-3 text-[12px] text-[#ff4757]">
                  ⚠️ Bu mahsulot stokda mavjud emas!
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {tr.qty}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#4a5568] focus:border-[#00d4aa]"
                  placeholder="0"
                  value={form.qty}
                  onChange={e => handleFormChange('qty', e.target.value)}
                />
                {selectedStock && (
                  <div className="mt-1 text-[10px] font-mono text-[#4a5568]">
                    Mavjud: {selectedStock.on_hand} dona
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {tr.sellPrice}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#4a5568] focus:border-[#00d4aa]"
                  placeholder="0"
                  value={form.sell_price}
                  onChange={e => handleFormChange('sell_price', e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {tr.saleType}
                </label>
                <select
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.sale_type}
                  onChange={e => handleFormChange('sale_type', e.target.value as FormData['sale_type'])}
                >
                  <option value="paid">{tr.paid}</option>
                  <option value="debt">{tr.debt}</option>
                  <option value="free">{tr.free}</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                  {tr.client}
                </label>
                <select
                  className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                  value={form.client_id}
                  onChange={e => handleFormChange('client_id', e.target.value)}
                >
                  <option value="">— Tanlang —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {form.sale_type === 'debt' && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                    {tr.dueDate}
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa]"
                    value={form.due_date}
                    onChange={e => handleFormChange('due_date', e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="mt-3">
              <label className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider text-[#4a5568]">
                {tr.note}
              </label>
              <textarea
                className="h-20 w-full resize-none rounded-xl border border-[#1e2535] bg-[#131720] px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-[#4a5568] focus:border-[#00d4aa]"
                placeholder="Ixtiyoriy..."
                value={form.note}
                onChange={e => handleFormChange('note', e.target.value)}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-[#1e2535] pt-5">
              <button
                onClick={closeModal}
                className="rounded-xl border border-[#1e2535] px-5 py-2.5 text-[13px] font-semibold text-[#8896ae] transition-all hover:border-[#28324a]"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="rounded-xl bg-[#ffa502] px-5 py-2.5 text-[13px] font-bold text-[#0c0800] transition-all hover:bg-[#ffb830] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saqlanmoqda...' : tr.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}