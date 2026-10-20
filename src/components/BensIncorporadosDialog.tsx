import { useState } from "react";
import { FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Linha = { tipo: string; quantidade: number; sem_codigo: number; total: number };

const CATEGORIAS: [string, string][] = [
  ["Aquisição", "Total por Aquisição:"],
  ["Doação", "Total por Doação:"],
  ["Levantamento", "Total por Levantamento:"],
  ["Permuta", "Total por Permuta:"],
  ["Reincorporação", "Total por Reincorporação:"],
  ["Obras", "Total por Obras:"],
];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function BensIncorporadosDialog() {
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [gerando, setGerando] = useState(false);
  const [res, setRes] = useState<{ inicio: string; fim: string; linhas: Linha[] } | null>(null);

  const gerar = async (): Promise<void> => {
    if (!inicio || !fim) { toast.error("Informe a data inicial e a data final."); return; }
    if (inicio > fim) { toast.error("A data inicial deve ser anterior à final."); return; }
    setGerando(true);
    const { data, error } = await supabase.rpc("demonstrativo_bens_incorporados", { _inicio: inicio, _fim: fim });
    setGerando(false);
    if (error) { toast.error("Não foi possível gerar o relatório."); return; }
    setRes({ inicio, fim, linhas: (data ?? []).map((l) => ({ ...l, quantidade: Number(l.quantidade), sem_codigo: Number(l.sem_codigo), total: Number(l.total) })) });
  };

  const linhas = res?.linhas ?? [];
  const valorDe = (cat: string) => linhas.filter((l) => norm(l.tipo) === norm(cat)).reduce((s, l) => s + l.total, 0);
  const conhecidas = CATEGORIAS.map(([c]) => norm(c));
  const outras = linhas.filter((l) => !conhecidas.includes(norm(l.tipo))).reduce((s, l) => s + l.total, 0);
  const totalBens = linhas.reduce((s, l) => s + l.quantidade, 0);
  const semCodigo = linhas.reduce((s, l) => s + l.sem_codigo, 0);
  const totalValor = linhas.reduce((s, l) => s + l.total, 0);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setRes(null); setAberto(true); }}>
        <FileBarChart className="mr-1 h-4 w-4" /> Bens incorporados
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={res ? "max-w-3xl" : "max-w-md"}>
          <DialogHeader>
            <DialogTitle className="text-center">Demonstrativo de bens incorporados</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <div className="grid flex-1 gap-3">
              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <Label htmlFor="inc-inicio">Data inicial:</Label>
                <Input id="inc-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                <Label htmlFor="inc-fim">Data final:</Label>
                <Input id="inc-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
            <Button onClick={gerar} disabled={gerando}>{gerando ? "Gerando..." : "Gerar"}</Button>
          </div>
          {res && (
            <div className="mt-4 space-y-3">
              <h3 className="text-center font-semibold">Bens Incorporados entre {br(res.inicio)} a {br(res.fim)}</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
                <div className="rounded border p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>Total de Bens sem Código:</span><b>{semCodigo}</b></div>
                  <div className="flex justify-between"><span>Total de Bens:</span><b>{totalBens}</b></div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="mb-2 border-b pb-1 text-center font-semibold">TOTAIS NA INCORPORAÇÃO</div>
                  {CATEGORIAS.map(([c, rot]) => (
                    <div key={c} className="flex justify-between"><span>{rot}</span><span>{brl(valorDe(c))}</span></div>
                  ))}
                  <div className="flex justify-between"><span>Total Outras Inc.:</span><span>{brl(outras)}</span></div>
                  <div className="mt-3 flex justify-between border-t pt-2 font-semibold"><span>TOTAL VALOR INCORPORADO:</span><span>{brl(totalValor)}</span></div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
