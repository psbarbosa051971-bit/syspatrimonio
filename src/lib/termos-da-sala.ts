import type { Tables } from "@/integrations/supabase/types";
import { lerDadosTermo, type DadosTermo } from "@/lib/termo-responsabilidade";

export type TermoDaSala = Pick<Tables<"importacoes">, "id" | "numero" | "termo_ano" | "created_at" | "arquivo" | "termo_snapshot">;
export function resumoTermoDaSala(termo: TermoDaSala): { dados: DadosTermo | null; quantidade: number; total: number; tipos: string } {
  try {
    const dados = lerDadosTermo(termo.termo_snapshot);
    return { dados, quantidade: dados.bens.length, total: dados.bens.reduce((soma, bem) => soma + bem.valor, 0),
      tipos: [...new Set(dados.bens.map((bem) => bem.tipo).filter(Boolean))].join(", ") || "—" };
  } catch { return { dados: null, quantidade: 0, total: 0, tipos: "—" }; }
}
