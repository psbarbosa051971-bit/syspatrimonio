import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Expõe somente o catálogo de destinos a usuários autenticados, sem liberar
// acesso aos bens, responsáveis ou outros dados dos locais não vinculados.
export const listarLocaisFisicosDestino = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const locais: { id: string; nome: string; unidade: string | null }[] = [];
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabaseAdmin.from("salas")
        .select("id,nome,unidade").order("nome").order("id").range(inicio, inicio + 499);
      if (error) throw new Error("Não foi possível carregar os locais físicos de destino.");
      locais.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return locais;
  });
