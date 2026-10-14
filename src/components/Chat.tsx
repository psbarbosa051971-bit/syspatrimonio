import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Minus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Papel } from "@/hooks/use-role";
import { useChat } from "@/hooks/use-chat";
import { useChatPush } from "@/hooks/use-chat-push";

export function Chat({ userId, role }: { userId: string; role: Papel | null }) {
  const permitido = role === "admin" || role === "operador" || role === "visualizador";
  return permitido ? <JanelaChat key={userId} userId={userId} administrador={role === "admin"} /> : null;
}

function JanelaChat({ userId, administrador }: { userId: string; administrador: boolean }) {
  const [aberto, setAberto] = useState(true);
  const [texto, setTexto] = useState("");
  const [pendente, setPendente] = useState<string | null>(null);
  const [mensagemSelecionada, setMensagemSelecionada] = useState<number | "boas-vindas" | null>(null);
  const [boasVindasOculta, setBoasVindasOculta] = useState(false);
  const chat = useChat(userId, administrador, aberto);
  const push = useChatPush(userId);
  const recebidaTratada = useRef<number | null>(null);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const recebida = chat.recebida;
    if (!recebida || recebidaTratada.current === recebida.id) return;
    recebidaTratada.current = recebida.id;
    setAberto(true);
    if (administrador && recebida.conversa_id !== chat.selecionada) {
      if (texto.trim() || chat.enviando) {
        setPendente(recebida.conversa_id);
      } else {
        chat.setSelecionada(recebida.conversa_id);
        setPendente(null);
      }
    }
  }, [chat.recebida, chat.selecionada, chat.setSelecionada, chat.enviando, administrador, texto]);
  const ultimaMensagem = chat.mensagens.at(-1)?.id;
  const conversa = chat.conversas.find((item) => item.user_id === chat.selecionada);
  const exibirMensagens = !administrador || !!chat.selecionada;

  useEffect(() => { setTexto(""); }, [chat.selecionada]);
  useEffect(() => {
    if (aberto && ultimaMensagem) fim.current?.scrollIntoView({ block: "end" });
  }, [aberto, ultimaMensagem]);

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    if (await chat.enviar(texto)) setTexto("");
  }

  return (
    <>
      {!aberto && <Button onClick={() => setAberto(true)} aria-expanded={false} aria-controls="chat-flutuante"
        className="fixed bottom-5 right-4 z-40 gap-2 rounded-full px-5 shadow-lg print:hidden">
        <MessageCircle className="h-5 w-5" aria-hidden="true" /> Chat
      </Button>}
      <section id="chat-flutuante" role="region" aria-labelledby="chat-titulo" hidden={!aberto}
        className={`${aberto ? "flex" : "hidden"} fixed bottom-3 right-2 z-40 h-[min(70dvh,580px)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] ${administrador ? "sm:w-[680px]" : "sm:w-[400px]"} flex-col gap-3 rounded-xl border bg-background p-3 text-foreground shadow-2xl sm:bottom-5 sm:right-4 print:hidden`}>
        <header className="flex items-start justify-between gap-2 border-b pb-2">
          <div>
            <h2 id="chat-titulo" className="text-base font-semibold">Chat {administrador ? "— atendimento" : "com o administrador"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {administrador ? "Novas mensagens abrem a conversa automaticamente." : "Conversa privada com os administradores. Responda por aqui."}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label="Minimizar chat" onClick={() => setAberto(false)}>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>
        <details className="shrink-0 rounded-md border bg-muted/40 px-2 py-1 text-xs">
          <summary className="cursor-pointer font-medium">
            {push.estado === "ativado" ? "Avisos neste computador: ativados" : "Receber avisos mesmo com o sistema fechado"}
          </summary>
          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pb-1">
            <p>Ative uma vez em cada navegador, com sua conta. Administradores recebem avisos das mensagens dos usuários; operadores e visualizadores recebem as respostas dos administradores, mesmo sem login.</p>
            <p>O aviso não mostra o texto privado. Para ler e responder, entre no sistema. É necessário internet e notificações permitidas no navegador e no computador; com o navegador totalmente encerrado, a entrega depende dele. Em computador compartilhado, desative antes de sair.</p>
            {push.estado === "indisponivel" ? <p>Abra o site publicado em uma aba própria de um navegador compatível. No iPhone/iPad, adicione o site à Tela de Início e abra por lá.</p>
              : push.estado === "bloqueado" ? <p>Notificações bloqueadas. Libere nas permissões deste site no navegador e recarregue a página.</p>
              : <Button type="button" variant="outline" size="sm" disabled={push.ocupado || push.estado === "verificando"}
                onClick={() => void (push.estado === "ativado" ? push.desativar() : push.ativar())}>
                {push.ocupado ? "Aguarde..." : push.estado === "verificando" ? "Verificando avisos..." : push.estado === "ativado" ? "Desativar avisos neste computador" : "Ativar avisos neste computador"}
              </Button>}
            {push.erro && <p role="alert" className="text-destructive">{push.erro}</p>}
          </div>
        </details>
        {pendente && <div role="status" className="rounded-md border bg-accent p-2 text-sm text-accent-foreground">
          <p>Nova mensagem de {chat.conversas.find((item) => item.user_id === pendente)?.nome ?? "outro usuário"}. Seu texto atual foi mantido.</p>
          <Button variant="outline" size="sm" disabled={chat.enviando} onClick={() => {
            chat.setSelecionada(pendente); setPendente(null);
          }}>Ver conversa recebida</Button>
        </div>}
        {chat.erro && <p role="alert" className="rounded-md border border-destructive p-2 text-sm text-destructive">{chat.erro}</p>}
        <div className="flex min-h-0 flex-1 gap-3">
          {administrador && (
            <aside aria-label="Conversas" className={`${chat.selecionada ? "hidden sm:flex" : "flex"} w-full flex-col gap-2 overflow-y-auto sm:w-44 sm:shrink-0 sm:border-r sm:pr-3`}>
              <h3 className="text-sm font-semibold">Conversas ({chat.conversas.length})</h3>
              {!chat.conversas.length && <p className="text-sm text-muted-foreground">{chat.carregando ? "Carregando..." : "Nenhuma conversa ainda. Ela aparecerá quando um usuário enviar uma mensagem pelo computador ou celular."}</p>}
              {chat.conversas.map((item) => (
                <Button key={item.user_id} variant={chat.selecionada === item.user_id ? "secondary" : "ghost"}
                  className="h-auto w-full flex-col items-start whitespace-normal py-3 text-left"
                  aria-pressed={chat.selecionada === item.user_id} disabled={chat.enviando}
                  onClick={() => { chat.setSelecionada(item.user_id); if (pendente === item.user_id) setPendente(null); }}>
                  <span className="break-words font-medium">{item.nome}</span>
                  <span className="text-xs text-muted-foreground">Identificação: {item.user_id.slice(0, 8)}</span>
                </Button>
              ))}
            </aside>
          )}
          <section aria-label="Mensagens" className={`${exibirMensagens ? "flex" : "hidden sm:flex"} min-h-0 min-w-0 flex-1 flex-col gap-2`}>
            {administrador && chat.selecionada && (
              <div className="flex items-center gap-2 border-b pb-2">
                <Button variant="ghost" size="icon" className="shrink-0 sm:hidden" aria-label="Voltar às conversas" disabled={chat.enviando} onClick={() => chat.setSelecionada(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h3 className="truncate text-sm font-semibold">{conversa?.nome ?? "Usuário"}</h3>
              </div>
            )}
            {!exibirMensagens ? <p className="m-auto text-center text-sm text-muted-foreground">Selecione uma conversa ao lado.</p> : <>
              <div role="log" aria-label="Histórico da conversa" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md bg-muted/40 p-3">
                {chat.temAnteriores && <Button variant="outline" size="sm" onClick={chat.carregarAnteriores} disabled={chat.carregando}>Carregar mensagens anteriores</Button>}
                {!administrador && !boasVindasOculta && <article className="relative mr-auto w-fit max-w-[90%] rounded-lg border bg-card px-3 py-2 text-card-foreground">
                  <button type="button" className={`block w-full text-left ${mensagemSelecionada === "boas-vindas" ? "pr-7" : ""}`}
                    aria-expanded={mensagemSelecionada === "boas-vindas"} onClick={() => setMensagemSelecionada(mensagemSelecionada === "boas-vindas" ? null : "boas-vindas")}>
                    <span className="mb-1 block text-xs font-semibold">Departamento de Patrimônio · Mensagem automática</span>
                    <span className="block whitespace-pre-wrap break-words text-sm">Olá! Seja muito bem-vindo(a) ao Departamento de Patrimônio! ✨ É um prazer receber o seu contato. Por favor, aguarde um momento que em instantes iremos atender você.</span>
                  </button>
                  {mensagemSelecionada === "boas-vindas" && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" aria-label="Excluir mensagem automática"
                    onClick={() => { setBoasVindasOculta(true); setMensagemSelecionada(null); }}><X className="h-4 w-4" aria-hidden="true" /></Button>}
                </article>}
                {chat.carregando && !chat.mensagens.length && <p className="text-sm text-muted-foreground">Carregando mensagens...</p>}
                {!chat.carregando && !chat.mensagens.length && <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Escreva abaixo para iniciar.</p>}
                {chat.mensagens.map((mensagem) => {
                  const propria = mensagem.autor_id === userId;
                  return (
                    <article key={mensagem.id} className={`${propria ? "ml-auto bg-primary text-primary-foreground" : "mr-auto border bg-card text-card-foreground"} relative w-fit max-w-[90%] rounded-lg px-3 py-2`}>
                      <button type="button" className={`block w-full text-left ${mensagemSelecionada === mensagem.id ? "pr-7" : ""}`}
                        aria-expanded={mensagemSelecionada === mensagem.id}
                        onClick={() => setMensagemSelecionada(mensagemSelecionada === mensagem.id ? null : mensagem.id)}>
                        <span className="mb-1 block text-xs font-semibold">{propria ? "Você" : mensagem.autor_id === (administrador ? chat.selecionada : userId) ? (conversa?.nome ?? "Usuário") : "Administrador"}</span>
                        <span className="block whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{mensagem.conteudo}</span>
                        <time dateTime={mensagem.criado_em} className="mt-1 block text-[10px] opacity-80">{new Date(mensagem.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
                      </button>
                      {mensagemSelecionada === mensagem.id && <button type="button" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md hover:bg-foreground/10 focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
                        aria-label={`Excluir mensagem ${mensagem.id}`} title="Excluir para todos os participantes" disabled={chat.excluindo != null}
                        onClick={async () => {
                          if (!window.confirm("Excluir esta mensagem para todos os participantes? Esta ação não pode ser desfeita.")) return;
                          if (await chat.excluir(mensagem.id)) setMensagemSelecionada(null);
                        }}><X className="h-4 w-4" aria-hidden="true" /></button>}
                    </article>
                  );
                })}
                <div ref={fim} />
              </div>
              <form onSubmit={enviar} className="shrink-0 space-y-2">
                <label htmlFor="chat-mensagem" className="text-sm font-medium">Mensagem</label>
                <Textarea id="chat-mensagem" value={texto} onChange={(event) => setTexto(event.target.value)}
                  placeholder="Digite sua mensagem..." maxLength={2000} rows={2} disabled={chat.enviando}
                  className="max-h-32 resize-none" />
                <p className="text-xs text-muted-foreground">{texto.length}/2000 · Atualiza a cada 5 s</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" disabled={chat.enviando || chat.excluindo != null} onClick={() => {
                    if (texto.trim() && !window.confirm("Encerrar o bate-papo e descartar o texto não enviado?")) return;
                    setTexto(""); setPendente(null); setMensagemSelecionada(null);
                    setBoasVindasOculta(false); setAberto(false);
                  }}>Encerrar bate-papo</Button>
                  <Button type="submit" disabled={!texto.trim() || chat.enviando} className="gap-2">
                    <Send className="h-4 w-4" aria-hidden="true" />{chat.enviando ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </form>
            </>}
          </section>
        </div>
      </section>
    </>
  );
}
