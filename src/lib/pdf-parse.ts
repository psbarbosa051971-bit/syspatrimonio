import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type TextoPdf = { str: string; transform: number[]; hasEOL?: boolean };

/** Carrega o leitor somente ao selecionar um PDF, sem executá-lo no servidor. */
export async function lerPaginasPdf(file: File): Promise<TextoPdf[][]> {
  if (!/\.pdf$/i.test(file.name)) throw new Error("Selecione somente um arquivo PDF.");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const paginas: TextoPdf[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      paginas.push(content.items.flatMap((item) => "str" in item
        ? [{ str: item.str, transform: item.transform, hasEOL: item.hasEOL }] : []));
    }
    return paginas;
  } finally {
    await doc.destroy();
  }
}

export type BemExtraido = {
  codigo_red: string;
  descricao: string;
  valor: number;
  incorporacao?: string | null;
  tipo?: string | null;
};

export type CabecalhoTermo = {
  historico: string;
  data: string;
  local: string;
  endereco: string;
};

export type TermoExtraido = {
  cabecalho: CabecalhoTermo;
  bens: BemExtraido[];
  locais?: { cabecalho: CabecalhoTermo; bens: BemExtraido[] }[];
};

const ROTULOS =
  "Hist[óo]rico|Data|Local|Endere[çc]o|C[óo]d(?:igo)?\\.?\\s*RED\\.?|Descri[çc][ãa]o(?:\\s+do\\s+bem)?|Valor|Diretor|Departamento|Almoxarifado|CPD";

function campo(texto: string, rotulo: string): string {
  const re = new RegExp(
    `(?:${rotulo})\\s*:\\s*(.+?)(?=\\s+(?:${ROTULOS})\\s*:|\\n|$)`,
    "i",
  );
  return texto.match(re)?.[1]?.trim() ?? "";
}

export async function extrairTermoDePdf(file: File): Promise<TermoExtraido> {
  return parsearPaginasTermo(await lerPaginasPdf(file));
}

function linhasPdf(items: TextoPdf[]): TextoPdf[][] {
  const linhas: TextoPdf[][] = [];
  for (const item of [...items].sort((a, b) => b.transform[5]! - a.transform[5]! || a.transform[4]! - b.transform[4]!)) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0]!.transform[5]! - item.transform[5]!) < 3) ultima.push(item);
    else linhas.push([item]);
  }
  return linhas.map((linha) => linha.sort((a, b) => a.transform[4]! - b.transform[4]!));
}

/** Agrupa páginas de continuação e separa os cabeçalhos reais de cada local. */
export function parsearPaginasTermo(paginas: TextoPdf[][]): TermoExtraido {
  const grupos: { nome: string; paginas: TextoPdf[][] }[] = [];
  let atual: (typeof grupos)[number] | undefined;
  for (const pagina of paginas) {
    let trecho: TextoPdf[] = [];
    const guardar = () => {
      if (!trecho.length) return;
      if (!atual) { atual = { nome: "", paginas: [] }; grupos.push(atual); }
      atual.paginas.push(trecho);
      trecho = [];
    };
    for (const linha of linhasPdf(pagina)) {
      const texto = linha.map((i) => i.str).join(" ").normalize("NFC").trim();
      const nome = texto.match(/^Local\s+F[íi]sico\s*:\s*(\d+\s*[-–—]?\s*[^;]+?)(?=\s+(?:C[óo]d(?:igo)?\.?\s*RED|Situa[çc][ãa]o|Par[âa]metro)\b|;|$)/i)?.[1]?.trim();
      if (nome) {
        guardar();
        const chave = nome.replace(/\s+/g, " ").toUpperCase();
        atual = grupos.find((g) => g.nome === chave);
        if (!atual) { atual = { nome: chave, paginas: [] }; grupos.push(atual); }
      }
      trecho.push(...linha);
    }
    guardar();
  }
  const extraidos = grupos.map((g) => parsearTrechosTermo(g.paginas));
  const locais = extraidos.filter((t) => t.bens.length > 0);
  const primeiro = locais[0] ?? extraidos[0] ?? parsearTrechosTermo([]);
  return { cabecalho: primeiro.cabecalho, bens: locais.flatMap((t) => t.bens),
    ...(locais.length > 1 ? { locais } : {}) };
}

function parsearTrechosTermo(paginas: TextoPdf[][]): TermoExtraido {
  const bensPos = paginas.flatMap((items) => parsearPorPosicao(items));
  let texto = paginas.map((items) => linhasPdf(items)
    .map((linha) => linha.map((i) => i.str).join(" ")).join("\n")).join("\n");
  texto = texto.normalize("NFC").replace(/[ \t\u00a0]+/g, " ");
  const dataMatch =
    texto.match(/Emiss\S{1,2}o\s*:.*?(\d{2}[-/.]\d{2}[-/.]\d{4})/i) ??
    texto.match(/Data\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i) ??
    texto.match(/(\d{1,2}[/.]\d{1,2}[/.]\d{4})/) ??
    texto.match(/(\d{1,2}\s+de\s+[A-Za-zçÇ]+\s+de\s+\d{4})/i);
  const historicoBruto =
    texto.match(
      /HIST\S{0,2}RICO\s*:?\s*([\s\S]+?)(?=\s*\b(?:Data|Local|Endere\S{1,2}o|C\S{0,2}d(?:igo)?\.?\s*RED)\b|$)/i,
    )?.[1] ?? "";
  let historico = historicoBruto
    .replace(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:\-–]+$/, "")
    .trim();
  // Se veio lixo (ex.: "3459 Código Mov."), procura a frase longa em maiúsculas do histórico
  const palavras = historico.split(/\s+/).filter((w) => /[A-Za-zÀ-ú]{3,}/.test(w));
  if (palavras.length < 5 || /C\S{0,2}d(?:igo)?\.?\s*Mov/i.test(historico)) {
    const linhas = texto.split("\n").map((l) => l.trim());
    const inicio = Math.max(0, linhas.findIndex((l) => /HIST\S{0,2}RICO/i.test(l)));
    const ehFrase = (l: string) =>
      l.length >= 25 &&
      /[A-ZÀ-Ú]{3,}(?:\s+[A-ZÀ-Ú0-9ºª°.,/\-–]+){4,}/.test(l) &&
      !/[a-zà-ú]{3,}/.test(l.replace(/\b(?:de|da|do|das|dos|e|para|nº)\b/g, "")) &&
      !/\d,\d{2}\b/.test(l) &&
      !/^\d+\s*-/.test(l);
    const ordem = [...linhas.slice(inicio), ...linhas.slice(0, inicio)];
    const idx = ordem.findIndex(ehFrase);
    if (idx >= 0) {
      const partes = [ordem[idx]!];
      for (let k = idx + 1; k < ordem.length && ehFrase(ordem[k]!); k++) partes.push(ordem[k]!);
      historico = partes.join(" ").replace(/\s{2,}/g, " ").trim();
    }
  }
  // Local: linha inteira após o rótulo (ex.: "12-SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED")
  const localFisico =
    texto.match(/Local\s+F\S{1,2}sico\s*:\s*(\d+\s+[^\n;]+?)(?=\s+C\S{0,2}d(?:igo)?\.?\s*Red|\n|;|$)/i)?.[1] ??
    texto.match(/Local\s+F\S{1,2}sico\s*:\s*([^\n;]+)/i)?.[1];
  let local =
    localFisico?.replace(/\s{2,}/g, " ").trim() ??
    texto.match(/\bLocal\s*:?\s*([^\n]+?)(?=\s+(?:Endere\S{1,2}o|Data|Hist\S{0,2}rico)\s*:|\n|$)/i)?.[1]?.trim() ??
    campo(texto, "Local");
  if (local && !localFisico) {
    const esc = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const completo = texto.match(new RegExp(`(\\d+\\s*-\\s*)?${esc}(\\s*-\\s*[A-ZÇÃÕÁÉÍÓÚ]{2,})?`));
    if (completo) local = completo[0].replace(/\s{2,}/g, " ").trim();
  }
  const cabecalho: CabecalhoTermo = {
    historico,
    data: dataMatch?.[1]?.trim() ?? "",
    local,
    endereco: campo(texto, "Endere[çc]o"),
  };
  return { cabecalho, bens: bensPos.length > 0 ? bensPos : parsearBens(texto) };
}

export async function extrairBensDePdf(file: File): Promise<BemExtraido[]> {
  return (await extrairTermoDePdf(file)).bens;
}

// Remove rótulos e trechos de outros campos, deixando só a descrição do bem
export function limparDescricao(d: string): string {
  let s = d;
  // remove trechos "Rótulo: valor" de campos do cabeçalho
  s = s.replace(
    new RegExp(
      `(?:Hist[óo]rico|Data|Local|Endere[çc]o)\\s*:\\s*.*?(?=\\s+(?:${ROTULOS})\\s*:|$)`,
      "gi",
    ),
    " ",
  );
  // remove rótulos soltos
  s = s.replace(new RegExp(`\\b(?:${ROTULOS})\\s*:?`, "gi"), " ");
  s = s.replace(/\bMotivo\s*:\s*\d*/gi, " ");
  s = s.replace(/\bObs\.?\s*:.*$/i, " ");
  s = s.replace(/\d{2}\/\d{2}\/\d{4}(?:\s+(?:Aquisi\S*|Doa\S*|Transfer\S*|Comodato|Cess\S*))?/gi, " ");
  s = s.replace(/\b(?:Aquisi[çc][ãa]o|Doa[çc][ãa]o)\b/gi, " ");
  s = s.replace(/\bR\$\s*$/i, "");
  return s.replace(/\s{2,}/g, " ").replace(/^[\s:\-–]+|[\s:\-–]+$/g, "").trim();
}

// Reconhece linhas no formato: <codigo> <descricao> <valor>
export function parsearBens(texto: string): BemExtraido[] {
  const bens: BemExtraido[] = [];
  const linhas = texto.split(/\n+/);
  const STATUS = /\b(?:ATIVO|INATIVO|BAIXADO|EM\s+USO|BOM|REGULAR|RUIM|NOVO)\b/gi;
  const re = /(\d{4,})\s+(.+?)\s+R?\$?\s*([\d.]*\d,\d{2}|\d+\.\d{2})\b/g;
  for (let li = 0; li < linhas.length; li++) {
    const linha = linhas[li] ?? "";
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(linha)) !== null) {
      const [, codigo, descricao, valorStr] = m;
      if (!codigo || !descricao || !valorStr) continue;
      const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) continue;
      let desc = limparDescricao(descricao).replace(STATUS, " ").replace(/\s{2,}/g, " ").trim();
      if (!desc) {
        // descrição pode vir depois do valor ou na linha seguinte
        const resto = linha.slice(re.lastIndex).replace(STATUS, " ").trim();
        const prox = (linhas[li + 1] ?? "").replace(STATUS, " ").trim();
        desc = limparDescricao(resto || (/^\d{4,}\s/.test(prox) ? "" : prox));
      }
      // Incorporação (data) e Tipo (Aquisição/Doação...) podem vir grudados na descrição
      let incorporacao: string | null = null;
      let tipo: string | null = null;
      const mt = (descricao + " " + linha.slice(re.lastIndex)).match(
        /(\d{2}\/\d{2}\/\d{4})\s+(Aquisi\S*|Doa\S*|Transfer\S*|Comodato|Cess\S*|[A-ZÀ-Úa-zà-ú]{4,})?/,
      );
      if (mt) {
        incorporacao = mt[1]!;
        tipo = mt[2] ?? null;
      }
      desc = limparDescricao(desc);
      if (!desc) continue;
      bens.push({ codigo_red: codigo, descricao: desc, valor, incorporacao, tipo });
    }
  }
  return bens;
}

type Item = { s: string; x: number; y: number };

// Layout "Quadro Demonstrativo dos Bens por Local Físico":
// código à esquerda; descrição na 1ª linha; Motivo/Obs abaixo; Incorporação, Tipo e Valor à direita
function parsearPorPosicao(raw: unknown[]): BemExtraido[] {
  const items: Item[] = [];
  for (const r of raw as { str?: string; transform?: number[] }[]) {
    const s = (r.str ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    if (!s || !r.transform) continue;
    items.push({ s, x: r.transform[4]!, y: r.transform[5]! });
  }
  const datas = items.filter((i) => /^\d{2}\/\d{2}\/\d{4}$/.test(i.s));
  if (datas.length === 0) return [];
  const minX = Math.min(...items.map((i) => i.x));
  const bens: BemExtraido[] = [];
  for (const d of datas) {
    const linha = items.filter((i) => Math.abs(i.y - d.y) < 4).sort((a, b) => a.x - b.x);
    const cod = linha.find((i) => /^\d{3,8}$/.test(i.s) && i.x < d.x && i.x < minX + 120);
    if (!cod) continue;
    const direita = linha.filter((i) => i.x > d.x).map((i) => i.s).join(" ");
    const mv = direita.match(/^(.*?)\s*R?\$?\s*([\d.]*\d,\d{2})\s*$/);
    if (!mv) continue;
    const valor = parseFloat(mv[2]!.replace(/\./g, "").replace(",", "."));
    const tipo = mv[1]!.replace(/R\$/g, "").trim();
    const cands = items.filter(
      (i) =>
        i.x > cod.x + 5 && i.x < d.x - 5 && i.y > d.y - 4 && i.y < d.y + 16 &&
        !/^(Motivo|Obs\.?)\s*:?/i.test(i.s) && i !== cod,
    );
    if (cands.length === 0) continue;
    const topo = Math.max(...cands.map((c) => c.y));
    const descricao = limparDescricao(
      cands.filter((c) => Math.abs(c.y - topo) < 3).sort((a, b) => a.x - b.x).map((c) => c.s).join(" "),
    );
    if (!descricao || Number.isNaN(valor)) continue;
    bens.push({ codigo_red: cod.s, descricao, valor, incorporacao: d.s, tipo: tipo || null });
  }
  return bens;
}
