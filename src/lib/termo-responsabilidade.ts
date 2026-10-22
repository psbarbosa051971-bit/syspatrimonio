import type { Json, Tables } from "@/integrations/supabase/types";

export type ItemTermo = {
  codigo_red: string; descricao: string; valor: number;
  incorporacao: string | null; tipo: string | null;
};
export type DadosTermo = {
  local: string; endereco: string; historico: string; data_origem: string;
  departamento: string; diretor: string; almoxarifado: string;
  endereco_departamento: string; responsavel: string; cpf: string; entregador?: string; data_termo?: string;
  responsavel_recebimento?: string; cpf_recebimento?: string;
  bens: ItemTermo[];
};
export type TermoResponsabilidade = Pick<Tables<"importacoes">,
  "id" | "numero" | "termo_ano" | "created_at" | "arquivo" | "termo_snapshot">;

const objeto = (v: Json | undefined): v is Record<string, Json | undefined> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function lerDadosTermo(valor: Json | null): DadosTermo {
  if (!objeto(valor) || !Array.isArray(valor["bens"]) || valor["bens"].length === 0) {
    throw new Error("Os dados deste termo não estão disponíveis.");
  }
  const texto = (campo: string) => typeof valor[campo] === "string" ? valor[campo] as string : "";
  const bens = valor["bens"].map((b) => {
    if (!objeto(b) || typeof b["codigo_red"] !== "string" || typeof b["descricao"] !== "string" ||
      typeof b["valor"] !== "number" || !Number.isFinite(b["valor"])) throw new Error("Termo com dados de bens inválidos.");
    return { codigo_red: b["codigo_red"], descricao: b["descricao"], valor: b["valor"],
      incorporacao: typeof b["incorporacao"] === "string" ? b["incorporacao"] : null,
      tipo: typeof b["tipo"] === "string" ? b["tipo"] : null };
  });
  return { local: texto("local"), endereco: texto("endereco"), historico: texto("historico"),
    data_origem: texto("data_origem"), departamento: texto("departamento"), diretor: texto("diretor"),
    almoxarifado: texto("almoxarifado"), endereco_departamento: texto("endereco_departamento"),
    responsavel: texto("responsavel"), cpf: texto("cpf"), entregador: texto("entregador"), data_termo: texto("data_termo"),
    responsavel_recebimento: texto("responsavel_recebimento"), cpf_recebimento: texto("cpf_recebimento"), bens };
}
export function numeroDoTermo(termo: Pick<TermoResponsabilidade, "numero" | "termo_ano" | "created_at">) {
  const ano = termo.termo_ano ?? new Date(termo.created_at).toLocaleDateString("pt-BR", {
    year: "numeric", timeZone: "America/Sao_Paulo",
  });
  return `${termo.numero}/${ano}`;
}
const escapar = (texto: string) => texto.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Documento independente do tema da aplicação; todos os textos importados são escapados. */
export function htmlDoTermo(termo: TermoResponsabilidade): string {
  const d = lerDadosTermo(termo.termo_snapshot);
  const grupos = new Map<string, ItemTermo[]>();
  for (const b of d.bens) {
    const grupo = grupos.get(b.descricao) ?? [];
    grupo.push(b);
    grupos.set(b.descricao, grupo);
  }
  const linhas = [...grupos.values()].map((itens) => {
    const ordenados = [...itens].sort((a, b) => a.codigo_red.localeCompare(b.codigo_red, "pt-BR", { numeric: true }));
    return ordenados.map((b) => `<tr><td>${escapar(b.codigo_red)}</td><td>${escapar(b.descricao)}</td>
      <td>${escapar(b.tipo ?? "")}</td><td>${escapar(b.incorporacao ?? "")}</td><td class="valor">${moeda(b.valor)}</td></tr>`).join("");
  }).join("");
  const cpf = d.cpf.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de responsabilidade ${escapar(numeroDoTermo(termo))}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: oklch(0 0 0); background: oklch(1 0 0); font: 11px Arial, sans-serif; }
      .documento { max-width: 273mm; margin: auto; }
      h1 { font-size: 23px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 0; }
      header { text-align: center; padding: 8px 0 12px; } header p { margin: 3px 0; }
      .local { border: 1px solid; text-align: center; padding: 10px; } .local p { margin: 5px 0 0; }
      .faixa { background: oklch(0.83 0 0); padding: 6px; text-align: center; font-weight: bold; }
      .historico { padding: 6px 0; } table { border-collapse: collapse; width: 100%; margin-top: 6px; table-layout: fixed; }
      th { background: oklch(0.78 0 0); text-align: left; font-size: 10px; }
      th, td { padding: 4px; vertical-align: top; overflow-wrap: anywhere; } tbody tr { break-inside: avoid; }
      thead { display: table-header-group; } .valor { text-align: right; white-space: nowrap; }
      .total { font-weight: bold; background: oklch(0.9 0 0); }
      .assinaturas { display: flex; gap: 12px; margin-top: 18px; break-inside: avoid; }
      .assinatura { border: 1px solid; width: 50%; padding: 10px; min-height: 210px; }
      .linha { border-top: 1px solid; margin-top: 55px; padding-top: 5px; text-align: center; }
      .declaracao { text-align: justify; line-height: 1.5; } .assinatura p { margin: 5px 0; }
      footer { margin-top: 8px; font-size: 9px; break-inside: avoid; }
      .origem { text-align: center; margin: 8px 0; font-size: 9px; }
      @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body><main class="documento">
    <header><h1>PREFEITURA MUNICIPAL DE ITAJUBÁ</h1><p>Av. Dr. Jerson Dias, 500 - Estiva, Itajubá - MG, 37500-295</p>
      <strong>CENTRAL DE DISTRIBUIÇÃO E LOGÍSTICA / MATERIAL E PATRIMÔNIO</strong></header>
    <section class="local"><h2>${escapar(d.local)}</h2><p>${escapar(d.endereco)}</p></section>
    <h2 class="faixa">TERMO DE RESPONSABILIDADE Nº ${escapar(numeroDoTermo(termo))}</h2>
    ${d.data_termo ? `<p><strong>DATA DO TERMO:</strong> ${escapar(d.data_termo)}</p>` : ""}
    <div class="historico"><strong>HISTÓRICO:</strong> ${escapar(d.historico || `Bens relacionados no arquivo ${termo.arquivo}.`)}</div>
    <div class="faixa">BENS DISTRIBUÍDOS EM CONFORMIDADE COM PLANILHA ENVIADA AO CENTRO DE DISTRIBUIÇÃO E LOGÍSTICA${d.departamento ? ` PELO(A) ${escapar(d.departamento.toUpperCase())}` : ""}</div>
    <table><colgroup><col style="width:10%"><col style="width:47%"><col style="width:13%"><col style="width:14%"><col style="width:16%"></colgroup>
      <thead><tr><th>CÓD. REDUZ.</th><th>DESCRIÇÃO DO(S) BEM(NS)</th><th>TIPO</th><th>INCORPORAÇÃO</th><th class="valor">VALOR UNIT.</th></tr></thead>
      <tbody>${linhas}<tr class="total"><td colspan="3">LISTADO(S) GERAL: ${d.bens.length}</td><td colspan="2" class="valor">VALOR TOTAL: ${moeda(d.bens.reduce((s, b) => s + b.valor, 0))}</td></tr></tbody></table>
    <section class="assinaturas"><div class="assinatura"><strong>${d.entregador ? "ENTREGUE POR" : "DIRETOR DE MATERIAL E PATRIMÔNIO"}</strong>
      <div class="linha">${escapar(d.entregador || d.diretor) || "Nome do diretor"}<p>${escapar(d.almoxarifado) || "CENTRAL DE DISTRIBUIÇÃO E LOGÍSTICA"}</p></div></div>
      <div class="assinatura"><p><strong>Local Físico:</strong> ${escapar(d.local)}</p>
      <p class="declaracao">Declaro que o(s) bem(ns) patrimonial(is) acima descrito(s) está(ão) sob minha responsabilidade, a partir da data de assinatura deste Termo de Responsabilidade. Comprometo-me a mantê-lo(s) em condições adequadas para o desenvolvimento normal dos trabalhos. As aplicações deste termo obedecem, em especial, ao disposto no artigo 70, parágrafo único, da Constituição Federal.</p>
      <div class="linha">${escapar(d.responsavel) || "Nome do responsável pelo local"}<p>${escapar(cpf)}</p><p><strong>Responsável pela Sala</strong></p></div>
      ${d.responsavel_recebimento ? `<div class="linha">${escapar(d.responsavel_recebimento)}<p>CPF: ${escapar((d.cpf_recebimento || "").replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"))}</p><p><strong>Responsável pelo Recebimento</strong></p></div>` : `<div class="linha">Nome: ________________________________________<p>CPF: ______________________________</p><p><strong>Responsável pelo Recebimento</strong></p></div>`}
      <p>DATA DE RECEBIMENTO ____/____/________</p></div></section>
    <footer class="faixa">ATENÇÃO: CONFERIR NO ATO DO RECEBIMENTO. NÃO ACEITAREMOS RECLAMAÇÕES APÓS O RECEBIMENTO E ASSINATURA DESTE TERMO.</footer>
    <p class="origem">Arquivo: ${escapar(termo.arquivo)}${d.data_origem ? ` • Data do relatório: ${escapar(d.data_origem)}` : ""}</p>
    </main></body></html>`;
}
