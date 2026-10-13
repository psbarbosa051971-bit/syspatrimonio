import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cpfValido, formatarCpf, normalizarCpf } from "@/lib/cpf";
import { htmlDoTermo, lerDadosTermo, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Props = { importacaoId: string; salaId: string; usuarioId: string; nomeAlternativo: string; onClose: () => void };

export function ImprimirImportacaoDialog({ importacaoId, salaId, usuarioId, nomeAlternativo, onClose }: Props) {
  const [etapa, setEtapa] = useState<"pergunta" | "formulario" | "documento">("pergunta");
  const [termo, setTermo] = useState<TermoResponsabilidade | null>(null);
  const [recebedor, setRecebedor] = useState("");
  const [cpf, setCpf] = useState("");
  const [entregador, setEntregador] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [html, setHtml] = useState("");
  const [pronto, setPronto] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const imprimirAoAbrir = useRef(false);

  useEffect(() => {
    if (etapa !== "formulario") return;
    let ativo = true;
    setCarregando(true); setErro("");
    async function carregar() {
      const [importacao, perfil] = await Promise.all([
        supabase.from("importacoes").select("id,numero,termo_ano,created_at,arquivo,termo_snapshot")
          .eq("id", importacaoId).eq("sala_id", salaId).single(),
        supabase.from("profiles").select("nome,login,email").eq("id", usuarioId).single(),
      ]);
      if (importacao.error || !importacao.data) throw new Error("Não foi possível carregar o termo desta importação.");
      if (perfil.error) throw new Error("Não foi possível identificar o usuário que está entregando os bens.");
      const dados = lerDadosTermo(importacao.data.termo_snapshot);
      if (!ativo) return;
      setTermo(importacao.data);
      setRecebedor(dados.responsavel); setCpf(formatarCpf(dados.cpf));
      setEntregador(perfil.data?.nome?.trim() || perfil.data?.login || perfil.data?.email || nomeAlternativo);
    }
    carregar().catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível preparar o formulário."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [etapa, importacaoId, salaId, usuarioId, nomeAlternativo, tentativa]);

  function imprimir() {
    try {
      const janela = frame.current?.contentWindow;
      if (!janela) return;
      janela.focus(); janela.print();
    } catch {
      setErro("O navegador não permitiu a impressão automática. Clique em Imprimir / Salvar PDF ou abra o sistema fora da prévia incorporada.");
    }
  }

  async function salvarEImprimir(e: React.FormEvent) {
    e.preventDefault();
    if (!termo || salvando) return;
    if (recebedor.trim().length < 2) { setErro("Informe o nome do recebedor."); return; }
    if (!cpfValido(cpf)) { setErro("Informe um CPF válido para o recebedor."); return; }
    setSalvando(true); setErro("");
    try {
      const { data, error } = await supabase.rpc("salvar_recebimento_termo", {
        _importacao_id: importacaoId, _recebedor: recebedor.trim(), _cpf: normalizarCpf(cpf),
      });
      if (error) throw error;
      if (!data) throw new Error("Não foi possível salvar os dados do recebimento.");
      const atualizado = { ...termo, termo_snapshot: data };
      setHtml(htmlDoTermo(atualizado)); setTermo(atualizado);
      setPronto(false); imprimirAoAbrir.current = true; setEtapa("documento");
    } catch (e) {
      setErro(e && typeof e === "object" && "message" in e ? String(e.message) : "Não foi possível salvar. Tente novamente.");
    } finally { setSalvando(false); }
  }

  // A confirmação não altera nem desfaz a importação já concluída.
  return <>
    <AlertDialog open={etapa === "pergunta"}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deseja imprimir o termo de Responsabilidade dessa importação?</AlertDialogTitle>
          <AlertDialogDescription>A importação foi concluída. Ao clicar em OK, informe o recebedor e o CPF antes de imprimir. Cancelar mantém a importação sem abrir o formulário.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => setEtapa("formulario")}>OK</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={etapa !== "pergunta"} onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
      <DialogContent className={`flex max-h-[92vh] w-[95vw] flex-col overflow-y-auto ${etapa === "documento" ? "max-w-5xl" : "max-w-xl"}`}>
        <DialogHeader>
          <DialogTitle>{etapa === "documento" ? `Termo de responsabilidade ${termo ? numeroDoTermo(termo) : ""}` : "Dados do recebimento"}</DialogTitle>
          <DialogDescription>{etapa === "documento" ? "Os dados foram gravados neste termo. Imprima ou salve uma cópia em PDF." : "Informe o recebedor. O nome de quem entrega será o do usuário logado. A data de recebimento ficará em branco no termo para preenchimento posterior."}</DialogDescription>
        </DialogHeader>
        {etapa === "formulario" && (carregando ? <p className="text-sm text-muted-foreground">Carregando dados da importação...</p> : termo ? <form onSubmit={salvarEImprimir} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="recebimento-nome">Nome do recebedor</Label>
            <Input id="recebimento-nome" autoFocus required maxLength={200} value={recebedor} disabled={salvando} onChange={(e) => setRecebedor(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label htmlFor="recebimento-cpf">CPF do recebedor</Label>
            <Input id="recebimento-cpf" required inputMode="numeric" autoComplete="off" maxLength={14} placeholder="000.000.000-00" value={cpf} disabled={salvando} onChange={(e) => setCpf(formatarCpf(e.target.value))} />
          </div>
          <div className="space-y-1.5"><Label htmlFor="recebimento-entregador">Entregue por (usuário logado)</Label>
            <Input id="recebimento-entregador" value={entregador} readOnly />
          </div>
          <p className="text-sm text-muted-foreground">Data de recebimento: ____/____/________ (preencher posteriormente no termo).</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={salvando} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={salvando || !entregador}><Printer className="mr-2 h-4 w-4" />{salvando ? "Gravando..." : "Imprimir"}</Button>
          </div>
        </form> : <Button variant="outline" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button>)}
        {etapa === "documento" && <>
          <Button className="self-end" disabled={!pronto} onClick={imprimir}><Printer className="mr-2 h-4 w-4" />Imprimir / Salvar PDF</Button>
          <iframe ref={frame} title="Termo desta importação" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[60vh] w-full rounded-md border bg-background" onLoad={() => {
            setPronto(true);
            if (imprimirAoAbrir.current) { imprimirAoAbrir.current = false; imprimir(); }
          }} />
        </>}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
