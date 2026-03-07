import { useState, useEffect } from 'react'
import type { Language } from './types'
import { useAuth } from './hooks/useAuth'
import { useLang } from './hooks/useLang'
import { useNotifications } from './hooks/useNotifications'
import { supabase } from './lib/supabase'
import { ROLES } from './config/roles'
import { t } from './i18n'
import Login from './components/Layout/Login'
import Sidebar from './components/Layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Stock from './pages/Stock'
import LowStock from './pages/LowStock'
import Receiving from './pages/Receiving'
import Issuance from './pages/Issuance'
import Clients from './pages/Clients'
import Debts from './pages/Debts'
import Profit from './pages/Profit'
import Transactions from './pages/Transactions'
import Audit from './pages/Audit'

const PAGE_ICONS: Record<string, string> = {
  dashboard: '📊', products: '📦', stock: '🗃️',
  lowstock: '⚠️', receiving: '📥', issuance: '📤',
  profit: '💹', transactions: '📋', debts: '💰',
  clients: '👥', audit: '🔍',
}

export default function App() {
  const { user, loading, login, logout } = useAuth()
  const { lang, setLang } = useLang()
  const [page, setPage] = useState('dashboard')
  const [lowStockCount, setLowStockCount] = useState(0)
  const tr = t(lang)

  useNotifications(user)

  useEffect(() => {
    if (user) fetchLowStockCount()
  }, [user])

  async function fetchLowStockCount() {
    if (!user) return
    const role = ROLES[user.role]
    const { data } = await supabase
      .from('stock')
      .select('*, products(warehouse_id, threshold)')
    const count = (data || []).filter((s: any) =>
      s.products &&
      role.warehouses.includes(s.products.warehouse_id) &&
      s.on_hand <= s.products.threshold
    ).length
    setLowStockCount(count)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#07090e] flex items-center justify-center">
      <div className="text-center text-[#4a5568]">
        <div className="text-4xl mb-3 animate-pulse">📦</div>
        <div className="font-mono text-sm">Loading...</div>
      </div>
    </div>
  )

  if (!user) {
    return (
      <Login
        onLogin={login}
        lang={lang}
        setLang={setLang}
      />
    )
  }

  const role = ROLES[user.role]

  function renderPage() {
    if (!role.pages.includes(page)) {
      return (
        <div className="flex items-center justify-center h-64 text-[#4a5568]">
          <div className="text-center">
            <div className="text-4xl mb-3">🔒</div>
            <div className="font-mono text-sm">{tr.noAccess}</div>
          </div>
        </div>
      )
    }
    switch (page) {
      case 'dashboard':    return <Dashboard    user={user!} lang={lang} />
      case 'products':     return <Products     user={user!} lang={lang} />
      case 'stock':        return <Stock        user={user!} lang={lang} />
      case 'lowstock':     return <LowStock     user={user!} lang={lang} />
      case 'receiving':    return <Receiving    user={user!} lang={lang} />
      case 'issuance':     return <Issuance     user={user!} lang={lang} />
      case 'clients':      return <Clients      user={user!} lang={lang} />
      case 'debts':        return <Debts        user={user!} lang={lang} />
      case 'profit':       return <Profit       user={user!} lang={lang} />
      case 'transactions': return <Transactions user={user!} lang={lang} />
      case 'audit':        return <Audit        lang={lang} />
      default: return null
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#07090e]">
      <Sidebar
        user={user!}
        page={page}
        setPage={setPage}
        lang={lang}
        lowStockCount={lowStockCount}
        onLogout={logout}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 bg-[#0d1018] border-b border-[#1e2535] flex items-center justify-between px-7">
          <div className="text-[15px] font-black tracking-tight">
            {PAGE_ICONS[page]} {tr[page as keyof typeof tr] as string}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['uz', 'ru', 'en'] as Language[]).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono border transition-all ${
                    lang === l
                      ? 'bg-[#00d4aa] text-[#07090e] border-[#00d4aa]'
                      : 'bg-transparent border-[#1e2535] text-[#8896ae] hover:border-[#28324a]'
                  }`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-[#4a5568]">
              {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}