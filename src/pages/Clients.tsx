import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props { user: User; lang: Language }

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)

  if (!digits) return ''
  if (digits.length <= 3) return `+${digits}`
  if (digits.length <= 5) return `+${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`
  if (digits.length <= 10) return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`
}

export default function Clients({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('name')
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search.replace(/\D/g, ''))
  )

  async function handleSave() {
    if (!form.name) return
    setSaving(true)

    const cleanPhone = (form.phone || '').replace(/\D/g, '').slice(0, 12)

    if (modal === 'add') {
      const { data } = await supabase.from('clients').insert([{
        name: form.name,
        phone: cleanPhone,
        address: form.address || ''
      }]).select()

      if (data) setClients(prev => [...prev, data[0]])

      await supabase.from('audit_logs').insert([{
        user_role: user.role, user_name: user.name,
        action: 'client_created', entity: 'client',
        record_id: data?.[0]?.id,
        detail: `Mijoz qo'shildi: ${form.name}`,
      }])
    } else {
      await supabase.from('clients').update({
        name: form.name,
        phone: cleanPhone,
        address: form.address
      }).eq('id', form.id)

      setClients(prev => prev.map(c => c.id === form.id ? { ...c, ...form, phone: cleanPhone } : c))
    }

    setSaving(false)
    setModal(null)
  }

  async function handleDelete() {
    setSaving(true)
    await supabase.from('clients').delete().eq('id', form.id)
    await supabase.from('audit_logs').insert([{
      user_role: user.role, user_name: user.name,
      action: 'client_deleted', entity: 'client',
      record_id: form.id,
      detail: `Mijoz o'chirildi: ${form.name}`,
    }])
    setClients(prev => prev.filter(c => c.id !== form.id))
    setSaving(false)
    setModal(null)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5568] text-sm">🔍</span>
          <input
            className="w-full bg-[#0d1018] border border-[#1e2535] rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] transition-all placeholder:text-[#4a5568]"
            placeholder={tr.search}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {role.canAddClient && (
          <button
            onClick={() => { setForm({ name: '', phone: '', address: '' }); setModal('add') }}
            className="px-4 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all flex items-center gap-2"
          >
            ＋ {tr.addClient}
          </button>
        )}
      </div>

      <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1e2535] bg-[#131720] flex items-center gap-2">
          <div className="w-0.5 h-4 rounded bg-[#00d4aa]" />
          <span className="font-bold text-[14px]">{tr.clients} ({filtered.length})</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[#4a5568]">
            <div className="text-3xl mb-2 animate-pulse">👥</div>
            <div className="font-mono text-sm">Loading...</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['#', tr.name, tr.phone, tr.address, 'Sana', ''].map(h => (
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
                  <td colSpan={6} className="text-center py-16 text-[#4a5568]">
                    <div className="text-3xl mb-2">👥</div>
                    {tr.noData}
                  </td>
                </tr>
              ) : filtered.map((c, i) => (
                <tr key={c.id} className="border-b border-[#1e2535] hover:bg-[#131720] transition-all">
                  <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">{i + 1}</td>
                  <td className="px-4 py-3 font-bold text-[13px]">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#8896ae]">
                    {c.phone ? formatPhone(c.phone) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#8896ae]">{c.address || '—'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-[#4a5568]">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {role.canAddClient && (
                        <button
                          onClick={() => { setForm({ ...c }); setModal('edit') }}
                          className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#0095ff] hover:bg-[#0095ff]/10 hover:border-[#0095ff] transition-all flex items-center justify-center text-xs"
                        >
                          ✎
                        </button>
                      )}
                      {role.canDeleteClient && (
                        <button
                          onClick={() => { setForm(c); setModal('delete') }}
                          className="w-7 h-7 rounded-lg border border-[#1e2535] text-[#ff4757] hover:bg-[#ff4757]/10 hover:border-[#ff4757] transition-all flex items-center justify-center text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && modal !== 'delete' && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[420px] max-w-[95vw]">
            <div className="text-[17px] font-black mb-5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00d4aa]" />
              {modal === 'add' ? tr.addClient : tr.edit}
            </div>

            <div className="mb-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">
                {tr.name}
              </label>
              <input
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="Mijoz ismi"
                value={form.name || ''}
                onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="mb-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">
                {tr.phone}
              </label>
              <input
                type="tel"
                inputMode="numeric"
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="+998 90 123 45 67"
                value={formatPhone(form.phone || '')}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
                  setForm((p: any) => ({ ...p, phone: digits }))
                }}
              />
            </div>

            <div className="mb-3">
              <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-wider mb-1.5">
                {tr.address}
              </label>
              <input
                className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-3 py-2.5 text-[13px] text-white outline-none focus:border-[#00d4aa] placeholder:text-[#4a5568]"
                placeholder="Manzil..."
                value={form.address || ''}
                onChange={e => setForm((p: any) => ({ ...p, address: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 justify-end mt-5 pt-5 border-t border-[#1e2535]">
              <button
                onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[13px] hover:bg-[#00f0c0] transition-all disabled:opacity-50"
              >
                {saving ? '...' : tr.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'delete' && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setModal(null)}
        >
          <div className="bg-[#0d1018] border border-[#28324a] rounded-2xl p-7 w-[400px]">
            <div className="text-[17px] font-black mb-4 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ff4757]" />
              {tr.delete}
            </div>
            <p className="text-[14px] text-[#8896ae]">
              <strong className="text-white">{form.name}</strong> {tr.deleteClientConfirm}
            </p>
            <p className="text-[12px] text-[#ff4757] mt-2">{tr.irreversible}</p>
            <div className="flex gap-2 justify-end mt-6 pt-5 border-t border-[#1e2535]">
              <button
                onClick={() => setModal(null)}
                className="px-5 py-2.5 rounded-xl border border-[#1e2535] text-[#8896ae] text-[13px] font-semibold hover:border-[#28324a] transition-all"
              >
                {tr.cancel}
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-5 py-2.5 bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#ff4757] font-bold rounded-xl text-[13px] hover:bg-[#ff4757]/30 transition-all disabled:opacity-50"
              >
                {saving ? '...' : tr.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}