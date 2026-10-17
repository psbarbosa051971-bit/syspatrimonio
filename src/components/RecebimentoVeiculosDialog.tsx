import type { TablesInsert } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";
import { Car, Printer, Save } from "lucide-react";
import { htmlTermoVeiculo, numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { conclusaoPadraoRecebimento, descricaoDetalhada, ehVeiculo, extrairDadosVeiculo, gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { ChaveAcessoNfe } from "@/components/ChaveAcessoNfe";
import { CampoEmissaoNfe } from "@/components/CampoEmissaoNfe";
import { CampoValorReais } from "@/components/CampoValorReais";
import { usePreenchimentoNfe } from "@/hooks/use-preenchimento-nfe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Bem = Tables<"bens">;
type Props = { bem: Bem; onClose: () => void; onSaved?: () => void };
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const identificacao = [
  { chave: "nota_fiscal", nome: "Nota fiscal" }, { chave: "valor", nome: "Valor da nota", tipo: "number" },
  { chave: "emissao", nome: "Emissão", tipo: "date" },
  { chave: "data_recebimento", nome: "Data do recebimento", tipo: "date" },
  { chave: "pedido", nome: "Pedido" },
  { chave: "ano_empenho", nome: "Ano do empenho", tipo: "number" },
  { chave: "empenho", nome: "Empenho" },
  { chave: "fornecedor", nome: "Fornecedor" },
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

export function RecebimentoVeiculosDialog({ bem, onClose, onSaved }: Props) {
  const [termo, setTermo] = useState<Tables<"recebimentos_veiculos"> | null>(null);
  const [dados, setDados] = useState<Record<string, string>>({});
  const [localOrigem, setLocalOrigem] = useState("");
  const [secretarias, setSecretarias] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const { emissaoRef, camposPreenchidos, registrarPreenchimento } = usePreenchimentoNfe();
  const alterar = (chave: string, valor: string) => setDados((atuais) => ({ ...atuais, [chave]: valor }));

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    void (async () => {
      try {
        const [recebimento, local, historico] = await Promise.all([
          supabase.from("recebimentos_veiculos").select("*").eq("bem_id", bem.id).maybeSingle(),
          bem.sala_id ? supabase.from("salas").select("nome").eq("id", bem.sala_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from("recebimentos_veiculos").select("secretaria:dados->>secretaria")
            .order("atualizado_em", { ascending: false }).limit(100),
        ]);
        if (recebimento.error) throw recebimento.error;
        if (local.error) throw local.error;
        if (cancelado) return;
        setTermo(recebimento.data ?? null);
        const salvos = lerDadosRecebimento(recebimento.data?.dados);
        const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const preenchidos: Record<string, string> = { data_termo: hoje, orgao: "PREFEITURA MUNICIPAL DE ITAJUBÁ", cidade: "Itajubá", portaria: "144/2025",
          ...extrairDadosVeiculo(limparDescricao(bem.descricao)).dados };
        for (const [chave, valor] of Object.entries(salvos)) {
          if (valor.trim() || !(chave in preenchidos)) preenchidos[chave] = valor;
        }
        if (!preenchidos.observacoes_gerais?.trim()) delete preenchidos.observacoes_gerais;
        setLocalOrigem(local.data?.nome ?? "");
        const nomesSecretarias = Array.from(new Set([
          salvos.secretaria ?? "",
          ...(historico.data ?? []).map((item) => typeof item.secretaria === "string" ? item.secretaria : ""),
        ].map((nome) => nome.trim()).filter(Boolean)));
        setSecretarias(nomesSecretarias);
        setDados({ assinante_5: "RODRIGO JESUÍNO TRINDADE", cargo_5: "AGENTE ADMINISTRATIVO",
          ...preenchidos, secretaria: salvos.secretaria ?? nomesSecretarias[0] ?? "",
          modelo_veiculo: salvos.modelo_veiculo?.trim() || extrairDadosVeiculo(limparDescricao(bem.descricao)).modelo,
          nota_fiscal: salvos.nota_fiscal ?? salvos.material ?? "",
        });
        setCarregando(false);
      } catch {
        if (!cancelado) { setErro(true); setCarregando(false); }
      }
    })();
    return () => { cancelado = true; };
  }, [bem.id, bem.sala_id, bem.descricao, tentativa]);

  async function salvar(imprimir = false) {
    if (carregando || erro || salvando || !bem.sala_id) return;
    if (dados.valor && (!/^\d+(?:\.\d{1,2})?$/.test(dados.valor) || !Number.isFinite(Number(dados.valor)))) {
      toast.error("Informe um valor positivo ou zero, com até duas casas decimais."); return;
    }
    const janela = imprimir ? window.open("", "_blank") : null;
    if (imprimir && !janela) {
      toast.error("Permita a abertura de janelas para salvar e imprimir o termo.");
      return;
    }
    if (janela) { janela.opener = null; janela.document.body.textContent = "Salvando termo…"; }
    setSalvando(true);
    try {
      const { data: { user }, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !user) throw new Error("Sessão indisponível");
      const { data: salvo, error } = await supabase.from("recebimentos_veiculos").upsert({
        bem_id: bem.id, dados: { ...dados, observacoes_gerais: conclusao, local_fisico: localOrigem }, atualizado_por: user.id, atualizado_em: new Date().toISOString(),
      } as unknown as TablesInsert<"recebimentos_veiculos">, { onConflict: "bem_id" }).select("*").single();
      if (error || !salvo) throw error ?? new Error("Termo não retornado");
      setTermo(salvo);
      toast.success(`Termo de recebimento Nº ${numeroTermoVeiculo(salvo)} salvo.`);
      if (janela && !janela.closed) {
        janela.document.open();
        janela.document.write(htmlTermoVeiculo(bem, salvo, localOrigem));
        janela.document.close();
        janela.focus();
      }
      onSaved?.();
      onClose();
    } catch {
      janela?.close();
      toast.error("Não foi possível salvar o recebimento. Seus dados foram mantidos para tentar novamente.");
    } finally { setSalvando(false); }
  }

  function campo(chave: string, nome: string, tipo = "text") {
    const largura = chave === "fornecedor" ? "sm:col-span-3" : chave === "chassi" ? "sm:col-span-2" : "";
    return <label key={chave} className={`min-w-0 space-y-1 text-xs font-semibold ${largura}`}>
      <span className="block uppercase">{nome}</span>
      {chave === "emissao" ? <CampoEmissaoNfe ref={emissaoRef} value={dados.emissao ?? ""} mes={dados.emissao_mes}
        className={`h-8 min-w-0 px-2 text-xs md:text-xs ${camposPreenchidos.has(chave) ? "campo-nfe-preenchido" : ""}`}
        onChange={(valor) => alterar("emissao", valor)} /> : chave === "valor" ? <CampoValorReais aria-label={nome}
        value={dados.valor ?? ""} onChange={(valor) => alterar("valor", valor)}
        className={`h-8 min-w-0 px-2 text-xs md:text-xs ${camposPreenchidos.has(chave) ? "campo-nfe-preenchido" : ""}`} /> : <Input type={tipo} min={tipo === "number" ? 0 : undefined}
        maxLength={tipo === "text" ? 200 : undefined}
        className={`h-8 min-w-0 px-2 text-xs md:text-xs ${camposPreenchidos.has(chave) ? "campo-nfe-preenchido" : ""}`}
        value={dados[chave] ?? ""} onChange={(evento) => alterar(chave, evento.target.value)} />}
    </label>;
  }

  const modeloVeiculo = dados.modelo_veiculo ?? extrairDadosVeiculo(limparDescricao(bem.descricao)).modelo;
  const conclusao = dados.observacoes_gerais ?? conclusaoPadraoRecebimento(modeloVeiculo);
  const automaticos = [
    ["Data cadastro", bem.incorporacao ?? ""], ["Patrimônio", formatarCodigoRed(bem.codigo_red)],
    ["Valor unitário", moeda(Number(bem.valor))], ["Incorporação", bem.tipo ?? ""],
  ];

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
    <DialogContent className="flex h-[96dvh] max-h-[96dvh] w-[calc(100%_-_1rem)] max-w-6xl flex-col gap-3 overflow-hidden p-4">
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle className="flex flex-wrap items-center gap-2"><Car className="h-5 w-5 text-primary" />Recebimento de Veículos
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{termo ? `Termo Nº ${numeroTermoVeiculo(termo)}` : "Novo termo · número gerado ao salvar"}</span>
        </DialogTitle>
        <DialogDescription className="line-clamp-2 text-xs">Patrimônio {formatarCodigoRed(bem.codigo_red)} — {limparDescricao(bem.descricao)}</DialogDescription>
      </DialogHeader>
      {carregando && <p role="status" className="text-sm text-muted-foreground">Carregando recebimento...</p>}
      {erro && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        Não foi possível carregar o recebimento.
        <Button type="button" variant="outline" size="sm" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button>
      </div>}
      {!bem.sala_id && <p role="alert" className="text-sm text-destructive">Vincule este bem a um Local Físico antes de salvar o recebimento.</p>}
      <Tabs defaultValue="recebimento" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid w-full shrink-0 grid-cols-3">
          <TabsTrigger value="recebimento">Recebimento</TabsTrigger>
          <TabsTrigger value="checklist">Check-list</TabsTrigger>
          <TabsTrigger value="termo">Termo e assinaturas</TabsTrigger>
        </TabsList>
        <div role="region" aria-label="Campos do recebimento e check-list" tabIndex={0} className="barra-rolagem mt-2 min-h-0 flex-1 overflow-y-scroll overscroll-contain touch-pan-y pr-2">
        <fieldset disabled={carregando || erro || salvando} className="min-w-0 disabled:opacity-60">
          <TabsContent value="recebimento" className="mt-0 space-y-2">
            <ChaveAcessoNfe dados={dados} onChange={(valores) => setDados((atuais) => ({ ...atuais, ...valores }))} onPreenchido={registrarPreenchimento} />
            <div className="grid items-center gap-2 rounded-md border border-border px-3 py-2 sm:grid-cols-[auto_1fr]">
              <h3 className="text-xs font-bold uppercase">Secretaria/Local</h3>
              <Input aria-label="Secretaria/Local" readOnly value={localOrigem} className="h-8 bg-muted/40 text-xs md:text-xs" title="Preenchido com o Local Físico do bem." />
            </div>
            <div className="rounded-md border border-border">
              <h3 className="bg-muted px-3 py-1 text-xs font-bold uppercase">Recebimento de veículo</h3>
              <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3 lg:grid-cols-6">
                {identificacao.map(({ chave, nome, tipo }) => campo(chave, nome, tipo))}
              </div>
            </div>
            <div className="grid items-start gap-2 lg:grid-cols-[3fr_2fr]">
              <div className="rounded-md border border-border">
                <h3 className="bg-muted px-3 py-1 text-xs font-bold uppercase">Dados do cadastro patrimonial</h3>
                <div className="grid grid-cols-2 gap-2 p-2 sm:grid-cols-4">
                  {automaticos.map(([nome, valor]) => <label key={nome} className="min-w-0 space-y-1 text-xs font-semibold">
                    <span className="block uppercase">{nome}</span>
                    <Input readOnly value={valor} className="h-8 bg-muted/40 px-2 text-xs md:text-xs" />
                  </label>)}
                  <label className="col-span-2 min-w-0 space-y-1 text-xs font-semibold sm:col-span-4">
                    <span className="block uppercase">Modelo do veículo</span>
                    <Textarea value={modeloVeiculo} rows={5} className="min-h-32 resize-y text-xs md:text-xs"
                      onChange={(evento) => alterar("modelo_veiculo", evento.target.value)} />
                  </label>
                  <label className="col-span-2 min-w-0 space-y-1 text-xs font-semibold sm:col-span-4">
                    <span className="block uppercase">Secretaria</span>
                    <Input aria-label="Secretaria" value={dados.secretaria ?? ""} maxLength={500}
                      list="secretarias-recebimento" className="h-8 text-xs md:text-xs" placeholder="Digite ou escolha uma secretaria salva"
                      onChange={(evento) => alterar("secretaria", evento.target.value)} />
                    <datalist id="secretarias-recebimento">
                      {secretarias.map((nome) => <option key={nome} value={nome} />)}
                    </datalist>
                    <span className="block text-xs font-normal text-muted-foreground">Ao salvar o recebimento, a secretaria fica disponível para os próximos veículos.</span>
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:grid-cols-3">
                  {detalhes.map(({ chave, nome, tipo }) => campo(chave, nome, tipo))}
                </div>
                <div className="rounded-md border border-border">
                  <h3 className="bg-muted px-3 py-1 text-xs font-bold uppercase">Descrição detalhada do veículo</h3>
                  <div className="p-2">
                    <div role="textbox" aria-label="Descrição detalhada do veículo" aria-readonly="true" aria-multiline="true" tabIndex={0}
                      className="rounded-md border border-input bg-background p-2 text-xs leading-snug text-foreground">
                      {descricaoDetalhada(dados, modeloVeiculo).split("\n").map((linha) => {
                        const separador = linha.indexOf(":");
                        return <div key={linha.slice(0, separador)} className="whitespace-pre-wrap break-words">
                          <strong className="font-bold">{linha.slice(0, separador + 1)}</strong>{" "}{linha.slice(separador + 1).trim()}
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="checklist" className="mt-0 space-y-2">
            {gruposChecklist.map((grupo) => <section key={grupo.titulo} className="rounded-md border border-border">
              <h3 className="bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{grupo.titulo}</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-2 sm:grid-cols-4 lg:grid-cols-6">
                {grupo.campos.map(({ chave, nome, opcoes }) => <label key={chave} className="min-w-0 space-y-0.5 text-xs font-semibold">
                  <span className="block">{nome}</span>
                  <select value={dados[chave] ?? ""} onChange={(evento) => alterar(chave, evento.target.value)}
                    className="h-7 w-full min-w-0 rounded-md border border-input bg-background px-1.5 text-xs text-foreground">
                    <option value="">Selecione...</option>
                    {opcoes.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                  </select>
                </label>)}
              </div>
            </section>)}
          </TabsContent>
          <TabsContent value="termo" className="mt-0 space-y-3">
            <section className="overflow-hidden rounded-xl border border-border">
              <h3 className="bg-muted px-4 py-2 text-xs font-bold uppercase tracking-wide">Identificação do documento</h3>
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                {campo("orgao", "Órgão / Prefeitura")}
                {campo("endereco_orgao", "Endereço do órgão")}
                {campo("cnpj_orgao", "CNPJ do órgão")}
                {campo("portaria", "Portaria da comissão (nº/ano)")}
                {campo("data_termo", "Data do termo", "date")}
                {campo("cidade", "Cidade")}
                {campo("via", "Via do documento")}
              </div>
            </section>
            <section className="overflow-hidden rounded-xl border border-border">
              <h3 className="bg-muted px-4 py-2 text-xs font-bold uppercase tracking-wide">Observações gerais / conclusão da comissão</h3>
              <div className="p-3"><label className="space-y-1 text-xs font-semibold">
                <span>Registre o resultado da conferência e eventuais ressalvas</span>
                <Textarea aria-label="Observações gerais / conclusão da comissão" rows={4} maxLength={5000}
                  placeholder="Registre a conclusão da comissão"
                  value={conclusao} onChange={(e) => alterar("observacoes_gerais", e.target.value)} />
                <span className="block font-normal text-muted-foreground">Texto padrão preenchido com o modelo deste veículo. Revise a conclusão e ajuste eventuais ressalvas antes de salvar.</span>
              </label></div>
            </section>
            <section className="overflow-hidden rounded-xl border border-border">
              <h3 className="bg-muted px-4 py-2 text-xs font-bold uppercase tracking-wide">Assinaturas da comissão</h3>
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className="space-y-2 rounded-lg bg-muted/30 p-3">
                  <p className="text-xs font-bold text-primary">{i === 5 ? "Assinatura adicional · Rodrigo Jesuíno Trindade" : i === 1 ? "Presidente" : `Membro ${i - 1}`}</p>
                  {campo(`assinante_${i}`, `Nome / matrícula ${i}`)}
                  {campo(`cargo_${i}`, `Cargo / função ${i}`)}
                </div>)}
              </div>
            </section>
          </TabsContent>
        </fieldset>
        </div>
      </Tabs>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <p className="max-w-xl text-xs text-muted-foreground">O recebimento e o check-list são salvos para este patrimônio, sem alterar o cadastro do bem ou o Local Físico.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => salvar()} disabled={carregando || erro || salvando || !bem.sala_id}>
            <Save className="mr-2 h-4 w-4" />{salvando ? "Salvando..." : "Salvar recebimento e check-list"}
          </Button>
          <Button type="button" onClick={() => salvar(true)} disabled={carregando || erro || salvando || !bem.sala_id}>
            <Printer className="mr-2 h-4 w-4" />Salvar e imprimir termo
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
