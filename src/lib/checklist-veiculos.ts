export function dataAtualRecebimento() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function extrairChaveNfe(texto: string): string {
  const parametro = texto.match(/[?&]p=(\d{44})(?:\||%7C|&|$)/i);
  const chave = parametro?.[1] ?? texto.replace(/\D/g, "");
  if (!/^\d{44}$/.test(chave) || /^(\d)\1+$/.test(chave)) throw new Error("Informe os 44 dígitos da chave de acesso da NF-e.");
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(chave[i]) * peso;
  const resto = soma % 11;
  if (Number(chave[43]) !== (resto < 2 ? 0 : 11 - resto)) throw new Error("Chave de acesso inválida. Confira os números lidos.");
  if (chave.slice(20, 22) !== "55") throw new Error("Use a chave de uma NF-e (modelo 55).");
  return chave;
}

export function dadosDaChave(texto: string): Record<string, string> {
  const chave = extrairChaveNfe(texto);
  return { chave_acesso: chave, nota_fiscal: String(Number(chave.slice(25, 34))), cnpj_fornecedor: chave.slice(6, 20) };
}

// O XML contém o nome e a data exata, que não existem na chave de 44 dígitos.
// DOMParser é chamado apenas após a seleção de arquivo, nunca durante SSR.
export function dadosDoXmlNfe(texto: string): Record<string, string> {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || /<!DOCTYPE/i.test(texto)) throw new Error("XML inválido. Selecione o XML original da NF-e.");
  const elemento = (pai: Document | Element, nome: string) => pai.getElementsByTagNameNS("*", nome)[0];
  const valor = (pai: Document | Element, nome: string) => elemento(pai, nome)?.textContent?.trim() ?? "";
  const info = elemento(doc, "infNFe");
  const emitente = info && elemento(info, "emit");
  const ide = info && elemento(info, "ide");
  if (!info || !emitente || !ide) throw new Error("O arquivo não contém os dados completos da NF-e.");
  const chave = extrairChaveNfe(info.getAttribute("Id")?.replace(/^NFe/, "") ?? valor(doc, "chNFe"));
  const dados = dadosDaChave(chave);
  const emissao = valor(ide, "dhEmi") || valor(ide, "dEmi");
  const total = elemento(info, "ICMSTot");
  const valorNota = total ? valor(total, "vNF") : "";
  if (valorNota && (!/^\d+(\.\d{1,2})?$/.test(valorNota) || !Number.isFinite(Number(valorNota)))) {
    throw new Error("O valor total da NF-e no XML é inválido.");
  }
  return { ...dados, nota_fiscal: valor(ide, "nNF") || dados.nota_fiscal, emissao: emissao.slice(0, 10),
    fornecedor: valor(emitente, "xNome"), ...(valorNota ? { valor: Number(valorNota).toFixed(2) } : {}) };
}

export const camposRecebimentoChecklist = [
  { chave: "nota_fiscal", nome: "Nota fiscal" },
  { chave: "valor", nome: "Valor", tipo: "number" },
  { chave: "emissao", nome: "Emissão", tipo: "date" },
  { chave: "data_recebimento", nome: "Data do recebimento", tipo: "date" },
  { chave: "pedido", nome: "Pedido" },
  { chave: "ano_empenho", nome: "Ano empenho", tipo: "number" },
  { chave: "empenho", nome: "Empenho" },
  { chave: "fornecedor", nome: "Fornecedor" },
];
