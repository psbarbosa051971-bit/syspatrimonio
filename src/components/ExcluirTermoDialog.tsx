import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import type { TermoDaSala } from "@/lib/termos-da-sala";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { salaId: string; termo: TermoDaSala; onExcluir: () => void };

export function ExcluirTermoDialog({ salaId, termo, onExcluir }: Props) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const salvandoRef = useRef(false);
  const numero = numeroDoTermo(termo);

  async function excluir() {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true); setErro("");
    try {
      const { error } = await supabase.rpc("excluir_termo_sala", { _termo: termo.id, _sala: salaId });
      if (error) throw error;
      toast.success(`Termo ${numero} excluído. Os bens foram preservados e as transferências retornaram à origem.`);
      setAberto(false);
      onExcluir();
    } catch (error) {
      setErro(error && typeof error === "object" && "message" in error
        ? String(error.message) : "Não foi possível excluir o termo. Tente novamente.");
    } finally {
      salvandoRef.current = false; setSalvando(false);
    }
  }

  return <>
    <Button type="button" size="sm" variant="destructive" aria-label={`Excluir termo ${numero}`}
      onClick={() => { setErro(""); setAberto(true); }}>
      <Trash2 className="mr-2 h-4 w-4" />Excluir
    </Button>
    <Dialog open={aberto} onOpenChange={(valor) => { if (!salvandoRef.current) setAberto(valor); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir termo {numero}</DialogTitle>
          <DialogDescription>Confirma excluir este termo? O documento e seu registro de entrega serão removidos. Esta ação não apaga os bens.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p>Os bens com transferência registrada neste termo retornam às respectivas salas de origem e ao termo anterior, se ele ainda existir.</p>
          <p>Bens importados ou anexados da própria sala permanecem nela, sem vínculo com o termo excluído.</p>
          <p>Se um bem transferido tiver sido movimentado novamente ou sua sala de origem não existir, a exclusão será bloqueada para evitar alterações indevidas.</p>
        </div>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={salvando} onClick={() => void excluir()}>
            {salvando ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
