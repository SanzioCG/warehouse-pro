import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

interface TransactionRow {
  id: string
  created_at: string
  product_id: string | null
  stock_id: string | null
  warehouse_id: string | null
  qty: number
  type: string
  products: {
    name: string | null
    unit: string | null
  } | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumberOrZero(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeTransactionRow(value: unknown): TransactionRow | null {
  if (!isRecord(value)) return null

  const products = isRecord(value.products)
    ? {
        name: value.products.name != null ? String(value.products.name) : null,
        unit: value.products.unit != null ? String(value.products.unit) : null,
      }
    : null

  return {
    id: String(value.id ?? ''),
    created_at: String(value.created_at ?? ''),
    product_id: value.product_id != null ? String(value.product_id) : null,
    stock_id: value.stock_id != null ? String(value.stock_id) : null,
    warehouse_id: value.warehouse_id != null ? String(value.warehouse_id) : null,
    qty: toNumberOrZero(value.qty),
    type: String(value.type ?? ''),
    products,
  }
}

function normalizeTransactionRows(value: unknown): TransactionRow[] {
  if (!Array.isArray(value)) return []

  return value
    .map(normalizeTransactionRow)
    .filter((row): row is TransactionRow => row !== null)
}

export default function Transactions({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [rows, setRows] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canDelete = ['leader', 'manager_saidaziz', 'manager_eldor'].includes(user.role)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          created_at,
          product_id,
          stock_id,
          warehouse_id,
          qty,
          type,
          products(name, unit)
        `)
        .in('warehouse_id', role.warehouses)
        .order('created_at', { ascending: false })

      if (error) throw error

      setRows(normalizeTransactionRows(data))
    } catch (error) {
      console.error('Transactions yuklanmadi:', error)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handleDeleteTransaction = useCallback(
    async (row: TransactionRow) => {
      const confirmed = window.confirm("Haqiqatan ham bu chiqimni o‘chirmoqchimisiz?")
      if (!confirmed) return

      setDeletingId(row.id)

      try {
        const isOutTransaction = row.type === 'out' || row.type === 'sale'

        // 1) Agar bu chiqim bo‘lsa, stockga qty ni qaytaramiz
        if (isOutTransaction) {
          if (!row.stock_id) {
            throw new Error("transactions jadvalida stock_id yo'q. Chiqimni stockga qaytarish uchun stock_id kerak.")
          }

          const { data: stockRow, error: stockReadError } = await supabase
            .from('stock')
            .select('id, on_hand')
            .eq('id', row.stock_id)
            .single()

          if (stockReadError) throw stockReadError
          if (!stockRow) throw new Error('Stock topilmadi')

          const restoredOnHand = toNumberOrZero(stockRow.on_hand) + toNumberOrZero(row.qty)

          const { error: stockUpdateError } = await supabase
            .from('stock')
            .update({ on_hand: restoredOnHand })
            .eq('id', row.stock_id)

          if (stockUpdateError) throw stockUpdateError
        }

        // 2) Transactionni delete qilamiz
        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', row.id)

        if (deleteError) throw deleteError

        // 3) Audit log
        const { error: auditError } = await supabase
          .from('audit_logs')
          .insert([
            {
              user_role: user.role,
              user_name: user.name,
              action: 'transaction_deleted',
              entity: 'transactions',
              record_id: row.id,
              detail: `Transaction o'chirildi: ${row.products?.name || 'Unknown'} | qty: ${row.qty} | type: ${row.type}`,
            },
          ])

        if (auditError) throw auditError

        // 4) local state update
        setRows(prev => prev.filter(item => item.id !== row.id))
      } catch (error) {
        console.error("Transaction o'chirishda xatolik:", error)
        alert(error instanceof Error ? error.message : "Transaction o'chirishda xatolik yuz berdi")
      } finally {
        setDeletingId(null)
      }
    },
    [user.name, user.role]
  )

  return (
    <div className="rounded-2xl border border-[#1e2535] bg-[#0d1018] p-6">
      <h2 className="mb-4 text-lg font-bold">{tr.transactions}</h2>

      {loading ? (
        <div className="text-[#8896ae]">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-[#8896ae]">{tr.noData}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] text-[#8896ae]">
              <th className="pb-2">#</th>
              <th className="pb-2">{tr.date}</th>
              <th className="pb-2">{tr.product}</th>
              <th className="pb-2">{tr.qty}</th>
              <th className="pb-2">{tr.type}</th>
              {canDelete && <th className="pb-2 text-right">Amal</th>}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-t border-[#1e2535]">
                <td className="py-3 text-[12px] text-[#8896ae]">{index + 1}</td>
                <td className="py-3 text-[13px]">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="py-3 text-[13px]">{row.products?.name || '—'}</td>
                <td className="py-3 text-[13px] font-mono">{row.qty}</td>
                <td className="py-3 text-[13px]">{row.type}</td>

                {canDelete && (
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleDeleteTransaction(row)}
                      disabled={deletingId === row.id}
                      className="rounded-xl border border-[#ff4757]/30 bg-[#ff4757]/10 px-3 py-1.5 text-[12px] font-semibold text-[#ff4757] transition-all hover:bg-[#ff4757]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === row.id ? "O'chirilmoqda..." : "O'chirish"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}