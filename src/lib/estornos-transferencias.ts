export type ItemEstorno = {
  id: string;
  codigo_red: string;
  descricao: string;
  valor: number;
  origem: string;
  estornado_em: string | null;
  impedimento: string | null;
};

export type TransferenciaEstorno = {
  id: string;
  numero: number;
  ano: number | null;
  data: string;
  destino: string;
  itens: ItemEstorno[];
};

export function codigoParaEstorno(texto: string): string {
  const codigo = texto.trim();
  if (!/^\d+$/.test(codigo)) throw new Error("Digite apenas um código RED, somente com números.");
  return codigo;
}

function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error("Resposta da transferência inválida. Busque novamente.");
  return valor as Record<string, unknown>;
}

export function lerTransferenciaEstorno(dados: unknown): TransferenciaEstorno | null {
  if (dados === null) return null;
  const t = objeto(dados);
  if (typeof t.id !== "string" || typeof t.numero !== "number" || typeof t.data !== "string" ||
    typeof t.destino !== "string" || (t.ano !== null && typeof t.ano !== "number") || !Array.isArray(t.itens)) {
    throw new Error("Não foi possível ler a transferência. Busque novamente.");
  }
  const itens = t.itens.map((valor): ItemEstorno => {
    const i = objeto(valor);
    if (typeof i.id !== "string" || typeof i.codigo_red !== "string" || typeof i.descricao !== "string" ||
      typeof i.valor !== "number" || typeof i.origem !== "string" ||
      (i.estornado_em !== null && typeof i.estornado_em !== "string") ||
      (i.impedimento !== null && typeof i.impedimento !== "string")) {
      throw new Error("Não foi possível ler os itens da transferência. Busque novamente.");
    }
    return { id: i.id, codigo_red: i.codigo_red, descricao: i.descricao, valor: i.valor,
      origem: i.origem, estornado_em: i.estornado_em, impedimento: i.impedimento };
  });
  return { id: t.id, numero: t.numero, ano: t.ano, data: t.data, destino: t.destino, itens };
}
