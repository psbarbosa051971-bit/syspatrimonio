import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { carregarFornecedoresNotas } from "@/lib/fornecedores-notas-fiscais";
import { lerArquivoNota, lerNotaFiscalXml, moedaNota, normalizarNumeroNota, type NotaFiscalXml } from "@/lib/notas-fiscais";
import { DocumentoNotaFiscal } from "@/components/DocumentoNotaFiscal";
import { DanfeOriginalNotaFiscal } from "@/components/DanfeOriginalNotaFiscal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Registro = Pick<Tables<"notas_fiscais">, "id" | "serie" | "chave" | "arquivo">;
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
        <DialogHeader className="shrink-0 pr-6"><DialogTitle>Notas Fiscais</DialogTitle><DialogDescription>Selecione o fornecedor e digite o número da nota para consultar os dados do XML, anexar ou visualizar o DANFE original em PDF ao lado e consultar os bens já cadastrados nas salas disponíveis para sua conta.</DialogDescription></DialogHeader>
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
  const { user } = useAuth();
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [bens, setBens] = useState<Tables<"bens">[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [id, setId] = useState("");
  const [nota, setNota] = useState<NotaFiscalXml | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroXml, setErroXml] = useState("");
  const [pendente, setPendente] = useState<{ xml: string; nota: NotaFiscalXml; arquivo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const ativo = useRef(true);
  useEffect(() => { ativo.current = true; return () => { ativo.current = false; }; }, []);
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
            const { data, error } = await supabase.from("notas_fiscais").select("id, serie, chave, arquivo").eq("fornecedor", fornecedor).eq("numero", numero).order("serie").order("id").range(inicio, inicio + 499);
            if (error) throw error;
            notas.push(...(data ?? []));
            if (!data || data.length < 500) break;
          }
          if (atual) { setBens(encontrados); setRegistros(notas); setId((anterior) => notas.some((n) => n.id === anterior) ? anterior : notas[0]?.id ?? ""); }
        } catch { if (atual) setErro("Não foi possível consultar a nota e seus bens."); }
        finally { if (atual) setCarregando(false); }
      })();
    }, 350);
    return () => { atual = false; clearTimeout(timer); };
  }, [fornecedor, numero, versao]);
  useEffect(() => {
    setNota(null); setErroXml("");
    if (!id) { setLendo(false); return; }
    let atual = true;
    setLendo(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from("notas_fiscais").select("xml").eq("id", id).single();
        if (error) throw error;
        const documento = lerNotaFiscalXml(data.xml);
        if (atual) setNota(documento);
      } catch { if (atual) setErroXml("Não foi possível abrir o XML desta nota."); }
      finally { if (atual) setLendo(false); }
    })();
    return () => { atual = false; };
  }, [id, versao]);

  async function anexar(evento: ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    evento.target.value = "";
    if (!file) return;
    setOcupado(true); setPendente(null); setConfirmado(false);
    try {
      const lido = await lerArquivoNota(file);
      if (lido.nota.numero !== numero) throw new Error(`O XML é da nota ${lido.nota.numero}, mas o número consultado é ${numero}. Corrija a pesquisa antes de anexar.`);
      if (ativo.current) setPendente({ ...lido, arquivo: file.name });
    } catch (e) { if (ativo.current) toast.error(mensagem(e)); }
    finally { if (ativo.current) setOcupado(false); }
  }

  async function salvar() {
    if (!pendente || !user || !confirmado || ocupado) return;
    setOcupado(true);
    try {
      const { error } = await supabase.from("notas_fiscais").insert({
        fornecedor, numero, serie: pendente.nota.serie, chave: pendente.nota.chave,
        xml: pendente.xml, arquivo: pendente.arquivo, criado_por: user.id,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Esta chave de NF-e já foi anexada. Consulte o fornecedor original para visualizá-la.");
        throw error;
      }
      if (ativo.current) { setPendente(null); setConfirmado(false); setVersao((v) => v + 1); toast.success("XML da nota fiscal salvo para consultas futuras."); }
    } catch (e) { if (ativo.current) toast.error(mensagem(e)); }
    finally { if (ativo.current) setOcupado(false); }
  }

  if (carregando) return <p role="status" className="p-6 text-center text-muted-foreground">Consultando nota e bens cadastrados…</p>;
  if (erro) return <div role="alert" className="space-y-2 rounded-lg border border-destructive p-4"><p>{erro}</p><Button variant="outline" onClick={() => setVersao((v) => v + 1)}>Tentar novamente</Button></div>;
  const exibida = pendente?.nota ?? nota;
  const secaoBens = <>
    <section className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Bens cadastrados referentes à nota</h3><p className="text-sm text-muted-foreground">{bens.length} bem(ns) · Fornecedor e nota nº {numero}, desconsiderando zeros à esquerda.</p></div><p className="font-semibold text-primary">Total dos bens: {moedaNota(bens.reduce((soma, bem) => soma + Number(bem.valor), 0))}</p></div>
      {!bens.length ? <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">Nenhum bem cadastrado com este fornecedor e número de nota. Confira os dados importados em Importar por fornecedor.</p> : <div className="max-h-80 overflow-auto rounded-lg border border-border"><table className="w-full min-w-0 text-sm"><thead className="sticky top-0 bg-muted text-left"><tr><th className="p-3">Patrimônio</th><th className="p-3">Descrição do bem</th><th className="p-3">Incorporação</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{bens.map((bem) => <tr key={bem.id} className="border-t border-border"><td className="whitespace-nowrap p-3 font-medium">{formatarCodigoRed(bem.codigo_red)}</td><td className="whitespace-pre-wrap break-words p-2">{bem.descricao}</td><td className="p-3">{bem.incorporacao || "—"}</td><td className="whitespace-nowrap p-3 text-right">{moedaNota(bem.valor)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
  return <>
    <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Arquivo XML da nota</h3><p className="mt-1 text-sm text-muted-foreground">{registros.length ? `${registros.length} XML(s) salvo(s).` : "Nenhum XML anexado para esta nota. Anexe o arquivo para visualizar o documento."} O XML não cadastra novos bens.</p></div>
        <div><Label htmlFor="nf-anexo" className="mb-1 flex items-center gap-2"><Upload className="h-4 w-4" />Anexar XML (até 2 MB)</Label><Input id="nf-anexo" type="file" accept=".xml,application/xml,text/xml" disabled={ocupado || !!pendente} onChange={anexar} /></div>
      </div>
      {registros.length > 1 && <div className="space-y-1"><Label htmlFor="nf-serie">XML / série</Label><select id="nf-serie" className={selectClass} value={id} disabled={!!pendente || ocupado} onChange={(e) => setId(e.target.value)}>{registros.map((n) => <option key={n.id} value={n.id}>Série {n.serie} · Chave …{n.chave.slice(-8)} · {n.arquivo}</option>)}</select><p className="text-xs text-muted-foreground">Os bens são associados pelo fornecedor e número. Como o cadastro dos bens não informa a série, a lista abaixo pode reunir bens de mais de uma série.</p></div>}
      {pendente && <div className="space-y-3 rounded-lg border border-primary p-3">
        <p className="text-sm font-semibold">Prévia do XML — ainda não salvo</p><p className="text-sm">Emitente do XML: <strong>{pendente.nota.emitente.nome}</strong> · CNPJ/CPF: {pendente.nota.emitente.documento}</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-1" /><span>Conferi o emitente e confirmo que este XML pertence ao fornecedor selecionado: <strong>{fornecedor}</strong>.</span></label>
        <div className="flex flex-wrap gap-2"><Button onClick={salvar} disabled={!confirmado || ocupado || !user}>{ocupado ? "Salvando…" : "Salvar XML da nota"}</Button><Button variant="outline" disabled={ocupado} onClick={() => { setPendente(null); setConfirmado(false); }}>Cancelar anexo</Button></div>
      </div>}
      {erroXml && !pendente && <div role="alert" className="flex flex-wrap items-center gap-2"><p>{erroXml}</p><Button variant="outline" onClick={() => setVersao((v) => v + 1)}>Tentar abrir novamente</Button></div>}
    </section>
    {lendo && !pendente ? <p role="status" className="p-4 text-muted-foreground">Abrindo XML da nota…</p> : exibida && <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-2"><h3 className="font-semibold">Dados do XML</h3><DocumentoNotaFiscal nota={exibida} />{secaoBens}</div>
      <DanfeOriginalNotaFiscal key={pendente ? `previa:${pendente.nota.chave}` : id} nota={exibida} notaId={pendente ? "" : id} />
    </div>}
    {!(exibida && !(lendo && !pendente)) && secaoBens}
  </>;
}
