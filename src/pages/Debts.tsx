import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

export default function Debts({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [debts, setDebts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState<any>(null)
  const [payAmount, setPayAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')

  useEffect(() => { fetchDebts() }, [])

  async function fetchDebts() {
    setLoading(true)

    const { data } = await supabase
      .from('debts')
      .select('*, clients(name), products(name, unit)')
      .in('warehouse_id', role.warehouses)
      .order('created_at', { ascending: false })

    setDebts(data || [])
    setLoading(false)
  }

  const filtered = debts.filter(d => filter === 'all' || d.status === filter)

  const totalOpen = debts
    .filter(d => d.status === 'open')
    .reduce((a, d) => a + (d.total - d.paid), 0)

  async function handlePay() {
    const amount = Number(payAmount)
    if (!amount || !payModal) return

    setSaving(true)

    const newPaid = payModal.paid + amount
    const newStatus = newPaid >= payModal.total ? 'closed' : 'open'

    await supabase
      .from('debts')
      .update({ paid: newPaid, status: newStatus })
      .eq('id', payModal.id)

    await supabase.from('audit_logs').insert([{
      user_role: user.role,
      user_name: user.name,
      action: 'debt_paid',
      entity: 'debt',
      record_id: payModal.id,
      detail: `To'lov: ${amount.toLocaleString()} so'm — ${payModal.clients?.name}`,
    }])

    setDebts(prev =>
      prev.map(d =>
        d.id === payModal.id
          ? { ...d, paid: newPaid, status: newStatus }
          : d
      )
    )

    setSaving(false)
    setPayModal(null)
    setPayAmount('')
  }

  const fmt = (n: number) => n?.toLocaleString('uz-UZ')

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ff4757]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            Ochiq qarzlar
          </div>
          <div className="text-xl font-black text-[#ff4757]">
            {fmt(totalOpen)} {tr.som}
          </div>
        </div>

        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#ffa502]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            Jami qarzlar
          </div>
          <div className="text-xl font-black text-[#ffa502]">
            {debts.filter(d => d.status === 'open').length} ta
          </div>
        </div>

        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#00d4aa]" />
          <div className="text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">
            Yopilgan
          </div>
          <div className="text-xl font-black text-[#00d4aa]">
            {debts.filter(d => d.status === 'closed').length} ta
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['all', 'open', 'closed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${
              filter === f
                ? 'bg-[#00d4aa] text-[#050e0c] border-[#00d4aa]'
                : 'bg-transparent border-[#1e2535] text-[#8896ae] hover:border-[#28324a]'
            }`}
          >
            {f === 'all' ? 'Barchasi' : f === 'open' ? tr.open : tr.closed}
          </button>
        ))}
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#ffa502]" />
          <span className="font-bold text-[14px]">
            {tr.debts} ({filtered.length})
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">💰</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[tr.client, tr.name, tr.qty, tr.total, tr.paidAmount, tr.remaining, tr.dueDate, 'Holat', ''].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-mono text-[#4a5568] uppercase tracking-wider bg-[#0d1018] border-b border-[#1e2535]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-[#4a5568]">
                    <div className="text-3xl mb-2">💰</div>
                    {tr.noData}
                  </td>
                </tr>
              ) : filtered.map(d => {
                const remaining = d.total - d.paid

                return (
                  <tr key={d.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                    <td className="px-4 py-3 font-bold text-[13px]">{d.clients?.name}</td>
                    <td className="px-4 py-3 text-[13px]">{d.products?.name}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {d.qty} {d.products?.unit}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold">{fmt(d.total)}</td>
                    <td className="px-4 py-3 font-mono text-[#00d4aa]">{fmt(d.paid)}</td>
                    <td
                      className="px-4 py-3 font-mono font-bold"
                      style={{ color: remaining > 0 ? '#ff4757' : '#00d4aa' }}
                    >
                      {fmt(remaining)}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                      {d.due_date ? new Date(d.due_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                          d.status === 'open'
                            ? 'bg-[#ff4757]/10 text-[#ff4757] border-[#ff4757]/20'
                            : 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20'
                        }`}
                      >
                        {d.status === 'open' ? tr.open : tr.closed}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.status === 'open' && (
                        <button
                          onClick={() => {
                            setPayModal(d)
                            setPayAmount('')
                          }}
                          className="px-3 py-1.5 rounded-lg border border-[#1e2535] text-[#00d4aa] text-[12px] font-bold hover:bg-[#00d4aa]/10 hover:border-[#00d4aa] transition-all"
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
        )}
      </div>

      {payModal && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setPayModal(null)}
        >
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[400px]">
            <div className="text-[17px] font-black mb-5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
              {tr.payDebt}
            </div>

            <div className="bg-[#131720] border border-[#1e2535] rounded-xl p-4 mb-4">
              <div className="font-bold text-[14px] mb-1">{payModal.clients?.name}</div>
              <div className="text-[13px] text-[#8896ae]">
                Qolgan:{' '}
                <strong className="text-[#ff4757]">
                  {fmt(payModal.total - payModal.paid)} {tr.som}
                </strong>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">
                {tr.payAmount}
              </label>
              <input
                type="number"
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="0"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end pt-5 border-t border-[#1e2535]">
              <button
                onClick={() => setPayModal(null)}
                className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all"
              >
                {tr.cancel}
              </button>

              <button
                onClick={handlePay}
                disabled={saving}
                className="px-5 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all disabled:opacity-50"
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