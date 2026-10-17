import { forwardRef, useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  mes?: string;
  onChange: (valor: string) => void;
};

// A chave contém AAMM, mas não contém o dia. Nunca invente uma data completa.
export const CampoEmissaoNfe = forwardRef<HTMLInputElement, Props>(function CampoEmissaoNfe(
  { value, mes = "", onChange, ...props }, ref,
) {
  const formatar = (data: string) => /^\d{4}-\d{2}-\d{2}$/.test(data)
    ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
    : /^\d{4}-\d{2}$/.test(mes) ? `__/${mes.slice(5, 7)}/${mes.slice(0, 4)}` : "";
  const [texto, setTexto] = useState(() => formatar(value));
  const ultimoEmitido = useRef<string | null>(null);
  const mesAnterior = useRef(mes);
  useEffect(() => {
    if (value !== ultimoEmitido.current || mes !== mesAnterior.current) setTexto(formatar(value));
    mesAnterior.current = mes;
  }, [value, mes]);
  function emitir(valor: string) { ultimoEmitido.current = valor; onChange(valor); }

  return <Input {...props} ref={ref} type="text" inputMode="numeric" placeholder="dd/mm/aaaa"
    value={texto} aria-label="Emissão"
    onFocus={(evento) => {
      props.onFocus?.(evento);
      if (texto.startsWith("__")) evento.currentTarget.setSelectionRange(0, 2);
    }}
    onClick={(evento) => {
      props.onClick?.(evento);
      if (texto.startsWith("__")) evento.currentTarget.setSelectionRange(0, 2);
    }}
    onChange={(evento) => {
      const entrada = evento.target.value;
      const digitos = entrada.replace(/\D/g, "").slice(0, 8);
      let novo = entrada.split("/").length === 3 || entrada.includes("_") ? entrada
        : digitos.length > 4 ? `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`
        : digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
      // No celular, o primeiro dígito pode ser inserido antes dos espaços do dia.
      // Substitui esses espaços sem deslocar ou apagar o mês/ano lido da NF-e.
      const partesEntrada = entrada.split("/");
      if (partesEntrada.length === 3 && (partesEntrada[0].includes("_")
        || (texto.split("/")[0].includes("_") && /^\d{1,2}$/.test(partesEntrada[0])))) {
        const diaDigitado = partesEntrada[0].replace(/\D/g, "").slice(0, 2);
        novo = `${diaDigitado.padEnd(2, "_")}/${partesEntrada[1]}/${partesEntrada[2]}`;
        const campo = evento.currentTarget;
        const posicao = diaDigitado.length;
        queueMicrotask(() => {
          if (campo.isConnected) campo.setSelectionRange(posicao, posicao);
        });
      }
      setTexto(novo);
      const partes = novo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!partes) { emitir(""); return; }
      const [, dia, mesNota, ano] = partes;
      const data = new Date(Date.UTC(Number(ano), Number(mesNota) - 1, Number(dia)));
      const iso = `${ano}-${mesNota}-${dia}`;
      emitir(data.toISOString().slice(0, 10) === iso ? iso : "");
    }} />;
});
