import type { Tables } from "@/integrations/supabase/types";
import { lerDadosTermo, type DadosTermo } from "@/lib/termo-responsabilidade";

export type TermoDaSala = Pick<Tables<"importacoes">, "id" | "numero" | "termo_ano" | "created_at" | "arquivo" | "termo_snapshot">;

export function termoSemMovimentacao(termo: TermoDaSala): boolean {
  const snapshot = termo.termo_snapshot;
  return Boolean(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && snapshot.tipo_documento === "novo_termo");
}

export function bensAtuaisDoTermo(bens: Tables<"bens">[], termo: TermoDaSala): Tables<"bens">[] {
  const snapshot = termo.termo_snapshot;
  if (termoSemMovimentacao(termo) && snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const ids = new Set(Array.isArray(snapshot.bem_ids) ? snapshot.bem_ids.filter((id): id is string => typeof id === "string") : []);
    return bens.filter((bem) => ids.has(bem.id));
  }
  return bens.filter((bem) => bem.importacao_id === termo.id);
}

export function resumoTermoDaSala(termo: TermoDaSala): { dados: DadosTermo | null; quantidade: number; total: number; tipos: string } {
  try {
    const dados = lerDadosTermo(termo.termo_snapshot);
    return { dados, quantidade: dados.bens.length, total: dados.bens.reduce((soma, bem) => soma + bem.valor, 0),
      tipos: [...new Set(dados.bens.map((bem) => bem.tipo).filter(Boolean))].join(", ") || "—" };
  } catch { return { dados: null, quantidade: 0, total: 0, tipos: "—" }; }
}
