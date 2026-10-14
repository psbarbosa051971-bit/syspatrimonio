import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useRole } from "@/hooks/use-role";
import { formatarCodigoRed, normalizarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { extrairDadosVeiculo, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";
import { pesquisarBensEmTodasAsSalas, type ResultadoPesquisaDinamica } from "@/lib/pesquisa-dinamica";
import { SeletorLocalFisico, type LocalFisicoOpcao } from "@/components/SeletorLocalFisico";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { checklist: Tables<"checklists_veiculos">; onClose: () => void; onAssociated: (bem: Tables<"bens">) => void };
type Associacao = { bem: Tables<"bens">; termo: Tables<"recebimentos_veiculos"> };

export function AssociarChecklistVeiculo({ checklist, onClose, onAssociated }: Props) {
  const { podeEditar, loading: carregandoPapel } = useRole();
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<ResultadoPesquisaDinamica | null>(null);
  const [pesquisando, setPesquisando] = useState(false);
  const [salas, setSalas] = useState<LocalFisicoOpcao[]>([]);
  const [local, setLocal] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const dados = lerDadosRecebimento(checklist.dados);
  const codigo = normalizarCodigoRed(busca);
  const codigoValido = /^\d{1,50}$/.test(codigo);
  const selecionado = resultado?.bens[0] ?? null;
  const novoCadastro = resultado !== null && !selecionado;
  const podeConfirmar = !!resultado && (!!selecionado?.sala_id || (novoCadastro && podeEditar && !!local[0] && !!dados.modelo_veiculo?.trim()));

  async function pesquisar(e: FormEvent) {
    e.preventDefault();
    if (!codigoValido || pesquisando || salvando || carregandoPapel) return;
    setPesquisando(true); setResultado(null); setLocal([]); setSalas([]);
    try {
      const encontrados = await pesquisarBensEmTodasAsSalas(codigo);
      const exatos = encontrados.bens.filter((bem) => normalizarCodigoRed(bem.codigo_red) === codigo);
      if (!exatos.length && podeEditar) {
        const locais: LocalFisicoOpcao[] = [];
        for (let inicio = 0; ; inicio += 500) {
          const { data, error } = await supabase.from("salas").select("id, nome, unidade")
            .order("nome").range(inicio, inicio + 499);
          if (error) throw error;
          locais.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
        setSalas(locais);
      }
      setResultado({ ...encontrados, termo: codigo, bens: exatos });
    } catch { toast.error("Não foi possível consultar o código RED e os locais disponíveis. Tente novamente."); }
    finally { setPesquisando(false); }
  }

  async function associar() {
    if (!podeConfirmar || !resultado || pesquisando || salvando) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc("associar_checklist_veiculo_por_red", {
        _checklist_id: checklist.id, _codigo_red: resultado.termo,
        ...(novoCadastro ? { _sala_id: local[0] } : {}),
      });
      if (error) throw error;
      const associado = data as unknown as Associacao;
      if (!associado?.bem?.id || !associado.termo) throw new Error("Não foi possível confirmar a associação. Consulte os termos antes de tentar novamente.");
      toast.success(`Código RED associado. Termo Nº ${numeroTermoVeiculo(associado.termo)} criado com os dados do checklist.`);
      onAssociated(associado.bem);
    } catch (erro) {
      toast.error(erro && typeof erro === "object" && "message" in erro ? String(erro.message) : "Não foi possível associar. Seus dados continuam salvos.");
    } finally { setSalvando(false); }
  }

  const chassiCadastro = selecionado ? extrairDadosVeiculo(limparDescricao(selecionado.descricao)).dados.chassi : "";
  const chassiDiferente = dados.chassi && chassiCadastro && dados.chassi.toUpperCase().trim() !== chassiCadastro.toUpperCase().trim();

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando && !pesquisando) onClose(); }}>
    <DialogContent className="flex max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-3xl flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>Associar código RED ao checklist</DialogTitle>
        <DialogDescription>Informe o código RED do veículo, sem precisar importar HTML. Se ele ainda não estiver cadastrado, um administrador ou operador pode cadastrá-lo com os dados do checklist.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">Checklist · Nota fiscal {dados.nota_fiscal || "não informada"}</p>
          <p>{dados.fornecedor || "Fornecedor não informado"}</p>
          <p className="text-muted-foreground">{dados.modelo_veiculo || "Modelo não informado"} · Chassi: {dados.chassi || "não informado"}</p>
        </div>
        <form onSubmit={pesquisar} className="flex flex-wrap gap-2">
          <Input aria-label="Código RED do veículo para associar" placeholder="Digite o código RED completo, com ou sem pontos" inputMode="numeric" value={busca} disabled={salvando || pesquisando} onChange={(e) => { setBusca(e.target.value); setResultado(null); setLocal([]); }} className="min-w-40 flex-1" />
          <Button type="submit" disabled={!codigoValido || pesquisando || salvando || carregandoPapel}>{pesquisando ? "Consultando…" : "Consultar código RED"}</Button>
        </form>
        {!!busca.trim() && !codigoValido && <p role="alert" className="text-sm text-destructive">Informe somente um código RED numérico, com até 50 dígitos. Pontos de separação são aceitos.</p>}
        {selecionado && <article className="space-y-2 rounded-xl border border-primary bg-primary/5 p-3">
          <p className="font-semibold">RED {formatarCodigoRed(selecionado.codigo_red)}</p>
          <p className="text-sm text-muted-foreground">{limparDescricao(selecionado.descricao)}</p>
          <p className="text-xs text-muted-foreground">{selecionado.sala_id ? resultado?.locais[selecionado.sala_id] : "Sem Local Físico"}</p>
          <p className="text-sm">Confira se este patrimônio corresponde ao veículo do checklist. A associação usará este cadastro, sem criar outro bem.</p>
        </article>}
        {novoCadastro && <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p role="status">O código RED <strong>{formatarCodigoRed(resultado.termo)}</strong> não foi encontrado nos locais disponíveis para sua conta.</p>
          {podeEditar ? <>
            <p>Para um código ainda não cadastrado, escolha o Local Físico. O veículo será cadastrado com o modelo, identificação e valor do checklist ao confirmar, sem HTML.</p>
            <label htmlFor="local-checklist-red" className="block font-medium">Local Físico do veículo</label>
            <SeletorLocalFisico id="local-checklist-red" ariaLabel="Local Físico do veículo" salas={salas} valor={local} onChange={setLocal} disabled={salvando} limparAoDigitar />
            {!salas.length && <p role="alert">Nenhum Local Físico disponível. Cadastre um local em Departamento ou solicite acesso ao administrador.</p>}
            {!dados.modelo_veiculo?.trim() && <p role="alert" className="text-destructive">Edite o checklist e preencha o Modelo do veículo antes de cadastrar o código RED.</p>}
            {!dados.valor?.trim() && <p>O checklist está sem Valor. Se continuar, o veículo será cadastrado com valor de R$ 0,00.</p>}
            <p className="text-muted-foreground">Se o RED já existir em outro local sem acesso, a operação será bloqueada para evitar duplicidade.</p>
          </> : <p>Peça a um administrador ou operador para cadastrar o veículo por este código RED ou conferir seu acesso ao local.</p>}
        </div>}
        {chassiDiferente && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">Atenção: o chassi do cadastro ({chassiCadastro}) é diferente do checklist ({dados.chassi}). Confira o código RED e corrija os dados antes de associar.</p>}
        {resultado && podeConfirmar && <p className="text-sm text-muted-foreground">Ao confirmar, os dados salvos do checklist serão usados para emitir o termo numerado. Um recebimento já existente para este RED não será substituído.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" disabled={salvando || pesquisando} onClick={onClose}>Cancelar</Button>
        <Button disabled={!podeConfirmar || !!chassiDiferente || salvando || pesquisando} onClick={associar}>
          {salvando ? "Associando…" : novoCadastro ? "Cadastrar RED e associar checklist" : "Associar checklist ao código RED"}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
