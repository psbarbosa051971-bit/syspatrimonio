import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type BemNotaIncorporada = Pick<Tables<"bens">, "id" | "ano_empenho" | "empenho" | "pedido" | "fornecedor" | "nota_fiscal" | "incorporacao" | "valor">;
export type LinhaNotaIncorporada = {
  empenho: string; ano: string; pedido: string; fornecedor: string; nota: string;
  quantidade: number; unitario: number; total: number;
};
export type FiltroDatasNotasIncorporadas = { dataInicial?: string; dataFinal?: string };
export type RelatorioNotasIncorporadas = FiltroDatasNotasIncorporadas & {
  ano: string; linhas: LinhaNotaIncorporada[]; quantidade: number;
  notas: number; empenhos: number; total: number;
};

/** Normaliza as datas de incorporação sem depender do fuso horário do navegador. */
function dataIncorporacaoISO(valor: string | null): string | null {
  const entrada = (valor ?? "").trim();
  const iso = entrada.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  const brasileira = entrada.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !brasileira) return null;
  const ano = Number(iso ? iso[1] : brasileira![3]);
  const mes = Number(iso ? iso[2] : brasileira![2]);
  const dia = Number(iso ? iso[3] : brasileira![1]);
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > dias[mes - 1]) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function validarPeriodo({ dataInicial, dataFinal }: FiltroDatasNotasIncorporadas) {
  for (const data of [dataInicial, dataFinal]) {
    if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || dataIncorporacaoISO(data) !== data)) {
      throw new Error("Informe datas válidas para o período de incorporação.");
    }
  }
  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw new Error("A data inicial não pode ser posterior à data final.");
  }
}
export const moedaIncorporada = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const texto = (valor: string | null) => (valor ?? "").trim();
const numeroDocumento = (valor: string | null) => texto(valor).replace(/^0+(?=\d)/, "");
const comparar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

/** O exercício é o ano do empenho; o período opcional filtra a data de incorporação. */
export function agruparNotasIncorporadas(bens: BemNotaIncorporada[], ano: string, periodo: FiltroDatasNotasIncorporadas = {}): RelatorioNotasIncorporadas {
  validarPeriodo(periodo);
  const grupos = new Map<string, LinhaNotaIncorporada>();
  const notas = new Set<string>();
  const empenhos = new Set<string>();
  const vistos = new Set<string>();
  let quantidade = 0;
  let totalCentavos = 0;
  for (const bem of bens) {
    if (vistos.has(bem.id) || texto(bem.ano_empenho) !== ano || !texto(bem.incorporacao)) continue;
    if (periodo.dataInicial || periodo.dataFinal) {
      const data = dataIncorporacaoISO(bem.incorporacao);
      if (!data || (periodo.dataInicial && data < periodo.dataInicial) || (periodo.dataFinal && data > periodo.dataFinal)) continue;
    }
    vistos.add(bem.id);
    const empenho = numeroDocumento(bem.empenho);
    const pedido = numeroDocumento(bem.pedido);
    const fornecedor = texto(bem.fornecedor);
    const nota = numeroDocumento(bem.nota_fiscal);
    const centavos = Math.round(Number(bem.valor) * 100);
    const chave = JSON.stringify([empenho, pedido, fornecedor, nota, centavos]);
    let linha = grupos.get(chave);
    if (!linha) {
      linha = { empenho, ano, pedido, fornecedor, nota, quantidade: 0, unitario: centavos / 100, total: 0 };
      grupos.set(chave, linha);
    }
    linha.quantidade++;
    linha.total = linha.quantidade * centavos / 100;
    quantidade++;
    totalCentavos += centavos;
    if (nota) notas.add(JSON.stringify([fornecedor, nota]));
    if (empenho) empenhos.add(empenho);
  }
  const linhas = [...grupos.values()].sort((a, b) => comparar(a.empenho, b.empenho) || comparar(a.fornecedor, b.fornecedor) || comparar(a.nota, b.nota) || comparar(a.pedido, b.pedido) || a.unitario - b.unitario);
  return { ano, linhas, quantidade, notas: notas.size, empenhos: empenhos.size, total: totalCentavos / 100,
    ...(periodo.dataInicial ? { dataInicial: periodo.dataInicial } : {}),
    ...(periodo.dataFinal ? { dataFinal: periodo.dataFinal } : {}),
  };
}

/** Pagina todos os bens permitidos para a conta, sem limitar à sala aberta. */
export async function carregarNotasIncorporadas(ano: string, periodo: FiltroDatasNotasIncorporadas = {}): Promise<RelatorioNotasIncorporadas> {
  if (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > 9999) throw new Error("Informe um exercício válido com quatro dígitos.");
  validarPeriodo(periodo);
  const bens: BemNotaIncorporada[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("bens")
      .select("id,ano_empenho,empenho,pedido,fornecedor,nota_fiscal,incorporacao,valor")
      .eq("ano_empenho", ano).not("incorporacao", "is", null).neq("incorporacao", "")
      .order("id").range(inicio, inicio + 499);
    if (error) throw error;
    bens.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return agruparNotasIncorporadas(bens, ano, periodo);
}

const escapar = (valor: unknown) => String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function htmlNotasIncorporadas(relatorio: RelatorioNotasIncorporadas): string {
  const linhas = relatorio.linhas.map((l) => `<tr><td>${escapar(l.empenho || "—")}</td><td>${escapar(l.ano)}</td><td>${escapar(l.pedido || "—")}</td><td class="fornecedor">${escapar(l.fornecedor || "Não informado")}</td><td>${escapar(l.nota || "Não informada")}</td><td>${l.quantidade}</td><td class="valor">${moedaIncorporada(l.unitario)}</td><td class="valor">${moedaIncorporada(l.total)}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Notas incorporadas e empenhos — ${escapar(relatorio.ano)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font: 11px Arial, sans-serif; color: oklch(0 0 0); background: oklch(1 0 0); margin: 20px; }
    h1 { font-size: 17px; text-align: center; } p { text-align: center; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th, td { border: 1px solid oklch(0.75 0 0); padding: 6px; text-align: center; overflow-wrap: anywhere; }
    th { background: oklch(0.93 0.02 250); } tbody tr:nth-child(even) { background: oklch(0.97 0 0); }
    .fornecedor { text-align: left; } .valor { text-align: right; white-space: nowrap; }
    thead { display: table-header-group; } tr { break-inside: avoid; }
    .totais { font-weight: bold; text-align: right; padding: 12px; border: 1px solid; }
    .acoes { text-align: center; margin-bottom: 20px; } button { padding: 10px; cursor: pointer; }
    @media print { body { margin: 0; } .acoes { display: none; } th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body><div class="acoes"><button onclick="window.print()">Imprimir / Salvar em PDF</button></div>
  <h1>Anexo III — Quadro Demonstrativo dos Bens Incorporados — por Empenho e Nota Fiscal</h1>
  <p>Exercício (ano do empenho): <strong>${escapar(relatorio.ano)}</strong> · Ordenação: empenho</p>
  ${relatorio.dataInicial || relatorio.dataFinal ? `<p>Data de incorporação: ${relatorio.dataInicial ? `de ${escapar(relatorio.dataInicial.split("-").reverse().join("/"))}` : "sem limite inicial"} · ${relatorio.dataFinal ? `até ${escapar(relatorio.dataFinal.split("-").reverse().join("/"))}` : "sem limite final"} (inclusive)</p>` : ""}
  <p>Bens com incorporação informada nas salas disponíveis para sua conta, respeitando o período selecionado quando informado, independentemente do tipo ou da situação.</p>
  <table><thead><tr><th>EMPENHO</th><th>ANO EMPENHO</th><th>PEDIDO</th><th>FORNECEDORES</th><th>NOTA FISCAL</th><th>ITENS</th><th>VALOR UNITÁRIO</th><th>VALOR TOTAL</th></tr></thead><tbody>${linhas}</tbody></table>
  <div class="totais">${relatorio.notas} nota(s) · ${relatorio.empenhos} empenho(s) · ${relatorio.quantidade} bem(ns)<br>Valor incorporado ao patrimônio: ${moedaIncorporada(relatorio.total)}</div>
  <p>Dados não informados são indicados por traço. Valores unitários diferentes aparecem em linhas separadas. Emitido em ${escapar(new Date().toLocaleString("pt-BR"))} · SysPatrimônio</p>
  </body></html>`;
}
