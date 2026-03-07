import { useState } from 'react'
import type { Language } from '../../types'
import { t } from '../../i18n'

interface Props {
  onLogin: (email: string, password: string) => Promise<string | null>
  lang: Language
  setLang: (l: Language) => void
}

export default function Login({ onLogin, lang, setLang }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email.trim()) { setError('Email kiriting!'); return }
    if (!password.trim()) { setError('Parol kiriting!'); return }
    setLoading(true)
    setError('')
    const err = await onLogin(email.trim(), password.trim())
    if (err) setError(err)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#07090e] flex items-center justify-center relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-[#00d4aa]/5 -top-40 -left-40 pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-[#0095ff]/4 -bottom-20 -right-20 pointer-events-none" />

      {/* Lang switcher */}
      <div className="absolute top-6 right-6 flex gap-2">
        {(['uz', 'ru', 'en'] as Language[]).map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold font-mono border transition-all ${
              lang === l
                ? 'bg-[#00d4aa] text-[#07090e] border-[#00d4aa]'
                : 'bg-transparent border-[#1e2535] text-[#8896ae] hover:border-[#28324a]'
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00d4aa] to-[#0095ff] flex items-center justify-center text-4xl mx-auto mb-4 shadow-[0_0_60px_rgba(0,212,170,0.3)]">
            📦
          </div>
          <div className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-[#00d4aa] bg-clip-text text-transparent mb-1">
            Proconcept
          </div>
          <div className="text-[11px] font-mono text-[#4a5568] tracking-[4px] uppercase">
            Ombor boshqaruv tizimi
          </div>
        </div>

        {/* Form */}
        <div className="bg-[#0d1018] border border-[#1e2535] rounded-2xl p-7">
          <div className="text-[18px] font-black mb-1">Tizimga kirish</div>
          <div className="text-[11px] font-mono text-[#4a5568] mb-6">// Email va parolingizni kiriting</div>

          {error && (
            <div className="bg-[#ff4757]/10 border border-[#ff4757]/25 rounded-xl p-3 mb-4 text-[13px] text-[#ff4757]">
              ⚠️ {error}
            </div>
          )}

          <div className="mb-3">
            <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Email</label>
            <input
              type="email"
              className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-[#00d4aa] focus:shadow-[0_0_0_3px_rgba(0,212,170,0.08)] transition-all placeholder:text-[#4a5568]"
              placeholder="email@proconcept.uz"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <div className="mb-6">
            <label className="block text-[10px] font-mono text-[#4a5568] uppercase tracking-widest mb-2">Parol</label>
            <input
              type="password"
              className="w-full bg-[#131720] border border-[#1e2535] rounded-xl px-4 py-3 text-[14px] text-white outline-none focus:border-[#00d4aa] focus:shadow-[0_0_0_3px_rgba(0,212,170,0.08)] transition-all placeholder:text-[#4a5568]"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 bg-[#00d4aa] text-[#050e0c] font-bold rounded-xl text-[14px] hover:bg-[#00f0c0] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Kirish...' : 'Kirish →'}
          </button>
        </div>
      </div>
    </div>
  )
}