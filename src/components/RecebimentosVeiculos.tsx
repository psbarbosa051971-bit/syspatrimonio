import { useEffect, useState, type FormEvent } from "react";
import { Car, FileText, Pencil, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { ehVeiculo, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { pesquisarBensEmTodasAsSalas, type ResultadoPesquisaDinamica } from "@/lib/pesquisa-dinamica";
import { imprimirTermoVeiculo, numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";
import { RecebimentoVeiculosDialog } from "@/components/RecebimentoVeiculosDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Bem = Tables<"bens">;
type Termo = Tables<"recebimentos_veiculos"> & { bem: (Bem & { sala: { nome: string } | null }) | null };

export function RecebimentosVeiculos() {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState("termos");
  const [termos, setTermos] = useState<Termo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [pesquisando, setPesquisando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoPesquisaDinamica | null>(null);
  const [bem, setBem] = useState<Bem | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    setCarregando(true); setErro(false);
    void (async () => {
      try {
        const registros: Termo[] = [];
        for (let inicio = 0; ; inicio += 500) {
          const { data, error } = await supabase.from("recebimentos_veiculos")
            .select("*, bem:bens(*, sala:salas(nome))").order("ano", { ascending: false }).order("numero", { ascending: false })
            .range(inicio, inicio + 499);
          if (error) throw error;
          registros.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
        if (ativo) setTermos(registros);
      } catch { if (ativo) setErro(true); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [aberto, versao]);

  async function pesquisar(evento: FormEvent) {
    evento.preventDefault();
    if (!busca.trim() || pesquisando) return;
    setPesquisando(true); setResultado(null);
    try {
      const encontrados = await pesquisarBensEmTodasAsSalas(busca);
      setResultado({ ...encontrados, bens: encontrados.bens.filter(ehVeiculo) });
    } catch { toast.error("Não foi possível pesquisar os veículos. Tente novamente."); }
    finally { setPesquisando(false); }
  }

  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtrados = termos.filter((t) => normalizar(`${numeroTermoVeiculo(t)} ${t.bem?.codigo_red} ${t.bem ? formatarCodigoRed(t.bem.codigo_red) : ""} ${t.bem?.descricao} ${lerDadosRecebimento(t.dados).secretaria ?? ""}`).includes(normalizar(filtro)));

  return <>
    <Button variant="ghost" size="sm" onClick={() => setAberto(true)}
      className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
      <Car className="mr-2 h-4 w-4" /> Recebimento de Veículos
    </Button>
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-6xl flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="flex items-center gap-2 text-xl"><Car className="h-6 w-6 text-primary" />Recebimento de Veículos</DialogTitle>
          <DialogDescription>Cadastre a conferência, acompanhe os termos numerados e imprima o documento completo para assinatura.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Termos registrados</p><p className="text-3xl font-bold text-primary">{carregando ? "…" : erro ? "—" : termos.length}</p></div>
          <p className="max-w-md text-sm text-muted-foreground">Numeração automática por ano, no formato 001/2026. Editar um recebimento mantém o número original.</p>
        </div>
        <Tabs value={aba} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="termos"><FileText className="mr-2 h-4 w-4" />Termos emitidos</TabsTrigger>
            <TabsTrigger value="novo"><Plus className="mr-2 h-4 w-4" />Novo recebimento</TabsTrigger>
          </TabsList>
          <TabsContent value="termos" className="min-h-0 overflow-y-auto space-y-3">
            <Input aria-label="Filtrar termos de veículos" placeholder="Filtrar por número/ano, patrimônio, modelo ou secretaria…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            {carregando ? <p role="status" className="py-8 text-center text-muted-foreground">Carregando termos...</p> : erro ? <div role="alert" className="rounded-lg border border-destructive p-4"><p>Não foi possível carregar os termos.</p><Button variant="outline" className="mt-2" onClick={() => setVersao((v) => v + 1)}>Tentar novamente</Button></div> : <>
              {filtrados.length === 0 && <p className="py-10 text-center text-muted-foreground">{termos.length ? "Nenhum termo corresponde ao filtro." : "Nenhum termo registrado. Abra Novo recebimento para começar."}</p>}
              {filtrados.map((t) => <article key={t.bem_id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
                <div className="min-w-0 flex-1"><p className="text-sm font-bold text-primary">TERMO Nº {numeroTermoVeiculo(t)}</p><p className="mt-1 text-sm font-semibold">Patrimônio {t.bem ? formatarCodigoRed(t.bem.codigo_red) : "indisponível"}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.bem ? limparDescricao(t.bem.descricao) : "Veículo não disponível para esta conta."}</p><p className="mt-2 text-xs text-muted-foreground">{lerDadosRecebimento(t.dados).secretaria || "Secretaria não informada"} · Atualizado em {new Date(t.atualizado_em).toLocaleDateString("pt-BR")}</p></div>
                <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!t.bem} onClick={() => setBem(t.bem)}><Pencil className="mr-2 h-4 w-4" />Editar</Button><Button size="sm" disabled={!t.bem} onClick={() => { if (t.bem && !imprimirTermoVeiculo(t.bem, t, t.bem.sala?.nome ?? "")) toast.error("Permita a abertura de janelas para imprimir o termo."); }}><Printer className="mr-2 h-4 w-4" />Imprimir termo</Button></div>
              </article>)}
            </>}
          </TabsContent>
          <TabsContent value="novo" className="min-h-0 overflow-y-auto space-y-4">
            <p className="text-sm text-muted-foreground">Localize um veículo já cadastrado pelo código RED, placa ou palavras da descrição. Cada patrimônio tem um termo; se já existir, você poderá editá-lo.</p>
            <form onSubmit={pesquisar} className="flex flex-wrap gap-2"><Input aria-label="Pesquisar veículo" className="min-w-48 flex-1" placeholder="Código RED, placa ou modelo do veículo" value={busca} onChange={(e) => setBusca(e.target.value)} /><Button type="submit" disabled={pesquisando || !busca.trim()}><Search className="mr-2 h-4 w-4" />{pesquisando ? "Buscando…" : "Localizar veículo"}</Button></form>
            {resultado && resultado.bens.length === 0 && <p role="status" className="rounded-lg bg-muted p-4 text-sm">Nenhum veículo encontrado nos locais disponíveis para sua conta. Cadastre ou importe o patrimônio em Departamento antes de criar seu recebimento.</p>}
            {resultado?.bens.map((v) => <article key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div className="min-w-0 flex-1"><p className="font-semibold">Patrimônio {formatarCodigoRed(v.codigo_red)}</p><p className="line-clamp-2 text-sm text-muted-foreground">{limparDescricao(v.descricao)}</p><p className="mt-1 text-xs text-muted-foreground">{v.sala_id ? resultado.locais[v.sala_id] : ""}</p></div><Button variant="outline" onClick={() => setBem(v)}>Preencher recebimento</Button></article>)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    {bem && <RecebimentoVeiculosDialog bem={bem} onClose={() => setBem(null)} onSaved={() => { setVersao((v) => v + 1); setAba("termos"); }} />}
  </>;
}
