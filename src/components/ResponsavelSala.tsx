import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cpfValido, formatarCpf, normalizarCpf } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Sala = Tables<"salas">;
type Props = {
  sala: Sala | null;
  perfil: { nome: string | null; cpf: string | null } | null;
  onSaved: (sala: Sala) => void;
};

export function ResponsavelSala({ sala, perfil, onSaved }: Props) {
  const manual = sala?.cpf_responsavel != null;
  const nomeAtual = manual ? sala?.responsavel ?? "" : perfil?.nome ?? sala?.responsavel ?? "";
  const cpfAtual = manual ? sala?.cpf_responsavel ?? "" : perfil?.cpf ?? "";
  const [nome, setNome] = useState(nomeAtual);
  const [cpf, setCpf] = useState(formatarCpf(cpfAtual));
  const [editado, setEditado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (editado) return;
    setNome(nomeAtual);
    setCpf(formatarCpf(cpfAtual));
  }, [nomeAtual, cpfAtual, editado]);

  async function salvar() {
    if (!sala || salvando) return;
    if (!nome.trim()) { toast.error("Informe o nome do responsável pela sala"); return; }
    if (cpf && !cpfValido(cpf)) { toast.error("Informe um CPF válido ou deixe o campo em branco"); return; }
    setSalvando(true);
    try {
      const { data, error } = await supabase.from("salas")
        .update({ responsavel: nome.trim(), cpf_responsavel: normalizarCpf(cpf) })
        .eq("id", sala.id).select().single();
      if (error || !data) throw error ?? new Error("Local não encontrado");
      onSaved(data);
      setEditado(false);
      toast.success("Responsável da sala salvo");
    } catch {
      toast.error("Não foi possível salvar o responsável da sala. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return <>
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor="cabResp">Responsável pela sala</Label>
      <Input id="cabResp" className="h-8" value={nome} maxLength={200}
        disabled={!sala || salvando} placeholder="Digite o nome do responsável"
        onChange={(e) => { setNome(e.target.value); setEditado(true); }} />
      <span className="text-xs text-muted-foreground">Não é necessário cadastrar um usuário.</span>
    </div>
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor="cabCpf">CPF</Label>
      <Input id="cabCpf" className="h-8" value={cpf} inputMode="numeric" maxLength={14}
        disabled={!sala || salvando} placeholder="CPF do responsável"
        onChange={(e) => { setCpf(formatarCpf(e.target.value)); setEditado(true); }} />
      <Button type="button" variant="outline" size="sm" disabled={!sala || !editado || salvando}
        onClick={() => void salvar()}>
        {salvando ? "Salvando..." : "Salvar responsável"}
      </Button>
    </div>
  </>;
}
