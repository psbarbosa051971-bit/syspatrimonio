import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstalarApp } from "@/components/InstalarApp";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Instalação do SysPatrimônio", () => {
  it("mostra instruções para computador, Android e iPhone", () => {
    render(<InstalarApp />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar aplicativo" }));
    expect(screen.getByRole("heading", { name: "Computador — Chrome ou Edge" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Android — Chrome" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "iPhone ou iPad — Safari" })).toBeInTheDocument();
    expect(screen.getByText(/consultar e salvar dados exige internet/)).toBeInTheDocument();
  });

  it("usa o convite de instalação fornecido pelo navegador", async () => {
    render(<InstalarApp />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const convite = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(convite, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    act(() => { window.dispatchEvent(convite); });
    expect(convite.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Instalar aplicativo" }));
    fireEvent.click(screen.getByRole("button", { name: "Instalar agora" }));
    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("esconde a faixa quando o navegador confirma a instalação", () => {
    render(<InstalarApp />);
    act(() => { window.dispatchEvent(new Event("appinstalled")); });
    expect(screen.queryByRole("button", { name: "Instalar aplicativo" })).not.toBeInTheDocument();
  });

  it("não exibe a faixa quando já está aberto como aplicativo", () => {
    const media = window.matchMedia("(display-mode: standalone)");
    vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
    render(<InstalarApp />);
    expect(screen.queryByRole("button", { name: "Instalar aplicativo" })).not.toBeInTheDocument();
  });
});
