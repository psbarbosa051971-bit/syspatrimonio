import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, LogOut, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";

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

  useEffect(() => {
    supabase.from("salas").select("*").order("nome").then(({ data }) => setSalas(data ?? []));
  }, []);
  useEffect(() => {
    if (!sala) return setBens([]);
    supabase.from("bens").select("*").eq("sala_id", sala.id).order("codigo_red")
      .then(({ data }) => setBens(data ?? []));
  }, [sala]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? salas.filter((s) => s.nome.toLowerCase().includes(t)) : salas;
  }, [salas, busca]);

  async function marcar(b: Bem, v: boolean) {
    setBens((p) => p.map((x) => (x.id === b.id ? { ...x, conferido: v } : x)));
    const { error } = await supabase.rpc("marcar_conferido", { _bem_id: b.id, _valor: v });
    if (error) {
      toast.error("Erro ao salvar conferência");
      setBens((p) => p.map((x) => (x.id === b.id ? { ...x, conferido: !v } : x)));
    }
  }

  const localizados = bens.filter((b) => b.conferido).length;

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
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>Conferência de bens</CardTitle>
            <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm sm:grid-cols-3">
              <p><strong>Local:</strong> {sala?.nome ?? "—"}</p>
              <p><strong>Endereço:</strong> {sala?.endereco ?? "—"}</p>
              <p><strong>Responsável pelo local:</strong> {sala?.responsavel ?? "—"}</p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Localizado</TableHead>
                  <TableHead className="w-36">Código RED.</TableHead>
                  <TableHead>Descrição do bem</TableHead>
                  <TableHead className="w-32 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      {sala ? "Nenhum bem nesta sala." : "Selecione uma sala ao lado."}
                    </TableCell>
                  </TableRow>
                )}
                {bens.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-1">
                      <input type="checkbox" className="h-4 w-4 accent-primary"
                        aria-label={`Bem ${b.codigo_red} localizado`}
                        checked={b.conferido} onChange={(e) => marcar(b, e.target.checked)} />
                    </TableCell>
                    <TableCell className="py-1 font-mono text-sm">{b.codigo_red}</TableCell>
                    <TableCell className="py-1">{limparDescricao(b.descricao)}</TableCell>
                    <TableCell className="py-1 text-right">{moeda(Number(b.valor))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {bens.length > 0 && (
              <p className="mt-3 text-right text-sm text-muted-foreground">
                {localizados} de {bens.length} bem(ns) localizado(s)
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
                  className={`rounded-sm px-3 py-2 text-left text-sm ${sala?.id === s.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  {s.nome}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
