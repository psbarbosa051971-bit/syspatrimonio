import { forwardRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (valor: string) => void;
};

function deCentavos(entrada: string) {
  const digitos = entrada.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);
  if (!digitos) return "";
  const preenchido = digitos.padStart(3, "0");
  return `${preenchido.slice(0, -2)}.${preenchido.slice(-2)}`;
}

function deTexto(entrada: string) {
  const texto = entrada.replace(/R\$/g, "").trim();
  if (/^\d+\.\d{1,2}$/.test(texto)) {
    const [inteiro, decimal] = texto.split(".");
    return deCentavos(inteiro + decimal.padEnd(2, "0"));
  }
  return deCentavos(texto);
}

// Exibe reais, mas mantém o valor decimal sem máscara usado ao salvar e imprimir.
export const CampoValorReais = forwardRef<HTMLInputElement, Props>(function CampoValorReais(
  { value, onChange, ...props }, ref,
) {
  const numero = Number(value);
  const exibido = value && Number.isFinite(numero)
    ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
  return <Input {...props} ref={ref} type="text" inputMode="numeric" placeholder="R$ 0,00"
    value={exibido} onChange={(evento) => onChange(deTexto(evento.target.value))}
    onPaste={(evento) => {
      const texto = evento.clipboardData.getData("text").trim();
      if (!/\d/.test(texto)) { evento.preventDefault(); return; }
      evento.preventDefault();
      // Colar um número inteiro significa reais; digitar usa a máscara de centavos.
      const inteiro = texto.replace(/R\$/g, "").trim();
      onChange(/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(inteiro)
        ? deCentavos(`${inteiro.replace(/\D/g, "")}00`) : deTexto(texto));
    }} />;
});
