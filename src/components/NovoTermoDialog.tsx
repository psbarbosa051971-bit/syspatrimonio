import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { lerTermoTransferencia } from "@/lib/transferencias";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { ImprimirImportacaoDialog } from "@/components/ImprimirImportacaoDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  sala: Tables<"salas">;
  bens: Tables<"bens">[];
  onClose: () => void;
  onSaved: (termoId: string) => void;
};

export function NovoTermoDialog({ sala, bens, onClose, onSaved }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState("");
  const [aceitarRepetidos, setAceitarRepetidos] = useState(false);
  const [termoId, setTermoId] = useState("");
  const pedido = useRef<string | null>(null);
  const operacao = useRef(false);
  const foraDaSala = bens.some((bem) => bem.sala_id !== sala.id);
  const invalido = !bens.length || bens.length > 500 || foraDaSala;

  async function salvar() {
    if (operacao.current || termoId || invalido) return;
    pedido.current ??= crypto.randomUUID();
    operacao.current = true; setSalvando(true); setErro("");
    try {
      const { data, error } = await supabase.rpc("criar_termo_bens_sala", {
        _sala: sala.id, _itens: bens.map((bem) => bem.id), _pedido: pedido.current,
        ...(aceitarRepetidos ? { _aceitar_repetidos: true } : {}),
      });
      if (error) {
        if (error.code === "P0001" || error.code?.startsWith("23")) {
          setPendente(false); pedido.current = null; setErro(error.message); return;
        }
        throw error;
      }
      const termo = lerTermoTransferencia(data);
      setTermoId(termo.id); setPendente(false);
      onSaved(termo.id);
      toast.success("Novo termo de responsabilidade criado. Nenhum bem foi movimentado.");
    } catch {
      setPendente(true);
      setErro("Não foi possível confirmar o resultado. Clique em Verificar criação para consultar o mesmo pedido sem gerar outro termo.");
    } finally { operacao.current = false; setSalvando(false); }
  }

  if (termoId) return <ImprimirImportacaoDialog importacaoId={termoId} salaId={sala.id} origem="novo-termo" onClose={onClose} />;

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando && !pendente) onClose(); }}>
    <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Novo termo de responsabilidade</DialogTitle>
        <DialogDescription>Crie um termo numerado para os bens selecionados que já estão nesta sala. Não há transferência, duplicação de bens nem alteração dos termos anteriores ou da conferência.</DialogDescription>
      </DialogHeader>
      <p className="font-medium">Local Físico: {sala.nome}</p>
      <div className="max-h-72 overflow-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Patrimônio</th><th className="p-2">Descrição do bem</th></tr></thead>
          <tbody>{bens.map((bem) => <tr key={bem.id} className="border-t"><td className="whitespace-nowrap p-2">{formatarCodigoRed(bem.codigo_red)}</td><td className="p-2">{bem.descricao}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="text-sm">{bens.length} bem(ns) selecionado(s) · {bens.reduce((total, bem) => total + Number(bem.valor), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      <p className="text-sm text-muted-foreground">O número só é confirmado ao criar o termo. Depois, você poderá preencher os dados do recebimento e imprimir ou salvar em PDF.</p>
      {invalido && <p role="alert" className="text-sm text-destructive">{foraDaSala ? "Selecione apenas bens do Local Físico informado. Para mudar bens de sala, use Gerar transferência." : "Selecione de 1 a 500 bens por termo."}</p>}
      <div className="space-y-2 rounded-md border border-border p-3 text-sm">
        <p>Por padrão, bens que já constam em outro termo desta sala são bloqueados. O aceite permite repetir o bem nos documentos, sem duplicar seu cadastro.</p>
        <Button type="button" variant={aceitarRepetidos ? "secondary" : "outline"} aria-pressed={aceitarRepetidos} disabled={salvando || pendente} onClick={() => { setAceitarRepetidos((atual) => !atual); setErro(""); }}>{aceitarRepetidos ? "Desfazer aceite de repetidos" : "Aceitar bens em termos diferentes"}</Button>
        {aceitarRepetidos && <p role="status">Repetição autorizada somente para este novo termo. Os termos anteriores serão preservados.</p>}
      </div>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={salvando || pendente} onClick={onClose}>Cancelar</Button>
        <Button disabled={salvando || invalido} onClick={salvar}>{salvando ? "Criando..." : pendente ? "Verificar criação" : "Criar termo"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
