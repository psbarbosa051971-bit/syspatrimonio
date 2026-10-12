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
  const locais: Record<string, string> = {};
  // Consulta paginada, sem restringir ao departamento ou à sala selecionada.
  // O acesso continua limitado às informações permitidas para a conta.
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("salas").select("id,nome")
      .order("id").range(inicio, inicio + 499);
    if (error) throw error;
    for (const sala of data ?? []) locais[sala.id] = sala.nome;
    if (!data || data.length < 500) break;
  }
  const bens: Bem[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("bens").select("*")
      .order("id").range(inicio, inicio + 499);
    if (error) throw error;
    for (const bem of data ?? []) {
      if (bem.sala_id && Object.prototype.hasOwnProperty.call(locais, bem.sala_id) && correspondePesquisaDinamica(bem, termo)) bens.push(bem);
    }
    if (!data || data.length < 500) break;
  }
  bens.sort((a, b) => a.codigo_red.localeCompare(b.codigo_red));
  return { termo: termo.trim(), bens, locais };
}
