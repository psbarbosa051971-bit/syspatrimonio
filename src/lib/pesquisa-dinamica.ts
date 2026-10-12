import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Bem = Tables<"bens">;
export type ResultadoPesquisaDinamica = {
  termo: string;
  bens: Bem[];
  locais: Record<string, string>;
};

const normalizar = (texto: string) => texto.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLowerCase().trim();

export function correspondePesquisaDinamica(bem: Pick<Bem, "codigo_red" | "descricao" | "valor">, termo: string) {
  const busca = normalizar(termo);
  if (!busca) return false;
  const valor = Number(bem.valor);
  const campos = [bem.codigo_red, bem.descricao, String(bem.valor), valor.toFixed(2),
    valor.toFixed(2).replace(".", ","),
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })];
  return campos.some((campo) => normalizar(campo).includes(busca));
}

export async function pesquisarBensEmTodasAsSalas(termo: string): Promise<ResultadoPesquisaDinamica> {
  const busca = termo.trim();
  const locais: Record<string, string> = {};
  const bens: Bem[] = [];
  if (!busca) return { termo: busca, bens, locais };
  // O banco filtra antes de enviar: não baixa mais todos os bens e salas.
  // A consulta mantém as permissões da conta e pagina apenas os resultados.
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.rpc("pesquisar_bens_salas", { _termo: busca })
      .range(inicio, inicio + 499);
    if (error) throw error;
    for (const item of data ?? []) {
      const bem = item.bem as unknown as Bem;
      if (!bem.sala_id) continue;
      bens.push(bem);
      locais[bem.sala_id] = item.local_nome;
    }
    if (!data || data.length < 500) break;
  }
  return { termo: busca, bens, locais };
}
