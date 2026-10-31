import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cpfValido, formatarCpf, normalizarCpf } from "@/lib/cpf";
import { numeroDoTermo } from "@/lib/termo-responsabilidade";
import { resumoTermoDaSala, type TermoDaSala } from "@/lib/termos-da-sala";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Entrega = Tables<"entregas_termos">;
type Props = {
  termo: TermoDaSala; entrega: Entrega | null; baixa?: boolean;
  onFechar: () => void; onSalvar: (entrega: Entrega) => void;
};

export function EntregaTermoDialog({ termo, entrega, baixa = false, onFechar, onSalvar }: Props) {
  const [entreguePor, setEntreguePor] = useState(entrega?.entregue_por ?? "");
  const [recebidoPor, setRecebidoPor] = useState(entrega?.recebido_por ?? "");
  const [cpf, setCpf] = useState(formatarCpf(entrega?.cpf ?? ""));
  const [dataEntrega, setDataEntrega] = useState(entrega?.data_entrega ?? "");
  const [status, setStatus] = useState(entrega?.status ?? "Aguardando Entrega");
  const [entregaHoje, setEntregaHoje] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const salvandoRef = useRef(false);
  const entregue = status === "Entregue";
  const resumo = resumoTermoDaSala(termo);
  const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const campo = baixa ? "grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2" : "space-y-1";
  const rotulo = baixa ? "flex h-9 items-center justify-center bg-muted px-2 text-xs uppercase" : "";

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
    <DialogContent className={baixa ? "max-h-[90dvh] overflow-y-auto sm:max-w-4xl" : "max-h-[90dvh] overflow-y-auto sm:max-w-lg"}>
      <section className={baixa ? "mt-3 border border-foreground p-3" : ""}>
        <DialogHeader>
          <DialogTitle className={baixa ? "text-center text-base uppercase" : ""}>{baixa ? "Termo de responsabilidade" : "Entrega do termo"} {numeroDoTermo(termo)}</DialogTitle>
          <DialogDescription className={baixa ? "sr-only" : ""}>Registre a entrega deste termo. Para marcar como Entregue, preencha todos os campos, incluindo o CPF de quem recebeu.</DialogDescription>
        </DialogHeader>
        {baixa && <>
          <div className="mt-3 min-h-[220px] max-h-[40dvh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-foreground">
                <tr className="[&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:uppercase">
                  <th>Patrimônio</th><th className="text-left">Descrição do bem</th><th>Aquisição</th><th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resumo.dados?.bens.map((bem, indice) => <tr key={`${bem.codigo_red}:${indice}`} className="[&_td]:px-3 [&_td]:py-1">
                  <td className="whitespace-nowrap text-center">{bem.codigo_red}</td>
                  <td>{bem.descricao}</td><td className="whitespace-nowrap text-center">{bem.incorporacao || "—"}</td>
                  <td className="whitespace-nowrap text-right">{moeda(bem.valor)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 px-3 text-xs">
            <p><strong>ITENS:</strong> {String(resumo.quantidade).padStart(2, "0")}</p>
            <p><strong>VALOR:</strong> {moeda(resumo.total)}</p>
          </div>
        </>}
      </section>
      <form onSubmit={salvar} className="space-y-4">
        <fieldset disabled={salvando} className={baixa ? "grid gap-2 md:grid-cols-3" : "space-y-4"}>
          <div className={`flex items-center gap-2 ${baixa ? "md:col-span-3 md:row-start-4" : ""}`}>
            <input id="termo-entrega-hoje" type="checkbox" className="h-4 w-4 accent-primary" checked={entregaHoje} onChange={(event) => {
              const marcado = event.target.checked;
              setEntregaHoje(marcado);
              if (marcado) {
                const hoje = new Date();
                setDataEntrega(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`);
                setStatus("Entregue");
              }
            }} />
            <Label htmlFor="termo-entrega-hoje">Registrar entrega com a data de hoje</Label>
          </div>
          <div className={`${campo} ${baixa ? "md:col-span-2" : ""}`}>
            <Label className={rotulo} htmlFor="termo-entregue-por">Entregue por</Label>
            <Input id="termo-entregue-por" value={entreguePor} onChange={(e) => setEntreguePor(e.target.value)} required={entregue} maxLength={200} />
          </div>
          <div className={`${campo} ${baixa ? "md:col-span-2 md:row-start-2" : ""}`}>
            <Label className={rotulo} htmlFor="termo-recebido-por">Recebido Por</Label>
            <Input id="termo-recebido-por" value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} required={entregue} maxLength={200} />
          </div>
          <div className={`${campo} ${baixa ? "md:col-start-3 md:row-start-1" : ""}`}>
            <Label className={rotulo} htmlFor="termo-entrega-cpf">CPF</Label>
            <Input id="termo-entrega-cpf" inputMode="numeric" autoComplete="off" maxLength={14} value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} required={entregue} />
          </div>
          <div className={`${campo} ${baixa ? "md:col-span-2 md:row-start-3" : ""}`}>
            <Label className={rotulo} htmlFor="termo-data-entrega">Data Entrega</Label>
            <Input id="termo-data-entrega" type="date" value={dataEntrega} onChange={(e) => { setDataEntrega(e.target.value); setEntregaHoje(false); }} required={entregue} />
          </div>
          <div className={`${campo} ${baixa ? "md:col-start-3 md:row-start-2" : ""}`}>
            <Label className={rotulo} htmlFor="termo-entrega-status">Status</Label>
            <select id="termo-entrega-status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={status} onChange={(e) => { setStatus(e.target.value); setEntregaHoje(false); }}>
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
