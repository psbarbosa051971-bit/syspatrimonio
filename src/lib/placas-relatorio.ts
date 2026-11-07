import { supabase } from "@/integrations/supabase/client";
import { lerDadosRecebimento } from "@/lib/recebimento-veiculos";

/** Consulta somente os recebimentos dos bens incluídos no relatório. */
export async function carregarPlacasRelatorio(
  bens: readonly { id: string }[],
): Promise<Record<string, string>> {
  const ids = [...new Set(bens.map((bem) => bem.id))];
  const placas: Record<string, string> = {};
  for (let inicio = 0; inicio < ids.length; inicio += 200) {
    const { data, error } = await supabase.from("recebimentos_veiculos")
      .select("bem_id,dados").in("bem_id", ids.slice(inicio, inicio + 200));
    if (error) throw error;
    for (const recebimento of data ?? []) {
      const placa = lerDadosRecebimento(recebimento.dados).placa?.trim();
      if (placa) placas[recebimento.bem_id] = placa;
    }
  }
  return placas;
}
