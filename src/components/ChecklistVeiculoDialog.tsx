import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { camposRecebimentoChecklist, dataAtualRecebimento } from "@/lib/checklist-veiculos";
import { gruposChecklist, lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { ChaveAcessoNfe } from "@/components/ChaveAcessoNfe";
import { CampoEmissaoNfe } from "@/components/CampoEmissaoNfe";
import { usePreenchimentoNfe } from "@/hooks/use-preenchimento-nfe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = { checklist: Tables<"checklists_veiculos"> | null; onClose: () => void; onSaved: () => void };

export function ChecklistVeiculoDialog({ checklist, onClose, onSaved }: Props) {
  const [dados, setDados] = useState<Record<string, string>>(() => checklist ? lerDadosRecebimento(checklist.dados) : { data_recebimento: dataAtualRecebimento() });
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const { emissaoRef, camposPreenchidos, registrarPreenchimento } = usePreenchimentoNfe();

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from("checklists_veiculos")
          .select("fornecedor:dados->>fornecedor").order("atualizado_em", { ascending: false }).limit(100);
        if (cancelado || error) return;
        const nomes = Array.from(new Set((data ?? []).map((item) =>
          typeof item.fornecedor === "string" ? item.fornecedor.trim() : "").filter(Boolean)));
        setFornecedores(nomes);
        if (!checklist && nomes[0]) setDados((atuais) => ({ ...atuais, fornecedor: atuais.fornecedor ?? nomes[0] }));
      } catch { /* O histórico é opcional e não impede o preenchimento. */ }
    })();
    return () => { cancelado = true; };
  }, [checklist]);

  function alterar(valores: Record<string, string>) { setAlterado(true); setDados((atuais) => ({ ...atuais, ...valores })); }
  function fechar() {
    if (!salvando && (!alterado || window.confirm("Fechar sem salvar as alterações deste checklist?"))) onClose();
  }

  async function salvar() {
    if (salvando) return;
    if (!dados.data_recebimento) { toast.error("Informe a data do recebimento."); return; }
    if (dados.valor && (!/^\d+(?:\.\d{1,2})?$/.test(dados.valor) || !Number.isFinite(Number(dados.valor)))) {
      toast.error("Informe um valor positivo ou zero, com até duas casas decimais."); return;
    }
    setSalvando(true);
    try {
      const { data: { user }, error: erroUsuario } = await supabase.auth.getUser();
      if (erroUsuario || !user) throw new Error("Entre novamente para salvar o checklist.");
      const consulta = checklist
        ? supabase.from("checklists_veiculos").update({ dados, atualizado_em: new Date().toISOString() }).eq("id", checklist.id).is("bem_id", null)
        : supabase.from("checklists_veiculos").insert({ dados, user_id: user.id });
      const { data, error } = await consulta.select("id").single();
      if (error || !data) throw new Error("Não foi possível salvar. O checklist pode já ter sido associado em outro dispositivo.");
      toast.success("Checklist salvo sem patrimônio e sem número de termo. Associe o código RED após importar o veículo.");
      onSaved(); onClose();
    } catch (erro) { toast.error((erro as Error).message); }
    finally { setSalvando(false); }
  }

  function campo(chave: string, nome: string, tipo = "text") {
    return <label key={chave} className={`min-w-0 space-y-1 text-sm font-semibold ${chave === "fornecedor" || chave === "modelo_veiculo" ? "sm:col-span-2" : ""}`}>
      <span>{nome}</span>
      {chave === "emissao" ? <CampoEmissaoNfe ref={emissaoRef} value={dados.emissao ?? ""} mes={dados.emissao_mes}
        className={camposPreenchidos.has(chave) ? "campo-nfe-preenchido" : undefined}
        onChange={(valor) => alterar({ emissao: valor })} /> : <Input aria-label={nome} type={tipo} min={tipo === "number" ? 0 : undefined} step={chave === "valor" ? "0.01" : undefined}
        inputMode={chave === "valor" ? "decimal" : undefined} maxLength={tipo === "text" ? 500 : undefined}
        className={camposPreenchidos.has(chave) ? "campo-nfe-preenchido" : undefined}
        list={chave === "fornecedor" ? "fornecedores-checklist" : undefined}
        value={dados[chave] ?? ""} onChange={(e) => alterar({ [chave]: e.target.value })} />}
      {chave === "fornecedor" && <>
        <datalist id="fornecedores-checklist">{fornecedores.map((nome) => <option key={nome} value={nome} />)}</datalist>
        <span className="block text-xs font-normal text-muted-foreground">Ao salvar o checklist, o fornecedor fica gravado e é sugerido nos próximos checklists. Você pode alterá-lo.</span>
      </>}
    </label>;
  }

  return <Dialog open onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
    <DialogContent className="flex h-[96dvh] max-h-[96dvh] sm:h-auto w-[calc(100%_-_1rem)] max-w-5xl flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>{checklist ? "Editar checklist pendente" : "Novo checklist de veículo"}</DialogTitle>
        <DialogDescription>Preencha no celular ou notebook antes da importação. O número do termo será gerado somente ao associar o código RED.</DialogDescription>
      </DialogHeader>
      <fieldset disabled={salvando} className="barra-rolagem min-h-0 flex-1 space-y-4 overflow-y-scroll overscroll-contain touch-pan-y pr-2 disabled:opacity-60">
        <ChaveAcessoNfe dados={dados} onChange={alterar} onPreenchido={registrarPreenchimento} />
        <section className="rounded-xl border border-border p-3">
          <h3 className="mb-3 font-semibold text-primary">Dados do recebimento</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{["nota_fiscal", "emissao", "valor", "data_recebimento", "pedido", "ano_empenho", "empenho", "fornecedor"]
            .map((c) => camposRecebimentoChecklist.find((item) => item.chave === c)).filter((item) => !!item)
            .map(({ chave, nome, tipo }) => campo(chave, nome, tipo))}</div>
        </section>
        <section className="rounded-xl border border-border p-3">
          <h3 className="mb-3 font-semibold text-primary">Identificação do veículo (opcional, antes do patrimônio)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campo("modelo_veiculo", "Modelo do veículo")}{campo("chassi", "Chassi")}{campo("placa", "Placa")}
            {campo("ano_modelo", "Ano/modelo")}{campo("renavam", "Renavam")}{campo("motor", "Motor")}{campo("km", "KM", "number")}
            {campo("secretaria", "Secretaria")}
          </div>
        </section>
        {gruposChecklist.map((grupo) => <section key={grupo.titulo} className="overflow-hidden rounded-xl border border-border">
          <h3 className="bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{grupo.titulo}</h3>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.campos.map(({ chave, nome, opcoes }) => <label key={chave} className="space-y-1 text-sm font-semibold">
              <span className="block">{nome}</span>
              <select value={dados[chave] ?? ""} onChange={(e) => alterar({ [chave]: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-base text-foreground">
                <option value="">Selecione...</option>{opcoes.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
              </select>
            </label>)}
          </div>
        </section>)}
        <label className="block space-y-1 text-sm font-semibold"><span>Observações gerais / conclusão da comissão</span>
          <Textarea rows={4} maxLength={5000} value={dados.observacoes_gerais ?? ""} onChange={(e) => alterar({ observacoes_gerais: e.target.value })} />
        </label>
      </fieldset>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" disabled={salvando} onClick={fechar}>Cancelar</Button>
        <Button type="button" disabled={salvando} onClick={salvar}><Save className="mr-2 h-4 w-4" />{salvando ? "Salvando…" : "Salvar checklist sem patrimônio"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
