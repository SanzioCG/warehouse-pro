import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Language } from '../types'
import { ROLES } from '../config/roles'
import { t } from '../i18n'

interface Props {
  user: User
  lang: Language
}

export default function Transactions({ user, lang }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTransactions()
  }, [])

  async function fetchTransactions() {
    setLoading(true)

    const { data } = await supabase
      .from('transactions')
      .select(`
        *,
        products(name, unit)
      `)
      .in('warehouse_id', role.warehouses)
      .order('created_at', { ascending: false })

    setRows(data || [])
    setLoading(false)
  }

  return (
    <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-6">
      <h2 className="text-lg font-bold mb-4">{tr.transactions}</h2>

      {loading ? (
        <div className="text-[#8896ae]">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-[#8896ae]">{tr.noData}</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[12px] text-[#8896ae]">
              <th>{tr.date}</th>
              <th>{tr.product}</th>
              <th>{tr.qty}</th>
              <th>{tr.type}</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[#1e2535]">
                <td>{new Date(row.created_at).toLocaleDateString()}</td>
                <td>{row.products?.name}</td>
                <td>{row.qty}</td>
                <td>{row.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}