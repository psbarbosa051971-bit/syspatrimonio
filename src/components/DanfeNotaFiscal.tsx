import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { gerarPreviaDanfe } from "@/lib/danfe-nota-fiscal";
import type { NotaFiscalXml } from "@/lib/notas-fiscais";
import { Button } from "@/components/ui/button";

export function DanfeNotaFiscal({ nota }: { nota: NotaFiscalXml }) {
  const [documento, setDocumento] = useState<{ nota: NotaFiscalXml; url: string } | null>(null);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    let url: string | undefined;
    setDocumento(null);
    setErro(false);
    void gerarPreviaDanfe(nota).then((blob) => {
      if (!ativo) return;
      url = URL.createObjectURL(blob);
      setDocumento({ nota, url });
    }).catch(() => { if (ativo) setErro(true); });
    return () => {
      ativo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [nota, tentativa]);
  const url = documento?.nota === nota ? documento.url : "";
  return <section aria-label="DANFE da nota" className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 text-card-foreground">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-semibold">DANFE da nota</h3>
      {url && <div className="flex flex-wrap gap-3 text-sm">
        <a className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Abrir PDF</a>
        <a className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4" href={url} download={`DANFE-previa-${nota.numero}-serie-${nota.serie}.pdf`}><Download className="h-4 w-4" />Baixar PDF</a>
      </div>}
    </div>
    <p className="text-xs text-muted-foreground">Prévia simplificada gerada a partir do XML, sem consulta à SEFAZ. Não substitui o DANFE original do fornecedor.</p>
    {erro ? <div role="alert" className="space-y-2 rounded-lg border border-destructive p-4"><p>Não foi possível gerar a prévia do DANFE.</p><Button variant="outline" onClick={() => setTentativa((valor) => valor + 1)}>Tentar gerar novamente</Button></div>
      : url ? <><iframe title={`DANFE da NF-e ${nota.numero} — série ${nota.serie}`} src={url} className="h-[65dvh] min-h-96 w-full rounded-lg border border-border bg-muted" /><p className="text-xs text-muted-foreground">Se o navegador não mostrar o PDF, use Abrir PDF ou Baixar PDF acima.</p></>
      : <p role="status" className="p-6 text-center text-muted-foreground">Gerando prévia do DANFE…</p>}
  </section>;
}
