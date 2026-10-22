import { useState } from "react";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { CampoValorReais } from "@/components/CampoValorReais";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Bem = Tables<"bens">;

export function EditarDescricaoBem({ bem, onSaved }: { bem: Bem; onSaved: (bem: Bem) => void }) {
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (salvando || !descricao.trim()) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("bens").update({ descricao: descricao.trim(), valor: valor ? Number(valor) : null })
        .eq("id", bem.id).select("*").single();
      if (error || !data) throw error ?? new Error("Bem não atualizado");
      onSaved(data);
      setAberto(false);
      toast.success("Dados do bem atualizados.");
    } catch {
      toast.error("Não foi possível salvar a descrição. O texto foi mantido para tentar novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return <>
    <Button type="button" size="icon" variant="ghost" className="ml-1 h-7 w-7 shrink-0 align-middle"
      title="Editar descrição do bem" aria-label={`Editar descrição do bem — ${bem.codigo_red}`}
      onClick={() => { setDescricao(limparDescricao(bem.descricao)); setValor(bem.valor != null && Number.isFinite(Number(bem.valor)) ? Number(bem.valor).toFixed(2) : ""); setAberto(true); }}>
      <Pencil className="h-4 w-4" />
    </Button>
    <Dialog open={aberto} onOpenChange={(valor) => { if (!salvando) setAberto(valor); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar descrição do bem</DialogTitle>
          <DialogDescription>Patrimônio {formatarCodigoRed(bem.codigo_red)}. A alteração será salva no cadastro do bem.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm font-semibold">
          <span>Descrição do bem</span>
          <Textarea rows={7} className="min-h-40 resize-y" value={descricao} disabled={salvando}
            onChange={(evento) => setDescricao(evento.target.value)} />
        </label>
        <label className="space-y-2 text-sm font-semibold">
          <span>Valor</span>
          <CampoValorReais aria-label="Valor" value={valor} onChange={setValor} disabled={salvando} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
          <Button type="button" disabled={salvando || !descricao.trim()} onClick={salvar}>
            <Save className="mr-2 h-4 w-4" />{salvando ? "Salvando..." : "Salvar descrição"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
