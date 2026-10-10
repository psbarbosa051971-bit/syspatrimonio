import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type Papel = "admin" | "operador" | "visualizador";

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<Papel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setRole((data?.role as Papel) ?? null);
        setLoading(false);
      });
  }, [user]);

  return { role, loading, podeEditar: role === "admin" || role === "operador" };
}
