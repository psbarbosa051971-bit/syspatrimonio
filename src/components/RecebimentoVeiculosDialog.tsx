import { useEffect, useState } from "react";
import { Car, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { descricaoDetalhada, ehVeiculo, extrairDadosVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Bem = Tables<"bens">;
type Props = { bem: Bem; onClose: () => void };
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const identificacao = [
  { chave: "material", nome: "Material" }, { chave: "emissao", nome: "Emissão", tipo: "date" },
  { chave: "fornecedor", nome: "Fornecedor" }, { chave: "pedido", nome: "Pedido" },
  { chave: "ano_empenho", nome: "Ano do empenho", tipo: "number" },
  { chave: "empenho", nome: "Empenho" },
];
const detalhes = [
  { chave: "ano_modelo", nome: "Ano/modelo" }, { chave: "chassi", nome: "Chassi" },
  { chave: "renavam", nome: "Renavam" }, { chave: "motor", nome: "Motor" },
  { chave: "placa", nome: "Placa" }, { chave: "km", nome: "KM", tipo: "number" },
];

export function BotaoRecebimentoVeiculo({ bem }: { bem: Bem }) {
  const [aberto, setAberto] = useState(false);
  if (!ehVeiculo(bem)) return null;
  return <>
    <Button type="button" size="icon" variant="outline" className="ml-2 h-7 w-7 shrink-0 align-middle text-primary"
      title="Recebimento de Veículos" aria-label={`Recebimento de Veículos — ${bem.codigo_red}`}
      onClick={() => setAberto(true)}><Car className="h-4 w-4" /></Button>
    {aberto && <RecebimentoVeiculosDialog bem={bem} onClose={() => setAberto(false)} />}
  </>;
}

export function RecebimentoVeiculosDialog({ bem, onClose }: Props) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [locais, setLocais] = useState<string[]>([]);
  const [localOrigem, setLocalOrigem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const alterar = (chave: string, valor: string) => setDados((atuais) => ({ ...atuais, [chave]: valor }));

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    void (async () => {
      try {
        const [recebimento, local] = await Promise.all([
          supabase.from("recebimentos_veiculos").select("dados").eq("bem_id", bem.id).maybeSingle(),
          bem.sala_id ? supabase.from("salas").select("nome").eq("id", bem.sala_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        if (recebimento.error) throw recebimento.error;
        if (local.error) throw local.error;
        if (cancelado) return;
        const salvos = lerDadosRecebimento(recebimento.data?.dados);
        const preenchidos = { ...extrairDadosVeiculo(limparDescricao(bem.descricao)).dados };
        for (const [chave, valor] of Object.entries(salvos)) {
          if (valor.trim() || !(chave in preenchidos)) preenchidos[chave] = valor;
        }
        setLocalOrigem(local.data?.nome ?? "");
        setDados({ ...preenchidos, secretaria: salvos.secretaria ?? local.data?.nome ?? "" });
        setCarregando(false);
      } catch {
        if (!cancelado) { setErro(true); setCarregando(false); }
      }
    })();
    // Os locais sugeridos são opcionais: uma falha não bloqueia os dados do veículo.
    void (async () => {
      const nomes: string[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase.from("salas").select("nome").order("nome").range(inicio, inicio + 999);
        if (cancelado || error) return;
        nomes.push(...(data ?? []).map((local) => local.nome));
        if (!data || data.length < 1000) break;
      }
      if (!cancelado) setLocais([...new Set(nomes)]);
    })().catch(() => { /* É possível digitar a secretaria sem as sugestões. */ });
    return () => { cancelado = true; };
  }, [bem.id, bem.sala_id, bem.descricao, tentativa]);

  async function salvar() {
    if (carregando || erro || salvando || !bem.sala_id) return;
    setSalvando(true);
    try {
      const { data: { user }, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !user) throw new Error("Sessão indisponível");
      const { error } = await supabase.from("recebimentos_veiculos").upsert({
        bem_id: bem.id, dados, atualizado_por: user.id, atualizado_em: new Date().toISOString(),
      }, { onConflict: "bem_id" }).select("bem_id").single();
      if (error) throw error;
      toast.success("Recebimento de veículo e check-list salvos.");
      onClose();
    } catch {
      toast.error("Não foi possível salvar o recebimento. Seus dados foram mantidos para tentar novamente.");
    } finally { setSalvando(false); }
  }

  function campo(chave: string, nome: string, tipo = "text") {
    return <label key={chave} className="space-y-1 text-xs font-semibold">
      <span className="block uppercase">{nome}</span>
      <Input type={tipo} min={tipo === "number" ? 0 : undefined} maxLength={tipo === "text" ? 200 : undefined}
        value={dados[chave] ?? ""} onChange={(evento) => alterar(chave, evento.target.value)} />
    </label>;
  }

  const modeloVeiculo = extrairDadosVeiculo(limparDescricao(bem.descricao)).modelo;
  const automaticos = [
    ["Data cadastro", bem.incorporacao ?? ""], ["Patrimônio", formatarCodigoRed(bem.codigo_red)],
    ["Valor unitário", moeda(Number(bem.valor))], ["Incorporação", bem.tipo ?? ""],
    ["Modelo do veículo", modeloVeiculo],
  ];

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
    <DialogContent className="max-h-[92vh] w-[calc(100%_-_1rem)] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5" />Recebimento de Veículos</DialogTitle>
        <DialogDescription>Patrimônio {formatarCodigoRed(bem.codigo_red)} — {limparDescricao(bem.descricao)}</DialogDescription>
      </DialogHeader>
      {carregando && <p role="status" className="text-sm text-muted-foreground">Carregando recebimento...</p>}
      {erro && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Não foi possível carregar o recebimento.
        <Button type="button" variant="outline" size="sm" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button>
      </div>}
      {!bem.sala_id && <p role="alert" className="text-sm text-destructive">Vincule este bem a um Local Físico antes de salvar o recebimento.</p>}
      <Tabs defaultValue="recebimento">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="recebimento">Recebimento</TabsTrigger>
          <TabsTrigger value="checklist">Check-list</TabsTrigger>
        </TabsList>
        <fieldset disabled={carregando || erro || salvando} className="mt-3 disabled:opacity-60">
          <TabsContent value="recebimento" className="space-y-4">
            <div className="rounded-md border border-border">
              <h3 className="bg-muted px-3 py-2 text-xs font-bold uppercase">Secretaria / Recebimento de veículo</h3>
              <div className="grid gap-3 p-3 sm:grid-cols-3">
                {identificacao.map(({ chave, nome, tipo }) => campo(chave, nome, tipo))}
              </div>
            </div>
            <div className="rounded-md border border-border">
              <h3 className="bg-muted px-3 py-2 text-xs font-bold uppercase">Dados do cadastro patrimonial</h3>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
                {automaticos.map(([nome, valor]) => <label key={nome}
                  className={`space-y-1 text-xs font-semibold ${nome === "Modelo do veículo" ? "sm:col-span-2" : ""}`}>
                  <span className="block uppercase">{nome}</span>
                  {nome === "Modelo do veículo" ? <Textarea readOnly value={valor} rows={2} className="bg-muted/40" />
                    : <Input readOnly value={valor} className="bg-muted/40" />}
                </label>)}
                <label className="space-y-1 text-xs font-semibold sm:col-span-2">
                  <span className="block uppercase">Secretaria</span>
                  <Input aria-label="Secretaria" list={`secretarias-${bem.id}`} value={dados.secretaria ?? ""} maxLength={200}
                    placeholder="Selecione ou digite a secretaria" onChange={(evento) => alterar("secretaria", evento.target.value)} />
                  <datalist id={`secretarias-${bem.id}`}>
                    {[...new Set([...locais, localOrigem, dados.secretaria ?? ""])].filter(Boolean).map((nome) => <option key={nome} value={nome} />)}
                  </datalist>
                  <span className="block text-xs font-normal text-muted-foreground">Local Físico de origem: {localOrigem || "—"}. Você pode digitar outra secretaria.</span>
                </label>
              </div>
            </div>
            <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-6">
              {detalhes.map(({ chave, nome, tipo }) => campo(chave, nome, tipo))}
            </div>
            <div className="rounded-md border border-border">
              <h3 className="bg-muted px-3 py-2 text-xs font-bold uppercase">Descrição detalhada do veículo</h3>
              <div className="p-3">
                <div role="textbox" aria-label="Descrição detalhada do veículo" aria-readonly="true" aria-multiline="true" tabIndex={0}
                  className="min-h-[180px] rounded-md border border-input bg-background px-6 py-6 text-xs leading-snug text-foreground">
                  {descricaoDetalhada(dados, modeloVeiculo).split("\n").map((linha) => {
                    const separador = linha.indexOf(":");
                    return <div key={linha.slice(0, separador)} className="whitespace-pre-wrap break-words">
                      <strong className="font-bold">{linha.slice(0, separador + 1)}</strong>{" "}{linha.slice(separador + 1).trim()}
                    </div>;
                  })}
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="checklist" className="space-y-4">
            {gruposChecklist.map((grupo) => <section key={grupo.titulo} className="rounded-md border border-border">
              <h3 className="bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{grupo.titulo}</h3>
              <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {grupo.campos.map(({ chave, nome, opcoes }) => <label key={chave} className="space-y-1 text-xs font-semibold">
                  <span className="block">{nome}</span>
                  <select value={dados[chave] ?? ""} onChange={(evento) => alterar(chave, evento.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="">Selecione...</option>
                    {opcoes.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                  </select>
                </label>)}
              </div>
            </section>)}
          </TabsContent>
        </fieldset>
      </Tabs>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="max-w-xl text-xs text-muted-foreground">O recebimento e o check-list são salvos para este patrimônio, sem alterar o cadastro do bem ou o Local Físico.</p>
        <Button type="button" onClick={salvar} disabled={carregando || erro || salvando || !bem.sala_id}>
          <Save className="mr-2 h-4 w-4" />{salvando ? "Salvando..." : "Salvar recebimento e check-list"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
