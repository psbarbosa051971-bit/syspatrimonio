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

export async function extrairBensDePdf(file: File): Promise<BemExtraido[]> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    texto +=
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ") + "\n";
  }
  return parsearBens(texto);
}

// Reconhece linhas no formato: <codigo> <descricao> <valor>
// Ex.: "123456 CADEIRA GIRATORIA 1.234,56"
export function parsearBens(texto: string): BemExtraido[] {
  const bens: BemExtraido[] = [];
  const linhas = texto.split(/\n+/);
  const re = /(\d{4,})\s+(.+?)\s+R?\$?\s*([\d.]*\d,\d{2}|\d+\.\d{2})\b/g;
  for (const linha of linhas) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(linha)) !== null) {
      const valor = parseFloat(m[3].replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor)) continue;
      bens.push({
        codigo_red: m[1],
        descricao: m[2].trim(),
        valor,
      });
    }
  }
  return bens;
}
