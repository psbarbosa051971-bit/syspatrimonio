CREATE TABLE public.departamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  diretor text NOT NULL,
  departamento text NOT NULL,
  almoxarifado text NOT NULL,
  local text NOT NULL,
  cpd text NOT NULL,
  endereco text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departamentos TO authenticated;
GRANT ALL ON public.departamentos TO service_role;
ALTER TABLE public.departamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own departamentos" ON public.departamentos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.salas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  departamento_id uuid REFERENCES public.departamentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  endereco text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salas TO authenticated;
GRANT ALL ON public.salas TO service_role;
ALTER TABLE public.salas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own salas" ON public.salas FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.bens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sala_id uuid REFERENCES public.salas(id) ON DELETE CASCADE,
  codigo_red text NOT NULL,
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bens TO authenticated;
GRANT ALL ON public.bens TO service_role;
ALTER TABLE public.bens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own bens" ON public.bens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());