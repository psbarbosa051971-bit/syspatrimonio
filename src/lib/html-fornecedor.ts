export type ItemFornecedor = {
  codigo_red: string;
  descricao: string;
  ano_pedido: string;
  pedido: string;
  ano_empenho: string;
  empenho: string;
  nota_fiscal: string;
  fornecedor: string;
  valor?: number;
};

const t = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const k = (s: string) => t(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function lerValor(entrada: string): number | undefined {
  const texto = entrada.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(texto)) return undefined;
  const valor = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : undefined;
}

/** Lê o "Quadro Demonstrativo dos Bens Incorporados - por Fornecedor" sem executar scripts. */
export function parsearFornecedorHtml(html: string): ItemFornecedor[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  const itens: ItemFornecedor[] = [];
  let fornecedor = "";
  let atual: ItemFornecedor | null = null;
  let tabela: Element | null = null;
  let colunaValor = 8;
  for (const tr of Array.from(doc.querySelectorAll("tr")).filter((r) => !r.querySelector("tr"))) {
    if (tr.closest("table") !== tabela) {
      tabela = tr.closest("table");
      colunaValor = 8;
    }
    const celulas = Array.from(tr.children).map((c) => t(c.textContent));
    const inicio = celulas.findIndex(Boolean);
    if (inicio < 0) continue;
    // O Sonner inclui células vazias de margem antes do código e dos cabeçalhos.
    // Remova apenas essa margem: vazios entre os dados ainda representam colunas.
    const cel = celulas.slice(inicio);
    const cabecalhoValor = cel.findIndex((c) => /^valor(?:\s|$)/.test(k(c)));
    if (cabecalhoValor >= 0 && cel.some((c) => /descri/.test(k(c)))) {
      colunaValor = cabecalhoValor;
      continue;
    }
    const iForn = cel.findIndex((c) => /^fornecedor\s*:?/.test(k(c)) && !/bens por/.test(k(c)));
    if (iForn >= 0) {
      const resto = t(cel[iForn]!.replace(/^fornecedor\s*:?/i, ""));
      fornecedor = resto || cel[iForn + 1] || "";
      continue;
    }
    const iDoc = cel.findIndex((c) => /^doc\.?\s*entrada/.test(k(c)));
    if (iDoc >= 0 && atual) {
      atual.nota_fiscal = t(cel[iDoc]!.replace(/^doc\.?\s*entrada\s*:?/i, "")) || cel[iDoc + 1] || "";
      continue;
    }
    if (/^\d+$/.test(cel[0]!) && cel.length >= 6) {
      atual = {
        codigo_red: cel[0]!, descricao: cel[1] ?? "",
        ano_pedido: cel[2] ?? "", pedido: cel[3] ?? "",
        ano_empenho: cel[4] ?? "", empenho: cel[5] ?? "",
        nota_fiscal: "", fornecedor,
        valor: lerValor(cel[colunaValor] ?? ""),
      };
      itens.push(atual);
    }
  }
  return itens;
}
