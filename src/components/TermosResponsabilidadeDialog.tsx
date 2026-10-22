import { useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ajustarViasDoTermo, htmlDoTermo, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Registro = Omit<TermoResponsabilidade, "termo_snapshot">;
type Props = { open: boolean; onOpenChange: (open: boolean) => void; salaId: string | null; ultimaImportacao: string; consultarPorNumero?: boolean };

export function TermosResponsabilidadeDialog({ open, onOpenChange, salaId, ultimaImportacao, consultarPorNumero = false }: Props) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [confirmado, setConfirmado] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [numero, setNumero] = useState("");
  const [termo, setTermo] = useState<TermoResponsabilidade | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const recente = consultarPorNumero ? "" : registros.find((r) => r.id === ultimaImportacao)?.id ?? "";
  const pedirNumero = consultarPorNumero || selecionado !== recente || !recente;

  useEffect(() => {
    if (!open || !salaId) return;
    let ativo = true;
    setCarregando(true); setErro(""); setRegistros([]); setSelecionado(""); setConfirmado(""); setNumero(""); setTermo(null); setPronto(false);
    async function carregar() {
      const todos: Registro[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("importacoes")
          .select("id,numero,termo_ano,created_at,arquivo")
          .eq("sala_id", salaId!).not("termo_snapshot", "is", null)
          .order("numero", { ascending: false }).range(inicio, inicio + 499);
        if (error) throw error;
        todos.push(...(data ?? []));
        if (!data || data.length < 500) break;
      }
      if (ativo) {
        const novo = consultarPorNumero ? undefined : todos.find((r) => r.id === ultimaImportacao);
        setRegistros(todos); setSelecionado(novo?.id ?? todos[0]?.id ?? ""); setConfirmado(novo?.id ?? "");
      }
    }
    carregar().catch(() => { if (ativo) setErro("Não foi possível carregar os termos. Feche e tente novamente."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [open, salaId, ultimaImportacao, consultarPorNumero]);

  useEffect(() => {
    if (!open || !selecionado || confirmado !== selecionado || !salaId) return;
    let ativo = true;
    setTermo(null); setPronto(false); setErro("");
    supabase.from("importacoes").select("id,numero,termo_ano,created_at,arquivo,termo_snapshot")
      .eq("id", selecionado).eq("sala_id", salaId).single()
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) setErro("Não foi possível abrir o termo selecionado.");
        else setTermo(data);
      }, () => { if (ativo) setErro("Não foi possível abrir o termo selecionado."); });
    return () => { ativo = false; };
  }, [open, selecionado, confirmado, salaId, tentativa]);

  const documento = useMemo(() => {
    if (!termo) return { html: "", erro: "" };
    try { return { html: htmlDoTermo(termo), erro: "" }; }
    catch (e) { return { html: "", erro: e instanceof Error ? e.message : "Termo inválido." }; }
  }, [termo]);

  function escolher(id: string) {
    setSelecionado(id); setConfirmado(id === recente ? id : ""); setNumero(""); setTermo(null); setPronto(false); setErro("");
  }
  function visualizar(e: React.FormEvent) {
    e.preventDefault();
    const partes = numero.trim().match(/^(\d+)(?:\s*\/\s*(\d{4}))?$/);
    if (!partes) { setErro("Informe o número do termo, por exemplo 15 ou 15/2026."); return; }
    const encontrados = registros.filter((r) => Number(r.numero) === Number(partes[1]) && (!partes[2] || numeroDoTermo(r).split("/")[1] === partes[2]));
    if (encontrados.length !== 1) {
      setErro(encontrados.length ? "Há termos com esse número em anos diferentes. Informe também o ano, como 15/2026." : "Nenhum termo com esse número foi encontrado neste Local Físico."); return;
    }
    setTermo(null); setPronto(false); setErro(""); setSelecionado(encontrados[0]!.id); setConfirmado(encontrados[0]!.id); setTentativa((valor) => valor + 1);
  }
  function imprimir() {
    try {
      const janela = frame.current?.contentWindow;
      if (!janela || !pronto) return;
      janela.focus(); janela.print();
    } catch { toast.error("Seu navegador não permitiu a impressão. Tente novamente fora da prévia incorporada."); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`flex max-h-[92vh] w-[95vw] flex-col overflow-y-auto ${documento.html ? "max-w-5xl" : "max-w-xl"}`}>
      <DialogHeader>
        <DialogTitle>{consultarPorNumero ? "Termo de Responsabilidade" : "Termos de responsabilidade"}</DialogTitle>
        <DialogDescription>{consultarPorNumero ? "Informe o número do termo deste Local Físico e clique em Imprimir para abrir o documento." : pedirNumero ? "Para uma importação anterior, informe o número do termo e pressione Enter para visualizar a impressão." : "Confira o termo do HTML recém-importado. Ao imprimir ou salvar em PDF, serão geradas duas vias lado a lado na mesma folha A4 em paisagem. Os dados originais são preservados."}</DialogDescription>
      </DialogHeader>
      {carregando ? <p className="text-sm text-muted-foreground">Carregando termos...</p> : registros.length > 0 ? <>
        <div className="flex flex-wrap items-end gap-3">
          {!consultarPorNumero && <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="termo-importacao">Termo / arquivo importado</Label>
            <Select value={selecionado} onValueChange={escolher}>
              <SelectTrigger id="termo-importacao"><SelectValue placeholder="Selecione um termo" /></SelectTrigger>
              <SelectContent>{registros.map((r) => <SelectItem key={r.id} value={r.id}>{numeroDoTermo(r)} — {r.arquivo}</SelectItem>)}</SelectContent>
            </Select>
          </div>}
          {documento.html && <Button onClick={imprimir} disabled={!pronto}><Printer className="mr-2 h-4 w-4" /> Imprimir / Salvar PDF</Button>}
        </div>
        {pedirNumero && <form onSubmit={visualizar} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5"><Label htmlFor="numero-termo">Número do termo</Label>
            <Input id="numero-termo" autoFocus className="w-48 text-base md:text-base" placeholder="Ex.: 15 ou 15/2026" value={numero} onChange={(e) => { setNumero(e.target.value); setErro(""); }} />
          </div><Button type="submit">{consultarPorNumero ? "Imprimir" : "Visualizar impressão"}</Button>
        </form>}
        {documento.html && <iframe ref={frame} title={`Termo de responsabilidade ${termo ? numeroDoTermo(termo) : ""}`} sandbox="allow-same-origin allow-modals" srcDoc={documento.html} onLoad={() => { if (frame.current?.contentDocument) ajustarViasDoTermo(frame.current.contentDocument); setPronto(true); }} className="h-[58vh] w-full rounded-md border bg-background" />}
        {confirmado === selecionado && !termo && !erro && <p className="text-sm text-muted-foreground">Preparando documento...</p>}
      </> : !erro && <p className="text-sm text-muted-foreground">Nenhum termo gerado para este local. Faça uma nova importação HTML para criar um termo numerado. As importações anteriores a esta função não possuem cópia dos dados originais.</p>}
      {(erro || documento.erro) && <p role="alert" className="text-sm text-destructive">{erro || documento.erro}</p>}
    </DialogContent>
  </Dialog>;
}
