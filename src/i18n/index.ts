import { uz } from './uz'
import { ru } from './ru'
import { en } from './en'
import type { Language } from '../types'

export const translations = { uz, ru, en }

export function t(lang: Language) {
  return translations[lang]
}