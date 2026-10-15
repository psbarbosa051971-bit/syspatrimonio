import { useEffect, useState } from "react";
import { Download, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConviteInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstalarApp() {
  const [visivel, setVisivel] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [convite, setConvite] = useState<ConviteInstalacao | null>(null);
  const [instalando, setInstalando] = useState(false);
  const [erro, setErro] = useState("");
  const [embutido, setEmbutido] = useState(false);

  useEffect(() => {
    const modoApp = window.matchMedia("(display-mode: standalone)");
    const ios = navigator as Navigator & { standalone?: boolean };
    const atualizar = () => setVisivel(!modoApp.matches && !ios.standalone);
    atualizar();
    setEmbutido(window.self !== window.top);
    const receberConvite = (event: Event) => {
      event.preventDefault();
      setConvite(event as ConviteInstalacao);
    };
    const instalado = () => {
      setVisivel(false);
      setAberto(false);
      setConvite(null);
    };
    window.addEventListener("beforeinstallprompt", receberConvite);
    window.addEventListener("appinstalled", instalado);
    modoApp.addEventListener("change", atualizar);
    // Usa o mesmo registro das notificações, sem substituir as assinaturas do chat.
    if (window.isSecureContext && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/chat-push-sw.js", { scope: "/" }).catch(() => {
        // A instalação manual continua disponível nas instruções do navegador.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", receberConvite);
      window.removeEventListener("appinstalled", instalado);
      modoApp.removeEventListener("change", atualizar);
    };
  }, []);

  async function instalar() {
    if (!convite || instalando) return;
    setInstalando(true);
    setErro("");
    try {
      await convite.prompt();
      const escolha = await convite.userChoice;
      if (escolha.outcome === "accepted") setAberto(false);
    } catch {
      setErro("Não foi possível abrir a instalação. Use o menu do navegador conforme as instruções abaixo.");
    } finally {
      setConvite(null);
      setInstalando(false);
    }
  }

  if (!visivel) return null;

  return (
    <>
      <aside aria-label="Instalação do aplicativo" className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-accent px-4 py-2 text-accent-foreground print:hidden">
        <div className="flex items-center gap-2 text-sm">
          <MonitorSmartphone className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span><strong>SysPatrimônio no PC e no celular</strong><span className="hidden sm:inline"> — abra direto pelo ícone do aplicativo.</span></span>
        </div>
        <Button size="sm" onClick={() => setAberto(true)}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />Instalar aplicativo
        </Button>
      </aside>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Instalar SysPatrimônio</DialogTitle>
            <DialogDescription>Use o mesmo sistema em uma janela própria, com um ícone no computador ou na tela inicial do celular.</DialogDescription>
          </DialogHeader>
          {embutido && <p className="rounded-md border border-border bg-accent p-3 text-sm text-accent-foreground">Você está em uma prévia incorporada. Para instalar, publique o site no Lovable e abra o endereço publicado diretamente no navegador, fora do editor.</p>}
          {convite && !embutido && <Button onClick={() => void instalar()} disabled={instalando}><Download className="mr-2 h-4 w-4" aria-hidden="true" />{instalando ? "Aguardando confirmação…" : "Instalar agora"}</Button>}
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="space-y-4 text-sm">
            <section><h3 className="font-semibold">Computador — Chrome ou Edge</h3><p className="mt-1 text-muted-foreground">Abra o site publicado. Clique no ícone de instalação na barra de endereço ou no menu do navegador, em “Instalar SysPatrimônio” ou “Aplicativos → Instalar este site como aplicativo”.</p></section>
            <section><h3 className="font-semibold">Android — Chrome</h3><p className="mt-1 text-muted-foreground">Abra o site publicado no Chrome. Toque no menu ⋮ e escolha “Adicionar à tela inicial” ou “Instalar aplicativo”. Confirme a instalação.</p></section>
            <section><h3 className="font-semibold">iPhone ou iPad — Safari</h3><p className="mt-1 text-muted-foreground">Abra o site publicado no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”. Se aparecer “Abrir como App”, mantenha ativado e confirme em “Adicionar”.</p></section>
          </div>
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">A instalação depende do navegador e exige um endereço seguro (HTTPS). Não é necessário baixar pela loja. Entre com sua conta habitual; consultar e salvar dados exige internet. Se o app já estiver instalado, abra pelo ícone.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
