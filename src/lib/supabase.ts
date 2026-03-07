import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()
  const fileName = `${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName)
  return data.publicUrl
}