import { useEffect, useMemo, useState } from "react";
import { Bell, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SolicitacaoBem } from "@/integrations/supabase/types";
import { agruparSolicitacoes, carregarSolicitacoes, tituloSolicitacao, type GrupoSolicitacoes } from "@/lib/solicitacoes-bens";
import { Button } from "@/components/ui/button";
import { RelatorioBensDialog } from "@/components/RelatorioBensDialog";

export function RelatoriosBens({ salaId, administrador = false, atualizacao = 0 }: {
  salaId?: string;
  administrador?: boolean;
  atualizacao?: number;
}) {
  const [itens, setItens] = useState<SolicitacaoBem[]>([]);
  const [leituras, setLeituras] = useState<Record<string, string>>({});
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<GrupoSolicitacoes | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    let emCurso = false;
    setItens([]);
    setLeituras({});
    setSelecionado(null);
    setCarregando(true);
    async function carregar() {
      if (emCurso) return;
      emCurso = true;
      try {
        const dados = await carregarSolicitacoes(salaId);
        const mapa: Record<string, string> = {};
        if (administrador) {
          for (let inicio = 0; ; inicio += 1000) {
            const { data, error } = await supabase.from("solicitacoes_bens_leituras")
              .select("solicitacao_id,versao_lida").order("solicitacao_id").range(inicio, inicio + 999);
            if (error) throw error;
            for (const leitura of data ?? []) mapa[leitura.solicitacao_id] = leitura.versao_lida;
            if (!data || data.length < 1000) break;
          }
        }
        if (!cancelado) {
          setItens(dados);
          setLeituras(mapa);
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

  const grupos = useMemo(() => agruparSolicitacoes(itens), [itens]);
  const naoLido = (item: SolicitacaoBem) => !leituras[item.id] || leituras[item.id] !== item.updated_at;
  const pendentes = administrador ? itens.filter(naoLido).length : 0;

  async function abrirRelatorio(grupo: GrupoSolicitacoes) {
    setSelecionado(grupo);
    if (!administrador) return;
    const versoes = grupo.itens.filter(naoLido).map((item) => ({
      solicitacao_id: item.id, versao_lida: item.updated_at,
    }));
    if (!versoes.length) return;
    try {
      const { error } = await supabase.from("solicitacoes_bens_leituras")
        .upsert(versoes, { onConflict: "solicitacao_id,admin_id" });
      if (error) throw error;
      setLeituras((atuais) => ({ ...atuais, ...Object.fromEntries(versoes.map((v) => [v.solicitacao_id, v.versao_lida])) }));
    } catch {
      toast.error("O relatório foi aberto, mas não foi possível marcar o alerta como lido.");
    }
  }

  return (
    <section aria-label={administrador ? "Alertas dos administradores" : "Relatórios deste local"}
      className="rounded-lg border border-primary/30 bg-card p-3 text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold" aria-live="polite">
          {administrador ? <Bell className="h-5 w-5 text-primary" /> : <FileText className="h-5 w-5 text-primary" />}
          {administrador ? `Alertas de bens: ${pendentes} novo(s)` : "Transferências e inservíveis"}
        </p>
        <Button variant="outline" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
          {aberto ? "Recolher relatórios" : "Ver relatórios"}
        </Button>
      </div>
      {administrador && <p className="mt-2 text-xs text-muted-foreground">Alertas atualizados automaticamente a cada 15 segundos enquanto o sistema estiver aberto. Clique na mensagem para consultar o relatório.</p>}
      {erro && <p role="alert" className="mt-2 text-sm text-destructive">
        Não foi possível atualizar os relatórios. <button type="button" className="underline"
          onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</button>
      </p>}
      {(aberto || pendentes > 0) && <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
        {carregando && <p className="text-sm text-muted-foreground">Carregando relatórios...</p>}
        {!carregando && !erro && !grupos.length && <p className="text-sm text-muted-foreground">Nenhum bem registrado para transferência ou como inservível.</p>}
        {grupos.filter((grupo) => aberto || grupo.itens.some(naoLido)).map((grupo) => {
          const novos = administrador ? grupo.itens.filter(naoLido).length : 0;
          return <button type="button" key={grupo.chave} onClick={() => void abrirRelatorio(grupo)}
            className="block w-full rounded-md border border-border bg-muted/40 p-3 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="block font-bold text-primary">{tituloSolicitacao(grupo.tipo)}: {grupo.local}</span>
            <span className="mt-1 block text-muted-foreground">{grupo.itens.length} bem(ns){novos > 0 ? ` • ${novos} novo(s)` : ""} • Clique para abrir o relatório</span>
          </button>;
        })}
      </div>}
      {selecionado && <RelatorioBensDialog grupo={selecionado} onClose={() => setSelecionado(null)} />}
    </section>
  );
}
