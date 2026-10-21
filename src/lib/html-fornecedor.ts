export type ItemFornecedor = {
  codigo_red: string;
  descricao: string;
  ano_pedido: string;
  pedido: string;
  ano_empenho: string;
  empenho: string;
  nota_fiscal: string;
  fornecedor: string;
};

const t = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
const k = (s: string) => t(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Lê o "Quadro Demonstrativo dos Bens Incorporados - por Fornecedor" sem executar scripts. */
export function parsearFornecedorHtml(html: string): ItemFornecedor[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  const itens: ItemFornecedor[] = [];
  let fornecedor = "";
  let atual: ItemFornecedor | null = null;
  for (const tr of Array.from(doc.querySelectorAll("tr")).filter((r) => !r.querySelector("tr"))) {
    const cel = Array.from(tr.children).map((c) => t(c.textContent)).filter(Boolean);
    if (!cel.length) continue;
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
      };
      itens.push(atual);
    }
  }
  return itens;
}
