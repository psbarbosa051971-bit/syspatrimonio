import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type SolicitacaoBem = Tables<"solicitacoes_bens">;

export type GrupoSolicitacoes = {
  chave: string;
  local: string;
  tipo: SolicitacaoBem["tipo"];
  itens: SolicitacaoBem[];
};

export const tituloSolicitacao = (tipo: SolicitacaoBem["tipo"]) =>
  tipo === "transferencia" ? "BENS PARA TRANSFERÊNCIA DO LOCAL FÍSICO" : "BENS INSERVÍVEIS DO LOCAL FÍSICO";

export function agruparSolicitacoes(itens: SolicitacaoBem[]): GrupoSolicitacoes[] {
  const grupos = new Map<string, GrupoSolicitacoes>();
  for (const item of itens) {
    const chave = JSON.stringify([item.sala_id ?? item.local_origem, item.tipo]);
    const grupo = grupos.get(chave) ?? { chave, local: item.local_origem, tipo: item.tipo, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

export async function carregarSolicitacoes(salaId?: string) {
  const itens: SolicitacaoBem[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    let consulta = supabase.from("solicitacoes_bens").select("*").eq("ativa", true)
      .order("updated_at", { ascending: false }).order("id").range(inicio, inicio + 999);
    if (salaId) consulta = consulta.eq("sala_id", salaId);
    const { data, error } = await consulta;
    if (error) throw error;
    itens.push(...(data ?? []));
    if (!data || data.length < 1000) return itens;
  }
}

export function csvSolicitacoes(itens: SolicitacaoBem[]): string {
  const celula = (valor: string) => {
    const seguro = /^[\s]*[=+@-]/.test(valor) ? `'${valor}` : valor;
    return `"${seguro.replace(/"/g, '""')}"`;
  };
  const linhas = [
    ["Situação", "Local físico de origem", "Código RED", "Descrição", "Local de destino", "Observações", "Valor (R$)", "Atualizado em"],
    ...itens.map((item) => [
      item.tipo === "transferencia" ? "TRANSFERÊNCIA" : "INSERVÍVEIS",
      item.local_origem, item.codigo_red, item.descricao, item.destino ?? "—", item.observacao,
      Number(item.valor).toFixed(2).replace(".", ","), new Date(item.updated_at).toLocaleString("pt-BR"),
    ]),
  ];
  return "\uFEFF" + linhas.map((linha) => linha.map(celula).join(";")).join("\r\n");
}

export function baixarRelatorio(itens: SolicitacaoBem[]) {
  const url = URL.createObjectURL(new Blob([csvSolicitacoes(itens)], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-bens-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
