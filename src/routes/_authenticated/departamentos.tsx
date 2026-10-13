import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { responsavelDoLocal } from "@/lib/usuarios.functions";
import { formatarCpf } from "@/lib/cpf";
import { formatarCodigoRed } from "@/lib/codigo-red";
import {
  Building2,
  CheckSquare,
  FileText,
  LogOut,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { limparDescricao } from "@/lib/pdf-parse";
import { pesquisarBensEmTodasAsSalas, type ResultadoPesquisaDinamica } from "@/lib/pesquisa-dinamica";
import { extrairTermoDeHtml } from "@/lib/html-parse";
import { ExcluirImportacoesDialog } from "@/components/ExcluirImportacoesDialog";
import { TermosResponsabilidadeDialog } from "@/components/TermosResponsabilidadeDialog";
import { TransferenciaBensDialog } from "@/components/TransferenciaBensDialog";
import { EstornoTransferenciaDialog } from "@/components/EstornoTransferenciaDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const bemNaoLocalizado = (bem: Bem) => bem.conferencia_finalizada && !bem.conferido;
const tipoExibido = (bem: Bem) => bemNaoLocalizado(bem) ? "Não localizado" : bem.tipo ?? "";

async function carregarBensDaSala(salaId: string): Promise<Bem[]> {
  const todos: Bem[] = [];
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from("bens").select("*")
      .eq("sala_id", salaId).order("id").range(inicio, inicio + 499);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return todos.sort((a, b) => a.codigo_red.localeCompare(b.codigo_red));
}

function DepartamentosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { role, loading: carregandoPapel } = useRole();
  const consultarResponsavel = useServerFn(responsavelDoLocal);
  const [perfilResponsavel, setPerfilResponsavel] = useState<{ salaId: string; nome: string | null; cpf: string | null; matricula?: string | null } | null>(null);
  const [excluindoSala, setExcluindoSala] = useState(false);
  useEffect(() => {
    if (!carregandoPapel && role !== "admin" && role !== "operador") {
      navigate({ to: "/conferencia" });
    }
  }, [carregandoPapel, role, navigate]);

  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [departamentoSel, setDepartamentoSel] = useState<Departamento | null>(null);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [salaSel, setSalaSel] = useState<Sala | null>(null);
  const [carregandoDepartamentos, setCarregandoDepartamentos] = useState(true);
  const [carregandoSalas, setCarregandoSalas] = useState(false);
  const [erroDepartamentos, setErroDepartamentos] = useState<string | null>(null);
  const [erroSalas, setErroSalas] = useState<string | null>(null);
  const [tentativaCarga, setTentativaCarga] = useState(0);
  const [tentativaSalas, setTentativaSalas] = useState(0);
  const [tentativaBens, setTentativaBens] = useState(0);
  useEffect(() => {
    const atualizarBens = () => setTentativaBens((valor) => valor + 1);
    window.addEventListener("bens-transferidos", atualizarBens);
    return () => window.removeEventListener("bens-transferidos", atualizarBens);
  }, []);
  const [carregandoBens, setCarregandoBens] = useState(false);
  const [erroBens, setErroBens] = useState<string | null>(null);
  const [bens, setBens] = useState<Bem[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [bensParaTransferir, setBensParaTransferir] = useState<Bem[]>([]);
  const codigosParaTransferir = [...new Set(bensParaTransferir.map((b) => formatarCodigoRed(b.codigo_red)))];
  const textoCodigosTransferencia = codigosParaTransferir.length ? `${codigosParaTransferir.join(", ")}, ` : "";
  useEffect(() => setSelecionados([]), [bens.length === 0]);
  const [busca, setBusca] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  const [unidadeLiberadaSalaId, setUnidadeLiberadaSalaId] = useState<string | null>(null);
  const unidadeRef = useRef<HTMLSelectElement>(null);
  const unidadeLiberada = !!salaSel && unidadeLiberadaSalaId === salaSel.id;
  useEffect(() => {
    setUnidadeLiberadaSalaId((atual) => atual === salaSel?.id ? atual : null);
  }, [salaSel?.id]);
  const [buscaBens, setBuscaBens] = useState("");
  const [pesquisaDinamica, setPesquisaDinamica] = useState("");
  const [resultadoPesquisa, setResultadoPesquisa] = useState<ResultadoPesquisaDinamica | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const bensExibidos = resultadoPesquisa?.bens ?? bens;

  async function localizarOuAtualizar(e: React.FormEvent) {
    e.preventDefault();
    if (localizando) return;
    if (resultadoPesquisa) {
      setResultadoPesquisa(null);
      setPesquisaDinamica("");
      setBuscaBens("");
      setSelecionados([]);
      setTentativaBens((valor) => valor + 1);
      return;
    }
    const termo = pesquisaDinamica.trim();
    if (!termo) return;
    setPesquisaDinamica("");
    setLocalizando(true);
    try {
      const resultado = await pesquisarBensEmTodasAsSalas(termo);
      setResultadoPesquisa(resultado);
      setBuscaBens("");
      setSelecionados([]);
    } catch {
      toast.error("Não foi possível realizar a pesquisa em todas as salas. Tente novamente.");
    } finally {
      setLocalizando(false);
    }
  }

  useEffect(() => {
    setBuscaBens("");
    setSelecionados([]);
  }, [salaSel?.id]);

  const bensFiltrados = useMemo(() => {
    const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const termos = normalizar(buscaBens).trim().split(/\s+/).filter(Boolean);
    if (!termos.length) return bensExibidos;
    return bensExibidos.filter((bem) => {
      const campos = normalizar([
        bem.codigo_red, formatarCodigoRed(bem.codigo_red), limparDescricao(bem.descricao), bem.incorporacao, tipoExibido(bem),
        bem.valor, formataMoeda(Number(bem.valor)), Number(bem.valor).toFixed(2).replace(".", ","),
        bem.observacao,
      ].filter((campo) => campo != null).join(" "));
      return termos.every((termo) => campos.includes(termo));
    });
  }, [bensExibidos, buscaBens]);
  const idsBensFiltrados = bensFiltrados.map((bem) => bem.id);
  const todosFiltradosSelecionados = idsBensFiltrados.length > 0 && idsBensFiltrados.every((id) => selecionados.includes(id));

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
  useEffect(() => {
    if (!unidadeLiberada || importando || carregandoSalas || erroSalas || salvandoUnidade) return;
    const frame = requestAnimationFrame(() => unidadeRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [unidadeLiberada, importando, carregandoSalas, erroSalas, salvandoUnidade]);
  const [confirmacaoImportacao, setConfirmacaoImportacao] = useState<{ local: string; quantidade: number } | null>(null);
  const resolverConfirmacaoImportacao = useRef<((confirmado: boolean) => void) | null>(null);
  useEffect(() => () => {
    resolverConfirmacaoImportacao.current?.(false);
    resolverConfirmacaoImportacao.current = null;
  }, []);

  function confirmarImportacao(local: string, quantidade: number): Promise<boolean> {
    return new Promise((resolve) => {
      resolverConfirmacaoImportacao.current = resolve;
      setConfirmacaoImportacao({ local, quantidade });
    });
  }

  function responderConfirmacaoImportacao(confirmado: boolean) {
    const resolver = resolverConfirmacaoImportacao.current;
    resolverConfirmacaoImportacao.current = null;
    setConfirmacaoImportacao(null);
    resolver?.(confirmado);
  }

  const [dialogTermos, setDialogTermos] = useState(false);
  const [consultarTermoPorNumero, setConsultarTermoPorNumero] = useState(false);
  const [dialogTransferencia, setDialogTransferencia] = useState(false);
  const [dialogEstorno, setDialogEstorno] = useState(false);
  const [ultimaImportacao, setUltimaImportacao] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [salaExcluir, setSalaExcluir] = useState<Sala | null>(null);
  async function atualizarAposExclusao() {
    if (!salaExcluir) return;
    const atualizados: Bem[] = [];
    for (let inicio = 0; ; inicio += 500) {
      const { data, error } = await supabase.from("bens").select("*")
        .eq("sala_id", salaExcluir.id).order("id").range(inicio, inicio + 499);
      if (error) {
        toast.error("Exclusão concluída, mas não foi possível atualizar a lista. Recarregue a página.");
        return;
      }
      atualizados.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    atualizados.sort((a, b) => a.codigo_red.localeCompare(b.codigo_red));
    if (salaSel?.id === salaExcluir.id) {
      setBens(atualizados);
      setSelecionados([]);
    }
    if (dialogSala?.id === salaExcluir.id) setBensDialogSala(atualizados);
    setSalas((p) => [...p]);
  }
  const cabecalhoPendente = useRef<{ historico: string; data: string; local: string; endereco: string } | null>(null);

  useEffect(() => {
    if (!user?.id || carregandoPapel || (role !== "admin" && role !== "operador")) return;
    let ativo = true;
    setCarregandoDepartamentos(true);
    setErroDepartamentos(null);
    async function carregarDepartamentos() {
      try {
        const { data, error } = await supabase.from("departamentos").select("*").order("created_at");
        if (error) throw error;
        if (!ativo) return;
        setDepartamentos(data ?? []);
        if (data?.length) selecionarDepartamento(data[0]!);
      } catch {
        if (ativo) setErroDepartamentos("Não foi possível carregar os departamentos. Isso não significa que os registros foram apagados. Tente novamente.");
      } finally {
        if (ativo) setCarregandoDepartamentos(false);
      }
    }
    void carregarDepartamentos();
    return () => { ativo = false; };
  }, [user?.id, carregandoPapel, role, tentativaCarga]);

  useEffect(() => {
    if (!departamentoSel) {
      setSalas([]);
      setSalaSel(null);
      setErroSalas(null);
      setCarregandoSalas(false);
      return;
    }
    const departamentoId = departamentoSel.id;
    let ativo = true;
    setCarregandoSalas(true);
    setErroSalas(null);
    async function carregarSalas() {
      try {
        const { data, error } = await supabase.from("salas").select("*")
          .eq("departamento_id", departamentoId).order("nome");
        if (error) throw error;
        if (!ativo) return;
        const locais = data ?? [];
        setSalas(locais);
        setSalaSel((atual) => locais.find((local) => local.id === atual?.id) ?? locais[0] ?? null);
      } catch {
        if (ativo) setErroSalas("Não foi possível carregar as salas. Tente novamente para consultar os registros salvos.");
      } finally {
        if (ativo) setCarregandoSalas(false);
      }
    }
    void carregarSalas();
    return () => { ativo = false; };
  }, [departamentoSel?.id, tentativaSalas]);

  useEffect(() => {
    setBens([]);
    setErroBens(null);
    if (!salaSel) {
      setCarregandoBens(false);
      return;
    }
    let ativo = true;
    setCarregandoBens(true);
    carregarBensDaSala(salaSel.id)
      .then((data) => { if (ativo) setBens(data); })
      .catch(() => { if (ativo) setErroBens("Não foi possível carregar os bens deste local. Tente novamente; os registros não foram excluídos."); })
      .finally(() => { if (ativo) setCarregandoBens(false); });
    return () => { ativo = false; };
  }, [salaSel, tentativaBens]);

  useEffect(() => {
    if (cabecalhoPendente.current) {
      setCabecalho(cabecalhoPendente.current);
      cabecalhoPendente.current = null;
      return;
    }
    setCabecalho({
      historico: "",
      data: salaSel?.data_termo ?? "",
      local: salaSel?.nome ?? "",
      endereco: salaSel?.endereco ?? "",
    });
  }, [salaSel]);

  useEffect(() => {
    setPerfilResponsavel(null);
    if (!salaSel) return;
    let ativo = true;
    consultarResponsavel({ data: { salaId: salaSel.id } })
      .then((perfil) => {
        if (ativo && perfil) setPerfilResponsavel({ salaId: salaSel.id, ...perfil });
      })
      .catch(() => { if (ativo) toast.error("Não foi possível carregar o responsável do local"); });
    return () => { ativo = false; };
  }, [salaSel, consultarResponsavel]);

  const responsavelAtual = perfilResponsavel?.salaId === salaSel?.id ? perfilResponsavel : null;

  // resumo (quantidade e valor total) por sala
  const [resumo, setResumo] = useState<Record<string, { qtd: number; total: number }>>({});
  useEffect(() => {
    const ids = salas.map((s) => s.id);
    if (ids.length === 0) { setResumo({}); return; }
    let ativo = true;
    async function carregarResumo() {
      const r: Record<string, { qtd: number; total: number }> = {};
      for (let inicio = 0; ; inicio += 500) {
        const { data, error } = await supabase.from("bens").select("sala_id,valor")
          .in("sala_id", ids).order("id").range(inicio, inicio + 499);
        if (error) throw error;
        for (const b of data ?? []) {
          if (!b.sala_id) continue;
          const x = (r[b.sala_id] ??= { qtd: 0, total: 0 });
          x.qtd += 1;
          x.total += Number(b.valor);
        }
        if (!data || data.length < 500) break;
      }
      if (ativo) setResumo(r);
    }
    carregarResumo().catch(() => { if (ativo) toast.error("Não foi possível atualizar o resumo dos locais"); });
    return () => { ativo = false; };
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

  async function excluirSalaVazia() {
    if (!salaSel || importando || excluindoSala) return;
    if (!confirm(`Excluir a sala “${salaSel.nome}”? A exclusão só será permitida se não houver nenhum bem. Os vínculos de usuários e o histórico de importações desse local também serão removidos.`)) return;
    const alvo = salaSel;
    setExcluindoSala(true);
    try {
      const { error } = await supabase.rpc("excluir_sala_vazia", { _sala_id: alvo.id });
      if (error) throw error;
      setSalas((prev) => prev.filter((s) => s.id !== alvo.id));
      setSalaSel((atual) => atual?.id === alvo.id ? null : atual);
      setDialogSala((atual) => atual?.id === alvo.id ? null : atual);
      setBens([]);
      setSelecionados([]);
      setNovaSala({ nome: "", endereco: "" });
      toast.success("Sala vazia excluída");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : (erro as { message?: string })?.message || "Não foi possível excluir a sala");
    } finally {
      setExcluindoSala(false);
    }
  }

  const salasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return salas.filter(
      (s) => (!filtroUnidade || s.unidade === filtroUnidade) &&
        (!t || s.nome.toLowerCase().includes(t) ||
          (s.endereco ?? "").toLowerCase().includes(t)),
    );
  }, [salas, busca, filtroUnidade]);

  async function salvarUnidade(unidade: string) {
    if (!salaSel || !unidadeLiberada || importando || salvandoUnidade || !["CENTRAL", "SAÚDE", "EDUCAÇÃO"].includes(unidade)) return;
    const alvo = salaSel;
    if (unidade === alvo.unidade) return;
    setSalvandoUnidade(true);
    try {
      const { data, error } = await supabase.from("salas")
        .update({ unidade }).eq("id", alvo.id).select().single();
      if (error) throw error;
      setSalas((prev) => prev.map((s) => s.id === alvo.id ? { ...s, unidade: data.unidade } : s));
      setSalaSel((atual) => atual?.id === alvo.id ? { ...atual, unidade: data.unidade } : atual);
      toast.success("Unidade do local salva");
    } catch {
      toast.error("Não foi possível salvar a unidade do local. Tente novamente.");
    } finally {
      setSalvandoUnidade(false);
    }
  }

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
    setResultadoPesquisa((prev) => prev ? { ...prev, bens: prev.bens.filter((b) => b.id !== id) } : null);
    setSelecionados((prev) => prev.filter((x) => x !== id));
  }

  async function removerSelecionados() {
    if (selecionados.length === 0) return;
    if (!confirm(`Excluir ${selecionados.length} bem(ns) selecionado(s)?`)) return;
    const ids = selecionados;
    const { error } = await supabase.from("bens").delete().in("id", ids);
    if (error) { toast.error("Erro ao excluir bens"); return; }
    setBens((prev) => prev.filter((b) => !ids.includes(b.id)));
    setResultadoPesquisa((prev) => prev ? { ...prev, bens: prev.bens.filter((b) => !ids.includes(b.id)) } : null);
    setSelecionados([]);
    toast.success(`${ids.length} bem(ns) excluído(s)`);
  }

  async function importarHtml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user || !departamentoSel) {
      if (!departamentoSel) toast.error("Selecione ou salve um departamento antes de importar o HTML");
      return;
    }
    setImportando(true);
    try {
      const termo = await extrairTermoDeHtml(file);
      const extraidos = termo.bens;
      const nomeLocal = termo.cabecalho.local.trim();
      if (!nomeLocal) throw new Error("Local Físico não encontrado no HTML. Envie o arquivo para conferir o layout.");
      const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase()
        .split(/\s*;\s*|\s*(?:SITUA[ÇC][ÃA]O\s+DO\s+BEM|PAR[ÂA]METRO\s+DE\s+ORDENA[ÇC][ÃA]O)\s*:/)[0]!.trim()
        .replace(/^(\d+)\s*[-–—]?\s*(?=[A-ZÀ-Ú])/, "$1-");
      const semCodigo = (s: string) => norm(s).replace(/^\d+\s*[-–—]?\s*/, "");
      let sala = salas.find((s) => norm(s.nome) === norm(nomeLocal)) ?? null;
      if (!sala && /^\d+(?:\s|[-–—])/.test(nomeLocal)) {
        // Reaproveita o cadastro antigo sem código e sem os filtros do relatório.
        const candidatas = salas.filter((s) => !/^\d+[-–—]/.test(norm(s.nome)) && semCodigo(s.nome) === semCodigo(nomeLocal));
        if (candidatas.length > 1) throw new Error("Há mais de um local com esse nome. Corrija os cadastros antes de importar.");
        sala = candidatas[0] ?? null;
      }
      if (!await confirmarImportacao(nomeLocal, extraidos.length)) return;
      if (!sala) {
        const { data: nova, error } = await supabase.from("salas").insert({
          user_id: user.id, departamento_id: departamentoSel.id, nome: nomeLocal,
          endereco: termo.cabecalho.endereco || null, data_termo: termo.cabecalho.data || null,
        }).select().single();
        if (error) throw error;
        sala = nova;
        setSalas((prev) => [...prev, nova]);
      } else {
        const { data: atualizada, error } = await supabase.from("salas").update({
          nome: nomeLocal,
          endereco: sala.endereco || termo.cabecalho.endereco || null,
          data_termo: termo.cabecalho.data || sala.data_termo,
        }).eq("id", sala.id).select().single();
        if (error) throw error;
        sala = atualizada;
        setSalas((prev) => prev.map((s) => s.id === atualizada.id ? atualizada : s));
      }
      const salaAlvo = sala;
      const { data: resultado, error: erroImportacao } = await supabase.rpc("importar_bens_html", {
        _sala_id: salaAlvo.id, _arquivo: file.name, _bens: extraidos.map((b) => ({ ...b })),
        _cabecalho: { ...termo.cabecalho },
      });
      if (erroImportacao) throw erroImportacao;
      if (!resultado || typeof resultado !== "object" || Array.isArray(resultado)) {
        throw new Error("Não foi possível confirmar a importação");
      }
      setNovaSala({ nome: salaAlvo.nome, endereco: salaAlvo.endereco ?? "" });
      cabecalhoPendente.current = {
        historico: termo.cabecalho.historico, data: termo.cabecalho.data,
        local: salaAlvo.nome, endereco: salaAlvo.endereco ?? "",
      };
      setSalaSel(salaAlvo);
      setUnidadeLiberadaSalaId(salaAlvo.id);
      setUltimaImportacao(String(resultado["importacao_id"] ?? resultado["numero"]));
      toast.success(`Termo de responsabilidade nº ${String(resultado["termo_numero"])} criado. ` +
        `${Number(resultado["novos"])} bem(ns) adicionados; ${Number(resultado["repetidos"])} já cadastrados. ` +
        `Use “Imprimir termo de Responsabilidade” para imprimir os ${extraidos.length} bens do HTML.`);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a importação do HTML");
    } finally {
      setImportando(false);
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-primary px-3 py-2 sm:px-6 sm:py-3">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center xl:flex-1">
            <div className="flex shrink-0 items-center gap-2">
              <Building2 className="h-6 w-6 text-primary-foreground" />
              <span className="text-lg font-bold text-primary-foreground">
                SysPatrimônio
              </span>
            </div>
            <form onSubmit={localizarOuAtualizar} autoComplete="off" className="min-w-0 flex-1 space-y-1.5 text-primary-foreground xl:max-w-[36rem]">
              <Label htmlFor="pesquisaDinamica">PESQUISA DINÂMICA</Label>
              <div className="flex items-center gap-2">
                <Input id="pesquisaDinamica" type="search" autoComplete="off"
                  autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  className="min-w-0 bg-background text-foreground dark:bg-background"
                  placeholder="RED: 60.651, 60.785 ou descrição/valor..."
                  value={pesquisaDinamica} disabled={localizando || !!resultadoPesquisa}
                  onChange={(e) => setPesquisaDinamica(e.target.value)} />
                <Button type="submit" variant="secondary" className="shrink-0"
                  disabled={localizando || importando || carregandoPapel || !["admin", "operador"].includes(role ?? "") || (!resultadoPesquisa && !pesquisaDinamica.trim())}>
                  {localizando ? "Localizando..." : resultadoPesquisa ? "Atualizar" : "Localizar"}
                </Button>
              </div>
              <p className="text-xs text-primary-foreground" aria-live="polite">
                {resultadoPesquisa
                  ? `${resultadoPesquisa.bens.length} bem(ns) encontrado(s) em todas as salas. Clique em Atualizar para voltar à sala selecionada.`
                  : "Pesquisa em todas as salas disponíveis para sua conta."}
              </p>
            </form>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-start gap-1 xl:justify-end [&_button]:text-base [&_a]:text-base">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCadastroAberto((aberto) => !aberto)}
              aria-expanded={cadastroAberto}
              aria-controls="painel-cadastro-departamento"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Building2 className="mr-2 h-4 w-4" /> Departamento
            </Button>
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

      <AlertDialog open={!!confirmacaoImportacao} onOpenChange={(aberto) => {
        if (!aberto) responderConfirmacaoImportacao(false);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-normal">
              LOCAL IMPORTADO: <strong>{confirmacaoImportacao?.local}</strong>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-foreground">
                <p className="font-bold">{confirmacaoImportacao?.quantidade} BEM(NS) SERÃO IMPORTADOS!</p>
                <p>DESEJA CONTINUAR? (Os Bens que já existem na sala não serão duplicados)</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => responderConfirmacaoImportacao(false)}>Não</AlertDialogCancel>
            <AlertDialogAction onClick={() => responderConfirmacaoImportacao(true)}>Sim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="mx-auto grid max-w-[1800px] gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-6 lg:contents">
          {carregandoDepartamentos && (
            <p role="status" className="text-sm text-muted-foreground lg:col-span-2">Carregando departamentos salvos...</p>
          )}
          {erroDepartamentos && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive p-3 text-sm lg:col-span-2">
              <p className="flex-1">{erroDepartamentos}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setTentativaCarga((n) => n + 1)}>
                Tentar novamente
              </Button>
            </div>
          )}
          {!carregandoDepartamentos && !erroDepartamentos && departamentos.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground lg:col-span-2">Nenhum departamento disponível para esta conta. Se você já tinha registros, confirme se entrou com a mesma conta e se ela tem acesso de administrador ou operador.</p>
          )}
          {/* Formulário principal — cabeçalho */}
          {cadastroAberto && (
          <Card id="painel-cadastro-departamento" className="min-w-0 lg:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Cadastro de Departamento</CardTitle>
                  <CardDescription>
                    Dados do cabeçalho do termo de responsabilidade
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={novoDepartamento}
                    disabled={carregandoDepartamentos || !!erroDepartamentos}>
                    <Plus className="mr-1 h-4 w-4" /> Novo
                  </Button>
                  <Button type="submit" form="cadastro-departamento" size="sm"
                    disabled={carregandoDepartamentos || !!erroDepartamentos}>
                    {departamentoSel ? "Salvar alterações" : "Cadastrar departamento"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(departamentos.length > 1 || (!departamentoSel && departamentos.length > 0)) && (
                <div className="mb-3 flex flex-col gap-1.5">
                  <Label htmlFor="departamento-cadastrado">Departamento cadastrado</Label>
                  <select
                    id="departamento-cadastrado"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={departamentoSel?.id ?? ""}
                    onChange={(e) => {
                      const selecionado = departamentos.find((d) => d.id === e.target.value);
                      if (selecionado) selecionarDepartamento(selecionado);
                    }}
                  >
                    <option value="" disabled>Selecione um departamento</option>
                    {departamentos.map((d) => (
                      <option key={d.id} value={d.id}>{d.departamento}</option>
                    ))}
                  </select>
                </div>
              )}
              <form
                id="cadastro-departamento"
                onSubmit={salvarDepartamento}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="flex flex-col gap-1.5 sm:col-span-2">
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
              </form>
            </CardContent>
          </Card>
          )}

          {/* Subformulário de bens */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Bens da sala {salaSel ? `— ${salaSel.nome}` : ""}</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" size="sm"
                    disabled={!!resultadoPesquisa || localizando || !salaSel || bens.length > 0 || carregandoBens || !!erroBens || carregandoSalas || !!erroSalas || importando || excluindoSala}
                    onClick={excluirSalaVazia}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    {excluindoSala ? "Excluindo..." : "Excluir sala vazia"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".html,.htm,text/html"
                    className="hidden"
                    onChange={importarHtml}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!departamentoSel || importando || localizando || !!resultadoPesquisa}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    {importando ? "Lendo HTML..." : "Importar HTML do Sonner"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!salaSel || importando || localizando || !!resultadoPesquisa}
                    onClick={() => { setConsultarTermoPorNumero(false); setDialogTermos(true); }}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Imprimir termo de Responsabilidade
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!salaSel || importando || localizando || !!resultadoPesquisa}
                    onClick={() => { setConsultarTermoPorNumero(true); setDialogTermos(true); }}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Termo de Responsabilidade
                  </Button>
                  <Button variant="outline" size="sm" disabled={importando} onClick={() => setDialogTransferencia(true)}>
                    Gerar transferência
                  </Button>
                  <Button variant="outline" size="sm" disabled={importando} onClick={() => setDialogEstorno(true)}>
                    Estornar transferência
                  </Button>
                  {dialogEstorno && <EstornoTransferenciaDialog
                    onClose={() => setDialogEstorno(false)}
                    onSaved={() => {
                      setTentativaBens((valor) => valor + 1);
                      setSelecionados([]);
                      setSalas((atuais) => [...atuais]);
                    }}
                  />}
                  {dialogTransferencia && <TransferenciaBensDialog
                    codigosIniciais={textoCodigosTransferencia}
                    onClose={() => setDialogTransferencia(false)}
                    onSaved={(destinoId, termoId) => {
                      setTentativaBens((valor) => valor + 1);
                      setSelecionados([]);
                      setBensParaTransferir([]);
                      if (salaSel?.id === destinoId) setUltimaImportacao(termoId);
                      setSalas((atuais) => [...atuais]);
                    }}
                  />}
                  <TermosResponsabilidadeDialog
                    open={dialogTermos}
                    onOpenChange={setDialogTermos}
                    salaId={salaSel?.id ?? null}
                    ultimaImportacao={ultimaImportacao}
                    consultarPorNumero={consultarTermoPorNumero}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 [&_input:not([type=checkbox])]:text-base [&_label]:text-base [&_select]:text-base [&_table]:text-base [&_td_button]:text-base">
              {!resultadoPesquisa && <div className="resumo-local grid gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,3fr)_minmax(0,1.2fr)]">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="cabData">Última</Label>
                  <Input
                    id="cabData"
                    aria-label="Data da última importação"
                    title="Data da última importação"
                    disabled={!salaSel}
                    value={cabecalho.data}
                    onChange={(e) => setCabecalho({ ...cabecalho, data: e.target.value })}
                    onBlur={salvarCabecalho}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="cabLocal">Local Físico</Label>
                  <Input
                    id="cabLocal"
                    className="text-xs md:text-xs"
                    disabled={!salaSel}
                    value={cabecalho.local}
                    onChange={(e) => setCabecalho({ ...cabecalho, local: e.target.value })}
                    onBlur={salvarCabecalho}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="cabUnidade">Unidade</Label>
                  {unidadeLiberada && (
                    <p id="avisoUnidade" role="status" className="text-sm font-semibold text-inherit">
                      Selecione a Unidade
                    </p>
                  )}
                  <select
                    ref={unidadeRef}
                    id="cabUnidade"
                    aria-describedby={unidadeLiberada ? "avisoUnidade" : undefined}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!unidadeLiberada || salvandoUnidade || carregandoSalas || !!erroSalas || importando}
                    value={salaSel?.unidade ?? ""}
                    onChange={(e) => void salvarUnidade(e.target.value)}
                  >
                    <option value="" disabled>Selecione a Unidade</option>
                    <option value="CENTRAL">CENTRAL</option>
                    <option value="SAÚDE">SAÚDE</option>
                    <option value="EDUCAÇÃO">EDUCAÇÃO</option>
                  </select>
                  {salvandoUnidade && <span className="sr-only" role="status">Salvando unidade...</span>}
                </div>
                <div className="grid gap-3 sm:col-span-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="cabResp">Responsável pela sala</Label>
                    <Input id="cabResp" readOnly value={responsavelAtual?.nome ?? salaSel?.responsavel ?? ""}
                      placeholder="Preenchido pelo usuário vinculado ao local" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="cabCpf">CPF</Label>
                    <Input id="cabCpf" readOnly value={responsavelAtual?.cpf ? formatarCpf(responsavelAtual.cpf) : ""}
                      placeholder="CPF do responsável" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="cabMatricula">Matrícula</Label>
                    <Input id="cabMatricula" readOnly value={responsavelAtual?.matricula ?? ""}
                      placeholder="Matrícula do responsável" />
                  </div>
                </div>
              </div>}
              {bensExibidos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm text-muted-foreground" role="status">
                    {selecionados.length} selecionado(s) · Exibindo {bensFiltrados.length} de {bensExibidos.length}
                  </span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      className="h-4 w-4 accent-primary"
                      checked={todosFiltradosSelecionados}
                      onChange={(e) => setSelecionados(e.target.checked ? idsBensFiltrados : [])}
                    />
                    Todos para exclusão
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      aria-label="Selecionar todos para transferência"
                      checked={bensFiltrados.length > 0 && bensFiltrados.every((b) => bensParaTransferir.some((item) => item.id === b.id))}
                      disabled={!bensFiltrados.length}
                      onChange={(e) => setBensParaTransferir((atuais) => e.target.checked
                        ? [...atuais, ...bensFiltrados.filter((b) => !atuais.some((item) => item.id === b.id))]
                        : atuais.filter((b) => !idsBensFiltrados.includes(b.id)))}
                    />
                    Todos para transferência
                  </label>
                  <div className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      className="pl-8"
                      aria-label="Pesquisar bens da sala"
                      placeholder="Pesquisar em qualquer campo dos bens..."
                      value={buscaBens}
                      onChange={(e) => {
                        setBuscaBens(e.target.value);
                        setSelecionados([]);
                      }}
                    />
                  </div>
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
              {bensParaTransferir.length > 0 && <div className="space-y-2 rounded-md border bg-accent p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="codigos-selecionados-transferencia">Códigos RED para transferência ({bensParaTransferir.length} bens)</Label>
                  <Button variant="outline" size="sm" onClick={() => setBensParaTransferir([])}>Limpar seleção de transferência</Button>
                </div>
                <Input id="codigos-selecionados-transferencia" readOnly value={textoCodigosTransferencia} />
                <p className="text-sm text-muted-foreground">Clique em Gerar transferência no cabeçalho. Os códigos serão preenchidos automaticamente; selecione o local de destino para liberar Filtrar. Esta seleção é independente da exclusão.</p>
              </div>}
              <div className="max-h-[480px] overflow-y-auto rounded-md border border-border">
              <Table className="text-xs [&_td]:text-xs [&_td_button]:text-xs [&_td_span]:text-xs">
                <TableHeader className="sticky top-0 z-10 bg-room-assets-header [&_th]:border-y-2 [&_th]:border-room-assets-header-border [&_th]:font-bold [&_th]:text-[10px] [&_th]:text-room-assets-header-foreground [&_th]:whitespace-nowrap [&_th:first-child]:border-l-2 [&_th:last-child]:border-r-2">
                  <TableRow className="h-8 hover:bg-room-assets-header">
                    <TableHead className="h-8 w-12 py-1 text-center">EXC.</TableHead>
                    <TableHead className="h-8 w-16 py-1 text-center">TRAN</TableHead>
                    <TableHead className="h-8 w-36 py-1">PATRIMÔNIO</TableHead>
                    <TableHead className="h-8 py-1">DESCRIÇÃO DO BEM</TableHead>
                    <TableHead className="h-8 w-36 py-1">INCORPORAÇÃO</TableHead>
                    <TableHead className="h-8 w-28 py-1">TIPO</TableHead>
                    <TableHead className="h-8 w-32 py-1 text-right">VALOR</TableHead>
                    <TableHead className="h-8 w-12 py-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bensExibidos.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {resultadoPesquisa ? "Nenhum bem encontrado para esta pesquisa em todas as salas."
                          : carregandoDepartamentos || carregandoSalas || carregandoBens
                          ? "Carregando registros salvos..."
                          : erroBens ? (
                            <div role="alert" className="flex flex-col items-center gap-2 py-2">
                              <p>{erroBens}</p>
                              <Button type="button" variant="outline" size="sm" onClick={() => setTentativaBens((n) => n + 1)}>
                                Tentar novamente
                              </Button>
                            </div>
                          ) : salaSel
                            ? "Nenhum bem cadastrado nesta sala."
                            : "Selecione uma sala na caixa de listagem ao lado."}
                      </TableCell>
                    </TableRow>
                  )}
                  {bensExibidos.length > 0 && bensFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum bem encontrado para esta pesquisa.
                      </TableCell>
                    </TableRow>
                  )}
                  {bensFiltrados.map((b) => (
                    <TableRow key={b.id} className={bemNaoLocalizado(b) ? "text-destructive" : undefined}>
                      <TableCell className="py-1 text-center">
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
                      <TableCell className="py-1 text-center">
                        <input type="checkbox" className="h-4 w-4 accent-primary"
                          aria-label={`Copiar RED ${formatarCodigoRed(b.codigo_red)} para transferência`}
                          checked={bensParaTransferir.some((item) => item.id === b.id)}
                          onChange={(e) => setBensParaTransferir((atuais) => e.target.checked
                            ? atuais.some((item) => item.id === b.id) ? atuais : [...atuais, b]
                            : atuais.filter((item) => item.id !== b.id))} />
                      </TableCell>
                      <TableCell className="py-1">
                        <button
                          type="button"
                          className={`font-mono text-sm font-medium underline ${bemNaoLocalizado(b) ? "text-destructive" : "text-primary"}`}
                          onClick={() => setTermoBem(b)}
                        >
                          {formatarCodigoRed(b.codigo_red)}
                        </button>
                      </TableCell>
                      <TableCell className="py-1">
                        {limparDescricao(b.descricao)}
                        {resultadoPesquisa && <span className="block text-sm text-muted-foreground">
                          Local Físico: {b.sala_id ? resultadoPesquisa.locais[b.sala_id] : "—"}
                        </span>}
                      </TableCell>
                      <TableCell className="py-1 whitespace-nowrap">{b.incorporacao ?? ""}</TableCell>
                      <TableCell className="py-1">{tipoExibido(b)}</TableCell>
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
              </div>
              <div className="flex items-center justify-between rounded-md border-2 border-primary/30 bg-accent px-3 py-2 text-sm font-medium text-foreground">
                <span>Quantidade de bens: {bensFiltrados.length}{buscaBens.trim() ? ` de ${bensExibidos.length}` : ""}</span>
                <span>
                  {buscaBens.trim() ? "Total filtrado" : "Total"}: {formataMoeda(bensFiltrados.reduce((acc, b) => acc + Number(b.valor), 0))}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Caixa de listagem de salas + busca */}
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader>
              <CardTitle className="text-base">Localizar salas</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="filtroUnidadeSalas">Filtrar por unidade</Label>
                <select
                  id="filtroUnidadeSalas"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={filtroUnidade}
                  onChange={(e) => setFiltroUnidade(e.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  <option value="CENTRAL">CENTRAL</option>
                  <option value="SAÚDE">SAÚDE</option>
                  <option value="EDUCAÇÃO">EDUCAÇÃO</option>
                </select>
              </div>
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
                className="flex h-[320px] flex-col gap-0 overflow-y-auto rounded-md border border-border p-1 lg:h-0 lg:min-h-0 lg:flex-1 [&>[role=option]]:shrink-0"
              >
                {(carregandoDepartamentos || carregandoSalas) && (
                  <p role="status" className="p-3 text-center text-sm text-muted-foreground">Carregando salas salvas...</p>
                )}
                {erroSalas && (
                  <div role="alert" className="p-3 text-sm">
                    <p>{erroSalas}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setTentativaSalas((n) => n + 1)}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
                {!carregandoDepartamentos && !carregandoSalas && !erroDepartamentos && !erroSalas && salasFiltradas.length === 0 && (
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
                    className={`flex items-center justify-between rounded-sm px-3 py-0.5 text-sm ${
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
                      aria-label={`Gerenciar usuários de ${s.nome}`}
                      title={role === "admin" ? "Editar usuário vinculado a este Local Físico" : "Apenas administradores podem gerenciar usuários"}
                      disabled={role !== "admin"}
                      className={
                        salaSel?.id === s.id
                          ? "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                          : ""
                      }
                      onClick={() => navigate({ to: "/usuarios", search: { salaId: s.id } })}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir importações de ${s.nome}`}
                      title="Excluir importações (mantém o local)"
                      className={
                        salaSel?.id === s.id
                          ? "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                          : "text-destructive"
                      }
                      onClick={() => setSalaExcluir(s)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-semibold" aria-live="polite">
                {carregandoDepartamentos || carregandoSalas
                  ? "Carregando quantidade de salas..."
                  : erroDepartamentos || erroSalas
                    ? "Quantidade de salas indisponível. Tente novamente."
                    : `Quantidade de salas listadas: ${salasFiltradas.length}`}
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
                <TableHead>Incorporação</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bensDialogSala.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Nenhum registro nesta sala.
                  </TableCell>
                </TableRow>
              )}
              {bensDialogSala.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{formatarCodigoRed(b.codigo_red)}</TableCell>
                  <TableCell>{limparDescricao(b.descricao)}</TableCell>
                  <TableCell>{b.incorporacao ?? ""}</TableCell>
                  <TableCell>{b.tipo ?? ""}</TableCell>
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
              Informações do bem {termoBem ? formatarCodigoRed(termoBem.codigo_red) : ""}
            </DialogDescription>
          </DialogHeader>
          {termoBem && departamentoSel && !resultadoPesquisa && (
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
                  <strong>Código RED.:</strong> {formatarCodigoRed(termoBem.codigo_red)}
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
          {termoBem && (!departamentoSel || resultadoPesquisa) && (
            <div className="px-1 text-sm">
              {resultadoPesquisa && <p>
                <strong>Local Físico:</strong> {termoBem.sala_id ? resultadoPesquisa.locais[termoBem.sala_id] : "—"}
              </p>}
              <p>
                <strong>Código RED.:</strong> {formatarCodigoRed(termoBem.codigo_red)}
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

      {salaExcluir && (
        <ExcluirImportacoesDialog
          key={salaExcluir.id}
          sala={salaExcluir}
          onClose={() => setSalaExcluir(null)}
          onDeleted={atualizarAposExclusao}
        />
      )}
    </div>
  );
}
