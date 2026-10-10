import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { excluirImportacoes } from "@/lib/salas.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  sala: Tables<"salas">;
  onClose: () => void;
  onDeleted: () => Promise<void>;
};

export function ExcluirImportacoesDialog({ sala, onClose, onDeleted }: Props) {
  const [importacoes, setImportacoes] = useState<Tables<"importacoes">[]>([]);
  const [anteriores, setAnteriores] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [escolha, setEscolha] = useState("");
  const [credenciais, setCredenciais] = useState({ email: "", senha: "" });
  const [excluindo, setExcluindo] = useState(false);
  const excluir = useServerFn(excluirImportacoes);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const lista: Tables<"importacoes">[] = [];
        for (let inicio = 0; ; inicio += 500) {
          const { data, error } = await supabase.from("importacoes").select("*")
            .eq("sala_id", sala.id).order("numero", { ascending: false }).range(inicio, inicio + 499);
          if (error) throw error;
          lista.push(...(data ?? []));
          if (!data || data.length < 500) break;
        }
        const { count, error } = await supabase.from("bens").select("id", { count: "exact", head: true })
          .eq("sala_id", sala.id).is("importacao_id", null);
        if (error) throw error;
        if (ativo) {
          setImportacoes(lista);
          setAnteriores(count ?? 0);
        }
      } catch {
        if (ativo) setErro(true);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void carregar();
    return () => { ativo = false; };
  }, [sala.id]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!escolha || carregando || erro || excluindo) return;
    setExcluindo(true);
    try {
      const modo = escolha === "todas" || escolha === "anteriores" ? escolha : "uma";
      await excluir({ data: {
        salaId: sala.id,
        modo,
        ...(modo === "uma" ? { importacaoId: escolha } : {}),
        ...credenciais,
      } });
      toast.success("Registros excluídos. O local foi mantido para novas importações.");
      await onDeleted();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir os registros");
    } finally {
      setExcluindo(false);
    }
  }

  const selecionada = importacoes.find((item) => item.id === escolha);

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !excluindo) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Qual importação deseja excluir?</DialogTitle>
          <DialogDescription>
            Local: {sala.nome}. Selecione uma importação ou todas. O local, o endereço e as permissões de acesso serão mantidos.
          </DialogDescription>
        </DialogHeader>
        {carregando ? <p role="status" className="text-sm text-muted-foreground">Carregando importações...</p> : erro ? (
          <p role="alert" className="text-sm text-destructive">Não foi possível carregar a lista. Feche esta janela e tente novamente.</p>
        ) : importacoes.length === 0 && anteriores === 0 ? (
          <p className="text-sm text-muted-foreground">Este local não possui importações ou bens para excluir.</p>
        ) : (
          <form onSubmit={confirmar} className="flex flex-col gap-4">
            <fieldset disabled={excluindo} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Importações deste local</legend>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border p-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-destructive p-3 text-sm">
                  <input className="mt-1" type="radio" name="importacao" value="todas" checked={escolha === "todas"} onChange={() => setEscolha("todas")} required />
                  <span><strong>Todas</strong><span className="block text-muted-foreground">Exclui todas as importações e todos os bens deste local, inclusive os anteriores/manuais.</span></span>
                </label>
                {importacoes.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm hover:bg-accent">
                    <input className="mt-1" type="radio" name="importacao" value={item.id} checked={escolha === item.id} onChange={() => setEscolha(item.id)} required />
                    <span className="min-w-0"><strong>Importação nº {item.numero}</strong>
                      <span className="block text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                      <span className="block break-all text-muted-foreground">{item.arquivo}</span>
                    </span>
                  </label>
                ))}
                {anteriores > 0 && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm hover:bg-accent">
                    <input className="mt-1" type="radio" name="importacao" value="anteriores" checked={escolha === "anteriores"} onChange={() => setEscolha("anteriores")} required />
                    <span><strong>Registros anteriores / manuais</strong><span className="block text-muted-foreground">{anteriores} bem(ns) sem número de importação. Não é possível reconstruir as importações antigas.</span></span>
                  </label>
                )}
              </div>
            </fieldset>
            {escolha && (
              <p className="text-sm text-destructive" role="status">
                {escolha === "todas" ? "Todos os registros e bens deste local serão excluídos." : escolha === "anteriores" ? "Os bens anteriores/manuais serão excluídos." : `A importação nº ${selecionada?.numero} e os bens adicionados por ela serão excluídos.`}
                {" "}Esta ação não pode ser desfeita. Informe as credenciais do administrador para confirmar.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excluirAdmEmail">E-mail do administrador</Label>
              <Input id="excluirAdmEmail" type="email" autoComplete="username" required disabled={excluindo} value={credenciais.email} onChange={(e) => setCredenciais({ ...credenciais, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excluirAdmSenha">Senha do administrador</Label>
              <Input id="excluirAdmSenha" type="password" autoComplete="current-password" required disabled={excluindo} value={credenciais.senha} onChange={(e) => setCredenciais({ ...credenciais, senha: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={excluindo} onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={!escolha || excluindo}>
                {excluindo ? "Excluindo..." : escolha === "todas" ? "Excluir todas" : "Confirmar exclusão"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
