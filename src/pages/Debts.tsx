import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

export default function Debts({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [debts, setDebts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState<any>(null)
  const [payAmount, setPayAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')

  const fetchDebts = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('debts')
        .select('*, clients(name), products(name, unit)')
        .in('warehouse_id', role.warehouses)
        .order('created_at', { ascending: false })
      setDebts(data || [])
    } finally {
      setLoading(false)
    }
  }, [role.warehouses])

  useEffect(() => { fetchDebts() }, [fetchDebts])

  // Statistikani xotirada saqlash
  const stats = useMemo(() => {
    const openDebts = debts.filter(d => d.status === 'open')
    return {
      totalOpenSum: openDebts.reduce((a, d) => a + (d.total - d.paid), 0),
      openCount: openDebts.length,
      closedCount: debts.filter(d => d.status === 'closed').length
    }
  }, [debts])

  const filtered = useMemo(() => {
    return debts.filter(d => filter === 'all' || d.status === filter)
  }, [debts, filter])

  async function handlePay() {
    const amount = Number(payAmount)
    const remaining = payModal.total - payModal.paid

    if (!amount || !payModal || amount <= 0) return
    
    // To'lov summasini tekshirish
    if (amount > remaining) {
      alert(`Xato: To'lov miqdori qolgan qarzdan (${remaining}) ko'p bo'lishi mumkin emas!`)
      return
    }

    setSaving(true)
    try {
      const newPaid = payModal.paid + amount
      const newStatus = newPaid >= payModal.total ? 'closed' : 'open'

      const { error: updateError } = await supabase
        .from('debts')
        .update({ paid: newPaid, status: newStatus })
        .eq('id', payModal.id)

      if (updateError) throw updateError

      // Audit Log
      await supabase.from('audit_logs').insert([{
        user_role: user.role,
        user_name: user.name,
        action: 'debt_paid',
        entity: 'debt',
        record_id: payModal.id,
        detail: `To'lov qilindi: $${amount.toLocaleString()} — Mijoz: ${payModal.clients?.name}`,
      }])

      // State-ni yangilash
      setDebts(prev => prev.map(d => d.id === payModal.id ? { ...d, paid: newPaid, status: newStatus } : d))
      setPayModal(null)
      setPayAmount('')
    } catch (err) {
      alert("To'lovni saqlashda xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => n?.toLocaleString('uz-UZ')
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="pt-4">
      {/* Statistika kartochkalari */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ff4757]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Ochiq qarzlar</div>
          <div className="text-2xl font-black text-[#ff4757] font-mono">${fmt(stats.totalOpenSum)}</div>
        </div>

        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffa502]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Qarzdorlar soni</div>
          <div className="text-2xl font-black text-[#ffa502] font-mono">{stats.openCount} ta</div>
        </div>

        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00d4aa]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Muvaffaqiyatli yopilgan</div>
          <div className="text-2xl font-black text-[#00d4aa] font-mono">{stats.closedCount} ta</div>
        </div>
      </div>

      {/* Filtrlar */}
      <div className="flex gap-2 mb-5">
        {(['all', 'open', 'closed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-xl text-[12px] font-bold border transition-all ${
              filter === f ? 'bg-[#00d4aa] text-[#050e0c] border-[#00d4aa]' : 'bg-[#131720] border-[#1e2535] text-[#8896ae] hover:border-[#28324a]'
            }`}
          >
            {f === 'all' ? 'Barchasi' : f === 'open' ? tr.open : tr.closed}
          </button>
        ))}
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#ffa502]" />
          <span className="font-bold text-[15px]">{tr.debts} ({filtered.length})</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#0d1018]">
                {[tr.client, tr.name, tr.qty, tr.total, tr.paidAmount, tr.remaining, tr.dueDate, 'Holat', ''].map(h => (
                  <th key={h} className="px-5 py-4 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-widest border-b border-[#1e2535]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-20 text-[#4a5568] animate-pulse">Yuklanmoqda...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-20 text-[#4a5568]">{tr.noData}</td></tr>
              ) : filtered.map(d => {
                const remaining = d.total - d.paid
                const isOverdue = d.status === 'open' && d.due_date && d.due_date < today

                return (
                  <tr key={d.id} className={`border-b border-[#1e2535] hover:bg-[#131720]/50 transition-all ${isOverdue ? 'bg-red-500/5' : ''}`}>
                    <td className="px-5 py-4 font-bold text-[14px] text-white">{d.clients?.name}</td>
                    <td className="px-5 py-4 text-[13px] text-[#8896ae]">{d.products?.name}</td>
                    <td className="px-5 py-4 font-mono text-[12px] text-[#8896ae]">{d.qty} {d.products?.unit}</td>
                    <td className="px-5 py-4 font-mono font-bold text-white">${fmt(d.total)}</td>
                    <td className="px-5 py-4 font-mono text-[#00d4aa]">${fmt(d.paid)}</td>
                    <td className={`px-5 py-4 font-mono font-black ${remaining > 0 ? 'text-[#ff4757]' : 'text-[#00d4aa]'}`}>
                      ${fmt(remaining)}
                    </td>
                    <td className={`px-5 py-4 text-[11px] font-mono ${isOverdue ? 'text-[#ff4757] font-bold animate-pulse' : 'text-[#4a5568]'}`}>
                      {d.due_date ? new Date(d.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black font-mono border ${
                        d.status === 'open' ? 'bg-[#ff4757]/10 text-[#ff4757] border-[#ff4757]/20' : 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20'
                      }`}>
                        {d.status === 'open' ? 'OCHIQ' : 'YOPILGAN'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {d.status === 'open' && (
                        <button
                          onClick={() => { setPayModal(d); setPayAmount('') }}
                          className="px-4 py-2 rounded-xl bg-[#131720] border border-[#1e2535] text-[#00d4aa] text-[12px] font-bold hover:border-[#00d4aa] transition-all"
                        >
                          {tr.pay}
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

      {/* To'lov Modali */}
      {payModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-md p-4" onClick={e => e.target === e.currentTarget && setPayModal(null)}>
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-full max-w-[400px] shadow-2xl">
            <div className="text-[18px] font-black mb-6 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
              {tr.payDebt}
            </div>

            <div className="bg-[#131720] border border-[#1e2535] rounded-xl p-5 mb-5">
              <div className="font-bold text-[15px] mb-1 text-white">{payModal.clients?.name}</div>
              <div className="text-[13px] text-[#8896ae]">Qolgan qarz: <strong className="text-[#ff4757] font-mono">${fmt(payModal.total - payModal.paid)}</strong></div>
            </div>

            <div className="mb-6">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">{tr.payAmount} ($)</label>
              <input
                autoFocus
                type="number"
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[16px] font-bold text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="0.00"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end pt-6 border-t border-[#1e2535]">
              <button onClick={() => setPayModal(null)} className="px-5 py-3 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#ff4757] hover:text-[#ff4757] transition-all">{tr.cancel}</button>
              <button
                onClick={handlePay}
                disabled={saving || !payAmount}
                className="px-8 py-3 bg-[#00d4aa] text-[#050e0c] font-black rounded-xl text-[13px] hover:bg-[#00f0c0] active:scale-95 transition-all disabled:opacity-30"
              >
                {saving ? '...' : tr.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}