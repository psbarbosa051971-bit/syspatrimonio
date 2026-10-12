import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { agruparSolicitacoes, carregarSolicitacoes, tituloSolicitacao, type GrupoSolicitacoes, type SolicitacaoBem } from "@/lib/solicitacoes-bens";
import { Button } from "@/components/ui/button";
import { RelatorioBensDialog } from "@/components/RelatorioBensDialog";
import { TransferenciaBensDialog } from "@/components/TransferenciaBensDialog";

export function RelatoriosBens({ salaId, administrador = false, atualizacao = 0 }: {
  salaId?: string;
  administrador?: boolean;
  atualizacao?: number;
}) {
  const [itens, setItens] = useState<SolicitacaoBem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<GrupoSolicitacoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    let emCurso = false;
    setItens([]);
    setSelecionado(null);
    setCarregando(true);
    async function carregar() {
      if (emCurso) return;
      emCurso = true;
      try {
        const dados = await carregarSolicitacoes(salaId);
        if (!cancelado) {
          setItens(dados);
          setErro(false);
        }
      } catch {
        if (!cancelado) setErro(true);
      } finally {
        emCurso = false;
        if (!cancelado) setCarregando(false);
      }
    }
    void carregar();
    const intervalo = window.setInterval(() => { if (!document.hidden) void carregar(); }, 15000);
    const aoFocar = () => { if (!document.hidden) void carregar(); };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoFocar);
    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [salaId, administrador, atualizacao, tentativa]);

  const grupos = useMemo(() => {
    if (!administrador) return agruparSolicitacoes(itens);
    const locais = new Map<string, GrupoSolicitacoes>();
    for (const item of itens) {
      const chave = item.sala_id ?? item.local_origem;
      const grupo = locais.get(chave) ?? { chave, local: item.local_origem, tipo: item.tipo, itens: [] };
      grupo.itens.push(item);
      locais.set(chave, grupo);
    }
    return [...locais.values()].sort((a, b) => a.local.localeCompare(b.local, "pt-BR", { numeric: true }));
  }, [itens, administrador]);

  if (administrador && itens.length === 0) return null;

  return (
    <section aria-label={administrador ? "Notificações de movimentação de bens" : "Relatórios deste local"}
      className="rounded-lg border border-primary/30 bg-card p-3 text-card-foreground">
      {!administrador && <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText className="h-5 w-5 text-primary" />
          Transferências e inservíveis
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? "Recolher relatórios" : "Ver relatórios"}
        </Button>
      </div>}
      {administrador && <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="w-full rounded-md bg-muted p-3 text-left font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-live="polite">
        <span className="alerta-movimentacao">Existe (em) bens para Movimentação(ões) Inservíveis/Transferência de Localidade.</span>
      </button>}
      {erro && <p role="alert" className="mt-2 text-sm text-destructive">
        Não foi possível atualizar os relatórios. <button type="button" className="underline"
          onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</button>
      </p>}
      {aberto && <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {carregando && <p className="text-sm text-muted-foreground">Carregando relatórios...</p>}
        {!carregando && !erro && !grupos.length && <p className="text-sm text-muted-foreground">Nenhum bem registrado para transferência ou como inservível.</p>}
        {grupos.map((grupo) => <div key={grupo.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-primary">{administrador ? grupo.local : `${tituloSolicitacao(grupo.tipo)}: ${grupo.local}`}</p>
            <p className="mt-1 text-muted-foreground">{grupo.itens.length} bem(ns) pendente(s)</p>
          </div>
          {administrador && <div className="flex flex-wrap gap-2 font-medium">
            {grupo.itens.some((item) => item.tipo === "inservivel") && <span>(Inservíveis)</span>}
            {grupo.itens.some((item) => item.tipo === "transferencia") && <span>(Transferência)</span>}
          </div>}
          <Button variant="outline" size="sm" onClick={() => setSelecionado(grupo)} aria-label={`${administrador ? "Abrir formulário" : "Abrir relatório"} — ${grupo.local}`}>
            {administrador ? "Abrir formulário" : "Abrir relatório"}
          </Button>
        </div>)}
      </div>}
      {selecionado && (administrador ? <TransferenciaBensDialog grupo={selecionado} onClose={() => setSelecionado(null)}
        onSaved={(_sala, _termo, ids) => {
          setItens((atuais) => atuais.filter((item) => !item.bem_id || !ids?.includes(item.bem_id)));
        }} /> : <RelatorioBensDialog key={selecionado.chave} grupo={selecionado} onClose={() => setSelecionado(null)}
          onEstornados={(ids) => {
            setItens((atuais) => atuais.filter((item) => !ids.includes(item.id)));
            setSelecionado((atual) => {
              if (!atual) return null;
              const restantes = atual.itens.filter((item) => !ids.includes(item.id));
              return restantes.length ? { ...atual, itens: restantes } : null;
            });
          }} />)}
    </section>
  );
}
