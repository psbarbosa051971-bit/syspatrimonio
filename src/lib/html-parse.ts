import type { BemExtraido, TermoExtraido } from "@/lib/pdf-parse";

const texto = (valor: string) => valor.normalize("NFC").replace(/\s+/g, " ").trim();
const chave = (valor: string) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const rotulos = /^(?:local(?:\s+fisico)?|endereco|data|emissao|historico|codigo|cod\.?\s*red|descricao|incorporacao|tipo|valor|total|pagina)\b/;

function moeda(valor: string): number | null {
  const s = texto(valor).replace(/^R\$\s*/, "");
  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(s)) return null;
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function nomeLocal(valor: string): string {
  return texto(valor).replace(/^(\d+)\s*[-–—]?\s*(?=[A-Za-zÀ-ÿ])/, "$1-");
}

/** Lê o documento sem executar scripts nem inserir o HTML na página. */
export function parsearTermoHtml(html: string): TermoExtraido {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  const linhas = Array.from(doc.querySelectorAll("tr,p,div"))
    .filter((el) => !el.querySelector("tr,p,div"))
    .map((el) => texto(el.textContent ?? "")).filter(Boolean);
  const completo = linhas.length ? linhas.join("\n") : doc.body.textContent ?? "";
  const celulas = Array.from(doc.querySelectorAll("td,th"))
    .filter((el) => !el.querySelector("table"));
  function campo(rotulo: RegExp): string {
    for (const el of celulas) {
      const s = texto(el.textContent ?? "");
      const m = s.match(rotulo);
      if (!m || m.index !== 0) continue;
      const partes = [s.slice(m[0].length).replace(/^\s*:\s*/, "").trim()];
      let proximo = el.nextElementSibling;
      while (proximo) {
        const t = texto(proximo.textContent ?? "");
        if (rotulos.test(chave(t))) break;
        if (t && t !== ":") partes.push(t.replace(/^:\s*/, ""));
        proximo = proximo.nextElementSibling;
      }
      if (partes.some(Boolean)) return texto(partes.join(" "));
    }
    for (let i = 0; i < linhas.length; i++) {
      const s = linhas[i]!;
      const m = s.match(rotulo);
      if (!m) continue;
      const valor = s.slice((m.index ?? 0) + m[0].length).replace(/^\s*:\s*/, "");
      if (valor.trim()) return texto(valor);
      const seguinte = linhas[i + 1] ?? "";
      if (!rotulos.test(chave(seguinte))) return seguinte;
    }
    return "";
  }
  const local = nomeLocal(campo(/^Local\s+F[ií]sico\s*:?/i) || campo(/^Local\s*:/i));
  const codigosLocais = new Set<string>();
  for (const el of celulas) {
    const s = texto(el.textContent ?? "");
    if (!/^Local\s+F[ií]sico\s*:?/i.test(s)) continue;
    const restante = s.replace(/^Local\s+F[ií]sico\s*:?\s*/i, "");
    const codigo = (restante || texto(el.nextElementSibling?.textContent ?? "")).match(/^\d+/)?.[0];
    if (codigo) codigosLocais.add(codigo);
  }
  if (codigosLocais.size > 1) throw new Error("O HTML contém mais de um Local Físico. Exporte e importe um local por arquivo para não misturar os bens.");
  const bens: BemExtraido[] = [];
  let suspeitos = 0;
  const codigosEncontrados = new Set<string>();
  let colunas: { codigo: number; descricao: number; valor: number; incorporacao: number; tipo: number } | null = null;
  for (const tabela of Array.from(doc.querySelectorAll("table"))) {
    for (const tr of Array.from(tabela.querySelectorAll("tr"))) {
      if (tr.closest("table") !== tabela) continue;
      const valores: string[] = [];
      for (const el of Array.from(tr.children)) {
        if (!/^(TD|TH)$/.test(el.tagName)) continue;
        if (el.querySelector("table")) continue;
        const span = Math.min(100, Math.max(1, Number(el.getAttribute("colspan")) || 1));
        valores.push(texto(el.textContent ?? ""));
        for (let i = 1; i < span; i++) valores.push("");
      }
      const nomes = valores.map(chave);
      const codigo = nomes.findIndex((v) => /^(?:cod(?:igo)?\.?\s*(?:red\.?)?|red\.?|patrimonio|tombamento)$/.test(v));
      const descricao = nomes.findIndex((v) => /^descricao(?:\s+do\s+bem)?$/.test(v));
      const valor = nomes.findIndex((v) => /^valor(?:\s+(?:atual|do bem|aquisicao|de aquisicao|total))?$/.test(v));
      if (codigo >= 0 && descricao >= 0 && valor >= 0) {
        colunas = { codigo, descricao, valor,
          incorporacao: nomes.findIndex((v) => /^(?:data\s+(?:de\s+)?)?incorporacao$/.test(v)),
          tipo: nomes.findIndex((v) => /^tipo(?:\s+de\s+aquisicao)?$/.test(v)) };
        continue;
      }
      if (!colunas || !valores.some(Boolean)) continue;
      const cod = (valores[colunas.codigo] ?? "").replace(/\s/g, "");
      if (!/^\d{3,}$/.test(cod)) continue;
      codigosEncontrados.add(cod);
      const v = moeda(valores[colunas.valor] ?? "");
      const desc = texto(valores[colunas.descricao] ?? "");
      if (v === null || !desc) { suspeitos++; continue; }
      bens.push({ codigo_red: cod, descricao: desc, valor: v,
        incorporacao: valores[colunas.incorporacao] || null,
        tipo: valores[colunas.tipo] || null });
    }
  }
  // Sem cabeçalhos reconhecidos, tenta o layout simples de células do relatório.
  if (!colunas) extrairSemColunas(doc, bens, codigosEncontrados);
  const unicos = new Map(bens.map((b) => [b.codigo_red, b]));
  if (!unicos.size) throw new Error("Nenhum bem reconhecido no HTML. Envie o arquivo exportado pelo Sonner para conferir o layout.");
  if (suspeitos || unicos.size < codigosEncontrados.size) {
    throw new Error("O HTML contém linhas de bens que não puderam ser lidas por completo. Nada foi importado; envie o arquivo para ajustar a leitura.");
  }
  const total = completo.match(/(?:quantidade\s+(?:total\s+)?(?:de\s+)?(?:bens|itens)|total\s+(?:de\s+)?(?:bens|itens))\s*:?\s*([\d.]+)/i);
  if (total && Number(total[1]!.replace(/\./g, "")) !== unicos.size) {
    throw new Error(`O relatório informa ${total[1]} bens, mas foram reconhecidos ${unicos.size} códigos únicos. Nada foi importado; confira o arquivo completo.`);
  }
  return { cabecalho: { local,
    endereco: campo(/^Endere[çc]o\s*:?/i),
    historico: campo(/^Hist[óo]rico\s*:?/i),
    data: campo(/^(?:Data|Emiss[ãa]o)\s*:?/i).match(/\d{2}[/.\-]\d{2}[/.\-]\d{4}/)?.[0] ?? "",
  }, bens: [...unicos.values()] };
}

function extrairSemColunas(doc: Document, bens: BemExtraido[], codigos: Set<string>) {
  for (const tr of Array.from(doc.querySelectorAll("tr"))) {
    const valores = Array.from(tr.children)
      .filter((el) => /^(TD|TH)$/.test(el.tagName) && !el.querySelector("table"))
      .map((el) => texto(el.textContent ?? "")).filter(Boolean);
    const indice = valores.findIndex((v) => /^\d{3,}$/.test(v));
    if (indice < 0) continue;
    const depois = valores.slice(indice + 1);
    let ultimo = -1;
    for (let i = depois.length - 1; i >= 0; i--) {
      if (moeda(depois[i]!) !== null) { ultimo = i; break; }
    }
    if (ultimo < 1) continue;
    const descricao = depois.slice(0, ultimo).find((v) =>
      /[A-Za-zÀ-ÿ]{3}/.test(v) && !/^\d{2}[/.-]/.test(v) &&
      !/^(?:Motivo|Obs\.?|Aquisi[çc][ãa]o|Doa[çc][ãa]o|Transfer[êe]ncia)\b/i.test(v));
    if (!descricao) continue;
    const codigo = valores[indice]!;
    if (indice !== 0 || bens.some((b) => b.codigo_red === codigo)) continue;
    codigos.add(codigo);
    bens.push({ codigo_red: codigo, descricao, valor: moeda(depois[ultimo]!)!,
      incorporacao: depois.find((v) => /^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(v)) ?? null,
      tipo: depois.find((v) => /^(?:Aquisi[çc][ãa]o|Doa[çc][ãa]o|Transfer[êe]ncia|Comodato|Cess[ãa]o)$/i.test(v)) ?? null });
  }
}

export async function extrairTermoDeHtml(file: File): Promise<TermoExtraido> {
  if (!/\.html?$/i.test(file.name)) throw new Error("Selecione um arquivo HTML (.html ou .htm) exportado pelo Sonner.");
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const legado = /charset\s*=\s*["']?(?:windows-1252|iso-8859-1)/i.test(utf8.slice(0, 4096));
  const html = legado || utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return parsearTermoHtml(html);
}
