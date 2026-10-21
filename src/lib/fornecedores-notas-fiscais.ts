import { supabase } from "@/integrations/supabase/client";

type Resultado = { fornecedores: string[]; aviso: string };
const detalhe = (erro: unknown): string => {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object" && "message" in erro) return String(erro.message);
  return "Falha de conexão. Tente novamente.";
};
const ordenar = (nomes: string[]) => [...new Set(nomes.filter((nome) => nome.trim()))]
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

async function lerTabela(tabela: "bens" | "notas_fiscais") {
  const nomes: string[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from(tabela).select("fornecedor")
      .not("fornecedor", "is", null).neq("fornecedor", "").order("fornecedor").order("id")
      .range(inicio, inicio + 499);
    if (error) throw error;
    nomes.push(...(data ?? []).flatMap((linha) => linha.fornecedor ? [linha.fornecedor] : []));
    if (!data || data.length < 500) return nomes;
  }
}

export async function carregarFornecedoresNotas(): Promise<Resultado> {
  try {
    const nomes: string[] = [];
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase.rpc("fornecedores_notas_fiscais")
        .order("fornecedor").range(inicio, inicio + 499);
      if (error) throw error;
      nomes.push(...(data ?? []).map((linha) => linha.fornecedor));
      if (!data || data.length < 500) return { fornecedores: ordenar(nomes), aviso: "" };
    }
  } catch {
    // A consulta direta mantém as mesmas permissões da conta conectada.
    const resultados = await Promise.allSettled([lerTabela("bens"), lerTabela("notas_fiscais")]);
    const nomes = resultados.flatMap((resultado) => resultado.status === "fulfilled" ? resultado.value : []);
    const falhas = resultados.flatMap((resultado) => resultado.status === "rejected" ? [detalhe(resultado.reason)] : []);
    if (falhas.length === resultados.length) {
      throw new Error(`Não foi possível carregar os fornecedores. ${[...new Set(falhas)].join("; ")}`);
    }
    return {
      fornecedores: ordenar(nomes),
      aviso: falhas.length ? `A lista de fornecedores está incompleta. ${falhas.join("; ")}` : "",
    };
  }
}
