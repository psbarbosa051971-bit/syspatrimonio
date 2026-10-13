import { useId, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export type LocalFisicoOpcao = { id: string; nome: string; unidade: string | null };

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function SeletorLocalFisico({ salas, valor, onChange, id, required = false, disabled = false, limparAoDigitar = false, ariaLabel = "Local Físico" }: {
  salas: LocalFisicoOpcao[];
  valor: string[];
  onChange: (valor: string[]) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  limparAoDigitar?: boolean;
  ariaLabel?: string;
}) {
  const uid = useId();
  const listaId = `${uid}-locais`;
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [indice, setIndice] = useState(0);
  const selecionado = salas.find((s) => s.id === valor[0]);
  const resultados = salas.filter((s) => normalizar(s.nome).includes(normalizar(busca.trim())));
  const ativo = Math.min(indice, Math.max(0, resultados.length - 1));

  function escolher(sala: LocalFisicoOpcao) {
    onChange([sala.id]);
    setAberto(false);
    setBusca("");
  }

  return (
    <div className="relative min-w-0">
      <Search aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
      <Input id={id ?? uid} className="pl-9" role="combobox" aria-label={ariaLabel}
        aria-expanded={aberto} aria-controls={listaId} aria-autocomplete="list"
        aria-activedescendant={aberto && resultados.length ? `${listaId}-${ativo}` : undefined}
        autoComplete="off" required={required} disabled={disabled}
        placeholder={disabled ? "Selecione a Unidade primeiro" : "Digite o nome ou número do local"}
        value={aberto ? busca : selecionado?.nome ?? ""}
        onFocus={() => { setAberto(true); setBusca(""); setIndice(0); }}
        onBlur={() => setAberto(false)}
        onChange={(e) => { setBusca(e.target.value); setIndice(0); setAberto(true); if (limparAoDigitar) onChange([]); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!aberto) { setAberto(true); setBusca(""); setIndice(0); return; }
            setIndice(Math.max(0, Math.min(resultados.length - 1, ativo + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (e.key === "Enter" && aberto) {
            e.preventDefault();
            if (resultados[ativo]) escolher(resultados[ativo]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setAberto(false);
          }
        }} />
      {aberto && (
        <div id={listaId} role="listbox" aria-label="Locais Físicos"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {!resultados.length && <p className="p-3 text-sm text-muted-foreground">Nenhum local encontrado.</p>}
          {resultados.map((sala, i) => (
            <button key={sala.id} id={`${listaId}-${i}`} type="button" role="option" tabIndex={-1}
              aria-selected={valor.includes(sala.id)}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${i === ativo ? "bg-accent text-accent-foreground" : ""}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(sala)}>
              <span className="min-w-0 flex-1 break-words">{sala.nome}<span className="block text-xs text-muted-foreground">{sala.unidade ?? "Sem unidade vinculada"}</span></span>
              {valor.includes(sala.id) && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
