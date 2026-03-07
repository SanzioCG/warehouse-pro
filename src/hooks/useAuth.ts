import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { User, Role } from '../types'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Sessiyani tekshirish
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    // Auth o'zgarishlarini kuzatish
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

  async function login(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return { user, loading, login, logout }
}