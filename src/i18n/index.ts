import { uz } from './uz'
import { ru } from './ru'
import { en } from './en' // 1. Buni qo'shing
import type { Language } from '../types'

// 2. en ni bu yerga ham qo'shing
export const translations = { uz, ru, en } 

export function t(lang: Language) {
  // 3. Tip xavfsizligi uchun as keyof dan foydalanamiz
  return (translations as any)[lang] ?? uz
}