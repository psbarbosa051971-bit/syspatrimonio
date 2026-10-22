import { useEffect, useState, type ChangeEvent } from "react";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { NotaFiscalXml } from "@/lib/notas-fiscais";
import { DanfeNotaFiscal } from "@/components/DanfeNotaFiscal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const bucket = "danfes-originais";
const mensagem = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "Não foi possível abrir ou salvar o PDF original. Tente novamente.";

type Pendente = { file: File; path?: string };
export function DanfeOriginalNotaFiscal({ nota, notaId }: { nota: NotaFiscalXml; notaId: string }) {
  const { user } = useAuth();
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(!!notaId);
  const [existente, setExistente] = useState(false);
  const [documento, setDocumento] = useState<{ url: string; nome: string } | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    let ativo = true;
    let url: string | undefined;
    setDocumento(null); setExistente(false); setErro("");
    if (!notaId) { setCarregando(false); return; }
    setCarregando(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from("notas_fiscais_danfes")
          .select("arquivo_path,arquivo_nome").eq("nota_fiscal_id", notaId).maybeSingle();
        if (error) throw error;
        if (!ativo || !data) return;
        setExistente(true);
        const arquivo = await supabase.storage.from(bucket).download(data.arquivo_path);
        if (arquivo.error) throw arquivo.error;
        if (!ativo) return;
        url = URL.createObjectURL(arquivo.data);
        setDocumento({ url, nome: data.arquivo_nome });
      } catch (e) { if (ativo) setErro(mensagem(e)); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; if (url) URL.revokeObjectURL(url); };
  }, [notaId, versao]);

  async function selecionar(evento: ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    evento.target.value = "";
    if (!file) return;
    setErro(""); setOcupado(true); setPendente(null); setConfirmado(false);
    try {
      if (!/\.pdf$/i.test(file.name) || file.size > 15 * 1024 * 1024 || !file.size) {
        throw new Error("Selecione o PDF original de até 15 MB.");
      }
      const assinatura = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (!assinatura.includes("%PDF-")) throw new Error("O arquivo selecionado não é um PDF válido.");
      setPendente({ file });
    } catch (e) { setErro(mensagem(e)); }
    finally { setOcupado(false); }
  }

  async function salvar() {
    if (!pendente || !confirmado || !user || !notaId || ocupado) return;
    setOcupado(true); setErro("");
    try {
      let path = pendente.path;
      if (!path) {
        path = `${notaId}/${crypto.randomUUID()}.pdf`;
        const envio = await supabase.storage.from(bucket).upload(path, pendente.file, { contentType: "application/pdf", upsert: false });
        if (envio.error) throw envio.error;
        setPendente({ file: pendente.file, path });
      }
      const { error } = await supabase.from("notas_fiscais_danfes").insert({
        nota_fiscal_id: notaId, arquivo_path: path, arquivo_nome: pendente.file.name.slice(0, 255), criado_por: user.id,
      });
      if (error) {
        if (error.code === "23505") {
          setPendente(null); setConfirmado(false); setVersao((v) => v + 1);
          return;
        }
        throw error;
      }
      setPendente(null); setConfirmado(false); setVersao((v) => v + 1);
    } catch (e) { setErro(mensagem(e)); }
    finally { setOcupado(false); }
  }

  return <div className="min-w-0 space-y-3">
    <section aria-label="PDF original do DANFE" className="space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h3 className="text-lg font-semibold">DANFE original do fornecedor</h3>
      <p className="text-sm text-muted-foreground">Para ver a nota exatamente como foi emitida, anexe o PDF original. O XML contém os dados fiscais, mas não guarda o layout, a logomarca ou a paginação do fornecedor.</p>
      {carregando ? <p role="status">Abrindo DANFE original…</p> : documento ? <>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={documento.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Abrir / Imprimir original</a>
          <a className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={documento.url} download={documento.nome}><Download className="h-4 w-4" />Baixar original</a>
        </div>
        <p className="break-all text-xs text-muted-foreground">Arquivo original anexado: {documento.nome}</p>
        <iframe title={`DANFE original da NF-e ${nota.numero} — série ${nota.serie}`} src={documento.url} className="h-[65dvh] min-h-96 w-full rounded-lg border border-border bg-muted" />
        <p className="text-xs text-muted-foreground">O PDF é exibido sem recriação ou alteração. Para imprimir, abra o original e use a impressão do navegador. A associação foi conferida por quem anexou; o sistema não valida o conteúdo do PDF na SEFAZ.</p>
      </> : !existente && !erro && (notaId ? <div className="space-y-2">
        <Label htmlFor="nf-danfe-original">Anexar PDF original (até 15 MB)</Label>
        <Input id="nf-danfe-original" type="file" accept=".pdf,application/pdf" disabled={ocupado || !!pendente || !user} onChange={selecionar} />
      </div> : <p className="text-sm">Salve primeiro o XML da nota para poder anexar o PDF original correspondente.</p>)}
      {pendente && <div className="space-y-3 rounded-lg border border-primary p-3">
        <p className="break-all text-sm">PDF selecionado: <strong>{pendente.file.name}</strong></p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={(e) => setConfirmado(e.target.checked)} /><span>Conferi que este PDF é o DANFE da NF-e {nota.numero}, série {nota.serie}, emitente {nota.emitente.nome}, chave {nota.chave}.</span></label>
        <div className="flex flex-wrap gap-2"><Button disabled={!confirmado || ocupado} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar DANFE original"}</Button><Button variant="outline" disabled={ocupado} onClick={() => { setPendente(null); setConfirmado(false); setErro(""); }}>Cancelar PDF</Button></div>
      </div>}
      {erro && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{erro}</p>{!pendente && <Button variant="outline" onClick={() => setVersao((v) => v + 1)}>Tentar abrir original novamente</Button>}</div>}
    </section>
    {!carregando && !documento && !existente && <DanfeNotaFiscal nota={nota} />}
  </div>;
}
