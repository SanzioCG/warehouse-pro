export type Language = 'uz' | 'ru'

export type Role =
  | 'leader'
  | 'manager_saidaziz'
  | 'manager_eldor'
  | 'seller'
  | 'operator'

export interface User {
  name: string
  role: Role
}

export interface Warehouse {
  id: string
  name: string
  icon: string
  color: string
}

export interface Product {
  id: string
  warehouse_id: string
  sku: string
  name: string
  unit: string
  sell_price: number
  cost_price: number
  threshold: number
  attrs: Record<string, string>
  created_at?: string
}

export interface Stock {
  id: string
  product_id: string
  on_hand: number
  reserved: number
}

export interface Client {
  id: string
  name: string
  phone: string
  address: string
  created_at?: string
}

export interface Transaction {
  id: string
  type: 'receiving' | 'issuance'
  warehouse_id: string
  product_id: string
  qty: number
  sell_price: number
  cost_price: number
  sale_type?: 'paid' | 'debt' | 'free'
  client_id?: string
  batch?: string
  waste?: number
  note?: string
  user_role?: string
  created_at?: string
}

export interface Debt {
  id: string
  client_id: string
  product_id: string
  warehouse_id: string
  qty: number
  total: number
  paid: number
  status: 'open' | 'closed'
  due_date?: string
  created_at?: string
}

export interface AuditLog {
  id: string
  user_role: string
  user_name: string
  action: string
  entity: string
  record_id: string
  detail: string
  created_at?: string
}