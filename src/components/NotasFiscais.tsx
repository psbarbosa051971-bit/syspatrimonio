import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { carregarFornecedoresNotas } from "@/lib/fornecedores-notas-fiscais";
import { moedaNota, normalizarNumeroNota } from "@/lib/notas-fiscais";
import { PdfNotaFiscal } from "@/components/PdfNotaFiscal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Registro = Pick<Tables<"notas_fiscais">, "id">;
const mensagem = (erro: unknown) => erro && typeof erro === "object" && "message" in erro ? String(erro.message) : "Não foi possível concluir. Tente novamente.";
const selectClass = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground";

export function NotasFiscais({ fornecedorImportado = "" }: { fornecedorImportado?: string }) {
  const [aberto, setAberto] = useState(false);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [fornecedor, setFornecedor] = useState("");
  const [numero, setNumero] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if (!fornecedorImportado) return;
    setFornecedor(fornecedorImportado);
    setNumero("");
  }, [fornecedorImportado]);
  const opcoesFornecedores = [...new Set([...fornecedores, fornecedorImportado].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setCarregando(true); setErro("");
    void (async () => {
      try {
        const resultado = await carregarFornecedoresNotas();
        if (ativo) { setFornecedores(resultado.fornecedores); setErro(resultado.aviso); }
      } catch (e) { if (ativo) setErro(mensagem(e)); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [aberto, versao]);
  const valido = /^\d+$/.test(numero.trim());
  return <>
    <Button variant="ghost" size="sm" onClick={() => setAberto(true)} className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"><FileText className="mr-2 h-4 w-4" />Notas Fiscais</Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="left-0 top-0 flex h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-hidden rounded-none border-0 p-4 sm:rounded-none sm:p-6">
        <DialogHeader className="shrink-0 pr-6"><DialogTitle>Notas Fiscais</DialogTitle><DialogDescription>Selecione o fornecedor e digite o número da nota para importar ou visualizar o PDF original, sem precisar de XML, e consultar os bens já cadastrados nas salas disponíveis para sua conta.</DialogDescription></DialogHeader>
        <div className="grid shrink-0 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[2fr_1fr]">
          <div className="min-w-0 space-y-1"><Label htmlFor="nf-fornecedor">Fornecedor</Label><select id="nf-fornecedor" className={selectClass} value={fornecedor} disabled={carregando && !opcoesFornecedores.length} onChange={(e) => setFornecedor(e.target.value)}><option value="">{carregando ? "Carregando fornecedores…" : "Selecione o fornecedor"}</option>{opcoesFornecedores.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="nf-numero">Número da nota fiscal</Label><Input id="nf-numero" inputMode="numeric" autoComplete="off" placeholder="Ex.: 614 ou 000000614" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {erro && <div role="alert" className="space-y-2"><p>{erro}</p><Button variant="outline" disabled={carregando} onClick={() => setVersao((v) => v + 1)}>Tentar novamente</Button></div>}
          {!carregando && !opcoesFornecedores.length ? !erro && <p className="p-4 text-muted-foreground">Nenhum fornecedor disponível. Primeiro cadastre os dados dos fornecedores dos bens em Importar por fornecedor.</p> : !fornecedor || !valido ? <p className="p-4 text-muted-foreground">{numero.trim() && !valido ? "Digite apenas números no campo da nota fiscal." : "Informe o fornecedor e o número da nota fiscal para começar."}</p> : <ConsultaNota key={`${fornecedor}:${normalizarNumeroNota(numero)}`} fornecedor={fornecedor} numero={normalizarNumeroNota(numero)} />}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function ConsultaNota({ fornecedor, numero }: { fornecedor: string; numero: string }) {
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [bens, setBens] = useState<Tables<"bens">[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  useEffect(() => {
    let atual = true;
    const timer = setTimeout(() => {
      setCarregando(true); setErro("");
      void (async () => {
        try {
          const encontrados: Tables<"bens">[] = [];
          const notas: Registro[] = [];
          for (let inicio = 0; ; inicio += 500) {
            const { data, error } = await supabase.rpc("bens_da_nota_fiscal", { _fornecedor: fornecedor, _numero: numero }).range(inicio, inicio + 499);
            if (error) throw error;
            encontrados.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          for (let inicio = 0; ; inicio += 500) {
            const { data, error } = await supabase.from("notas_fiscais").select("id").eq("fornecedor", fornecedor).eq("numero", numero).order("serie").order("id").range(inicio, inicio + 499);
            if (error) throw error;
            notas.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          if (atual) { setBens(encontrados); setRegistros(notas); }
        } catch { if (atual) setErro("Não foi possível consultar a nota e seus bens."); }
        finally { if (atual) setCarregando(false); }
      })();
    }, 350);
    return () => { atual = false; clearTimeout(timer); };
  }, [fornecedor, numero, versao]);
  if (carregando) return <p role="status" className="p-6 text-center text-muted-foreground">Consultando nota e bens cadastrados…</p>;
  if (erro) return <div role="alert" className="space-y-2 rounded-lg border border-destructive p-4"><p>{erro}</p><Button variant="outline" onClick={() => setVersao((v) => v + 1)}>Tentar novamente</Button></div>;
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
    <section className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Bens cadastrados referentes à nota</h3><p className="text-xs text-muted-foreground">{bens.length} bem(ns) · Fornecedor e nota nº {numero}, desconsiderando zeros à esquerda.</p></div><p className="text-xs font-semibold text-primary">Total dos bens: {moedaNota(bens.reduce((soma, bem) => soma + Number(bem.valor), 0))}</p></div>
      {!bens.length ? <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Nenhum bem cadastrado com este fornecedor e número de nota. Confira os dados importados em Importar por fornecedor.</p> : <div className="max-h-[65dvh] overflow-auto rounded-lg border border-border"><table className="w-full min-w-0 text-xs"><thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Patrimônio</th><th className="p-2">Descrição do bem</th><th className="p-2">Incorporação</th><th className="p-2 text-right">Valor</th></tr></thead><tbody>{bens.map((bem) => <tr key={bem.id} className="border-t border-border"><td className="whitespace-nowrap p-2 font-medium">{formatarCodigoRed(bem.codigo_red)}</td><td className="whitespace-pre-wrap break-words p-2">{bem.descricao}</td><td className="break-words p-2">{bem.incorporacao || "—"}</td><td className="whitespace-nowrap p-2 text-right">{moedaNota(bem.valor)}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="min-w-0"><PdfNotaFiscal fornecedor={fornecedor} numero={numero} registros={registros} /></div>
  </div>;
}
