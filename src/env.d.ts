declare namespace App {
  interface Locals {
    /** Usuario validado con Supabase Auth (solo en /cuenta, /admin y /api/checkout). */
    usuario: import('./lib/auth.ts').Usuario | null;
    /** Cliente con la sesión del visitante; sus lecturas pasan por RLS. */
    supabase: import('@supabase/supabase-js').SupabaseClient | null;
  }
}
