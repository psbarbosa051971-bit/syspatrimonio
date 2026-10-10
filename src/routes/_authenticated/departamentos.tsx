import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckSquare,
  FileText,
  LogOut,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { extrairTermoDePdf, limparDescricao } from "@/lib/pdf-parse";
import { useServerFn } from "@tanstack/react-start";
import { excluirSala } from "@/lib/salas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/departamentos")({
  head: () => ({
    meta: [
      { title: "Departamentos — SysPatrimônio" },
      {
        name: "description",
        content:
          "Cadastro de departamentos, salas e bens patrimoniais no SysPatrimônio.",
      },
      { property: "og:title", content: "Departamentos — SysPatrimônio" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepartamentosPage,
});

type Departamento = Tables<"departamentos">;
type Sala = Tables<"salas">;
type Bem = Tables<"bens">;

const formataMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DepartamentosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { role, loading: carregandoPapel } = useRole();
  const [responsavel, setResponsavel] = useState("");
  useEffect(() => {
    if (!carregandoPapel && role !== "admin" && role !== "operador") {
      navigate({ to: "/conferencia" });
    }
  }, [carregandoPapel, role, navigate]);

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [departamentoSel, setDepartamentoSel] = useState<Departamento | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaSel, setSalaSel] = useState<Sala | null>(null);
  const [bens, setBens] = useState<Bem[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  useEffect(() => setSelecionados([]), [bens.length === 0]);
  const [busca, setBusca] = useState("");

  // formulário de departamento (cabeçalho)
  const [form, setForm] = useState({
    diretor: "",
    departamento: "",
    almoxarifado: "",
    local: "",
    cpd: "",
    endereco: "",
  });
  // campo pai: sala
  const [novaSala, setNovaSala] = useState({ nome: "", endereco: "" });
  // subformulário de bens
  const [novoBem, setNovoBem] = useState({ codigo_red: "", descricao: "", valor: "" });
  const [cabecalho, setCabecalho] = useState({ historico: "", data: "", local: "", endereco: "" });

  const [dialogSala, setDialogSala] = useState<Sala | null>(null);
  const [bensDialogSala, setBensDialogSala] = useState<Bem[]>([]);
  const [termoBem, setTermoBem] = useState<Bem | null>(null);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [salaExcluir, setSalaExcluir] = useState<Sala | null>(null);
  const [credAdmin, setCredAdmin] = useState({ email: "", senha: "" });
  const [excluindo, setExcluindo] = useState(false);
  const excluirSalaFn = useServerFn(excluirSala);

  async function confirmarExclusaoSala(e: React.FormEvent) {
    e.preventDefault();
    if (!salaExcluir) return;
    setExcluindo(true);
    try {
      await excluirSalaFn({ data: { salaId: salaExcluir.id, ...credAdmin } });
      setSalas((p) => p.filter((s) => s.id !== salaExcluir.id));
      if (salaSel?.id === salaExcluir.id) setSalaSel(null);
      toast.success("Sala excluída");
      setSalaExcluir(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir sala");
    } finally {
      setExcluindo(false);
    }
  }
  const cabecalhoPendente = useRef<{ historico: string; data: string; local: string; endereco: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("departamentos")
      .select("*")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) toast.error("Erro ao carregar departamentos");
        setDepartamentos(data ?? []);
        if (data && data.length > 0) selecionarDepartamento(data[0]!);
      });
  }, [user]);

  useEffect(() => {
    if (!departamentoSel) {
      setSalas([]);
      return;
    }
    supabase
      .from("salas")
      .select("*")
      .eq("departamento_id", departamentoSel.id)
      .order("nome")
      .then(({ data }) => setSalas(data ?? []));
  }, [departamentoSel]);

  useEffect(() => {
    if (!salaSel) {
      setBens([]);
      return;
    }
    supabase
      .from("bens")
      .select("*")
      .eq("sala_id", salaSel.id)
      .order("codigo_red")
      .then(({ data }) => setBens(data ?? []));
  }, [salaSel]);

  useEffect(() => {
    if (cabecalhoPendente.current) {
      setCabecalho(cabecalhoPendente.current);
      cabecalhoPendente.current = null;
      setResponsavel(salaSel?.responsavel ?? "");
      return;
    }
    setCabecalho({
      historico: "",
      data: salaSel?.data_termo ?? "",
      local: salaSel?.nome ?? "",
      endereco: salaSel?.endereco ?? "",
    });
    setResponsavel(salaSel?.responsavel ?? "");
  }, [salaSel]);

  // resumo (quantidade e valor total) por sala
  const [resumo, setResumo] = useState<Record<string, { qtd: number; total: number }>>({});
  useEffect(() => {
    const ids = salas.map((s) => s.id);
    if (ids.length === 0) { setResumo({}); return; }
    supabase
      .from("bens")
      .select("sala_id, valor")
      .in("sala_id", ids)
      .then(({ data }) => {
        const r: Record<string, { qtd: number; total: number }> = {};
        for (const b of data ?? []) {
          if (!b.sala_id) continue;
          const x = (r[b.sala_id] ??= { qtd: 0, total: 0 });
          x.qtd += 1;
          x.total += Number(b.valor);
        }
        setResumo(r);
      });
  }, [salas, bens]);

  async function salvarCabecalho() {
    if (!salaSel) return;
    const nome = cabecalho.local.trim() || salaSel.nome;
    const upd = {
      nome,
      endereco: cabecalho.endereco.trim() || null,
      data_termo: cabecalho.data.trim() || null,
    };
    if (
      upd.nome === salaSel.nome &&
      upd.endereco === (salaSel.endereco ?? null) &&
      upd.data_termo === (salaSel.data_termo ?? null)
    ) return;
    const { data, error } = await supabase
      .from("salas").update(upd).eq("id", salaSel.id).select().single();
    if (error) { toast.error("Erro ao salvar dados do local"); return; }
    setSalas((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    cabecalhoPendente.current = { ...cabecalho, local: data.nome };
    setSalaSel(data);
    toast.success("Dados do local salvos");
  }

  async function salvarResponsavel() {
    if (!salaSel || responsavel === (salaSel.responsavel ?? "")) return;
    const { data, error } = await supabase
      .from("salas")
      .update({ responsavel: responsavel || null })
      .eq("id", salaSel.id)
      .select()
      .single();
    if (error) { toast.error("Erro ao salvar responsável"); return; }
    setSalas((prev) => prev.map((s) => (s.id === data.id ? data : s)));
    cabecalhoPendente.current = { ...cabecalho };
    setSalaSel(data);
    toast.success("Responsável salvo");
  }

  const salasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return salas;
    return salas.filter(
      (s) =>
        s.nome.toLowerCase().includes(t) ||
        (s.endereco ?? "").toLowerCase().includes(t),
    );
  }, [salas, busca]);

  async function salvarDepartamento(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload = { ...form, user_id: user.id };
    if (departamentoSel) {
      const { data, error } = await supabase
        .from("departamentos")
        .update(payload)
        .eq("id", departamentoSel.id)
        .select()
        .single();
      if (error) { toast.error("Erro ao salvar departamento"); return; }
      setDepartamentos((prev) =>
        prev.map((d) => (d.id === data.id ? data : d)),
      );
      setDepartamentoSel(data);
      toast.success("Departamento atualizado");
    } else {
      const { data, error } = await supabase
        .from("departamentos")
        .insert(payload)
        .select()
        .single();
      if (error) { toast.error("Erro ao cadastrar departamento"); return; }
      setDepartamentos((prev) => [...prev, data]);
      setDepartamentoSel(data);
      toast.success("Departamento cadastrado");
    }
  }

  function novoDepartamento() {
    setDepartamentoSel(null);
    setSalaSel(null);
    setForm({
      diretor: "",
      departamento: "",
      almoxarifado: "",
      local: "",
      cpd: "",
      endereco: "",
    });
  }

  function selecionarDepartamento(d: Departamento) {
    setDepartamentoSel(d);
    setSalaSel(null);
    setForm({
      diretor: d.diretor,
      departamento: d.departamento,
      almoxarifado: d.almoxarifado,
      local: d.local,
      cpd: d.cpd,
      endereco: d.endereco ?? "",
    });
  }

  async function adicionarSala(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !departamentoSel) {
      toast.error("Salve o departamento antes de adicionar salas");
      return;
    }
    const { data, error } = await supabase
      .from("salas")
      .insert({
        user_id: user.id,
        departamento_id: departamentoSel.id,
        nome: novaSala.nome,
        endereco: novaSala.endereco || null,
      })
      .select()
      .single();
    if (error) { toast.error("Erro ao adicionar sala"); return; }
    setSalas((prev) => [...prev, data]);
    setNovaSala({ nome: "", endereco: "" });
    toast.success("Sala adicionada");
  }

  async function adicionarBem(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !salaSel) {
      toast.error("Selecione uma sala antes de adicionar bens");
      return;
    }
    const valor = parseFloat(novoBem.valor.replace(/\./g, "").replace(",", ".")) || 0;
    const { data, error } = await supabase
      .from("bens")
      .insert({
        user_id: user.id,
        sala_id: salaSel.id,
        codigo_red: novoBem.codigo_red,
        descricao: novoBem.descricao,
        valor,
      })
      .select()
      .single();
    if (error) { toast.error("Erro ao adicionar bem"); return; }
    setBens((prev) => [...prev, data]);
    setNovoBem({ codigo_red: "", descricao: "", valor: "" });
  }

  async function removerBem(id: string) {
    const { error } = await supabase.from("bens").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover bem"); return; }
    setBens((prev) => prev.filter((b) => b.id !== id));
    setSelecionados((prev) => prev.filter((x) => x !== id));
  }

  async function removerSelecionados() {
    if (selecionados.length === 0) return;
    if (!confirm(`Excluir ${selecionados.length} bem(ns) selecionado(s)?`)) return;
    const ids = selecionados;
    const { error } = await supabase.from("bens").delete().in("id", ids);
    if (error) { toast.error("Erro ao excluir bens"); return; }
    setBens((prev) => prev.filter((b) => !ids.includes(b.id)));
    setSelecionados([]);
    toast.success(`${ids.length} bem(ns) excluído(s)`);
  }

  async function importarPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !departamentoSel) {
      if (!departamentoSel) toast.error("Selecione ou salve um departamento antes de importar o PDF");
      return;
    }
    setImportando(true);
    try {
      const termo = await extrairTermoDePdf(file);
      const extraidos = termo.bens;
      const nomeLocal = (termo.cabecalho.local || salaSel?.nome || "").trim();
      if (!nomeLocal) {
        toast.error("Local não encontrado no PDF. Selecione uma sala e tente de novo.");
        return;
      }
      // procura sala com o mesmo Local (acumula os PDFs no mesmo local)
      const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
      let sala = salas.find((s) => norm(s.nome) === norm(nomeLocal)) ?? null;
      if (!sala) {
        const { data: nova, error: errSala } = await supabase
          .from("salas")
          .insert({
            user_id: user.id,
            departamento_id: departamentoSel.id,
            nome: nomeLocal,
            endereco: termo.cabecalho.endereco || null,
          })
          .select()
          .single();
        if (errSala) throw errSala;
        sala = nova;
        setSalas((prev) => [...prev, nova]);
      } else if (!sala.endereco && termo.cabecalho.endereco) {
        const { data: upd } = await supabase
          .from("salas")
          .update({ endereco: termo.cabecalho.endereco })
          .eq("id", sala.id)
          .select()
          .single();
        if (upd) {
          sala = upd;
          setSalas((prev) => prev.map((s) => (s.id === upd.id ? upd : s)));
        }
      }
      if (termo.cabecalho.data && termo.cabecalho.data !== sala.data_termo) {
        const { data: upd } = await supabase
          .from("salas").update({ data_termo: termo.cabecalho.data }).eq("id", sala.id).select().single();
        if (upd) {
          sala = upd;
          setSalas((prev) => prev.map((s) => (s.id === upd.id ? upd : s)));
        }
      }
      const salaAlvo = sala;
      setNovaSala({ nome: salaAlvo.nome, endereco: salaAlvo.endereco ?? termo.cabecalho.endereco });
      cabecalhoPendente.current = {
        historico: termo.cabecalho.historico,
        data: termo.cabecalho.data,
        local: salaAlvo.nome,
        endereco: termo.cabecalho.endereco || (salaAlvo.endereco ?? ""),
      };
      if (extraidos.length === 0) {
        setSalaSel(salaAlvo);
        toast.error("Nenhum bem encontrado no PDF", {
          description:
            "O PDF deve conter linhas com código, descrição e valor (ex.: 123456 CADEIRA 1.234,56).",
        });
        return;
      }
      const { data: existentes } = await supabase
        .from("bens")
        .select("codigo_red")
        .eq("sala_id", salaAlvo.id);
      const ja = new Set((existentes ?? []).map((b) => b.codigo_red));
      const novos = extraidos.filter((b) => !ja.has(b.codigo_red));
      if (novos.length > 0) {
        const { error } = await supabase
          .from("bens")
          .insert(novos.map((b) => ({ ...b, user_id: user.id, sala_id: salaAlvo.id })));
        if (error) throw error;
      }
      if (salaSel?.id === salaAlvo.id) {
        const { data: todos } = await supabase
          .from("bens").select("*").eq("sala_id", salaAlvo.id).order("codigo_red");
        setBens(todos ?? []);
        setCabecalho(cabecalhoPendente.current);
        cabecalhoPendente.current = null;
      } else {
        setSalaSel(salaAlvo);
      }
      toast.success(
        `${novos.length} bem(ns) adicionados ao local "${salaAlvo.nome}"` +
          (extraidos.length > novos.length ? ` (${extraidos.length - novos.length} já existiam)` : ""),
      );
    } catch {
      toast.error("Não foi possível ler o PDF");
    } finally {
      setImportando(false);
    }
  }

  async function abrirRegistrosDaSala(sala: Sala) {
    setDialogSala(sala);
    const { data } = await supabase
      .from("bens")
      .select("*")
      .eq("sala_id", sala.id)
      .order("codigo_red");
    setBensDialogSala(data ?? []);
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-primary px-6 py-3">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary-foreground" />
            <span className="text-lg font-bold text-primary-foreground">
              SysPatrimônio
            </span>
          </div>
          <div className="flex items-center gap-1">
            {role === "admin" && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/usuarios"><Users className="mr-2 h-4 w-4" /> Usuários</Link>
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link to="/conferencia"><CheckSquare className="mr-2 h-4 w-4" /> Conferência</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={sair}
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {/* Formulário principal — cabeçalho */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Cadastro de Departamento</CardTitle>
                  <CardDescription>
                    Dados do cabeçalho do termo de responsabilidade
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={novoDepartamento}>
                  <Plus className="mr-1 h-4 w-4" /> Novo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {departamentos.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {departamentos.map((d) => (
                    <Button
                      key={d.id}
                      size="sm"
                      variant={departamentoSel?.id === d.id ? "default" : "outline"}
                      onClick={() => selecionarDepartamento(d)}
                    >
                      {d.departamento}
                    </Button>
                  ))}
                </div>
              )}
              <form
                onSubmit={salvarDepartamento}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="diretor">Diretor</Label>
                  <Input
                    id="diretor"
                    required
                    value={form.diretor}
                    onChange={(e) => setForm({ ...form, diretor: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="departamento">Departamento</Label>
                  <Input
                    id="departamento"
                    required
                    value={form.departamento}
                    onChange={(e) =>
                      setForm({ ...form, departamento: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="almoxarifado">Almoxarifado</Label>
                  <Input
                    id="almoxarifado"
                    required
                    value={form.almoxarifado}
                    onChange={(e) =>
                      setForm({ ...form, almoxarifado: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endereco">Endereço do local</Label>
                  <Input
                    id="endereco"
                    value={form.endereco}
                    onChange={(e) =>
                      setForm({ ...form, endereco: e.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    {departamentoSel ? "Salvar alterações" : "Cadastrar departamento"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Campo pai: sala + endereço */}
          <Card>
            <CardHeader>
              <CardTitle>Local (Sala)</CardTitle>
              <CardDescription>
                Nome da sala onde os bens estão localizados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={adicionarSala}
                className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nomeSala">Local (nome da sala)</Label>
                  <Input
                    id="nomeSala"
                    required
                    value={novaSala.nome}
                    onChange={(e) =>
                      setNovaSala({ ...novaSala, nome: e.target.value })
                    }
                    placeholder="Ex.: Sala 101 — Secretaria"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endSala">Endereço do local</Label>
                  <Input
                    id="endSala"
                    value={novaSala.endereco}
                    onChange={(e) =>
                      setNovaSala({ ...novaSala, endereco: e.target.value })
                    }
                    placeholder="Ex.: Bloco A, 1º andar"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button type="submit" variant="secondary">
                    <Plus className="mr-1 h-4 w-4" /> Adicionar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!departamentoSel || importando}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-1 h-4 w-4" /> Nova importação
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Subformulário de bens */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Bens da sala {salaSel ? `— ${salaSel.nome}` : ""}</CardTitle>
                  <CardDescription>
                    Preenchido manualmente ou pela leitura do PDF do termo
                  </CardDescription>
                </div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={importarPdf}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!departamentoSel || importando}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    {importando ? "Lendo PDF..." : "Importar PDF do termo"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 rounded-md border-2 border-primary/30 bg-accent p-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cabData">Data</Label>
                  <Input
                    id="cabData"
                    disabled={!salaSel}
                    value={cabecalho.data}
                    onChange={(e) => setCabecalho({ ...cabecalho, data: e.target.value })}
                    onBlur={salvarCabecalho}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cabLocal">Local</Label>
                  <Input
                    id="cabLocal"
                    disabled={!salaSel}
                    value={cabecalho.local}
                    onChange={(e) => setCabecalho({ ...cabecalho, local: e.target.value })}
                    onBlur={salvarCabecalho}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cabEndereco">Endereço</Label>
                  <Input
                    id="cabEndereco"
                    disabled={!salaSel}
                    value={cabecalho.endereco}
                    onChange={(e) => setCabecalho({ ...cabecalho, endereco: e.target.value })}
                    onBlur={salvarCabecalho}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cabResp">Nome do responsável pelo local</Label>
                  <Input
                    id="cabResp"
                    disabled={!salaSel}
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                    onBlur={salvarResponsavel}
                  />
                </div>
              </div>
              {bens.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selecionados.length} selecionado(s)
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={selecionados.length === 0}
                    onClick={removerSelecionados}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Excluir selecionados
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="h-8 w-10 py-1">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos"
                        className="h-4 w-4 accent-primary"
                        checked={bens.length > 0 && selecionados.length === bens.length}
                        onChange={(e) =>
                          setSelecionados(e.target.checked ? bens.map((b) => b.id) : [])
                        }
                      />
                    </TableHead>
                    <TableHead className="h-8 w-36 py-1">Código RED.</TableHead>
                    <TableHead className="h-8 py-1">Descrição do bem</TableHead>
                    <TableHead className="h-8 w-32 py-1 text-right">Valor</TableHead>
                    <TableHead className="h-8 w-12 py-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bens.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {salaSel
                          ? "Nenhum bem cadastrado nesta sala."
                          : "Selecione uma sala na caixa de listagem ao lado."}
                      </TableCell>
                    </TableRow>
                  )}
                  {bens.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="py-1">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${b.codigo_red}`}
                          className="h-4 w-4 accent-primary"
                          checked={selecionados.includes(b.id)}
                          onChange={(e) =>
                            setSelecionados((prev) =>
                              e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <button
                          type="button"
                          className="font-mono text-sm font-medium text-primary underline"
                          onClick={() => setTermoBem(b)}
                        >
                          {b.codigo_red}
                        </button>
                      </TableCell>
                      <TableCell className="py-1">{limparDescricao(b.descricao)}</TableCell>
                      <TableCell className="py-1 text-right">
                        {formataMoeda(Number(b.valor))}
                      </TableCell>
                      <TableCell className="py-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removerBem(b.id)}
                          aria-label="Remover bem"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {bens.length > 0 && (
                <p className="text-right text-sm font-medium text-foreground">
                  Total:{" "}
                  {formataMoeda(bens.reduce((acc, b) => acc + Number(b.valor), 0))}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Caixa de listagem de salas + busca */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Localizar salas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar sala ou endereço..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div
                role="listbox"
                aria-label="Salas"
                className="flex max-h-[480px] flex-col gap-1 overflow-y-auto rounded-md border border-border p-1"
              >
                {salasFiltradas.length === 0 && (
                  <p className="p-3 text-center text-sm text-muted-foreground">
                    {departamentoSel
                      ? "Nenhuma sala encontrada."
                      : "Cadastre ou selecione um departamento."}
                  </p>
                )}
                {salasFiltradas.map((s) => (
                  <div
                    key={s.id}
                    role="option"
                    aria-selected={salaSel?.id === s.id}
                    className={`flex items-center justify-between rounded-sm px-3 py-2 text-sm ${
                      salaSel?.id === s.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setSalaSel(s)}
                    >
                      <span className="block font-medium">{s.nome}</span>
                      <span
                        className={`block text-xs ${
                          salaSel?.id === s.id
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      >
                        {resumo[s.id]?.qtd ?? 0} item(ns) · {formataMoeda(resumo[s.id]?.total ?? 0)}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Ver registros de ${s.nome}`}
                      className={
                        salaSel?.id === s.id
                          ? "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                          : ""
                      }
                      onClick={() => abrirRegistrosDaSala(s)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir sala ${s.nome}`}
                      className={
                        salaSel?.id === s.id
                          ? "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                          : "text-destructive"
                      }
                      onClick={() => { setSalaExcluir(s); setCredAdmin({ email: "", senha: "" }); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Dialog: registros (bens) da sala clicada */}
      <Dialog open={!!dialogSala} onOpenChange={(o) => !o && setDialogSala(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registros — {dialogSala?.nome}</DialogTitle>
            <DialogDescription>{dialogSala?.endereco}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código RED.</TableHead>
                <TableHead>Descrição do bem</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bensDialogSala.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Nenhum registro nesta sala.
                  </TableCell>
                </TableRow>
              )}
              {bensDialogSala.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{b.codigo_red}</TableCell>
                  <TableCell>{limparDescricao(b.descricao)}</TableCell>
                  <TableCell className="text-right">
                    {formataMoeda(Number(b.valor))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Dialog: termo do bem (clique no Código RED.) */}
      <Dialog open={!!termoBem} onOpenChange={(o) => !o && setTermoBem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Termo de Responsabilidade</DialogTitle>
            <DialogDescription>
              Informações do bem {termoBem?.codigo_red}
            </DialogDescription>
          </DialogHeader>
          {termoBem && departamentoSel && (
            <div className="rounded-md border border-border">
              <div className="border-b border-border bg-muted/50 px-4 py-3 text-sm">
                <p>
                  <strong>Diretor:</strong> {departamentoSel.diretor}
                </p>
                <p>
                  <strong>Departamento:</strong> {departamentoSel.departamento}
                </p>
                <p>
                  <strong>Almoxarifado:</strong> {departamentoSel.almoxarifado}
                </p>
                <p>
                  <strong>Local:</strong> {salaSel?.nome ?? "—"}
                </p>
              </div>
              <div className="px-4 py-3 text-sm">
                <p>
                  <strong>Código RED.:</strong> {termoBem.codigo_red}
                </p>
                <p>
                  <strong>Descrição do bem:</strong> {termoBem.descricao}
                </p>
                <p>
                  <strong>Valor:</strong> {formataMoeda(Number(termoBem.valor))}
                </p>
              </div>
            </div>
          )}
          {termoBem && !departamentoSel && (
            <div className="px-1 text-sm">
              <p>
                <strong>Código RED.:</strong> {termoBem.codigo_red}
              </p>
              <p>
                <strong>Descrição do bem:</strong> {termoBem.descricao}
              </p>
              <p>
                <strong>Valor:</strong> {formataMoeda(Number(termoBem.valor))}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!salaExcluir} onOpenChange={(o) => !o && setSalaExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir sala</DialogTitle>
            <DialogDescription>
              A sala "{salaExcluir?.nome}" e todos os seus bens serão excluídos. Informe o e-mail e a senha do administrador.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmarExclusaoSala} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admEmail">E-mail do administrador</Label>
              <Input id="admEmail" type="email" required value={credAdmin.email}
                onChange={(e) => setCredAdmin({ ...credAdmin, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admSenha">Senha do administrador</Label>
              <Input id="admSenha" type="password" required value={credAdmin.senha}
                onChange={(e) => setCredAdmin({ ...credAdmin, senha: e.target.value })} />
            </div>
            <Button type="submit" variant="destructive" disabled={excluindo}>
              {excluindo ? "Excluindo..." : "Excluir sala"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
