import { useState, useEffect } from 'react'

export function useUsdRate() {
  const [rate, setRate] = useState<number>(12700)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRate()
  }, [])

  async function fetchRate() {
    try {
      const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/')
      const data = await res.json()
      if (data?.[0]?.Rate) {
        setRate(Math.round(Number(data[0].Rate)))
      }
    } catch (e) {
      console.error('CBU rate fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }

  return { rate, loading }
}