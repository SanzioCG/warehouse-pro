import { useState } from 'react'
import type { Language } from '../types'

export function useLang() {
  const [lang, setLang] = useState<Language>('uz')
  return { lang, setLang }
}