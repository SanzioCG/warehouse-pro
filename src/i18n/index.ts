import { uz } from './uz'
import { ru } from './ru'
import type { Language } from '../types'

export const translations = { uz, ru }

export function t(lang: Language) {
  return translations[lang] ?? uz
}