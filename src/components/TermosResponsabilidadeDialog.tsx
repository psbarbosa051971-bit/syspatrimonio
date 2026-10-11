import { useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { htmlDoTermo, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Registro = Omit<TermoResponsabilidade, "termo_snapshot">;
type Props = { open: boolean; onOpenChange: (open: boolean) => void; salaId: string | null; ultimaImportacao: string };

export function TermosResponsabilidadeDialog({ open, onOpenChange, salaId, ultimaImportacao }: Props) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [selecionado, setSelecionado] = useState("");
  const [termo, setTermo] = useState<TermoResponsabilidade | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || !salaId) return;
    let ativo = true;
    setCarregando(true); setErro(""); setRegistros([]); setSelecionado(""); setTermo(null); setPronto(false);
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
      if (ativo) { setRegistros(todos); setSelecionado(todos[0]?.id ?? ""); }
    }
    carregar().catch(() => { if (ativo) setErro("Não foi possível carregar os termos. Feche e tente novamente."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [open, salaId, ultimaImportacao]);

  useEffect(() => {
    if (!open || !selecionado || !salaId) return;
    let ativo = true;
    setTermo(null); setPronto(false); setErro("");
    supabase.from("importacoes").select("id,numero,termo_ano,created_at,arquivo,termo_snapshot")
      .eq("id", selecionado).eq("sala_id", salaId).single()
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) setErro("Não foi possível abrir o termo selecionado.");
        else setTermo(data);
      });
    return () => { ativo = false; };
  }, [open, selecionado, salaId]);

  const documento = useMemo(() => {
    if (!termo) return { html: "", erro: "" };
    try { return { html: htmlDoTermo(termo), erro: "" }; }
    catch (e) { return { html: "", erro: e instanceof Error ? e.message : "Termo inválido." }; }
  }, [termo]);

  function imprimir() {
    try {
      const janela = frame.current?.contentWindow;
      if (!janela || !pronto) return;
      janela.focus(); janela.print();
    } catch {
      toast.error("Seu navegador não permitiu a impressão. Tente novamente fora da prévia incorporada.");
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-5xl flex-col overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Termos de responsabilidade</DialogTitle>
        <DialogDescription>Escolha a importação para imprimir ou salvar em PDF. O termo conserva os dados do HTML, inclusive os códigos já cadastrados, sem duplicar os bens.</DialogDescription>
      </DialogHeader>
      {carregando ? <p className="text-sm text-muted-foreground">Carregando termos...</p> : registros.length > 0 ? <>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="termo-importacao">Termo / arquivo importado</Label>
            <Select value={selecionado} onValueChange={setSelecionado}>
              <SelectTrigger id="termo-importacao"><SelectValue placeholder="Selecione um termo" /></SelectTrigger>
              <SelectContent>{registros.map((r) => <SelectItem key={r.id} value={r.id}>
                {numeroDoTermo(r)} — {r.arquivo}
              </SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={imprimir} disabled={!documento.html || !pronto}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
        </div>
        {documento.html && <iframe ref={frame} title={`Termo de responsabilidade ${termo ? numeroDoTermo(termo) : ""}`}
          sandbox="allow-same-origin allow-modals" srcDoc={documento.html}
          onLoad={() => setPronto(true)} className="h-[58vh] w-full rounded-md border bg-background" />}
        {!termo && !erro && <p className="text-sm text-muted-foreground">Preparando documento...</p>}
      </> : !erro && <p className="text-sm text-muted-foreground">Nenhum termo gerado para este local. Faça uma nova importação HTML para criar um termo numerado. As importações anteriores a esta função não possuem cópia dos dados originais.</p>}
      {(erro || documento.erro) && <p role="alert" className="text-sm text-destructive">{erro || documento.erro}</p>}
    </DialogContent>
  </Dialog>;
}
