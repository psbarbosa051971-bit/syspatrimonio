import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Opcao = "observacao" | "transferencia" | "inservivel";
type Props = {
  bem: Tables<"bens">;
  onClose: () => void;
  onSaved: (id: string, observacao: string) => void;
};

export function ObservacoesBemDialog({ bem, onClose, onSaved }: Props) {
  const [texto, setTexto] = useState(bem.observacao ?? "");
  const [opcao, setOpcao] = useState<Opcao>("observacao");
  const [destino, setDestino] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(false);
    void (async () => {
      try {
        const { data, error } = await supabase.from("solicitacoes_bens")
          .select("tipo,destino").eq("bem_id", bem.id).eq("ativa", true).maybeSingle();
        if (error) throw error;
        if (!cancelado) {
          const tipo = data?.tipo;
          setOpcao(tipo === "transferencia" || tipo === "inservivel" ? tipo : "observacao");
          setDestino(data?.destino ?? "");
        }
      } catch {
        if (!cancelado) setErro(true);
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [bem.id, tentativa]);

  async function salvar() {
    if (carregando || erro || salvando) return;
    if (opcao === "transferencia" && !destino.trim()) {
      toast.error("Informe o local para onde o bem foi transferido.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("salvar_observacao_solicitacao", {
        _bem_id: bem.id,
        _obs: texto,
        _tipo: opcao === "observacao" ? null : opcao,
        _destino: opcao === "transferencia" ? destino.trim() : null,
      } as { _bem_id: string; _obs: string; _tipo: string; _destino?: string });
      if (error) throw error;
      onSaved(bem.id, texto);
      toast.success(opcao === "observacao" ? "Observação salva." : "Registro salvo no relatório e encaminhado aos administradores.");
      onClose();
    } catch {
      toast.error("Não foi possível salvar. Os dados foram mantidos para tentar novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Observações — {bem.codigo_red}</DialogTitle>
          <DialogDescription>{limparDescricao(bem.descricao)}</DialogDescription>
        </DialogHeader>
        {erro && <div role="alert" className="text-sm text-destructive">
          Não foi possível carregar a situação deste bem.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</Button>
        </div>}
        <fieldset disabled={carregando || erro || salvando} className="space-y-3 disabled:opacity-60">
          <legend className="mb-2 text-sm font-semibold">Situação do bem (selecione uma opção)</legend>
          {([
            ["observacao", "SOMENTE OBSERVAÇÕES"],
            ["transferencia", "TRANSFERÊNCIA"],
            ["inservivel", "INSERVÍVEIS"],
          ] as const).map(([valor, rotulo]) => (
            <label key={valor} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={opcao === valor}
                onChange={(e) => setOpcao(e.target.checked ? valor : "observacao")} />
              {rotulo}
            </label>
          ))}
          {opcao === "transferencia" && <label className="block space-y-2 text-sm font-medium">
            <span>Local de destino da transferência <span className="text-destructive">*</span></span>
            <Input value={destino} onChange={(e) => setDestino(e.target.value)} maxLength={300}
              required placeholder="Número e nome do local para onde o bem foi" />
          </label>}
          <label className="block space-y-2 text-sm font-medium">
            <span>Observações</span>
            <Textarea rows={4} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Digite observações sobre o bem..." />
          </label>
        </fieldset>
        <p className="text-xs text-muted-foreground">Ao salvar transferência ou inservíveis, o bem entra no relatório e gera um alerta aos administradores. “Somente observações” retira o bem desses relatórios. Este registro não altera o local do cadastro patrimonial.</p>
        <Button onClick={salvar} disabled={carregando || erro || salvando}>
          {carregando ? "Carregando..." : salvando ? "Salvando..." : "Salvar observação e situação"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
