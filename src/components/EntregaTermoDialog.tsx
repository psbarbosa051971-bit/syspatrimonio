import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cpfValido, formatarCpf, normalizarCpf } from "@/lib/cpf";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import type { TermoDaSala } from "@/lib/termos-da-sala";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Entrega = Tables<"entregas_termos">;
type Props = {
  termo: TermoDaSala; entrega: Entrega | null;
  onFechar: () => void; onSalvar: (entrega: Entrega) => void;
};

export function EntregaTermoDialog({ termo, entrega, onFechar, onSalvar }: Props) {
  const [entreguePor, setEntreguePor] = useState(entrega?.entregue_por ?? "");
  const [recebidoPor, setRecebidoPor] = useState(entrega?.recebido_por ?? "");
  const [cpf, setCpf] = useState(formatarCpf(entrega?.cpf ?? ""));
  const [dataEntrega, setDataEntrega] = useState(entrega?.data_entrega ?? "");
  const [status, setStatus] = useState(entrega?.status ?? "Aguardando Entrega");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const salvandoRef = useRef(false);
  const entregue = status === "Entregue";

  async function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (salvandoRef.current) return;
    setErro("");
    if (entregue && (!entreguePor.trim() || !recebidoPor.trim() || !dataEntrega || !cpf.trim())) {
      setErro("Preencha todos os campos para registrar o termo como Entregue."); return;
    }
    if (cpf.trim() && !cpfValido(cpf)) {
      setErro("Informe um CPF válido de quem recebeu o termo."); return;
    }
    salvandoRef.current = true; setSalvando(true);
    try {
      const { data, error } = await supabase.from("entregas_termos").upsert({
        importacao_id: termo.id, entregue_por: entreguePor.trim(), recebido_por: recebidoPor.trim(),
        cpf: normalizarCpf(cpf), data_entrega: dataEntrega || null, status,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "importacao_id" }).select("*").single();
      if (error) throw error;
      if (!data) throw new Error("Entrega não retornada.");
      onSalvar(data); toast.success("Status de entrega do termo salvo."); onFechar();
    } catch {
      setErro("Não foi possível salvar a entrega. Seus dados foram mantidos; tente novamente.");
    } finally { salvandoRef.current = false; setSalvando(false); }
  }

  return <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvandoRef.current) onFechar(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Entrega do termo {numeroDoTermo(termo)}</DialogTitle>
        <DialogDescription>Registre a entrega deste termo. Para marcar como Entregue, preencha todos os campos, incluindo o CPF de quem recebeu.</DialogDescription>
      </DialogHeader>
      <form onSubmit={salvar} className="space-y-4">
        <fieldset disabled={salvando} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="termo-entregue-por">Entregue por</Label>
            <Input id="termo-entregue-por" value={entreguePor} onChange={(e) => setEntreguePor(e.target.value)} required={entregue} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="termo-recebido-por">Recebido Por</Label>
            <Input id="termo-recebido-por" value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} required={entregue} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="termo-entrega-cpf">CPF</Label>
            <Input id="termo-entrega-cpf" inputMode="numeric" autoComplete="off" maxLength={14} value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} required={entregue} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="termo-data-entrega">Data Entrega</Label>
            <Input id="termo-data-entrega" type="date" value={dataEntrega} onChange={(e) => setDataEntrega(e.target.value)} required={entregue} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="termo-entrega-status">Status</Label>
            <select id="termo-entrega-status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Aguardando Entrega">Aguardando Entrega</option>
              <option value="Entregue">Entregue</option>
            </select>
          </div>
        </fieldset>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={onFechar}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar entrega"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
