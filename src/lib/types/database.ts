/**
 * Placeholder gerado durante o Passo 0 do Módulo 1.
 *
 * Este arquivo será SUBSTITUÍDO por tipos reais após o Passo 2 (criar schema
 * no Supabase), executando:
 *
 *     npm run supabase:types
 *
 * Por enquanto, expõe um tipo vazio compatível com `SupabaseClient<Database>`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
