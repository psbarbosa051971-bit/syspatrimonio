import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { gerarRelatorioSalaPdf, type DadosRelatorioSala } from "@/lib/relatorio-sala-pdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { dados: DadosRelatorioSala | null; disabled?: boolean };
export function CompartilharRelatorioSala({ dados, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!aberto || !dados) return;
    let ativo = true;
    setArquivo(null); setErro(false);
    gerarRelatorioSalaPdf(dados).then((pdf) => { if (ativo) setArquivo(pdf); })
      .catch(() => { if (ativo) setErro(true); });
    return () => { ativo = false; };
  }, [aberto, dados, tentativa]);

  function baixar() {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url; link.download = arquivo.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast.success("PDF baixado. Anexe o arquivo à conversa no WhatsApp.");
  }
  async function compartilhar() {
    if (!arquivo) return;
    if (!navigator.canShare?.({ files: [arquivo] }) || !navigator.share) {
      baixar(); return;
    }
    setCompartilhando(true);
    try {
      await navigator.share({ files: [arquivo], title: "Relatório de bens da sala" });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        toast.error("O navegador não permitiu compartilhar. Baixe o PDF e anexe no WhatsApp.");
      }
    } finally { setCompartilhando(false); }
  }
  return <>
    <Button variant="outline" size="sm" disabled={disabled || !dados} onClick={() => setAberto(true)}>
      <Share2 className="mr-1 h-4 w-4" /> Compartilhar Relatório
    </Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartilhar Relatório</DialogTitle>
          <DialogDescription>Relatório completo dos bens atuais de {dados?.sala.nome}. O PDF inclui todos os bens da sala, independentemente do termo ou da pesquisa selecionada.</DialogDescription>
        </DialogHeader>
        {erro ? <div role="alert" className="space-y-2 text-sm">
          <p>Não foi possível gerar o PDF.</p>
          <Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
        </div> : !arquivo ? <p role="status">Preparando PDF...</p> : <>
          <p className="break-all text-sm font-medium">{arquivo.name}</p>
          <p className="text-sm text-muted-foreground">Clique em Compartilhar PDF e escolha o WhatsApp, se disponível no seu aparelho. Se o navegador não oferecer compartilhamento de arquivos, o PDF será baixado para você anexar na conversa.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={compartilhando} onClick={() => void compartilhar()}><Share2 className="mr-2 h-4 w-4" /> Compartilhar PDF</Button>
            <Button variant="outline" onClick={baixar}><Download className="mr-2 h-4 w-4" /> Baixar PDF</Button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
