import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { codigoParaEstorno, lerTransferenciaEstorno, type TransferenciaEstorno } from "@/lib/estornos-transferencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { onClose: () => void; onSaved: () => void };

export function EstornoTransferenciaDialog({ onClose, onSaved }: Props) {
  const [busca, setBusca] = useState("");
  const [transferencia, setTransferencia] = useState<TransferenciaEstorno | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const operacao = useRef(false);
  const pedido = useRef<{ id: string; transferencia: string; itens: string[] } | null>(null);
  const bloqueado = carregando || salvando || pendente;
  const disponiveis = transferencia?.itens.filter((i) => !i.impedimento && !i.estornado_em) ?? [];
  const marcados = disponiveis.filter((i) => selecionados.includes(i.id));
  const todos = disponiveis.length > 0 && marcados.length === disponiveis.length;

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (operacao.current || pendente) return;
    setErro(""); setAviso(""); setTransferencia(null); setSelecionados([]); setConfirmando(false);
    try {
      const codigo = codigoParaEstorno(busca);
      operacao.current = true; setCarregando(true);
      const { data, error } = await supabase.rpc("buscar_ultima_transferencia", { _codigo: codigo });
      if (error) throw error;
      const encontrada = lerTransferenciaEstorno(data);
      setTransferencia(encontrada);
      if (!encontrada) setAviso("Nenhuma transferência registrada para este código RED. O histórico para estorno é guardado nas transferências realizadas a partir da ativação deste recurso.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível buscar a transferência. Tente novamente.");
    } finally { operacao.current = false; setCarregando(false); }
  }

  async function estornar() {
    if (operacao.current || !transferencia) return;
    if (!pedido.current) {
      if (!confirmando || !marcados.length) return;
      pedido.current = { id: crypto.randomUUID(), transferencia: transferencia.id, itens: marcados.map((i) => i.id) };
    }
    const atual = pedido.current;
    operacao.current = true; setSalvando(true); setErro("");
    try {
      const { error } = await supabase.rpc("estornar_transferencia", {
        _transferencia: atual.transferencia, _itens: atual.itens, _pedido: atual.id,
      });
      if (error) {
        if (error.code === "P0001" || error.code?.startsWith("23")) {
          pedido.current = null; setPendente(false); setConfirmando(false);
          setErro(`${error.message}. Busque novamente para atualizar a lista.`); return;
        }
        throw error;
      }
      setTransferencia((t) => t ? { ...t, itens: t.itens.map((i) => atual.itens.includes(i.id)
        ? { ...i, estornado_em: new Date().toISOString(), impedimento: "Já estornado" } : i) } : null);
      setSelecionados([]); setConfirmando(false); setPendente(false); pedido.current = null;
      setAviso(`${atual.itens.length} bem(ns) devolvido(s) ao local de origem. Os itens não selecionados permanecem onde estavam.`);
      toast.success("Estorno realizado com sucesso.");
      onSaved();
    } catch {
      setPendente(true);
      setErro("Não foi possível confirmar o resultado. Clique em Verificar estorno para consultar o mesmo pedido sem repetir a devolução.");
    } finally { operacao.current = false; setSalvando(false); }
  }

  function selecionar(id: string, marcado: boolean) {
    setSelecionados((atuais) => marcado ? [...atuais, id] : atuais.filter((item) => item !== id));
    setConfirmando(false);
  }

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !bloqueado) onClose(); }}>
    <DialogContent onInteractOutside={(e) => e.preventDefault()} className="flex max-h-[94vh] w-[96vw] max-w-6xl flex-col overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Estornar transferência</DialogTitle>
        <DialogDescription>Digite um único código RED para localizar a última transferência desse bem e mostrar todos os itens do mesmo lote. Selecione alguns ou todos para devolver ao local anterior.</DialogDescription>
      </DialogHeader>
      <form onSubmit={buscar} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="estorno-red" className="text-base">Código RED</Label>
          <Input id="estorno-red" inputMode="numeric" value={busca} disabled={bloqueado} className="text-base md:text-base" placeholder="Digite um dos códigos da transferência"
            onChange={(e) => { setBusca(e.target.value); setTransferencia(null); setSelecionados([]); setErro(""); setAviso(""); setConfirmando(false); }} />
        </div>
        <Button type="submit" disabled={bloqueado || !busca.trim()}>{carregando ? "Buscando..." : "Buscar transferência"}</Button>
      </form>
      {aviso && <p role="status" className="rounded-md bg-muted p-3">{aviso}</p>}
      {erro && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{erro}</p>}
      {transferencia && <section className="space-y-3" aria-label="Última transferência encontrada">
        <div className="space-y-1 rounded-md border-2 border-primary/30 bg-accent p-4">
          <p className="font-semibold">Transferência — Termo {transferencia.numero}{transferencia.ano ? `/${transferencia.ano}` : ""}</p>
          <p>Data: {new Date(transferencia.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          <p>Destino da transferência: <strong>{transferencia.destino}</strong></p>
          <p>{transferencia.itens.length} item(ns) no lote · {disponiveis.length} disponível(is) para estorno</p>
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-md border">
          <table className="w-full text-left text-base">
            <thead className="sticky top-0 bg-muted"><tr>
              <th className="p-3"><input type="checkbox" aria-label="Selecionar todos os disponíveis" checked={todos}
                ref={(el) => { if (el) el.indeterminate = marcados.length > 0 && !todos; }}
                disabled={bloqueado || !disponiveis.length} className="h-4 w-4 accent-primary"
                onChange={(e) => { setSelecionados(e.target.checked ? disponiveis.map((i) => i.id) : []); setConfirmando(false); }} /></th>
              <th className="p-3">Código RED</th><th className="p-3">Descrição</th>
              <th className="p-3">Valor</th><th className="p-3">Devolver para</th><th className="p-3">Situação</th>
            </tr></thead>
            <tbody>{transferencia.itens.map((item) => <tr key={item.id} className="border-t">
              <td className="p-3"><input type="checkbox" aria-label={`Selecionar RED ${item.codigo_red}`}
                checked={selecionados.includes(item.id)} disabled={bloqueado || !!item.impedimento || !!item.estornado_em}
                className="h-4 w-4 accent-primary" onChange={(e) => selecionar(item.id, e.target.checked)} /></td>
              <td className="whitespace-nowrap p-3 font-medium">{item.codigo_red}</td>
              <td className="min-w-48 p-3">{item.descricao}</td>
              <td className="whitespace-nowrap p-3">{item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
              <td className="p-3">{item.origem}</td>
              <td className="p-3">{item.impedimento ?? (item.estornado_em ? "Já estornado" : "Disponível para estorno")}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-sm text-muted-foreground">Cada bem retorna ao seu próprio local de origem. Itens já estornados ou movimentados depois desta transferência ficam bloqueados. O termo original é preservado como histórico.</p>
        <p className="font-semibold">{marcados.length} bem(ns) selecionado(s) · {marcados.reduce((s, i) => s + i.valor, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
        {confirmando && !pendente && <div role="group" aria-label="Confirmar devolução" className="space-y-3 rounded-md border-2 border-destructive p-4">
          <p>Confirma o estorno de <strong>{marcados.length} bem(ns)</strong>? Somente os itens marcados voltarão aos locais indicados na coluna “Devolver para”.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={salvando} onClick={() => setConfirmando(false)}>Voltar à seleção</Button>
            <Button variant="destructive" disabled={salvando} onClick={estornar}>{salvando ? "Estornando..." : "Confirmar estorno"}</Button></div>
        </div>}
      </section>}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" disabled={bloqueado} onClick={onClose}>Fechar</Button>
        {pendente ? <Button disabled={salvando} onClick={estornar}>{salvando ? "Verificando..." : "Verificar estorno"}</Button>
          : transferencia && !confirmando && <Button variant="destructive" disabled={bloqueado || !marcados.length} onClick={() => { setConfirmando(true); setErro(""); }}>Estornar selecionados</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
