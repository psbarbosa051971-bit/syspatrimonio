import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { ehVeiculo, extrairDadosVeiculo, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { numeroTermoVeiculo } from "@/lib/recebimento-veiculos-impressao";
import { pesquisarBensEmTodasAsSalas, type ResultadoPesquisaDinamica } from "@/lib/pesquisa-dinamica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { checklist: Tables<"checklists_veiculos">; onClose: () => void; onAssociated: (bem: Tables<"bens">) => void };

export function AssociarChecklistVeiculo({ checklist, onClose, onAssociated }: Props) {
  const [busca, setBusca] = useState("");
  const [resultado, setResultado] = useState<ResultadoPesquisaDinamica | null>(null);
  const [pesquisando, setPesquisando] = useState(false);
  const [selecionado, setSelecionado] = useState<Tables<"bens"> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const dados = lerDadosRecebimento(checklist.dados);

  async function pesquisar(e: FormEvent) {
    e.preventDefault();
    if (!busca.trim() || pesquisando || salvando) return;
    setPesquisando(true); setResultado(null); setSelecionado(null);
    try {
      const encontrados = await pesquisarBensEmTodasAsSalas(busca);
      setResultado({ ...encontrados, bens: encontrados.bens.filter(ehVeiculo) });
    } catch { toast.error("Não foi possível pesquisar. Tente novamente."); }
    finally { setPesquisando(false); }
  }

  async function associar() {
    if (!selecionado || salvando) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc("associar_checklist_veiculo", { _checklist_id: checklist.id, _bem_id: selecionado.id });
      if (error) throw error;
      const termo = data as unknown as Tables<"recebimentos_veiculos">;
      toast.success(`Código RED associado. Termo Nº ${numeroTermoVeiculo(termo)} criado com os dados do checklist.`);
      onAssociated(selecionado);
    } catch (erro) {
      toast.error(erro && typeof erro === "object" && "message" in erro ? String(erro.message) : "Não foi possível associar. Seus dados continuam salvos.");
    } finally { setSalvando(false); }
  }

  const chassiCadastro = selecionado ? extrairDadosVeiculo(limparDescricao(selecionado.descricao)).dados.chassi : "";
  const chassiDiferente = dados.chassi && chassiCadastro && dados.chassi.toUpperCase().trim() !== chassiCadastro.toUpperCase().trim();

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
    <DialogContent className="flex max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-3xl flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>Associar código RED ao checklist</DialogTitle>
        <DialogDescription>Primeiro importe o veículo pelo HTML em Departamento. Depois localize-o aqui, confira a seleção e confirme para gerar o número do termo.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">Checklist · Nota fiscal {dados.nota_fiscal || "não informada"}</p>
          <p>{dados.fornecedor || "Fornecedor não informado"}</p>
          <p className="text-muted-foreground">{dados.modelo_veiculo || "Modelo não informado"} · Chassi: {dados.chassi || "não informado"}</p>
        </div>
        <form onSubmit={pesquisar} className="flex flex-wrap gap-2">
          <Input aria-label="Código RED do veículo para associar" placeholder="Código RED, placa, chassi ou modelo" value={busca} disabled={salvando} onChange={(e) => setBusca(e.target.value)} className="min-w-40 flex-1" />
          <Button type="submit" disabled={!busca.trim() || pesquisando || salvando}>{pesquisando ? "Buscando…" : "Localizar veículo importado"}</Button>
        </form>
        {resultado && !resultado.bens.length && <p role="status" className="rounded-lg bg-muted p-3 text-sm">Nenhum veículo encontrado. Verifique a importação HTML e seu acesso ao Local Físico.</p>}
        {resultado?.bens.map((bem) => <article key={bem.id} className={`space-y-2 rounded-xl border p-3 ${selecionado?.id === bem.id ? "border-primary bg-primary/5" : "border-border"}`}>
          <p className="font-semibold">RED {formatarCodigoRed(bem.codigo_red)}</p>
          <p className="text-sm text-muted-foreground">{limparDescricao(bem.descricao)}</p>
          <p className="text-xs text-muted-foreground">{bem.sala_id ? resultado.locais[bem.sala_id] : "Sem Local Físico"}</p>
          <Button type="button" variant="outline" disabled={salvando || !bem.sala_id} onClick={() => setSelecionado(bem)}>{selecionado?.id === bem.id ? "Veículo selecionado" : "Selecionar este veículo"}</Button>
        </article>)}
        {selecionado && <div className="space-y-2 rounded-lg border border-primary p-3 text-sm">
          <p>Confirma associar este checklist ao patrimônio <strong>{formatarCodigoRed(selecionado.codigo_red)}</strong>? O termo será criado agora. Um veículo que já possui termo não pode ser associado novamente.</p>
          {chassiDiferente && <p role="alert" className="font-semibold text-destructive">Atenção: o chassi do checklist difere do cadastro importado. Confira se escolheu o veículo correto antes de continuar.</p>}
        </div>}
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button variant="outline" disabled={salvando} onClick={onClose}>Cancelar</Button>
        <Button disabled={!selecionado || salvando} onClick={associar}>{salvando ? "Associando…" : "Confirmar associação e gerar termo"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
