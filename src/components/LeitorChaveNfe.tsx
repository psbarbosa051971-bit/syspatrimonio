import { useEffect, useRef, useState } from "react";
import { extrairChaveNfe } from "@/lib/checklist-veiculos";
import { Button } from "@/components/ui/button";

type Props = { onRead: (chave: string) => void; onClose: () => void };

export function LeitorChaveNfe({ onRead, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onRead, onClose });
  callbacks.current = { onRead, onClose };
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    let concluido = false;
    let parar: (() => void) | undefined;
    const elemento = video.current;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Câmera indisponível neste navegador. Digite a chave ou use o XML.");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelado || !elemento) return;
        const leitor = new BrowserMultiFormatReader();
        const controles = await leitor.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } },
          elemento,
          (resultado, _erro, controle) => {
            if (!resultado || concluido || cancelado) return;
            try {
              const chave = extrairChaveNfe(resultado.getText());
              concluido = true;
              controle.stop();
              callbacks.current.onRead(chave);
            } catch { /* Continua procurando um código válido de NF-e. */ }
          },
        );
        parar = () => controles.stop();
        if (cancelado || concluido) parar();
      } catch (falha) {
        if (!cancelado) setErro(falha instanceof Error && falha.message.startsWith("Câmera indisponível") ? falha.message : "Não foi possível abrir a câmera. Verifique a permissão do navegador ou digite a chave / carregue o XML.");
      }
    })();
    return () => {
      cancelado = true;
      parar?.();
      const stream = elemento?.srcObject;
      if (typeof MediaStream !== "undefined" && stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return <div className="space-y-2 rounded-lg border border-border bg-background p-3">
    <p className="text-sm">Aponte a câmera para o código de barras da chave de acesso no DANFE. Mantenha os 44 dígitos e as barras inteiras no enquadramento, com boa iluminação.</p>
    {erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : <video ref={video} autoPlay muted playsInline aria-label="Leitor de código de barras da NF-e" className="max-h-64 w-full rounded-md bg-muted object-contain" />}
    <Button type="button" variant="outline" onClick={onClose}>Fechar câmera</Button>
  </div>;
}
