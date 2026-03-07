import type { Role, Language } from '../types'

interface RoleConfig {
  label: Record<Language, string>
  icon: string
  color: string
  warehouses: string[]
  pages: string[]
  canSeeCost: boolean
  canSeeProfit: boolean
  canAddProduct: boolean
  canAddClient: boolean
  canDeleteClient: boolean
}

export const ROLES: Record<Role, RoleConfig> = {
  leader: {
    label: { uz: 'Hasan — Rahbar', ru: 'Хасан — Руководитель', en: 'Hasan — Leader' },
    icon: '👑', color: '#ffd700',
    warehouses: ['panels', 'profiles', 'furniture', 'doors'],
    pages: ['dashboard', 'stock', 'lowstock', 'receiving', 'issuance', 'profit', 'transactions', 'debts', 'clients', 'audit'],
    canSeeCost: true, canSeeProfit: true,
    canAddProduct: false,
    canAddClient: true,
    canDeleteClient: true,
  },
  manager_saidaziz: {
    label: { uz: 'Saidaziz — Menejer', ru: 'Саидазиз — Менеджер', en: 'Saidaziz — Manager' },
    icon: '🪵', color: '#00d4aa',
    warehouses: ['panels', 'profiles', 'furniture'],
    pages: ['dashboard', 'products', 'stock', 'lowstock', 'receiving', 'issuance', 'transactions', 'debts', 'clients', 'audit'],
    canSeeCost: true, canSeeProfit: true,
    canAddProduct: true,
    canAddClient: true,
    canDeleteClient: true,
  },
  manager_eldor: {
    label: { uz: 'Eldor — Menejer', ru: 'Элдор — Менеджер', en: 'Eldor — Manager' },
    icon: '🚪', color: '#a55eea',
    warehouses: ['doors'],
    pages: ['dashboard', 'products', 'stock', 'lowstock', 'receiving', 'issuance', 'transactions', 'debts', 'clients', 'audit'],
    canSeeCost: true, canSeeProfit: true,
    canAddProduct: true,
    canAddClient: true,
    canDeleteClient: true,
  },
  seller: {
    label: { uz: 'Sotuvchi', ru: 'Продавец', en: 'Seller' },
    icon: '💼', color: '#2ed573',
    warehouses: ['panels', 'profiles', 'furniture', 'doors'],
    pages: ['dashboard', 'stock', 'issuance', 'transactions', 'debts', 'clients'],
    canSeeCost: false, canSeeProfit: false,
    canAddProduct: false,
    canAddClient: true,
    canDeleteClient: false,
  },
  operator: {
    label: { uz: 'Operator', ru: 'Оператор', en: 'Operator' },
    icon: '🔧', color: '#747d8c',
    warehouses: ['panels', 'profiles', 'furniture', 'doors'],
    pages: ['stock', 'issuance'],
    canSeeCost: false, canSeeProfit: false,
    canAddProduct: false,
    canAddClient: false,
    canDeleteClient: false,
  },
}

export const WAREHOUSES = [
  { id: 'panels',    name: 'Decorative Panels', icon: '🪵', color: '#00d4aa' },
  { id: 'profiles',  name: 'Aluminum Profiles', icon: '🔩', color: '#0095ff' },
  { id: 'furniture', name: 'Furniture',          icon: '🪑', color: '#ffa502' },
  { id: 'doors',     name: 'Doors',              icon: '🚪', color: '#a55eea' },
]

export const WAREHOUSE_PARAMS: Record<string, { key: string; label: string; type: string }[]> = {
  panels: [
    { key: 'texture',   label: 'Texture',        type: 'text'   },
    { key: 'thickness', label: 'Thickness (mm)',  type: 'number' },
    { key: 'width',     label: 'Width (mm)',      type: 'number' },
    { key: 'length',    label: 'Length (mm)',     type: 'number' },
  ],
  profiles: [
    { key: 'color',  label: 'Color',        type: 'text'   },
    { key: 'length', label: 'Length (mm)',  type: 'number' },
  ],
  furniture: [
    { key: 'material', label: 'Material', type: 'text'   },
    { key: 'color',    label: 'Color',    type: 'text'   },
    { key: 'width',    label: 'Width',    type: 'number' },
    { key: 'height',   label: 'Height',   type: 'number' },
  ],
  doors: [
    { key: 'material', label: 'Material',     type: 'text'   },
    { key: 'color',    label: 'Color',        type: 'text'   },
    { key: 'width',    label: 'Width (mm)',   type: 'number' },
    { key: 'height',   label: 'Height (mm)', type: 'number' },
  ],
}