import type { User, Language } from '../../types'
import { t } from '../../i18n'
import { ROLES } from '../../config/roles'

interface NavSection { section: string }
interface NavItem { key: string; icon: string; badge?: boolean }
type NavEntry = NavSection | NavItem

const NAV_ITEMS: NavEntry[] = [
  { section: 'main' },
  { key: 'dashboard', icon: '📊' },
  { section: 'inventory' },
  { key: 'products', icon: '📦' },
  { key: 'stock', icon: '🗃️' },
  { key: 'lowstock', icon: '⚠️', badge: true },
  { section: 'operations' },
  { key: 'receiving', icon: '📥' },
  { key: 'issuance', icon: '📤' },
  { section: 'reports' },
  { key: 'profit', icon: '💹' },
  { key: 'transactions', icon: '📋' },
  { key: 'debts', icon: '💰' },
  { key: 'clients', icon: '👥' },
  { section: 'system' },
  { key: 'audit', icon: '🔍' },
]

const SECTIONS: Record<string, Record<Language, string>> = {
  main:       { uz: 'Asosiy',        ru: 'Главная' },
  inventory:  { uz: 'Inventar',      ru: 'Инвентарь' },
  operations: { uz: 'Operatsiyalar', ru: 'Операции' },
  reports:    { uz: 'Hisobotlar',    ru: 'Отчёты' },
  system:     { uz: 'Tizim',         ru: 'Система' },
}

interface Props {
  user: User
  page: string
  setPage: (p: string) => void
  lang: Language
  lowStockCount: number
  onLogout: () => void
}

export default function Sidebar({ user, page, setPage, lang, lowStockCount, onLogout }: Props) {
  const tr = t(lang)
  const role = ROLES[user.role]

  return (
    <div className="w-60 min-w-[240px] bg-[#0d1018] border-r border-[#1e2535] flex flex-col h-screen overflow-y-auto">
      {/* Brand */}
      <div className="p-4 border-b border-[#1e2535] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00d4aa] to-[#0095ff] flex items-center justify-center text-lg flex-shrink-0">
          📦
        </div>
        <div>
          <div className="font-black text-[15px] tracking-tight">{tr.appName}</div>
          <div className="text-[10px] text-[#4a5568] font-mono mt-0.5">ERP v1.0</div>
        </div>
      </div>

      {/* User */}
      <div className="px-4 py-3 border-b border-[#1e2535] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#131720] border border-[#1e2535] flex items-center justify-center text-sm flex-shrink-0">
          {role.icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{user.name}</div>
          <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: role.color }}>
            {role.label[lang]}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={i} className="px-4 pt-4 pb-1 text-[10px] font-mono text-[#4a5568] uppercase tracking-widest">
                {SECTIONS[item.section]?.[lang]}
              </div>
            )
          }

          if (!role.pages.includes(item.key)) return null

          const isActive = page === item.key
          return (
            <div
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`mx-2 my-0.5 px-3 py-2 rounded-lg flex items-center gap-2 cursor-pointer text-[13px] font-semibold transition-all border ${
                isActive
                  ? 'bg-[#00d4aa]/10 text-[#00d4aa] border-[#00d4aa]/20'
                  : 'text-[#8896ae] border-transparent hover:bg-[#131720] hover:text-white'
              }`}
            >
              <span className="w-5 text-center text-sm">{item.icon}</span>
              <span className="truncate">{tr[item.key as keyof typeof tr] as string}</span>
              {item.badge && lowStockCount > 0 && (
                <span className="ml-auto text-[10px] font-mono bg-[#ff4757] text-white px-1.5 py-0.5 rounded flex-shrink-0">
                  {lowStockCount}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Logout */}
      <div className="p-3 border-t border-[#1e2535]">
        <button
          onClick={onLogout}
          className="w-full py-2 rounded-lg border border-[#1e2535] text-[#8896ae] text-[12px] font-semibold hover:border-[#ff4757] hover:text-[#ff4757] transition-all"
        >
          ⏻ {tr.logout}
        </button>
      </div>
    </div>
  )
}