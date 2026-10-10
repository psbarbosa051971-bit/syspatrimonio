import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, LogOut, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";
import { ObservacoesBemDialog } from "@/components/ObservacoesBemDialog";
import { RelatoriosBens } from "@/components/RelatoriosBens";

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
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ConferenciaPage() {
  const navigate = useNavigate();
  const [salas, setSalas] = useState<Sala[]>([]);
  const [sala, setSala] = useState<Sala | null>(null);
  const [bens, setBens] = useState<Bem[]>([]);
  const [busca, setBusca] = useState("");
  const [obsBem, setObsBem] = useState<Bem | null>(null);
  const [atualizacaoRelatorios, setAtualizacaoRelatorios] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pendentes, setPendentes] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("salas").select("*").order("nome").then(({ data }) => setSalas(data ?? []));
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

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? salas.filter((s) => s.nome.toLowerCase().includes(t)) : salas;
  }, [salas, busca]);

  async function marcar(b: Bem, v: boolean) {
    setPendentes((p) => [...p, b.id]);
    setBens((p) => p.map((x) => (x.id === b.id ? { ...x, conferido: v } : x)));
    try {
      const { error } = await supabase.rpc("marcar_conferido", { _bem_id: b.id, _valor: v });
      if (error) throw error;
    } catch {
      toast.error("Erro ao salvar a marcação. Tente novamente.");
      setBens((p) => p.map((x) => (x.id === b.id ? { ...x, conferido: b.conferido } : x)));
    } finally {
      setPendentes((p) => p.filter((id) => id !== b.id));
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
      <header className="border-b border-border bg-primary px-6 py-3">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary-foreground" />
            <span className="text-lg font-bold text-primary-foreground">SysPatrimônio — Conferência</span>
          </div>
          <Button variant="ghost" size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto grid max-w-[1400px] gap-6 px-6 py-6 lg:grid-cols-[1fr_300px]">
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
              <p><strong>Local Físico:</strong> {sala?.nome ?? "—"}</p>
              <p><strong>Responsável pelo local:</strong> {sala?.responsavel ?? "—"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-primary">Quantidade de itens</p>
                <p className="text-3xl font-bold tabular-nums">{carregando ? "—" : bens.length}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-primary">Valor total dos bens</p>
                <p className="break-words text-3xl font-bold tabular-nums">{carregando ? "—" : moeda(valorTotal)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Marque “Sim” nos bens encontrados e clique em Salvar conferência para identificar os demais como NÃO LOCALIZADO.</p>
            {sala && <RelatoriosBens salaId={sala.id} atualizacao={atualizacaoRelatorios} />}
          </CardHeader>
          <CardContent>
            <div role="region" aria-label="Lista de bens da conferência" tabIndex={0}
              className="rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:max-h-[55vh] [&>div]:overflow-y-scroll [&>div]:[scrollbar-gutter:stable]">
            <Table className="min-w-[760px]">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-24">Localizado</TableHead>
                  <TableHead className="w-36">Código RED.</TableHead>
                  <TableHead>Descrição do bem</TableHead>
                  <TableHead className="w-40">Situação</TableHead>
                  <TableHead className="w-32 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      {carregando ? "Carregando bens..." : sala ? "Nenhum bem nesta sala." : "Selecione uma sala ao lado."}
                    </TableCell>
                  </TableRow>
                )}
                {bens.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-2">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" className="h-5 w-5 accent-primary disabled:opacity-50"
                          aria-label={`Bem ${b.codigo_red} localizado`}
                          disabled={salvando || pendentes.includes(b.id)}
                          checked={b.conferido} onChange={(e) => marcar(b, e.target.checked)} />
                        <span className="text-sm">Sim</span>
                      </label>
                    </TableCell>
                    <TableCell className="py-1 font-mono text-sm">
                      <button type="button" className="underline-offset-2 hover:underline"
                        onClick={() => setObsBem(b)}>
                        {b.codigo_red}
                      </button>
                    </TableCell>
                    <TableCell className="py-1">{limparDescricao(b.descricao)}</TableCell>
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
        <Card>
          <CardHeader><CardTitle className="text-base">Localizar salas</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar sala..." value={busca}
                onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="flex max-h-[480px] flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
              {filtradas.map((s) => (
                <button key={s.id} type="button" onClick={() => setSala(s)}
                  disabled={salvando || pendentes.length > 0}
                  className={`rounded-sm px-3 py-2 text-left text-sm disabled:cursor-wait disabled:opacity-60 ${sala?.id === s.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  {s.nome}
                </button>
              ))}
            </div>
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
