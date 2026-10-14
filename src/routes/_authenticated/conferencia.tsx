import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";
import { ObservacoesBemDialog } from "@/components/ObservacoesBemDialog";
import { RelatoriosBens } from "@/components/RelatoriosBens";
import { BotaoRecebimentoVeiculo } from "@/components/RecebimentoVeiculosDialog";
import { EditarDescricaoBem } from "@/components/EditarDescricaoBem";
import { useRole } from "@/hooks/use-role";
import { Input } from "@/components/ui/input";
import { correspondePesquisaDinamica } from "@/lib/pesquisa-dinamica";

export const Route = createFileRoute("/_authenticated/conferencia")({
  head: () => ({
    meta: [
      { title: "Conferência de bens — SysPatrimônio" },
      { name: "description", content: "Conferência dos bens patrimoniais por local." },
      { property: "og:title", content: "Conferência de bens — SysPatrimônio" },
      { property: "og:description", content: "Marque os bens localizados em cada sala." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConferenciaPage,
});

type Sala = Tables<"salas">;
type Bem = Tables<"bens">;
type CampoOrdenacao = "conferido" | "codigo_red" | "descricao" | "situacao" | "valor";
type Ordenacao = { campo: CampoOrdenacao; crescente: boolean };
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const situacaoBem = (bem: Bem) => bem.conferido ? "LOCALIZADO" : bem.conferencia_finalizada ? "NÃO LOCALIZADO" : "A CONFERIR";

function CabecalhoOrdenavel({ campo, titulo, ordenacao, onOrdenar, className = "" }: {
  campo: CampoOrdenacao;
  titulo: string;
  ordenacao: Ordenacao;
  onOrdenar: (campo: CampoOrdenacao) => void;
  className?: string;
}) {
  const ativo = ordenacao.campo === campo;
  const Icone = ativo ? (ordenacao.crescente ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={`p-0 font-bold text-conference-header-foreground ${className}`}
      aria-sort={ativo ? (ordenacao.crescente ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onOrdenar(campo)}
        title={`Ordenar por ${titulo}: ${ativo && ordenacao.crescente ? "decrescente" : "crescente"}`}
        className={`flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-xs tracking-wide hover:bg-conference-header-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-conference-header-foreground ${campo === "valor" ? "justify-end" : ""}`}>
        {titulo}<Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function ConferenciaPage() {
  const navigate = useNavigate();
  const { podeEditar } = useRole();
  const [salas, setSalas] = useState<Sala[]>([]);
  const [sala, setSala] = useState<Sala | null>(null);
  const [bens, setBens] = useState<Bem[]>([]);
  const [buscaBens, setBuscaBens] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: "codigo_red", crescente: true });
  const [obsBem, setObsBem] = useState<Bem | null>(null);
  const [atualizacaoRelatorios, setAtualizacaoRelatorios] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendentes, setPendentes] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("salas").select("*").order("nome").then(({ data, error }) => {
      if (error) {
        toast.error("Não foi possível carregar os locais da conferência.");
        return;
      }
      setSalas(data ?? []);
      setSala((atual) => atual ?? data?.[0] ?? null);
    });
  }, []);
  useEffect(() => {
    if (!sala) return setBens([]);
    let cancelado = false;
    setCarregando(true);
    setBens([]);
    async function carregarBens() {
      try {
        const todos: Bem[] = [];
        for (let inicio = 0; ; inicio += 1000) {
          const { data, error } = await supabase.from("bens").select("*")
            .eq("sala_id", sala!.id).order("codigo_red").order("id").range(inicio, inicio + 999);
          if (cancelado) return;
          if (error) throw error;
          todos.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        setBens(todos);
      } catch {
        if (!cancelado) toast.error("Não foi possível carregar os bens deste local.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void carregarBens();
    return () => { cancelado = true; };
  }, [sala]);

  const bensOrdenados = useMemo(() => {
    const compararTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
    const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const termo = normalizar(buscaBens.trim());
    return bens.filter((bem) => !termo || correspondePesquisaDinamica(bem, buscaBens)
      || [bem.incorporacao, bem.tipo, bem.observacao, situacaoBem(bem)]
        .some((valor) => normalizar(valor ?? "").includes(termo))).sort((a, b) => {
      let resultado: number;
      switch (ordenacao.campo) {
        case "conferido": resultado = Number(a.conferido) - Number(b.conferido); break;
        case "valor": resultado = Number(a.valor) - Number(b.valor); break;
        case "descricao": resultado = compararTexto(limparDescricao(a.descricao), limparDescricao(b.descricao)); break;
        case "situacao": resultado = compararTexto(situacaoBem(a), situacaoBem(b)); break;
        default: resultado = compararTexto(a.codigo_red, b.codigo_red);
      }
      return (ordenacao.crescente ? resultado : -resultado) || compararTexto(a.codigo_red, b.codigo_red) || a.id.localeCompare(b.id);
    });
  }, [bens, ordenacao, buscaBens]);

  function ordenar(campo: CampoOrdenacao) {
    setOrdenacao((atual) => ({ campo, crescente: atual.campo === campo ? !atual.crescente : true }));
  }

  async function marcar(itens: Bem[], v: boolean) {
    if (carregando || salvando || pendentes.length) return;
    const alterados = itens.filter((b) => b.conferido !== v);
    if (!alterados.length) return;
    const anteriores = new Map(alterados.map((b) => [b.id, b.conferido]));
    const falhas = new Set<string>();
    setPendentes(alterados.map((b) => b.id));
    setBens((p) => p.map((b) => anteriores.has(b.id) ? { ...b, conferido: v } : b));
    try {
      // Limita as requisições simultâneas sem mudar a forma de salvar cada bem.
      for (let inicio = 0; inicio < alterados.length; inicio += 10) {
        await Promise.all(alterados.slice(inicio, inicio + 10).map(async (b) => {
          try {
            const { error } = await supabase.rpc("marcar_conferido", { _bem_id: b.id, _valor: v });
            if (error) throw error;
          } catch {
            falhas.add(b.id);
          }
        }));
      }
    } finally {
      if (falhas.size) {
        setBens((p) => p.map((b) => falhas.has(b.id) ? { ...b, conferido: anteriores.get(b.id)! } : b));
        toast.error(alterados.length === 1
          ? "Erro ao salvar a marcação. Tente novamente."
          : `Não foi possível salvar a marcação de ${falhas.size} bem(ns). As demais foram salvas. Tente novamente.`);
      }
      setPendentes([]);
    }
  }

  async function salvarConferencia() {
    if (!sala || carregando || salvando || pendentes.length || !bens.length) return;
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("salvar_conferencia", {
        _sala_id: sala.id,
        _bens_ids: bens.map((b) => b.id),
        _localizados: bens.filter((b) => b.conferido).map((b) => b.id),
      });
      if (error) throw error;
      setBens((p) => p.map((b) => ({ ...b, conferencia_finalizada: true })));
      toast.success("Conferência salva. Os itens não marcados foram identificados como NÃO LOCALIZADO.");
    } catch {
      toast.error("Não foi possível salvar a conferência. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const localizados = bens.filter((b) => b.conferido).length;
  const valorTotal = bens.reduce((total, b) => total + Number(b.valor), 0);
  const naoLocalizados = bens.filter((b) => !b.conferido && b.conferencia_finalizada).length;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-primary px-3 py-2 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-6 w-6 text-primary-foreground" />
            <span className="truncate text-base font-bold sm:text-lg text-primary-foreground">SysPatrimônio — Conferência</span>
          </div>
          <Button variant="ghost" size="sm"
            className="text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        <Card className="min-w-0 self-start">
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Conferência de bens</CardTitle>
              <Button onClick={salvarConferencia}
                disabled={!sala || !bens.length || carregando || salvando || pendentes.length > 0}>
                <Save className="mr-2 h-4 w-4" />
                {salvando ? "Salvando..." : "Salvar conferência"}
              </Button>
            </div>
            <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="local-conferencia" className="font-bold">Local Físico:</label>
                {salas.length > 1 ? (
                  <select id="local-conferencia" value={sala?.id ?? ""}
                    disabled={salvando || pendentes.length > 0}
                    onChange={(e) => {
                      setBuscaBens("");
                      setSala(salas.find((local) => local.id === e.target.value) ?? null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-foreground disabled:opacity-60">
                    {salas.map((local) => <option key={local.id} value={local.id}>{local.nome}</option>)}
                  </select>
                ) : <span>{sala?.nome ?? "Nenhum local disponível"}</span>}
              </div>
              <p><strong>Responsável pelo local:</strong> {sala?.responsavel ?? "—"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-xs font-semibold text-primary">Quantidade de itens</p>
                <p className="text-xl font-bold tabular-nums">{carregando ? "—" : bens.length}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-xs font-semibold text-primary">Valor total dos bens</p>
                <p className="break-words text-xl font-bold tabular-nums">{carregando ? "—" : moeda(valorTotal)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Marque “Sim” nos bens encontrados, individualmente ou pela opção “Selecionar todos”, e clique em Salvar conferência para identificar os demais como NÃO LOCALIZADO.</p>
            <div className="space-y-1">
              <label htmlFor="pesquisa-bens-conferencia" className="text-sm font-semibold">Pesquisar bens da sala</label>
              <Input id="pesquisa-bens-conferencia" type="search" aria-label="Pesquisar bens da sala"
                placeholder="Pesquisar por código RED, descrição, valor ou situação..."
                value={buscaBens} onChange={(e) => setBuscaBens(e.target.value)} />
              <p role="status" className="text-xs text-muted-foreground">Exibindo {bensOrdenados.length} de {bens.length} bens do local. A pesquisa não altera as marcações nem os totais da sala.</p>
            </div>
            <label className="inline-flex w-fit items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-primary disabled:opacity-50"
                checked={bensOrdenados.length > 0 && bensOrdenados.every((bem) => bem.conferido)}
                ref={(elemento) => { if (elemento) elemento.indeterminate = bensOrdenados.some((bem) => bem.conferido) && bensOrdenados.some((bem) => !bem.conferido); }}
                disabled={!bensOrdenados.length || carregando || salvando || pendentes.length > 0}
                onChange={(e) => void marcar(bensOrdenados, e.target.checked)} />
              {buscaBens.trim() ? "Selecionar todos os resultados da pesquisa" : "Selecionar todos"}
            </label>
            {sala && <RelatoriosBens salaId={sala.id} atualizacao={atualizacaoRelatorios} />}
          </CardHeader>
          <CardContent>
            <div role="region" aria-label="Lista de bens da conferência" tabIndex={0}
              className="rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:max-h-[55vh] [&>div]:overflow-y-scroll [&>div]:[scrollbar-gutter:stable]">
            <Table className="min-w-[760px]">
              <TableHeader className="sticky top-0 z-10 bg-conference-header">
                <TableRow className="hover:bg-transparent">
                  <CabecalhoOrdenavel campo="conferido" titulo="LOCALIZADO" ordenacao={ordenacao} onOrdenar={ordenar} className="w-36" />
                  <CabecalhoOrdenavel campo="codigo_red" titulo="CÓDIGO RED." ordenacao={ordenacao} onOrdenar={ordenar} className="w-40" />
                  <CabecalhoOrdenavel campo="descricao" titulo="DESCRIÇÃO DO BEM" ordenacao={ordenacao} onOrdenar={ordenar} />
                  <CabecalhoOrdenavel campo="situacao" titulo="SITUAÇÃO" ordenacao={ordenacao} onOrdenar={ordenar} className="w-40" />
                  <CabecalhoOrdenavel campo="valor" titulo="VALOR" ordenacao={ordenacao} onOrdenar={ordenar} className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bensOrdenados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {carregando ? "Carregando bens..." : bens.length > 0 ? "Nenhum bem corresponde à pesquisa." : sala ? "Nenhum bem nesta sala." : "Nenhum local disponível para conferência."}
                    </TableCell>
                  </TableRow>
                )}
                {bensOrdenados.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-2">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" className="h-5 w-5 accent-primary disabled:opacity-50"
                          aria-label={`Bem ${b.codigo_red} localizado`}
                          disabled={carregando || salvando || pendentes.length > 0}
                          checked={b.conferido} onChange={(e) => void marcar([b], e.target.checked)} />
                        <span className="text-sm">Sim</span>
                      </label>
                    </TableCell>
                    <TableCell className="py-1 font-mono text-sm">
                      <button type="button" className="underline-offset-2 hover:underline"
                        onClick={() => setObsBem(b)}>
                        {b.codigo_red}
                      </button>
                    </TableCell>
                    <TableCell className="py-1">
                      {limparDescricao(b.descricao)}
                      {podeEditar && <EditarDescricaoBem bem={b} onSaved={(atualizado) => {
                        setBens((itens) => itens.map((item) => item.id === atualizado.id ? { ...item, descricao: atualizado.descricao } : item));
                        setObsBem((atual) => atual?.id === atualizado.id ? { ...atual, descricao: atualizado.descricao } : atual);
                        setAtualizacaoRelatorios((valor) => valor + 1);
                      }} />}
                      <BotaoRecebimentoVeiculo bem={b} />
                    </TableCell>
                    <TableCell className="py-2" aria-live="polite">
                      {b.conferido ? (
                        <span className="inline-flex whitespace-nowrap rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">LOCALIZADO</span>
                      ) : b.conferencia_finalizada ? (
                        <span className="inline-flex whitespace-nowrap rounded-md bg-destructive/10 px-2 py-1 text-xs font-bold text-destructive">NÃO LOCALIZADO</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">A conferir</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1 text-right">{moeda(Number(b.valor))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            {bens.length > 0 && (
              <p className="mt-3 text-sm font-semibold" aria-live="polite">
                {localizados} de {bens.length} item(ns) localizado(s)
                {naoLocalizados > 0 && ` • ${naoLocalizados} não localizado(s)`}
              </p>
            )}
          </CardContent>
        </Card>

      </main>
      {obsBem && <ObservacoesBemDialog key={obsBem.id} bem={obsBem} onClose={() => setObsBem(null)}
        onSaved={(id, observacao) => {
          setBens((atuais) => atuais.map((bem) => bem.id === id ? { ...bem, observacao } : bem));
          setAtualizacaoRelatorios((valor) => valor + 1);
        }} />}
    </div>
  );
}
