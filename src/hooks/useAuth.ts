import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Role } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session.user.id)
      else { setUser(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      setUser({ name: data.full_name, role: data.role as Role })
    }
    setLoading(false)
  }

  async function login(username: string, password: string): Promise<string | null> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', username)
      .single()

    if (!profile?.email) {
      return 'Foydalanuvchi topilmadi!'
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password,
    })

    if (error) return 'Login yoki parol noto\'g\'ri!'
    return null
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return { user, loading, login, logout }
}
