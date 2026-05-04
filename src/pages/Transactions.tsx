import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES, WAREHOUSES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Transactions({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canDelete = ['leader', 'manager_saidaziz', 'manager_eldor'].includes(user.role)

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          products(name, unit, sku),
          clients(name)
        `)
        .in('warehouse_id', role.warehouses)
        .order('created_at', { ascending: false })
        .limit(150)

      if (error) throw error
      setRows(data || [])
    } catch (error) {
      console.error('Transactions error:', error)
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const handleDelete = async (row: any) => {
    if (!canDelete) return alert("Ruxsat yo'q!")
    if (!window.confirm("Ushbu operatsiyani o'chirmoqchimisiz? (Ombordagi qoldiq avtomatik to'g'irlanadi)")) return

    setDeletingId(row.id)
    try {
      // 1. Ombordagi qoldiqni topish
      const { data: stockRow } = await supabase
        .from('stock')
        .select('id, on_hand')
        .eq('id', row.stock_id)
        .single()

      if (stockRow) {
        let newQty = stockRow.on_hand
        
        // MANTIQ: 
        // Agar o'chirilayotgan narsa CHIQIM bo'lsa -> stock ko'payadi (+)
        // Agar o'chirilayotgan narsa KIRIM bo'lsa -> stock kamayadi (-)
        if (row.type === 'issuance' || row.type === 'sale') {
          newQty += row.qty
        } else if (row.type === 'receiving') {
          newQty -= row.qty
        }

        // 2. Stockni yangilash
        await supabase.from('stock').update({ on_hand: newQty }).eq('id', stockRow.id)
      }

      // 3. Tranzaksiyani o'chirish
      await supabase.from('transactions').delete().eq('id', row.id)

      // 4. Audit Log
      await supabase.from('audit_logs').insert([{
        user_role: user.role,
        user_name: user.name,
        action: 'transaction_deleted',
        entity: 'transactions',
        detail: `O'chirildi: ${row.type === 'receiving' ? 'Kirim' : 'Chiqim'} | ${row.products?.name} | Miqdor: ${row.qty}`,
      }])

      setRows(prev => prev.filter(r => r.id !== row.id))
    } catch (err) {
      alert("O'chirishda xatolik yuz berdi")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="pt-4">
      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-[#1e2535] bg-[#131720] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-[#0095ff] rounded" />
            <span className="font-bold text-[16px] text-white uppercase tracking-tight">{tr.transactions}</span>
          </div>
          <span className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">So'nggi 150 ta operatsiya</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#0d1018]">
                {['Vaqt', 'Tur', 'Mahsulot', 'Mijoz/Izoh', 'Miqdor', 'Narx', ''].map(h => (
                  <th key={h} className="px-6 py-4 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-widest border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-20 animate-pulse text-[#4a5568]">Yuklanmoqda...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-20 text-[#4a5568]">{tr.noData}</td></tr>
              ) : rows.map((row, idx) => {
                const isOut = row.type === 'issuance' || row.type === 'sale'
                const wh = WAREHOUSES.find(w => w.id === row.warehouse_id)

                return (
                  <tr key={row.id} className="border-b border-[#1e2535] hover:bg-[#131720]/50 transition-all">
                    <td className="px-6 py-4 text-[11px] font-mono text-[#4a5568]">
                      {new Date(row.created_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black font-mono border ${
                        isOut ? 'bg-[#ffa502]/10 text-[#ffa502] border-[#ffa502]/20' : 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20'
                      }`}>
                        {isOut ? '📤 CHIQIM' : '📥 KIRIM'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-[13px] text-white">{row.products?.name}</div>
                      <div className="text-[10px] text-[#4a5568] font-mono uppercase tracking-tighter">
                        {wh?.icon} {wh?.name} • SKU: {row.products?.sku || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[12px] text-[#8896ae] font-semibold">{row.clients?.name || '—'}</div>
                      {row.note && <div className="text-[10px] text-[#4a5568] italic">"{row.note}"</div>}
                    </td>
                    <td className={`px-6 py-4 font-mono font-black text-[14px] ${isOut ? 'text-[#ff4757]' : 'text-[#00d4aa]'}`}>
                      {isOut ? '-' : '+'}{row.qty} <span className="text-[10px] font-normal opacity-50">{row.products?.unit}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[12px] text-white">
                      ${(row.sell_price || row.cost_price || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#1e2535] text-[#ff4757] hover:bg-[#ff4757]/10 hover:border-[#ff4757] transition-all"
                          title="O'chirish"
                        >
                          {deletingId === row.id ? '...' : '✕'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}