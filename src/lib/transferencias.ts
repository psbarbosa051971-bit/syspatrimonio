import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { lerDadosTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";

export type BemTransferencia = Tables<"bens">;
export type SalaTransferencia = Tables<"salas">;

export function codigosDaBusca(texto: string): string[] {
  const codigos = [...new Set(texto.split(",").map((c) => c.trim()).filter(Boolean))];
  if (!codigos.length) throw new Error("Digite os códigos RED separados por vírgulas.");
  if (codigos.some((c) => !/^\d+$/.test(c))) throw new Error("Use somente números separados por vírgulas nos códigos RED.");
  if (codigos.length > 500) throw new Error("Informe no máximo 500 códigos por transferência.");
  return codigos;
}

export async function carregarSalasTransferencia(): Promise<SalaTransferencia[]> {
  const salas: SalaTransferencia[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("salas").select("*").order("id").range(inicio, inicio + 499);
    if (error) throw error;
    salas.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return salas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
}

export async function buscarBensTransferencia(codigos: string[]): Promise<BemTransferencia[]> {
  const bens: BemTransferencia[] = [];
  // Lotes pequenos para não exceder o tamanho da URL; busca exata e paginada.
  for (let lote = 0; lote < codigos.length; lote += 50) {
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase.from("bens").select("*")
        .in("codigo_red", codigos.slice(lote, lote + 50)).order("id").range(inicio, inicio + 499);
      if (error) throw error;
      bens.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  return bens.sort((a, b) => a.codigo_red.localeCompare(b.codigo_red, "pt-BR", { numeric: true }));
}

export function aceitarBens(atuais: BemTransferencia[], encontrados: BemTransferencia[], ids: string[], destino: string) {
  const unicos = new Map(atuais.map((b) => [b.id, b]));
  encontrados.filter((b) => ids.includes(b.id) && b.sala_id !== destino).forEach((b) => unicos.set(b.id, b));
  return [...unicos.values()];
}

export function lerTermoTransferencia(dados: unknown): TermoResponsabilidade {
  const t = dados as Partial<Tables<"importacoes">> | null;
  if (!t || typeof t.id !== "string" || typeof t.numero !== "number" || typeof t.created_at !== "string" ||
    typeof t.arquivo !== "string" || !t.termo_snapshot) throw new Error("Não foi possível abrir o termo. Consulte os termos da sala de destino.");
  lerDadosTermo(t.termo_snapshot);
  return { id: t.id, numero: t.numero, created_at: t.created_at, arquivo: t.arquivo,
    termo_ano: t.termo_ano ?? null, termo_snapshot: t.termo_snapshot };
}
