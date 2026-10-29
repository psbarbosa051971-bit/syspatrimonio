import { lerPaginasPdf, type TextoPdf } from "@/lib/pdf-parse";
import type { ItemFornecedor } from "@/lib/html-fornecedor";

const texto = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();
const chave = (s: string) => texto(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Lê o relatório por fornecedor com texto selecionável, sem aceitar HTML. */
export async function extrairFornecedorPdf(file: File): Promise<ItemFornecedor[]> {
  return parsearFornecedorPdf(await lerPaginasPdf(file));
}

export function parsearFornecedorPdf(paginas: TextoPdf[][]): ItemFornecedor[] {
  const itens: ItemFornecedor[] = [];
  let fornecedor = "";
  let atual: ItemFornecedor | null = null;
  let colunas: { campo: keyof ItemFornecedor; x: number }[] = [];
  for (const pagina of paginas) {
    const linhas: TextoPdf[][] = [];
    for (const item of [...pagina].sort((a, b) => b.transform[5]! - a.transform[5]! || a.transform[4]! - b.transform[4]!)) {
      const ultima = linhas[linhas.length - 1];
      if (ultima && Math.abs(ultima[0]!.transform[5]! - item.transform[5]!) < 3) ultima.push(item);
      else linhas.push([item]);
    }
    for (const bruta of linhas) {
      const linha = bruta.sort((a, b) => a.transform[4]! - b.transform[4]!);
      const s = texto(linha.map((i) => i.str).join(" "));
      if (/^fornecedor\s*:/i.test(s)) {
        fornecedor = texto(s.replace(/^fornecedor\s*:\s*/i, ""));
        atual = null;
        continue;
      }
      if (/^doc\.?\s*entrada\s*:/i.test(s)) {
        if (atual) atual.nota_fiscal = texto(s.replace(/^doc\.?\s*entrada\s*:\s*/i, ""));
        continue;
      }
      if (/descri/.test(chave(s)) && /pedido/.test(chave(s))) {
        const novas: typeof colunas = [];
        for (const item of linha) {
          const k = chave(item.str).replace(/\./g, "");
          const campo: keyof ItemFornecedor | undefined = /cod.*red/.test(k) ? "codigo_red"
            : /descri/.test(k) ? "descricao"
            : /ano.*pedido/.test(k) ? "ano_pedido"
            : /^pedido$/.test(k) ? "pedido"
            : /ano.*empenho/.test(k) ? "ano_empenho"
            : /^empenho$/.test(k) ? "empenho" : undefined;
          if (campo) novas.push({ campo, x: item.transform[4]! });
        }
        if (novas.length === 6) colunas = novas;
        continue;
      }
      const celulas = linha.map((i) => texto(i.str)).filter(Boolean);
      if (!/^\d[\d.]*$/.test(celulas[0] ?? "")) continue;
      const valores: Partial<ItemFornecedor> = {};
      if (colunas.length === 6) {
        for (const item of linha) {
          // As colunas numéricas são alinhadas à direita; usa a posição mais próxima.
          const coluna = colunas.reduce((a, b) => Math.abs(item.transform[4]! - a.x) <= Math.abs(item.transform[4]! - b.x) ? a : b);
          valores[coluna.campo] = texto(`${valores[coluna.campo] ?? ""} ${item.str}`);
        }
      } else {
        // Relatórios com cabeçalho dividido: RED, descrição e quatro campos numéricos.
        if (celulas.length < 6 || !celulas.slice(-4).every((v) => /^\d+$/.test(v))) continue;
        Object.assign(valores, { codigo_red: celulas[0], descricao: celulas.slice(1, -4).join(" "),
          ano_pedido: celulas.at(-4), pedido: celulas.at(-3), ano_empenho: celulas.at(-2), empenho: celulas.at(-1) });
      }
      if (!valores.codigo_red || !valores.descricao || !fornecedor) continue;
      atual = { codigo_red: valores.codigo_red.replace(/\./g, ""), descricao: valores.descricao,
        ano_pedido: valores.ano_pedido ?? "", pedido: valores.pedido ?? "",
        ano_empenho: valores.ano_empenho ?? "", empenho: valores.empenho ?? "",
        nota_fiscal: "", fornecedor };
      itens.push(atual);
    }
  }
  return itens;
}
