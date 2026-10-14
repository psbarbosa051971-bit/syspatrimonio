import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chat } from "@/components/Chat";

const estado = vi.hoisted(() => ({
  enviar: vi.fn(),
  setSelecionada: vi.fn(),
  mensagens: [] as Array<{ id: number; autor_id: string; conteudo: string; criado_em: string }>,
  selecionada: null as string | null,
  erro: "",
}));
vi.mock("@/hooks/use-chat", () => ({
  useChat: () => ({
    conversas: [{ user_id: "usuario-1", nome: "Maria", criado_em: "2026-01-01T12:00:00Z" }],
    selecionada: estado.selecionada,
    setSelecionada: estado.setSelecionada,
    mensagens: estado.mensagens,
    carregando: false,
    enviando: false,
    erro: estado.erro,
    enviar: estado.enviar,
    temAnteriores: false,
    carregarAnteriores: vi.fn(),
  }),
}));

function tamanhoCelular(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches, media: "(max-width: 767px)", onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  });
}

beforeEach(() => {
  estado.enviar.mockReset().mockResolvedValue(true);
  estado.setSelecionada.mockReset();
  estado.selecionada = null;
  estado.mensagens = [];
  estado.erro = "";
  tamanhoCelular(false);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Chat por perfil e tamanho da tela", () => {
  it.each(["operador", "visualizador"] as const)("não mostra chat para %s no computador", (role) => {
    render(<Chat userId="usuario-1" role={role} />);
    expect(screen.queryByRole("button", { name: "Chat" })).not.toBeInTheDocument();
  });

  it.each(["operador", "visualizador"] as const)("mostra chat para %s no celular", (role) => {
    tamanhoCelular(true);
    render(<Chat userId="usuario-1" role={role} />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    expect(screen.getByRole("heading", { name: "Chat com o administrador" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Conversas")).not.toBeInTheDocument();
  });

  it("mostra ao administrador a lista de conversas no computador", () => {
    render(<Chat userId="admin-1" role="admin" />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.click(screen.getByRole("button", { name: /Maria/ }));
    expect(estado.setSelecionada).toHaveBeenCalledWith("usuario-1");
  });

  it("não mostra o botão enquanto o perfil não foi identificado", () => {
    tamanhoCelular(true);
    render(<Chat userId="usuario-1" role={null} />);
    expect(screen.queryByRole("button", { name: "Chat" })).not.toBeInTheDocument();
  });

  it("envia a mensagem e limpa o campo após confirmação", async () => {
    tamanhoCelular(true);
    render(<Chat userId="usuario-1" role="visualizador" />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Preciso de ajuda" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(estado.enviar).toHaveBeenCalledWith("Preciso de ajuda"));
    await waitFor(() => expect(screen.getByLabelText("Mensagem")).toHaveValue(""));
  });

  it("mantém o texto se o envio falhar", async () => {
    tamanhoCelular(true);
    estado.enviar.mockResolvedValue(false);
    render(<Chat userId="usuario-1" role="operador" />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Minha dúvida" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(estado.enviar).toHaveBeenCalled());
    expect(screen.getByLabelText("Mensagem")).toHaveValue("Minha dúvida");
  });
});
