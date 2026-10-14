import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatPush } from "@/hooks/use-chat-push";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));

let subscription: { endpoint: string; toJSON: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> } | null;
let requestPermission: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
let getRegistration: ReturnType<typeof vi.fn>;

beforeEach(() => {
  subscription = null;
  requestPermission = vi.fn().mockResolvedValue("granted");
  subscribe = vi.fn().mockImplementation(async () => {
    subscription = {
      endpoint: "https://fcm.googleapis.com/teste",
      toJSON: vi.fn().mockReturnValue({ endpoint: "https://fcm.googleapis.com/teste", keys: { p256dh: "chave", auth: "segredo" } }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    return subscription;
  });
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe } };
  register = vi.fn().mockResolvedValue(registration);
  getRegistration = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration, register, ready: Promise.resolve(registration) },
  });
  mocks.invoke.mockReset().mockImplementation(async (_name, options) => ({
    data: options.body.action === "key" ? { publicKey: "AQID" } : { ok: true }, error: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("Avisos do chat fora do sistema", () => {
  it("não pede permissão automaticamente ao abrir a página", async () => {
    const { result } = renderHook(() => useChatPush("usuario-1"));
    await waitFor(() => expect(result.current.estado).toBe("desativado"));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("ativa apenas depois da permissão e da confirmação do servidor", async () => {
    const { result } = renderHook(() => useChatPush("usuario-1"));
    await waitFor(() => expect(result.current.estado).toBe("desativado"));
    await act(async () => { await result.current.ativar(); });
    expect(register).toHaveBeenCalledWith("/chat-push-sw.js", { scope: "/" });
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(mocks.invoke).toHaveBeenCalledWith("chat-push", expect.objectContaining({
      body: expect.objectContaining({ action: "subscribe" }),
    }));
    expect(result.current.estado).toBe("ativado");
  });

  it("não assina quando o usuário nega a permissão", async () => {
    requestPermission.mockResolvedValue("denied");
    const { result } = renderHook(() => useChatPush("usuario-1"));
    await waitFor(() => expect(result.current.estado).toBe("desativado"));
    await act(async () => { await result.current.ativar(); });
    expect(result.current.estado).toBe("bloqueado");
    expect(register).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("não informa ativação quando o serviço de envio falha", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("Indisponível") });
    const { result } = renderHook(() => useChatPush("usuario-1"));
    await waitFor(() => expect(result.current.estado).toBe("desativado"));
    await act(async () => { await result.current.ativar(); });
    expect(result.current.estado).toBe("desativado");
    expect(result.current.erro).toContain("Não foi possível ativar");
  });

  it("permite desativar o navegador registrado", async () => {
    const { result } = renderHook(() => useChatPush("usuario-1"));
    await waitFor(() => expect(result.current.estado).toBe("desativado"));
    await act(async () => { await result.current.ativar(); });
    const registered = subscription!;
    await act(async () => { await result.current.desativar(); });
    expect(mocks.invoke).toHaveBeenCalledWith("chat-push", {
      body: { action: "unsubscribe", endpoint: registered.endpoint },
    });
    expect(registered.unsubscribe).toHaveBeenCalled();
    expect(result.current.estado).toBe("desativado");
  });
});
