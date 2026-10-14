import { useEffect, useState } from "react";
import { Link2, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { lerDadosRecebimento } from "@/lib/recebimento-veiculos";
import { ChecklistVeiculoDialog } from "@/components/ChecklistVeiculoDialog";
import { AssociarChecklistVeiculo } from "@/components/AssociarChecklistVeiculo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Checklist = Tables<"checklists_veiculos">;
type Props = { onAssociated: (bem: Tables<"bens">) => void };

export function ChecklistsVeiculos({ onAssociated }: Props) {
  const [registros, setRegistros] = useState<Checklist[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const [filtro, setFiltro] = useState("");
  const [edicao, setEdicao] = useState<{ checklist: Checklist | null } | null>(null);
  const [associacao, setAssociacao] = useState<Checklist | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro(false);
    void (async () => {
      try {
        const todos: Checklist[] = [];
        for (let inicio = 0; ; inicio += 500) {
          const { data, error } = await supabase.from("checklists_veiculos").select("*").is("bem_id", null)
            .order("criado_em", { ascending: false }).range(inicio, inicio + 499);
          if (error) throw error;
          todos.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
        if (ativo) setRegistros(todos);
      } catch { if (ativo) setErro(true); }
      finally { if (ativo) setCarregando(false); }
    })();
    return () => { ativo = false; };
  }, [versao]);

  const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtrados = registros.filter((registro) => {
    const dados = lerDadosRecebimento(registro.dados);
    return normalizar(`${dados.nota_fiscal ?? ""} ${dados.fornecedor ?? ""} ${dados.chassi ?? ""} ${dados.placa ?? ""} ${dados.modelo_veiculo ?? ""} ${dados.chave_acesso ?? ""}`).includes(normalizar(filtro));
  });

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <div className="max-w-xl space-y-1"><h3 className="font-semibold text-primary">Checklists pendentes de código RED</h3>
        <p className="text-sm text-muted-foreground">1. Preencha e salve o checklist. 2. Clique em Associar código RED e informe o código do veículo. Se ainda não estiver cadastrado, escolha o Local Físico para cadastrá-lo com os dados do checklist e gerar o termo, sem importar HTML.</p>
        <p className="text-xs text-muted-foreground">Acesse com a mesma conta no celular ou notebook para continuar o preenchimento. Administradores também podem acompanhar os pendentes.</p>
      </div>
      <Button onClick={() => setEdicao({ checklist: null })}><Plus className="mr-2 h-4 w-4" />Novo checklist vazio</Button>
    </div>
    <Input aria-label="Filtrar checklists pendentes" placeholder="Filtrar por nota fiscal, fornecedor, chassi, placa ou modelo…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
    {carregando ? <p role="status" className="py-8 text-center text-muted-foreground">Carregando checklists…</p> : erro ? <div role="alert" className="rounded-lg border border-destructive p-3">
      <p>Não foi possível carregar os checklists.</p><Button variant="outline" className="mt-2" onClick={() => setVersao((v) => v + 1)}>Tentar novamente</Button>
    </div> : <>
      <p className="text-xs text-muted-foreground">{registros.length} checklist(s) pendente(s) · sem número de termo</p>
      {!filtrados.length && <p className="py-8 text-center text-muted-foreground">{registros.length ? "Nenhum checklist corresponde ao filtro." : "Nenhum checklist pendente. Clique em Novo checklist vazio para começar."}</p>}
      {filtrados.map((registro) => {
        const dados = lerDadosRecebimento(registro.dados);
        const dataRecebimento = /^\d{4}-\d{2}-\d{2}$/.test(dados.data_recebimento ?? "") ? dados.data_recebimento.split("-").reverse().join("/") : "Não informada";
        return <article key={registro.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase text-primary">Pendente · aguardando código RED</p>
            <p className="font-semibold">Nota fiscal {dados.nota_fiscal || "não informada"}</p>
            <p className="break-words text-sm">{dados.fornecedor || "Fornecedor não informado"}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{dados.modelo_veiculo || "Modelo não informado"} · Chassi: {dados.chassi || "não informado"} · Placa: {dados.placa || "não informada"}</p>
            <p className="text-xs text-muted-foreground">Recebimento: {dataRecebimento} · Atualizado em {new Date(registro.atualizado_em).toLocaleDateString("pt-BR")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEdicao({ checklist: registro })}><Pencil className="mr-2 h-4 w-4" />Editar checklist</Button>
            <Button size="sm" onClick={() => setAssociacao(registro)}><Link2 className="mr-2 h-4 w-4" />Associar código RED</Button>
          </div>
        </article>;
      })}
    </>}
    {edicao && <ChecklistVeiculoDialog checklist={edicao.checklist} onClose={() => setEdicao(null)} onSaved={() => setVersao((v) => v + 1)} />}
    {associacao && <AssociarChecklistVeiculo checklist={associacao} onClose={() => setAssociacao(null)} onAssociated={(bem) => {
      setAssociacao(null); setVersao((v) => v + 1); onAssociated(bem);
    }} />}
  </div>;
}
