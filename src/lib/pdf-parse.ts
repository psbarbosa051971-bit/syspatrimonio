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
  const dataMatch = texto.match(/Data\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  const cabecalho: CabecalhoTermo = {
    historico: campo(texto, "Hist[óo]rico"),
    data: dataMatch?.[1] ?? campo(texto, "Data"),
    local: campo(texto, "Local"),
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
  const re = /(\d{4,})\s+(.+?)\s+R?\$?\s*([\d.]*\d,\d{2}|\d+\.\d{2})\b/g;
  for (const linha of linhas) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(linha)) !== null) {
      const [, codigo, descricao, valorStr] = m;
      if (!codigo || !descricao || !valorStr) continue;
      const valor = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) continue;
      const desc = limparDescricao(descricao);
      if (!desc) continue;
      bens.push({ codigo_red: codigo, descricao: desc, valor });
    }
  }
  return bens;
}
