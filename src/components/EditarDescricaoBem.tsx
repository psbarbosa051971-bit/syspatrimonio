import { useId, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatarCodigoRed } from "@/lib/codigo-red";
import { limparDescricao } from "@/lib/pdf-parse";
import { Button } from "@/components/ui/button";
import { CampoValorReais } from "@/components/CampoValorReais";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Bem = Tables<"bens">;

// A incorporação é guardada como texto dd/mm/aaaa, o mesmo formato lido do PDF/HTML.
function mascararData(entrada: string) {
  const digitos = entrada.replace(/\D/g, "").slice(0, 8);
  if (digitos.length > 4) return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
  if (digitos.length > 2) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return digitos;
}

function dataValida(texto: string) {
  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!partes) return false;
  const [, dia, mes, ano] = partes;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  return data.getUTCFullYear() === Number(ano) && data.getUTCMonth() === Number(mes) - 1 && data.getUTCDate() === Number(dia);
}

const TIPOS_COMUNS = ["Aquisição", "Doação", "Transferência", "Comodato", "Cessão"];

export function EditarDescricaoBem({ bem, onSaved }: { bem: Bem; onSaved: (bem: Bem) => void }) {
  const listaTipos = useId();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [incorporacao, setIncorporacao] = useState("");
  const [tipo, setTipo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (salvando || !descricao.trim()) return;
    const novaIncorporacao = incorporacao.trim();
    if (novaIncorporacao && !dataValida(novaIncorporacao)) {
      toast.error("Informe uma data de incorporação válida no formato dd/mm/aaaa.");
      return;
    }
    const atualizacao: { descricao: string; valor?: number; incorporacao?: string | null; tipo?: string | null } = {
      descricao: descricao.trim(),
      ...(valor ? { valor: Number(valor) } : {}),
    };
    if (novaIncorporacao !== (bem.incorporacao ?? "")) atualizacao.incorporacao = novaIncorporacao || null;
    if (tipo.trim() !== (bem.tipo ?? "")) atualizacao.tipo = tipo.trim() || null;
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("bens").update(atualizacao)
        .eq("id", bem.id).select("*").single();
      if (error || !data) throw error ?? new Error("Bem não atualizado");
      onSaved(data);
      setAberto(false);
      toast.success("Dados do bem e dos termos de responsabilidade da sala atualizados.");
    } catch {
      toast.error("Não foi possível salvar a descrição. O texto foi mantido para tentar novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return <>
    <Button type="button" size="icon" variant="ghost" className="ml-1 h-7 w-7 shrink-0 align-middle"
      title="Editar descrição do bem" aria-label={`Editar descrição do bem — ${bem.codigo_red}`}
      onClick={() => {
        setDescricao(limparDescricao(bem.descricao));
        setValor(bem.valor != null && Number.isFinite(Number(bem.valor)) ? Number(bem.valor).toFixed(2) : "");
        setIncorporacao(bem.incorporacao ?? "");
        setTipo(bem.tipo ?? "");
        setAberto(true);
      }}>
      <Pencil className="h-4 w-4" />
    </Button>
    <Dialog open={aberto} onOpenChange={(valor) => { if (!salvando) setAberto(valor); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar descrição do bem</DialogTitle>
          <DialogDescription>Patrimônio {formatarCodigoRed(bem.codigo_red)}. Ao salvar, os dados serão atualizados no cadastro do bem e nos termos de responsabilidade da mesma sala, inclusive os já criados.</DialogDescription>
        </DialogHeader>
        <label className="space-y-2 text-sm font-semibold">
          <span>Descrição do bem</span>
          <Textarea rows={7} className="min-h-40 resize-y" value={descricao} disabled={salvando}
            onChange={(evento) => setDescricao(evento.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">
            <span>Incorporação</span>
            <Input aria-label="Incorporação" inputMode="numeric" placeholder="dd/mm/aaaa" className="font-mono"
              value={incorporacao} disabled={salvando}
              onChange={(evento) => setIncorporacao(mascararData(evento.target.value))} />
            {incorporacao.trim() && !dataValida(incorporacao.trim()) && (
              <span className="block text-xs font-normal text-destructive">Data inválida. Use dd/mm/aaaa.</span>
            )}
          </label>
          <label className="space-y-2 text-sm font-semibold">
            <span>Tipo</span>
            <Input aria-label="Tipo" list={listaTipos} placeholder="Aquisição, Doação..."
              value={tipo} disabled={salvando} onChange={(evento) => setTipo(evento.target.value)} />
            <datalist id={listaTipos}>
              {TIPOS_COMUNS.map((nome) => <option key={nome} value={nome} />)}
            </datalist>
          </label>
        </div>
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
