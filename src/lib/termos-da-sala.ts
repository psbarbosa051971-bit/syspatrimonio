import type { Tables } from "@/integrations/supabase/types";
import { ehVeiculo } from "@/lib/recebimento-veiculos";
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

/** Primeira palavra da descrição (ignora números iniciais). */
export function primeiraPalavra(descricao: string): string {
  return (descricao.trim().split(/\s+/).find((p) => /\p{L}/u.test(p)) ?? "").replace(/[^\p{L}\p{N}-]/gu, "").toUpperCase();
}

/** VEÍCULO se houver veículo; a palavra comum se todos iguais; senão DIVERSOS. */
export function classificacaoTermo(bens: { descricao: string; tipo: string | null }[]): string {
  if (!bens.length) return "—";
  if (bens.some((b) => ehVeiculo({ descricao: b.descricao, tipo: b.tipo }))) return "VEÍCULO";
  const palavras = new Set(bens.map((b) => primeiraPalavra(b.descricao)));
  return palavras.size === 1 ? [...palavras][0] || "—" : "DIVERSOS";
}

export function resumoTermoDaSala(termo: TermoDaSala): { dados: DadosTermo | null; quantidade: number; total: number; tipos: string; classificacao: string } {
  try {
    const dados = lerDadosTermo(termo.termo_snapshot);
    return { dados, quantidade: dados.bens.length, total: dados.bens.reduce((soma, bem) => soma + bem.valor, 0),
      tipos: [...new Set(dados.bens.map((bem) => bem.tipo).filter(Boolean))].join(", ") || "—",
      classificacao: classificacaoTermo(dados.bens) };
  } catch { return { dados: null, quantidade: 0, total: 0, tipos: "—", classificacao: "—" }; }
}
