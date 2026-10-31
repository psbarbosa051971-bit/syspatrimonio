import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { htmlDoTermo, numeroDoTermo } from "@/lib/termo-responsabilidade";
import { resumoTermoDaSala, type TermoDaSala } from "@/lib/termos-da-sala";

type Props = {
  termo: TermoDaSala; entreguePor: string; recebidoPor: string; cpf: string;
  dataEntrega: string; status: string; disabled?: boolean;
};

export function ImprimirEntregaTermo({ termo, entreguePor, recebidoPor, cpf, dataEntrega, status, disabled }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [documento, setDocumento] = useState<{ html: string; chave: number } | null>(null);
  const [preparando, setPreparando] = useState(false);

  function preparar() {
    try {
      const dados = resumoTermoDaSala(termo).dados;
      if (!dados) throw new Error("Os dados deste termo não estão disponíveis.");
      let html = htmlDoTermo({ ...termo, termo_snapshot: {
        ...dados, entregador: entreguePor.trim(),
        responsavel_recebimento: recebidoPor.trim(),
        cpf_recebimento: cpf.trim(),
      } });
      const data = /^\d{4}-\d{2}-\d{2}$/.test(dataEntrega) ? dataEntrega.split("-").reverse().join("/") : "____/____/________";
      const situacao = status === "Entregue" ? "Entregue" : "Aguardando Entrega";
      html = html.replace("<p>DATA DE RECEBIMENTO ____/____/________</p>", `<p>DATA DE RECEBIMENTO ${data}</p><p><strong>STATUS:</strong> ${situacao}</p>`);
      setPreparando(true);
      setDocumento((anterior) => ({ html, chave: (anterior?.chave ?? 0) + 1 }));
    } catch {
      toast.error("Não foi possível preparar o termo para impressão.");
    }
  }

  return <>
    <Button type="button" variant="outline" size="icon" aria-label="Imprimir termo de responsabilidade" title="Imprimir termo / Salvar PDF"
      disabled={disabled || preparando} onClick={preparar}><Printer className="h-4 w-4" /></Button>
    {documento && <iframe key={documento.chave} ref={frame} title={`Impressão do termo ${numeroDoTermo(termo)}`}
      srcDoc={documento.html} sandbox="allow-same-origin allow-modals" aria-hidden="true" tabIndex={-1}
      className="fixed -left-[10000px] top-0 h-[210mm] w-[297mm] border-0"
      onLoad={() => {
        setPreparando(false);
        try {
          const janela = frame.current?.contentWindow;
          if (!janela) throw new Error("Documento indisponível");
          janela.focus(); janela.print();
        } catch { toast.error("Seu navegador não permitiu a impressão. Tente abrir o sistema fora da prévia incorporada."); }
      }} />}
  </>;
}
