import { supabase } from "@/integrations/supabase/client";
import { lerDadosTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";

/** Usa o cadastro atual da sala na impressão, sem alterar o termo salvo. */
export async function atualizarResponsaveisDosTermos(
  termos: TermoResponsabilidade[], salaId?: string,
): Promise<TermoResponsabilidade[]> {
  if (!termos.length) return [];
  const salasPorTermo = new Map<string, string>();
  if (salaId) {
    termos.forEach((termo) => salasPorTermo.set(termo.id, salaId));
  } else {
    const { data, error } = await supabase.from("importacoes")
      .select("id,sala_id").in("id", termos.map((termo) => termo.id));
    if (error) throw new Error("Não foi possível consultar a sala dos termos. Tente novamente.");
    (data ?? []).forEach((registro) => salasPorTermo.set(registro.id, registro.sala_id));
  }
  const responsaveis = new Map<string, { responsavel: string; cpf: string }>();
  await Promise.all([...new Set(salasPorTermo.values())].map(async (id) => {
    const { data, error } = await supabase.rpc("dados_responsavel_sala_termo", { _sala_id: id });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Não foi possível consultar o responsável pela sala. Tente novamente.");
    }
    responsaveis.set(id, {
      responsavel: typeof data.responsavel === "string" ? data.responsavel.trim() : "",
      cpf: typeof data.cpf === "string" ? data.cpf : "",
    });
  }));
  return termos.map((termo) => {
    const id = salasPorTermo.get(termo.id);
    if (!id) throw new Error("Não foi possível identificar a sala deste termo.");
    const atual = responsaveis.get(id);
    if (!atual?.responsavel) return termo;
    return { ...termo, termo_snapshot: { ...lerDadosTermo(termo.termo_snapshot), ...atual } };
  });
}
