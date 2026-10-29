import { useState } from "react";
import { FileBarChart, Printer } from "lucide-react";
import { toast } from "sonner";
import { carregarNotasIncorporadas, htmlNotasIncorporadas, moedaIncorporada, type RelatorioNotasIncorporadas } from "@/lib/notas-incorporadas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function NotasIncorporadasDialog() {
  const [aberto, setAberto] = useState(false);
  const [exercicio, setExercicio] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [relatorio, setRelatorio] = useState<RelatorioNotasIncorporadas | null>(null);
  const valido = /^\d{4}$/.test(exercicio) && Number(exercicio) >= 1900 && Number(exercicio) <= 9999;
  const periodoValido = !dataInicial || !dataFinal || dataInicial <= dataFinal;

  const gerar = async () => {
    if (!valido) { toast.error("Informe um exercício válido com quatro dígitos."); return; }
    if (!periodoValido) return;
    setGerando(true); setErro(""); setRelatorio(null);
    try { setRelatorio(await carregarNotasIncorporadas(exercicio, { dataInicial, dataFinal })); }
    catch { setErro("Não foi possível consultar as notas incorporadas. Tente gerar o relatório novamente."); }
    finally { setGerando(false); }
  };
  const imprimir = () => {
    if (!relatorio) return;
    const janela = window.open("", "_blank");
    if (!janela) { toast.error("Permita abrir janelas neste navegador para imprimir o relatório."); return; }
    janela.opener = null;
    janela.document.open();
    janela.document.write(htmlNotasIncorporadas(relatorio));
    janela.document.close();
  };

  return <>
    <Button variant="outline" size="sm" onClick={() => { if (!exercicio) setExercicio(String(new Date().getFullYear())); setAberto(true); }}>
      <FileBarChart className="mr-1 h-4 w-4" /> Notas incorporadas
    </Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none border-0 p-4 sm:rounded-none sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>Notas incorporadas e empenhos</DialogTitle>
          <DialogDescription>Quadro demonstrativo baseado no Anexo III, reunindo os bens de todas as salas disponíveis para sua conta, sem limitar à sala aberta.</DialogDescription>
        </DialogHeader>
        <form className="flex shrink-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3" onSubmit={(e) => { e.preventDefault(); void gerar(); }}>
          <div className="space-y-1">
            <Label htmlFor="notas-incorporadas-exercicio">Exercício</Label>
            <Input id="notas-incorporadas-exercicio" type="number" min="1900" max="9999" step="1" className="w-36" value={exercicio} disabled={gerando} onChange={(e) => { setExercicio(e.target.value); setRelatorio(null); setErro(""); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notas-incorporadas-data-inicial">Data inicial</Label>
            <Input id="notas-incorporadas-data-inicial" type="date" className="w-44" value={dataInicial} max={dataFinal || "9999-12-31"} disabled={gerando} aria-invalid={!periodoValido} onChange={(e) => { setDataInicial(e.target.value); setRelatorio(null); setErro(""); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notas-incorporadas-data-final">Data final</Label>
            <Input id="notas-incorporadas-data-final" type="date" className="w-44" value={dataFinal} min={dataInicial || undefined} max="9999-12-31" disabled={gerando} aria-invalid={!periodoValido} onChange={(e) => { setDataFinal(e.target.value); setRelatorio(null); setErro(""); }} />
          </div>
          <Button type="submit" disabled={gerando || !valido || !periodoValido}>{gerando ? "Gerando…" : "Gerar relatório"}</Button>
          <Button type="button" variant="outline" disabled={gerando || !relatorio?.linhas.length} onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar em PDF</Button>
          {!periodoValido && <p role="alert" className="basis-full text-sm text-destructive">A data inicial não pode ser posterior à data final.</p>}
          <p className="basis-full text-xs text-muted-foreground">O exercício corresponde ao ano do empenho, conforme o anexo. As datas são opcionais e filtram a data de incorporação dos bens, incluindo o primeiro e o último dia. Deixe-as em branco para consultar todo o exercício. São incluídos todos os tipos e situações.</p>
        </form>
        {erro && <p role="alert" className="shrink-0 text-sm text-destructive">{erro}</p>}
        {gerando ? <p role="status" className="p-6 text-center text-muted-foreground">Consultando notas e empenhos do exercício…</p> : !relatorio ? <p className="p-6 text-center text-muted-foreground">Selecione o exercício e clique em Gerar relatório.</p> : <>
          <div className="shrink-0 space-y-1 text-center">
            <h3 className="font-semibold">Anexo III — Quadro Demonstrativo dos Bens Incorporados — por Empenho e Nota Fiscal</h3>
            <p className="text-sm">Exercício (ano do empenho): <strong>{relatorio.ano}</strong> · Ordenação: empenho</p>
            {(relatorio.dataInicial || relatorio.dataFinal) && <p className="text-sm">Data de incorporação: {relatorio.dataInicial ? `de ${relatorio.dataInicial.split("-").reverse().join("/")}` : "sem limite inicial"} · {relatorio.dataFinal ? `até ${relatorio.dataFinal.split("-").reverse().join("/")}` : "sem limite final"}</p>}
            <p className="text-xs text-muted-foreground">Uma linha por empenho, pedido, fornecedor, nota e valor unitário. Dados não informados aparecem com traço.</p>
          </div>
          {!relatorio.linhas.length ? <p role="status" className="p-6 text-center text-muted-foreground">Nenhum bem incorporado encontrado com ano de empenho {relatorio.ano}{relatorio.dataInicial || relatorio.dataFinal ? " no período de incorporação selecionado" : ""}. Confira os dados vinculados em Importar por fornecedor e as datas de incorporação dos bens.</p> : <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[1050px] text-xs" aria-label="Notas incorporadas por empenho">
              <thead className="sticky top-0 bg-muted text-left"><tr>
                <th className="p-3">EMPENHO</th><th className="p-3">ANO EMPENHO</th><th className="p-3">PEDIDO</th><th className="p-3">FORNECEDORES</th><th className="p-3">NOTA FISCAL</th><th className="p-3 text-right">ITENS</th><th className="p-3 text-right">VALOR UNITÁRIO</th><th className="p-3 text-right">VALOR TOTAL</th>
              </tr></thead>
              <tbody>{relatorio.linhas.map((linha, i) => <tr key={i} className="border-t border-border even:bg-muted/30">
                <td className="p-3">{linha.empenho || "—"}</td><td className="p-3">{linha.ano}</td><td className="p-3">{linha.pedido || "—"}</td><td className="p-3">{linha.fornecedor || "—"}</td><td className="p-3">{linha.nota || "—"}</td><td className="p-3 text-right">{linha.quantidade}</td><td className="whitespace-nowrap p-3 text-right">{moedaIncorporada(linha.unitario)}</td><td className="whitespace-nowrap p-3 text-right">{moedaIncorporada(linha.total)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-accent p-3 text-sm font-semibold">
            <span>{relatorio.notas} nota(s) · {relatorio.empenhos} empenho(s) · {relatorio.quantidade} bem(ns)</span>
            <span>Valor incorporado ao patrimônio: {moedaIncorporada(relatorio.total)}</span>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
