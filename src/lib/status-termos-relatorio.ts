import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { bensAtuaisDoTermo, type TermoDaSala } from "@/lib/termos-da-sala";

/** Usa o mesmo vínculo e o mesmo status exibidos em Termos criados da sala. */
export async function carregarStatusTermosRelatorio(
  bens: Tables<"bens">[],
  termoSelecionado?: TermoDaSala | null,
): Promise<Record<string, string>> {
  const status: Record<string, string> = Object.fromEntries(bens.map((bem) => [bem.id, "Sem termo"]));
  const salas = [...new Set(bens.map((bem) => bem.sala_id).filter((id): id is string => !!id))];
  const termos: (TermoDaSala & { sala_id: string })[] = [];
  for (let inicio = 0; inicio < salas.length; inicio += 50) {
    for (let pagina = 0; ; pagina += 500) {
      const { data, error } = await supabase.from("importacoes")
        .select("id,numero,termo_ano,created_at,arquivo,termo_snapshot,sala_id")
        .in("sala_id", salas.slice(inicio, inicio + 50)).not("termo_snapshot", "is", null)
        .order("created_at", { ascending: false }).order("id")
        .range(pagina, pagina + 499);
      if (error) throw error;
      termos.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
  }
  const relevantes = termos.filter((termo) => !termoSelecionado || termo.id === termoSelecionado.id)
    .map((termo) => ({ termo, bens: bensAtuaisDoTermo(bens.filter((bem) => bem.sala_id === termo.sala_id), termo) }))
    .filter((item) => item.bens.length > 0);
  const entregas = new Map<string, string>();
  for (let inicio = 0; inicio < relevantes.length; inicio += 100) {
    const ids = relevantes.slice(inicio, inicio + 100).map(({ termo }) => termo.id);
    for (let pagina = 0; ; pagina += 500) {
      const { data, error } = await supabase.from("entregas_termos")
        .select("importacao_id,status").in("importacao_id", ids)
        .order("importacao_id").range(pagina, pagina + 499);
      if (error) throw error;
      for (const entrega of data ?? []) entregas.set(entrega.importacao_id, entrega.status);
      if (!data || data.length < 500) break;
    }
  }
  const associados = new Set<string>();
  // Em caso de histórico de retorno à sala, considera o termo mais recente.
  for (const { termo, bens: itens } of relevantes) {
    for (const bem of itens) {
      if (associados.has(bem.id)) continue;
      status[bem.id] = entregas.get(termo.id) ?? "Aguardando Entrega";
      associados.add(bem.id);
    }
  }
  return status;
}
