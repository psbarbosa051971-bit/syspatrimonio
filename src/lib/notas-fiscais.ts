export const normalizarNumeroNota = (valor: string) => valor.trim().replace(/^0+(?=\d)/, "");
export const moedaNota = (valor: string | number) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type PessoaNota = { nome: string; documento: string; ie: string; endereco: string };
export type NotaFiscalXml = {
  chave: string; numero: string; serie: string; emissao: string; natureza: string;
  emitente: PessoaNota; destinatario: PessoaNota; protocolo: string; homologacao: boolean;
  itens: { codigo: string; descricao: string; ncm: string; cfop: string; unidade: string; quantidade: string; unitario: string; total: string }[];
  produtos: string; frete: string; desconto: string; icms: string; ipi: string; total: string; adicionais: string;
};

const filhos = (el: Element, nome: string) => Array.from(el.children).filter((e) => e.localName === nome);
const filho = (el: Element, nome: string) => filhos(el, nome)[0];
const texto = (el: Element | undefined, nome: string) => el ? filho(el, nome)?.textContent?.trim() ?? "" : "";
function pessoa(el: Element | undefined, tagEndereco: string): PessoaNota {
  const end = el && filho(el, tagEndereco);
  return {
    nome: texto(el, "xNome"), documento: texto(el, "CNPJ") || texto(el, "CPF"), ie: texto(el, "IE"),
    endereco: [texto(end, "xLgr"), texto(end, "nro"), texto(end, "xCpl"), texto(end, "xBairro"), texto(end, "xMun"), texto(end, "UF"), texto(end, "CEP")].filter(Boolean).join(" · "),
  };
}

/** Somente dados de NF-e: nenhum conteúdo do XML é executado ou inserido como HTML. */
export function lerNotaFiscalXml(xml: string): NotaFiscalXml {
  if (!xml.trim() || new TextEncoder().encode(xml).length > 2 * 1024 * 1024) throw new Error("Anexe um XML de até 2 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("O XML contém declarações não permitidas.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagNameNS("*", "parsererror").length || doc.documentElement.localName === "parsererror") throw new Error("O arquivo XML está inválido ou incompleto.");
  const infos = Array.from(doc.getElementsByTagNameNS("*", "infNFe"));
  if (infos.length !== 1) throw new Error("Anexe o XML de uma única NF-e (modelo 55).");
  const inf = infos[0]!;
  const ide = filho(inf, "ide");
  if (texto(ide, "mod") !== "55") throw new Error("Este formulário aceita XML de NF-e, modelo 55.");
  const numero = normalizarNumeroNota(texto(ide, "nNF"));
  const serie = texto(ide, "serie");
  const chave = (inf.getAttribute("Id") ?? "").replace(/^NFe/, "");
  if (!/^\d{44}$/.test(chave) || !/^\d+$/.test(numero) || !/^\d+$/.test(serie)) throw new Error("O XML não informa uma chave, número e série válidos de NF-e.");
  const emitente = pessoa(filho(inf, "emit"), "enderEmit");
  if (!emitente.nome) throw new Error("O XML não informa o fornecedor emitente.");
  const totais = filho(inf, "total");
  const icms = totais && filho(totais, "ICMSTot");
  const protocolo = doc.getElementsByTagNameNS("*", "infProt")[0];
  const adicionais = filho(inf, "infAdic");
  return {
    chave, numero, serie, emissao: texto(ide, "dhEmi") || texto(ide, "dEmi"), natureza: texto(ide, "natOp"),
    emitente, destinatario: pessoa(filho(inf, "dest"), "enderDest"), protocolo: texto(protocolo, "nProt"), homologacao: texto(ide, "tpAmb") === "2",
    itens: filhos(inf, "det").map((det) => {
      const p = filho(det, "prod");
      return { codigo: texto(p, "cProd"), descricao: texto(p, "xProd"), ncm: texto(p, "NCM"), cfop: texto(p, "CFOP"), unidade: texto(p, "uCom"), quantidade: texto(p, "qCom"), unitario: texto(p, "vUnCom"), total: texto(p, "vProd") };
    }),
    produtos: texto(icms, "vProd"), frete: texto(icms, "vFrete"), desconto: texto(icms, "vDesc"), icms: texto(icms, "vICMS"), ipi: texto(icms, "vIPI"), total: texto(icms, "vNF"),
    adicionais: [texto(adicionais, "infCpl"), texto(adicionais, "infAdFisco")].filter(Boolean).join("\n"),
  };
}

export async function lerArquivoNota(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error("O XML deve ter no máximo 2 MB.");
  if (!/\.xml$/i.test(file.name)) throw new Error("Selecione um arquivo com extensão .xml.");
  const bytes = await file.arrayBuffer();
  const inicio = new TextDecoder().decode(bytes.slice(0, 200));
  const encoding = /encoding\s*=\s*["']([^"']+)/i.exec(inicio)?.[1] ?? "utf-8";
  let xml: string;
  try { xml = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error("Não foi possível ler a codificação deste XML. Exporte novamente a NF-e."); }
  return { xml, nota: lerNotaFiscalXml(xml) };
}
