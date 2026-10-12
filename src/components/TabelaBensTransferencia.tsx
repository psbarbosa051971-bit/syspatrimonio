import type { BemTransferencia, SalaTransferencia } from "@/lib/transferencias";
import { limparDescricao } from "@/lib/pdf-parse";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TabelaBensTransferencia({ titulo, bens, salas, selecionados, onChange, disabled = false }: {
  titulo: string;
  bens: BemTransferencia[];
  salas: SalaTransferencia[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const todos = bens.length > 0 && bens.every((b) => selecionados.includes(b.id));
  const nomes = new Map(salas.map((s) => [s.id, s.nome]));
  return <section className="min-w-0 space-y-2" aria-label={titulo}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{titulo}</h3>
      <span className="text-sm text-muted-foreground">{selecionados.length} selecionado(s) de {bens.length}</span>
    </div>
    <div className="max-h-64 overflow-auto rounded-md border [-webkit-overflow-scrolling:touch]">
      <Table className="text-sm sm:text-base">
        <TableHeader className="sticky top-0 z-10 bg-card"><TableRow>
          <TableHead className="w-10"><input type="checkbox" className="h-4 w-4 accent-primary"
            aria-label={`Selecionar todos — ${titulo}`} checked={todos} disabled={disabled || !bens.length}
            onChange={(e) => onChange(e.target.checked ? bens.map((b) => b.id) : [])} /></TableHead>
          <TableHead>Código RED</TableHead><TableHead>Descrição do bem</TableHead>
          <TableHead>Local de origem</TableHead><TableHead className="text-right">Valor</TableHead>
        </TableRow></TableHeader>
        <TableBody>{!bens.length ? <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nenhum bem nesta lista.</TableCell></TableRow> : bens.map((b) => <TableRow key={b.id}>
          <TableCell><input type="checkbox" className="h-4 w-4 accent-primary" disabled={disabled}
            aria-label={`Selecionar RED ${b.codigo_red} — ${nomes.get(b.sala_id ?? "") ?? "Sem sala"} — ${titulo}`}
            checked={selecionados.includes(b.id)} onChange={(e) => onChange(e.target.checked ? [...selecionados, b.id] : selecionados.filter((id) => id !== b.id))} /></TableCell>
          <TableCell className="whitespace-nowrap font-medium">{b.codigo_red}</TableCell>
          <TableCell className="min-w-64">{limparDescricao(b.descricao)}</TableCell>
          <TableCell className="min-w-48">{nomes.get(b.sala_id ?? "") ?? "Sem sala"}</TableCell>
          <TableCell className="whitespace-nowrap text-right">{Number(b.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </section>;
}
