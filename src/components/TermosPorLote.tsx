import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ajustarViasDoTermo, htmlDosTermos, numeroDoTermo, type TermoResponsabilidade } from "@/lib/termo-responsabilidade";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Registro = Omit<TermoResponsabilidade, "termo_snapshot"> & { local: string | null };

export function TermosPorLote() {
  const [open, setOpen] = useState(false);
  const [inicial, setInicial] = useState("");
  const [final, setFinal] = useState("");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [html, setHtml] = useState("");
  const [pronto, setPronto] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const imprimirAoAbrir = useRef(false);
  const versao = useRef(0);
  const intervaloValido = !!inicial && !!final && inicial <= final;

  useEffect(() => {
    let ativo = true;
    versao.current += 1;
    setRegistros([]); setSelecionados([]); setHtml(""); setPronto(false); setErro(""); setCarregando(false);
    if (!open || !intervaloValido) return;
    setCarregando(true);
    async function carregar() {
      const proximoDia = new Date(`${final}T12:00:00Z`);
      proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);
      const fimExclusivo = `${proximoDia.toISOString().slice(0, 10)}T00:00:00-03:00`;
      const todos: Registro[] = [];
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("importacoes")
          .select("id,numero,termo_ano,created_at,arquivo,local:termo_snapshot->>local")
          .not("termo_snapshot", "is", null).gte("created_at", `${inicial}T00:00:00-03:00`).lt("created_at", fimExclusivo)
          .order("created_at", { ascending: true }).order("id").range(inicio, inicio + 499);
        if (!ativo) return;
        if (error) throw error;
        todos.push(...(data ?? []).map((r) => ({ ...r, local: typeof r.local === "string" ? r.local : null })));
        if (!data || data.length < 500) break;
      }
      if (ativo) setRegistros(todos);
    }
    carregar().catch(() => { if (ativo) setErro("Não foi possível carregar os termos. Tente novamente."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [open, inicial, final, intervaloValido, tentativa]);

  function imprimirDocumento() {
    try {
      const janela = frame.current?.contentWindow;
      if (!janela) return;
      janela.focus(); janela.print();
    } catch { setErro("O navegador não permitiu a impressão. Tente novamente fora da prévia incorporada."); }
  }

  async function imprimirLote() {
    if (!selecionados.length || preparando || carregando || !intervaloValido) return;
    const atual = versao.current;
    setPreparando(true); setErro(""); setHtml(""); setPronto(false);
    try {
      const ids = registros.filter((r) => selecionados.includes(r.id)).map((r) => r.id);
      const termos: TermoResponsabilidade[] = [];
      for (let inicio = 0; inicio < ids.length; inicio += 100) {
        const { data, error } = await supabase.from("importacoes")
          .select("id,numero,termo_ano,created_at,arquivo,termo_snapshot").in("id", ids.slice(inicio, inicio + 100));
        if (atual !== versao.current) return;
        if (error) throw new Error("Não foi possível abrir os termos selecionados. Tente novamente.");
        termos.push(...(data ?? []));
      }
      if (termos.length !== ids.length) throw new Error("Algum termo não está mais disponível. Atualize a listagem e selecione novamente.");
      const porId = new Map(termos.map((t) => [t.id, t]));
      const documento = htmlDosTermos(ids.map((id) => porId.get(id)!), "vias-separadas");
      if (atual === versao.current) { imprimirAoAbrir.current = true; setHtml(documento); }
    } catch (e) { if (atual === versao.current) setErro(e instanceof Error ? e.message : "Não foi possível preparar a impressão."); }
    finally { setPreparando(false); }
  }

  function marcar(id: string, checked: boolean) {
    setSelecionados((atuais) => checked ? [...atuais, id] : atuais.filter((valor) => valor !== id));
    setHtml(""); setPronto(false);
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => { setInicial(""); setFinal(""); setOpen(true); }}><Printer className="mr-1 h-4 w-4" />TERMOS POR LOTE</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-5xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Termos por lote</DialogTitle>
          <DialogDescription>Selecione o período de criação dos termos, incluindo as duas datas (horário de Brasília). A lista inclui todos os locais físicos que você pode consultar. Cada termo será impresso em duas vias, cada uma em uma folha A4 separada, em retrato.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label htmlFor="lote-data-inicial">Data inicial</Label><Input id="lote-data-inicial" type="date" value={inicial} disabled={preparando} onChange={(e) => setInicial(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="lote-data-final">Data final</Label><Input id="lote-data-final" type="date" value={final} disabled={preparando} onChange={(e) => setFinal(e.target.value)} /></div>
          <Button variant="outline" disabled={!intervaloValido || carregando || preparando} onClick={() => setTentativa((v) => v + 1)}>Atualizar listagem</Button>
        </div>
        {inicial && final && !intervaloValido && <p role="alert" className="text-sm text-destructive">A data final deve ser igual ou posterior à data inicial.</p>}
        {!inicial || !final ? <p className="text-sm text-muted-foreground">Informe as duas datas para listar os termos.</p> : carregando ? <p role="status">Carregando termos...</p> : intervaloValido && !erro && !registros.length ? <p>Nenhum termo encontrado neste período.</p> : null}
        {registros.length > 0 && <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Selecionar todos os termos" checked={selecionados.length === registros.length} disabled={preparando} onChange={(e) => { setSelecionados(e.target.checked ? registros.map((r) => r.id) : []); setHtml(""); setPronto(false); }} />Selecionar todos ({registros.length})</label>
            <span className="text-sm">{selecionados.length} termo(s) selecionado(s) · {selecionados.length * 2} folha(s) · {selecionados.length * 2} vias</span>
          </div>
          <div className="max-h-[35vh] overflow-auto rounded-md border">
            <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2">SEL.</th><th className="p-2">Termo</th><th className="p-2">Criado em</th><th className="p-2">Local Físico</th><th className="p-2">Arquivo</th></tr></thead>
              <tbody>{registros.map((r) => <tr key={r.id} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Selecionar termo ${numeroDoTermo(r)}`} checked={selecionados.includes(r.id)} disabled={preparando} onChange={(e) => marcar(r.id, e.target.checked)} /></td><td className="whitespace-nowrap p-2">{numeroDoTermo(r)}</td><td className="whitespace-nowrap p-2">{new Date(r.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-2">{r.local || "Não informado"}</td><td className="p-2">{r.arquivo}</td></tr>)}</tbody>
            </table>
          </div>
          <Button className="self-end" disabled={!selecionados.length || preparando || carregando || !intervaloValido} onClick={imprimirLote}><Printer className="mr-2 h-4 w-4" />{preparando ? "Preparando..." : "Imprimir"}</Button>
        </>}
        {html && <>
          <Button variant="outline" className="self-end" disabled={!pronto} onClick={imprimirDocumento}>Imprimir novamente / Salvar PDF</Button>
          <iframe ref={frame} title="Termos de responsabilidade por lote — duas vias" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[55vh] min-h-72 w-full shrink-0 rounded-md border bg-background" onLoad={() => {
            if (frame.current?.contentDocument) ajustarViasDoTermo(frame.current.contentDocument);
            setPronto(true);
            if (imprimirAoAbrir.current) { imprimirAoAbrir.current = false; imprimirDocumento(); }
          }} />
        </>}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
