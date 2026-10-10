import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { baixarRelatorio, tituloSolicitacao, type GrupoSolicitacoes } from "@/lib/solicitacoes-bens";
import { limparDescricao } from "@/lib/pdf-parse";

export function RelatorioBensDialog({ grupo, onClose }: { grupo: GrupoSolicitacoes; onClose: () => void }) {
  const total = grupo.itens.reduce((soma, item) => soma + Number(item.valor), 0);
  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader className="shrink-0 pr-5">
          <DialogTitle>{tituloSolicitacao(grupo.tipo)}: {grupo.local}</DialogTitle>
          <DialogDescription>
            Registros informados na conferência. Não representam transferência ou baixa já efetivada no cadastro patrimonial.
          </DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md bg-muted p-3">
          <p className="font-semibold">{grupo.itens.length} bem(ns) • Total: {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          <Button variant="outline" size="sm" onClick={() => baixarRelatorio(grupo.itens)}>
            <Download className="mr-2 h-4 w-4" /> Baixar relatório (CSV)
          </Button>
        </div>
        <div role="region" aria-label="Relatório de bens" tabIndex={0} className="min-h-0 overflow-auto rounded-md border border-border">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Código RED</TableHead>
                <TableHead>Descrição do bem</TableHead>
                {grupo.tipo === "transferencia" && <TableHead>Local de destino informado</TableHead>}
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Atualizado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.itens.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="align-top font-mono">{item.codigo_red}</TableCell>
                  <TableCell className="min-w-56 whitespace-pre-wrap align-top">{limparDescricao(item.descricao)}</TableCell>
                  {grupo.tipo === "transferencia" && <TableCell className="min-w-48 whitespace-pre-wrap align-top font-semibold">{item.destino}</TableCell>}
                  <TableCell className="min-w-48 whitespace-pre-wrap align-top">{item.observacao || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top">{Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                  <TableCell className="align-top">{new Date(item.updated_at).toLocaleString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
