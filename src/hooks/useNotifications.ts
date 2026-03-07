import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'
import { ROLES } from '../config/roles'

export function useNotifications(user: User | null) {
  const shownRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    checkLowStock()
    const interval = setInterval(checkLowStock, 5 * 60 * 1000)

    // Operator uchun real-time
    let channel: any = null
    if (user.role === 'operator') {
      channel = supabase
        .channel('new-issuance')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions',
            filter: 'type=eq.issuance',
          },
          async (payload: any) => {
            const tx = payload.new

            // Mahsulot nomini olish
            const { data: prod } = await supabase
              .from('products')
              .select('name, unit, warehouse_id')
              .eq('id', tx.product_id)
              .single()

            if (!prod) return

            const role = ROLES[user.role]
            if (!role.warehouses.includes(prod.warehouse_id)) return

            // Mijoz nomini olish
            let clientName = '—'
            if (tx.client_id) {
              const { data: client } = await supabase
                .from('clients')
                .select('name')
                .eq('id', tx.client_id)
                .single()
              if (client) clientName = client.name
            }

            const saleLabel = tx.sale_type === 'paid' ? 'NAQD' : tx.sale_type === 'debt' ? 'QARZ' : 'TEKIN'
            const saleColor = tx.sale_type === 'paid' ? '#00d4aa' : tx.sale_type === 'debt' ? '#ff4757' : '#8896ae'

            showToast({
              title: '📤 Yangi chiqim!',
              message: `${prod.name} — ${tx.qty} ${prod.unit}`,
              sub: `Mijoz: ${clientName} • ${saleLabel}`,
              color: saleColor,
              duration: 8000,
            })
          }
        )
        .subscribe()
    }

    return () => {
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user])

  async function checkLowStock() {
    if (!user) return
    const role = ROLES[user.role]

    const { data } = await supabase
      .from('stock')
      .select('*, products(name, unit, warehouse_id, threshold)')

    const lowItems = (data || []).filter((s: any) =>
      s.products &&
      role.warehouses.includes(s.products.warehouse_id) &&
      s.on_hand <= s.products.threshold &&
      !shownRef.current.has(s.product_id)
    )

    lowItems.forEach((s: any) => {
      shownRef.current.add(s.product_id)
      showToast({
        title: s.on_hand === 0 ? '🚨 Mahsulot tugadi!' : '⚠️ Kam zaxira!',
        message: s.products.name,
        sub: `Qoldiq: ${s.on_hand} ${s.products.unit}`,
        color: s.on_hand === 0 ? '#ff4757' : '#ffa502',
        duration: 6000,
      })
    })
  }
}

let toastCount = 0

function showToast({ title, message, sub, color, duration }: {
  title: string
  message: string
  sub?: string
  color: string
  duration: number
}) {
  toastCount++
  const id = `toast-${toastCount}`

  const el = document.createElement('div')
  el.id = id
  el.style.cssText = `
    position: fixed;
    top: ${20 + (toastCount - 1) * 90}px;
    right: 20px;
    background: #0d1018;
    border: 1px solid ${color}40;
    border-left: 3px solid ${color};
    border-radius: 12px;
    padding: 14px 16px;
    font-family: Syne, sans-serif;
    z-index: 9999;
    box-shadow: 0 4px 32px rgba(0,0,0,0.5);
    min-width: 280px;
    max-width: 340px;
    animation: toastIn 0.3s ease;
    cursor: pointer;
  `

  el.innerHTML = `
    <div style="font-size:13px;font-weight:800;color:${color};margin-bottom:4px">${title}</div>
    <div style="font-size:13px;font-weight:600;color:#e2e8f4">${message}</div>
    ${sub ? `<div style="font-size:11px;color:#4a5568;margin-top:3px;font-family:monospace">${sub}</div>` : ''}
    <div style="position:absolute;bottom:0;left:0;height:2px;background:${color};border-radius:0 0 12px 12px;width:100%;animation:toastBar ${duration}ms linear forwards"></div>
  `

  const style = document.createElement('style')
  style.textContent = `
    @keyframes toastIn {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toastOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
    @keyframes toastBar {
      from { width: 100%; }
      to { width: 0%; }
    }
  `
  if (!document.getElementById('toast-styles')) {
    style.id = 'toast-styles'
    document.head.appendChild(style)
  }

  document.body.appendChild(el)

  el.onclick = () => removeToast(el)

  setTimeout(() => removeToast(el), duration)
}

function removeToast(el: HTMLElement) {
  el.style.animation = 'toastOut 0.3s ease forwards'
  setTimeout(() => {
    el.remove()
    toastCount = Math.max(0, toastCount - 1)
  }, 300)
}