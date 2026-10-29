import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const bucket = "danfes-originais";
const mensagem = (e: unknown) => e && typeof e === "object" && "message" in e ? String(e.message) : "Não foi possível abrir ou salvar o PDF. Tente novamente.";
type Arquivo = { arquivo_path: string; arquivo_nome: string };
type Pendente = { file: File; path?: string };

export function PdfNotaFiscal({ fornecedor, numero, registros }: { fornecedor: string; numero: string; registros: { id: string }[] }) {
  const { user } = useAuth();
  const ativo = useRef(true);
  const [versao, setVersao] = useState(0);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [indice, setIndice] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  useEffect(() => { ativo.current = true; return () => { ativo.current = false; }; }, []);

  useEffect(() => {
    let atual = true;
    setCarregando(true); setErro(""); setArquivos([]); setIndice(0);
    void (async () => {
      try {
        const resultado = await supabase.from("notas_fiscais_pdfs").select("arquivo_path,arquivo_nome")
          .eq("fornecedor", fornecedor).eq("numero", numero);
        if (resultado.error) throw resultado.error;
        const encontrados: Arquivo[] = [...(resultado.data ?? [])];
        if (registros.length) {
          const antigos = await supabase.from("notas_fiscais_danfes").select("arquivo_path,arquivo_nome")
            .in("nota_fiscal_id", registros.map((r) => r.id));
          if (antigos.error) throw antigos.error;
          encontrados.push(...(antigos.data ?? []));
        }
        if (atual) setArquivos(encontrados);
      } catch (e) { if (atual) setErro(mensagem(e)); }
      finally { if (atual) setCarregando(false); }
    })();
    return () => { atual = false; };
  }, [fornecedor, numero, registros, versao]);

  const arquivo = arquivos[indice];
  useEffect(() => {
    let atual = true;
    let blobUrl = "";
    setUrl("");
    if (pendente) {
      blobUrl = URL.createObjectURL(pendente.file);
      setUrl(blobUrl);
    } else if (arquivo) {
      void (async () => {
        try {
          const resposta = await supabase.storage.from(bucket).download(arquivo.arquivo_path);
          if (resposta.error) throw resposta.error;
          if (!atual) return;
          blobUrl = URL.createObjectURL(resposta.data);
          setUrl(blobUrl);
        } catch (e) { if (atual) setErro(mensagem(e)); }
      })();
    }
    return () => { atual = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [arquivo, pendente, versao]);

  async function selecionar(evento: ChangeEvent<HTMLInputElement>) {
    const file = evento.target.files?.[0];
    evento.target.value = "";
    if (!file) return;
    setErro(""); setOcupado(true); setConfirmado(false);
    try {
      if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 15 * 1024 * 1024) throw new Error("Selecione um PDF de até 15 MB.");
      const assinatura = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
      if (!assinatura.includes("%PDF-")) throw new Error("O arquivo selecionado não é um PDF válido.");
      if (ativo.current) setPendente({ file });
    } catch (e) { if (ativo.current) setErro(mensagem(e)); }
    finally { if (ativo.current) setOcupado(false); }
  }

  async function salvar() {
    if (!pendente || !confirmado || !user || ocupado) return;
    setOcupado(true); setErro("");
    try {
      let path = pendente.path;
      if (!path) {
        path = `notas/${user.id}/${crypto.randomUUID()}.pdf`;
        const envio = await supabase.storage.from(bucket).upload(path, pendente.file, { contentType: "application/pdf", upsert: false });
        if (envio.error) throw envio.error;
        if (!ativo.current) return;
        setPendente({ file: pendente.file, path });
      }
      const { error } = await supabase.from("notas_fiscais_pdfs").insert({
        fornecedor, numero, arquivo_path: path, arquivo_nome: pendente.file.name.slice(0, 255), criado_por: user.id,
      });
      if (error && error.code !== "23505") throw error;
      if (ativo.current) { setPendente(null); setConfirmado(false); setVersao((v) => v + 1); }
    } catch (e) { if (ativo.current) setErro(mensagem(e)); }
    finally { if (ativo.current) setOcupado(false); }
  }

  return <section aria-label="PDF da nota fiscal" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h3 className="text-lg font-semibold">PDF da nota fiscal</h3>
    <p className="text-sm text-muted-foreground">Anexe o PDF original da nota nº {numero}, do fornecedor {fornecedor}. Não é necessário XML. O anexo não cadastra novos bens.</p>
    {carregando ? <p role="status">Consultando PDF da nota…</p> : !arquivos.length && !pendente && <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Nenhum PDF anexado para esta nota.</p>
      <Label htmlFor="nf-pdf">Importar PDF da nota (até 15 MB)</Label>
      <Input id="nf-pdf" type="file" accept=".pdf,application/pdf" disabled={ocupado || !user || !!erro} onChange={selecionar} />
    </div>}
    {arquivos.length > 1 && <div className="space-y-1">
      <Label htmlFor="nf-pdf-salvo">PDF salvo</Label>
      <select id="nf-pdf-salvo" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={indice} onChange={(e) => { setIndice(Number(e.target.value)); setErro(""); }}>
        {arquivos.map((item, i) => <option key={item.arquivo_path} value={i}>{item.arquivo_nome}</option>)}
      </select>
    </div>}
    {pendente && <div className="space-y-3 rounded-lg border border-primary p-3">
      <p className="break-all text-sm">PDF selecionado — ainda não salvo: <strong>{pendente.file.name}</strong></p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmado} disabled={ocupado} onChange={(e) => setConfirmado(e.target.checked)} /><span>Conferi que este PDF pertence ao fornecedor <strong>{fornecedor}</strong> e à nota nº <strong>{numero}</strong>.</span></label>
      <div className="flex flex-wrap gap-2"><Button disabled={!confirmado || ocupado || !user} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar PDF da nota"}</Button><Button variant="outline" disabled={ocupado} onClick={() => { setPendente(null); setConfirmado(false); setErro(""); }}>Cancelar PDF</Button></div>
    </div>}
    {erro && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{erro}</p><Button variant="outline" disabled={ocupado} onClick={() => { setErro(""); setVersao((v) => v + 1); }}>Tentar novamente</Button></div>}
    {url ? <>
      {!pendente && <div className="flex flex-wrap gap-3 text-sm">
        <a className="inline-flex items-center gap-1 text-primary underline" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Abrir / Imprimir nota</a>
        <a className="inline-flex items-center gap-1 text-primary underline" href={url} download={arquivo?.arquivo_nome}><Download className="h-4 w-4" />Baixar PDF</a>
      </div>}
      <iframe title={`PDF da nota fiscal ${numero}`} src={url} className="h-[65dvh] min-h-96 w-full rounded-lg border border-border bg-muted" />
      <p className="text-xs text-muted-foreground">O PDF é exibido sem alteração. Confira fornecedor e número antes de salvar; o sistema não valida o conteúdo na SEFAZ.</p>
    </> : arquivo && !erro && <p role="status">Abrindo PDF da nota…</p>}
  </section>;
}
