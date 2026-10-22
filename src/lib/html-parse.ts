import type { BemExtraido, TermoExtraido } from "@/lib/pdf-parse";

const texto = (valor: string) => valor.normalize("NFC").replace(/\s+/g, " ").trim();
const chave = (valor: string) => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const rotulos = /^(?:local(?:\s+fisico)?|situacao\s+do\s+bem|parametro\s+de\s+ordenacao|endereco|data|emissao|historico|codigo|cod\.?\s*red|descricao|incorporacao|tipo|valor|total|pagina)\b/;

function moeda(valor: string): number | null {
  const s = texto(valor).replace(/^R\$\s*/, "");
  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(s)) return null;
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function nomeLocal(valor: string): string {
  return texto(valor)
    .replace(/^Local\s+F[ií]sico\s*:?\s*/i, "")
    .split(/\s*;\s*|\s*(?:Situa[çc][ãa]o\s+do\s+Bem|Par[âa]metro\s+de\s+Ordena[çc][ãa]o)\s*:/i)[0]!
    .replace(/^(\d+)\s*[-–—]?\s*(?=[A-Za-zÀ-ÿ])/, "$1 ").trim();
}

/** O título em negrito junto às colunas identifica o local, não os filtros do relatório. */
type MarcadorLocal = { elemento: Element; local: string };
export type TermoHtmlExtraido = TermoExtraido & { locais: TermoExtraido[] };

function locaisEmNegrito(doc: Document): MarcadorLocal[] {
  const negritos = Array.from(doc.querySelectorAll("b,strong,[style]"))
    .filter((el) => /^(B|STRONG)$/.test(el.tagName) || /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(el.getAttribute("style") ?? ""));
  const locais: MarcadorLocal[] = [];
  const vistos = new Set<Element>();
  for (const el of negritos) {
    if (el.querySelector("table,tr")) continue;
    const contexto = el.closest("tr,p,div");
    const elemento = contexto && !contexto.querySelector("table") ? contexto : el;
    if (vistos.has(elemento)) continue;
    const conteudo = elemento.tagName === "TR"
      ? Array.from(elemento.children).map((celula) => celula.textContent ?? "").join(" ")
      : elemento.textContent ?? "";
    // Filtros do relatório e linhas de patrimônio não são títulos de local.
    if (/Situa[çc][ãa]o\s+do\s+Bem|Par[âa]metro\s+de\s+Ordena[çc][ãa]o/i.test(conteudo)) continue;
    if (elemento.tagName === "TR" && Array.from(elemento.children).some((celula) => moeda(celula.textContent ?? "") !== null)) continue;
    if (/\d[.,]\d{2}(?:\s|$)|\d{2}[/.-]\d{2}[/.-]\d{4}/.test(conteudo)) continue;
    const local = [nomeLocal(conteudo), nomeLocal(el.textContent ?? "")]
      .find((s) => /^\d+\s+[A-Za-zÀ-ÿ]/.test(s) && s.length < 400);
    if (local) { locais.push({ elemento, local }); vistos.add(elemento); }
  }
  return locais;
}

/** Lê uma seção sem executar scripts nem inserir o HTML na página. */
function parsearSecaoHtml(html: string, validarTotal = true): TermoExtraido {
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
  const local = locaisEmNegrito(doc)[0]?.local || nomeLocal(campo(/^Local\s+F[ií]sico\s*:?/i) || campo(/^Local\s*:/i));
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
  if (validarTotal && total && Number(total[1]!.replace(/\./g, "")) !== unicos.size) {
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

/** Separa o relatório na ordem do documento, nunca pela lista de filtros. */
export function parsearTermoHtml(html: string): TermoHtmlExtraido {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript,template").forEach((el) => el.remove());
  const marcadores = locaisEmNegrito(doc);
  const temTitulos = marcadores.length > 0;
  for (const el of Array.from(doc.querySelectorAll("td,th,p,div"))) {
    if (el.querySelector("table,tr,p,div")) continue;
    const conteudo = texto(el.textContent ?? "");
    if (!/^Local\s+F[ií]sico\s*:?/i.test(conteudo)) continue;
    if (temTitulos && /Situa[çc][ãa]o\s+do\s+Bem|Par[âa]metro/i.test(conteudo)) continue;
    const linha = el.closest("tr");
    const partes = [conteudo];
    let seguinte = el.nextElementSibling;
    while (linha && seguinte && !rotulos.test(chave(seguinte.textContent ?? ""))) {
      partes.push(texto(seguinte.textContent ?? "")); seguinte = seguinte.nextElementSibling;
    }
    const local = nomeLocal(partes.join(" "));
    if (local && local.length < 400 && !rotulos.test(chave(local))) marcadores.push({ elemento: linha ?? el, local });
  }
  marcadores.sort((a, b) => a.elemento === b.elemento ? 0 : a.elemento.compareDocumentPosition(b.elemento) & 4 ? -1 : 1);
  const limites: MarcadorLocal[] = [];
  const identidade = (local: string) => local.match(/^\d+/)?.[0].replace(/^0+(?=\d)/, "") ?? chave(local);
  for (const marcador of marcadores) {
    if (identidade(limites.at(-1)?.local ?? "") !== identidade(marcador.local)) limites.push(marcador);
  }
  if (limites.length <= 1) {
    const termo = parsearSecaoHtml(html);
    return { ...termo, locais: [termo] };
  }
  const grupos = new Map<string, TermoExtraido>();
  const destinoPorCodigo = new Map<string, string>();
  for (let i = 0; i < limites.length; i++) {
    const marcador = limites[i]!;
    const intervalo = doc.createRange();
    intervalo.setStartBefore(marcador.elemento);
    const proximo = limites[i + 1];
    if (proximo) intervalo.setEndBefore(proximo.elemento);
    else intervalo.setEnd(doc.body, doc.body.childNodes.length);
    const fragmento = intervalo.cloneContents();
    const recipiente = doc.createElement("div");
    const raiz = fragmento.firstElementChild?.tagName;
    if (raiz === "TR" || raiz === "TBODY" || raiz === "THEAD") {
      const tabela = doc.createElement("table"); tabela.append(fragmento); recipiente.append(tabela);
    } else recipiente.append(fragmento);
    // A última seção pode conter o total geral; ele é conferido após reunir os locais.
    const termo = parsearSecaoHtml(recipiente.innerHTML, false);
    termo.cabecalho.local = marcador.local;
    const idLocal = identidade(marcador.local);
    for (const bem of termo.bens) {
      const codigo = bem.codigo_red.replace(/^0+(?=\d)/, "");
      const anterior = destinoPorCodigo.get(codigo);
      if (anterior && anterior !== idLocal) throw new Error(`O patrimônio ${bem.codigo_red} aparece em mais de um Local Físico no HTML. Nada foi importado; confira o arquivo.`);
      destinoPorCodigo.set(codigo, idLocal);
    }
    const anterior = grupos.get(idLocal);
    if (anterior) anterior.bens = [...new Map([...anterior.bens, ...termo.bens].map((bem) => [bem.codigo_red, bem])).values()];
    else grupos.set(idLocal, termo);
  }
  const locais = [...grupos.values()];
  const bens = locais.flatMap((local) => local.bens);
  // Confere também o documento inteiro: nenhuma linha pode ficar fora das seções.
  const completo = parsearSecaoHtml(html, false);
  const lidos = new Set(bens.map((b) => b.codigo_red));
  if (completo.bens.some((b) => !lidos.has(b.codigo_red))) {
    throw new Error("Há patrimônios sem Local Físico identificado no HTML. Nada foi importado; confira os títulos dos locais.");
  }
  const totais = Array.from(doc.querySelectorAll("tr,p,div"))
    .filter((el) => !el.querySelector("tr,p,div"))
    .map((el) => texto(el.textContent ?? ""))
    .map((linha) => linha.match(/(?:quantidade\s+(?:total\s+)?(?:de\s+)?(?:bens|itens)|total\s+(?:geral\s+)?(?:de\s+)?(?:bens|itens))\s*:?\s*([\d.]+)/i))
    .filter((m) => m !== null);
  const geral = totais.length === 1 ? totais[0] : totais.find((m) => /geral/i.test(m[0]));
  if (geral && Number(geral[1]!.replace(/\./g, "")) !== bens.length) throw new Error(`O total do relatório não corresponde aos ${bens.length} patrimônios reconhecidos. Nada foi importado; confira o arquivo completo.`);
  return { cabecalho: locais[0]!.cabecalho, bens, locais };
}

export async function extrairTermoDeHtml(file: File): Promise<TermoHtmlExtraido> {
  if (!/\.html?$/i.test(file.name)) throw new Error("Selecione um arquivo HTML (.html ou .htm) exportado pelo Sonner.");
  const bytes = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const legado = /charset\s*=\s*["']?(?:windows-1252|iso-8859-1)/i.test(utf8.slice(0, 4096));
  const html = legado || utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return parsearTermoHtml(html);
}
