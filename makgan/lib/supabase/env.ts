export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** .env.local이 없으면 false. 이때 화면은 데이터 없이 뼈대만 보여 준다. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
