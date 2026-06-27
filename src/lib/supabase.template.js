// FalconMed v3 — Supabase Client
// Copy this file to src/lib/supabase.js
// Add your own Supabase URL and anon key
// Never commit the real credentials to GitHub

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
