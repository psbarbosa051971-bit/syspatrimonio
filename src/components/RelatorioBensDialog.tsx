import { useState } from "react";
import { toast } from "sonner";
import { Download, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { baixarRelatorio, tituloSolicitacao, type GrupoSolicitacoes } from "@/lib/solicitacoes-bens";
import { limparDescricao } from "@/lib/pdf-parse";

export function RelatorioBensDialog({ grupo, onClose, onEstornados }: {
  grupo: GrupoSolicitacoes;
  onClose: () => void;
  onEstornados: (ids: string[]) => void;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inserviveis = grupo.tipo === "inservivel";
  const elegiveis = grupo.itens.filter((item) => item.bem_id && item.sala_id && item.ativa && item.tipo === grupo.tipo);
  const escolhidos = elegiveis.filter((item) => selecionados.has(item.id));
  const todos = elegiveis.length > 0 && escolhidos.length === elegiveis.length;
  const total = grupo.itens.reduce((soma, item) => soma + Number(item.valor), 0);

  async function estornar() {
    if (salvando || !escolhidos.length) return;
    const sala = escolhidos[0]!.sala_id!;
    if (escolhidos.some((item) => item.sala_id !== sala)) {
      setErro("Selecione bens de um mesmo local de origem.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const ids = escolhidos.map((item) => item.id);
      const { data, error } = await supabase.rpc(inserviveis ? "estornar_bens_inserviveis" : "estornar_solicitacoes_transferencia", {
        _solicitacoes: ids, _sala_id: sala,
      });
      if (error) throw error;
      if (data !== ids.length) throw new Error("Não foi possível confirmar o estorno. Reabra o relatório para conferir a situação dos bens.");
      setSelecionados(new Set());
      setConfirmando(false);
      onEstornados(ids);
      toast.success(`${ids.length} bem(ns) estornado(s). ${inserviveis ? "A marcação de inservível foi retirada" : "A solicitação de transferência foi retirada do relatório"} e os bens permanecem no local de origem.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : (falha as { message?: string })?.message || "Não foi possível estornar os bens. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader className="shrink-0 pr-5">
          <DialogTitle>{tituloSolicitacao(grupo.tipo)}: {grupo.local}</DialogTitle>
          <DialogDescription>
            Registros informados na conferência. Não representam transferência ou baixa já efetivada no cadastro patrimonial.
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md bg-muted p-3">
          <p className="font-semibold">{grupo.itens.length} bem(ns) • Total: {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!escolhidos.length || salvando || confirmando}
              onClick={() => { setErro(""); setConfirmando(true); }}>
              <Undo2 className="mr-2 h-4 w-4" /> {salvando ? "Estornando..." : "Estornar bens"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => baixarRelatorio(grupo.itens)}>
              <Download className="mr-2 h-4 w-4" /> Baixar relatório (CSV)
            </Button>
          </div>
        </div>
        <div className="shrink-0 space-y-2 text-sm">
          <p aria-live="polite">{escolhidos.length} de {elegiveis.length} bem(ns) selecionado(s).</p>
          <p className="text-muted-foreground">{inserviveis ? "O estorno retira a marcação de inservível e o alerta dos bens selecionados." : "O estorno retira do relatório e do alerta as solicitações de transferência dos bens selecionados."} Eles permanecem no local de origem: {grupo.local}. Observações são preservadas. Não desfaz transferências já realizadas.</p>
          {grupo.itens.length !== elegiveis.length && <p className="text-muted-foreground">Registros sem vínculo com um bem ou local não podem ser estornados neste formulário.</p>}
          {confirmando && <div role="group" aria-label="Confirmar estorno" className="space-y-2 rounded-md border border-border p-3">
            <p>{inserviveis ? `Confirma estornar ${escolhidos.length} bem(ns) para o local de origem ${grupo.local}?` : `Confirma retirar ${escolhidos.length} bem(ns) deste relatório de transferência? Os bens permanecem em ${grupo.local}.`}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void estornar()} disabled={salvando}>{salvando ? "Estornando..." : "Confirmar estorno"}</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmando(false)} disabled={salvando}>Cancelar</Button>
            </div>
          </div>}
          {erro && <p role="alert" className="text-destructive">{erro}</p>}
        </div>
        <div role="region" aria-label="Relatório de bens" tabIndex={0} className="min-h-0 overflow-auto rounded-md border border-border">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Selecionar todos os bens"
                      checked={todos} disabled={!elegiveis.length || salvando || confirmando}
                      onChange={(event) => setSelecionados(new Set(event.target.checked ? elegiveis.map((item) => item.id) : []))} />
                    Selecionar todos
                  </label>
                </TableHead>
                <TableHead>Código RED</TableHead>
                <TableHead>Descrição do bem</TableHead>
                {grupo.tipo === "transferencia" && <TableHead>Local de destino informado</TableHead>}
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top">
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Selecionar bem ${item.codigo_red}`}
                      checked={selecionados.has(item.id)} disabled={!item.bem_id || !item.sala_id || !item.ativa || item.tipo !== grupo.tipo || salvando || confirmando}
                      onChange={(event) => {
                        const marcado = event.target.checked;
                        setSelecionados((atuais) => {
                          const novos = new Set(atuais);
                          if (marcado) novos.add(item.id); else novos.delete(item.id);
                          return novos;
                        });
                      }} />
                  </TableCell>
                  <TableCell className="align-top font-mono">{item.codigo_red}</TableCell>
                  <TableCell className="min-w-56 whitespace-pre-wrap align-top">{limparDescricao(item.descricao)}</TableCell>
                  {grupo.tipo === "transferencia" && <TableCell className="min-w-48 whitespace-pre-wrap align-top font-semibold">{item.destino}</TableCell>}
                  <TableCell className="min-w-48 whitespace-pre-wrap align-top">{item.observacao || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top">{Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="align-top">{new Date(item.updated_at).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
