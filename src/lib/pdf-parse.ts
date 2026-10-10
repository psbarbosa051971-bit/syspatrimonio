import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export type BemExtraido = {
  codigo_red: string;
  descricao: string;
  valor: number;
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
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texto +=
      content.items
        .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
        .join("") + "\n";
  }
  texto = texto.normalize("NFC").replace(/[ \t\u00a0]+/g, " ");
  const dataMatch =
    texto.match(/Data\s*:?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})/i) ??
    texto.match(/(\d{1,2}[/.]\d{1,2}[/.]\d{4})/) ??
    texto.match(/(\d{1,2}\s+de\s+[A-Za-zçÇ]+\s+de\s+\d{4})/i);
  const historicoBruto =
    texto.match(
      /HIST\S{0,2}RICO\s*:?\s*([\s\S]+?)(?=\s*\b(?:Data|Local|Endere\S{1,2}o|C\S{0,2}d(?:igo)?\.?\s*RED)\b|$)/i,
    )?.[1] ?? "";
  const historico = historicoBruto
    .replace(/\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:\-–]+$/, "")
    .trim();
  // Local: linha inteira após o rótulo (ex.: "12-SECRETARIA MUNICIPAL DE EDUCAÇÃO - SEMED")
  let local =
    texto.match(/\bLocal\s*:?\s*([^\n]+?)(?=\s+(?:Endere\S{1,2}o|Data|Hist\S{0,2}rico)\s*:|\n|$)/i)?.[1]?.trim() ??
    campo(texto, "Local");
  if (local) {
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
  return { cabecalho, bens: parsearBens(texto) };
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
      if (!desc) continue;
      bens.push({ codigo_red: codigo, descricao: desc, valor });
    }
  }
  return bens;
}
