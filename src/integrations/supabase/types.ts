export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      notas_fiscais: {
        Row: {
          id: string
          fornecedor: string
          numero: string
          serie: string
          chave: string
          xml: string
          arquivo: string
          criado_por: string
          criado_em: string
        }
        Insert: {
          id?: string
          fornecedor: string
          numero: string
          serie: string
          chave: string
          xml: string
          arquivo: string
          criado_por: string
          criado_em?: string
        }
        Update: {
          id?: string
          fornecedor?: string
          numero?: string
          serie?: string
          chave?: string
          xml?: string
          arquivo?: string
          criado_por?: string
          criado_em?: string
        }
        Relationships: []
      }
      bens: {
        Row: {
          ano_empenho: string | null
          ano_pedido: string | null
          codigo_red: string
          conferencia_finalizada: boolean
          conferido: boolean
          created_at: string
          descricao: string
          empenho: string | null
          fornecedor: string | null
          id: string
          importacao_id: string | null
          incorporacao: string | null
          nota_fiscal: string | null
          observacao: string | null
          pedido: string | null
          sala_id: string | null
          status: string
          tipo: string | null
          user_id: string
          valor: number
        }
        Insert: {
          ano_empenho?: string | null
          ano_pedido?: string | null
          codigo_red: string
          conferencia_finalizada?: boolean
          conferido?: boolean
          created_at?: string
          descricao: string
          empenho?: string | null
          fornecedor?: string | null
          id?: string
          importacao_id?: string | null
          incorporacao?: string | null
          nota_fiscal?: string | null
          observacao?: string | null
          pedido?: string | null
          sala_id?: string | null
          status?: string
          tipo?: string | null
          user_id: string
          valor?: number
        }
        Update: {
          ano_empenho?: string | null
          ano_pedido?: string | null
          codigo_red?: string
          conferencia_finalizada?: boolean
          conferido?: boolean
          created_at?: string
          descricao?: string
          empenho?: string | null
          fornecedor?: string | null
          id?: string
          importacao_id?: string | null
          incorporacao?: string | null
          nota_fiscal?: string | null
          observacao?: string | null
          pedido?: string | null
          sala_id?: string | null
          status?: string
          tipo?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "bens_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bens_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversas: {
        Row: {
          criado_em: string
          nome: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          nome?: string
          user_id: string
        }
        Update: {
          criado_em?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_mensagens: {
        Row: {
          autor_id: string
          conteudo: string
          conversa_id: string
          criado_em: string
          id: number
        }
        Insert: {
          autor_id: string
          conteudo: string
          conversa_id: string
          criado_em?: string
          id?: never
        }
        Update: {
          autor_id?: string
          conteudo?: string
          conversa_id?: string
          criado_em?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chat_conversas"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_push_assinaturas: {
        Row: {
          auth: string
          criado_em: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          criado_em?: string
          endpoint: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          criado_em?: string
          endpoint?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_push_config: {
        Row: {
          dispatch_token: string
          id: boolean
          vapid_private_key: string | null
          vapid_public_key: string | null
        }
        Insert: {
          dispatch_token?: string
          id?: boolean
          vapid_private_key?: string | null
          vapid_public_key?: string | null
        }
        Update: {
          dispatch_token?: string
          id?: boolean
          vapid_private_key?: string | null
          vapid_public_key?: string | null
        }
        Relationships: []
      }
      checklists_veiculos: {
        Row: {
          atualizado_em: string
          bem_id: string | null
          criado_em: string
          dados: Json
          id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          bem_id?: string | null
          criado_em?: string
          dados?: Json
          id?: string
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          bem_id?: string | null
          criado_em?: string
          dados?: Json
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_veiculos_bem_id_fkey"
            columns: ["bem_id"]
            isOneToOne: true
            referencedRelation: "bens"
            referencedColumns: ["id"]
          },
        ]
      }
      comissao_recebimento_veiculos: {
        Row: {
          atualizado_em: string
          atualizado_por: string
          dados: Json
          id: boolean
        }
        Insert: {
          atualizado_em?: string
          atualizado_por: string
          dados?: Json
          id?: boolean
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string
          dados?: Json
          id?: boolean
        }
        Relationships: []
      }
      departamentos: {
        Row: {
          almoxarifado: string
          cpd: string
          created_at: string
          departamento: string
          diretor: string
          endereco: string | null
          id: string
          local: string
          user_id: string
        }
        Insert: {
          almoxarifado: string
          cpd?: string
          created_at?: string
          departamento: string
          diretor: string
          endereco?: string | null
          id?: string
          local?: string
          user_id: string
        }
        Update: {
          almoxarifado?: string
          cpd?: string
          created_at?: string
          departamento?: string
          diretor?: string
          endereco?: string | null
          id?: string
          local?: string
          user_id?: string
        }
        Relationships: []
      }
      entregas_termos: {
        Row: {
          atualizado_em: string
          cpf: string
          data_entrega: string | null
          entregue_por: string
          importacao_id: string
          recebido_por: string
          status: string
        }
        Insert: {
          atualizado_em?: string
          cpf?: string
          data_entrega?: string | null
          entregue_por?: string
          importacao_id: string
          recebido_por?: string
          status?: string
        }
        Update: {
          atualizado_em?: string
          cpf?: string
          data_entrega?: string | null
          entregue_por?: string
          importacao_id?: string
          recebido_por?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entregas_termos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: true
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacoes: {
        Row: {
          arquivo: string
          created_at: string
          id: string
          numero: number
          sala_id: string
          termo_ano: number | null
          termo_snapshot: Json | null
          user_id: string
        }
        Insert: {
          arquivo: string
          created_at?: string
          id?: string
          numero?: never
          sala_id: string
          termo_ano?: number | null
          termo_snapshot?: Json | null
          user_id?: string
        }
        Update: {
          arquivo?: string
          created_at?: string
          id?: string
          numero?: never
          sala_id?: string
          termo_ano?: number | null
          termo_snapshot?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          login: string | null
          matricula: string | null
          nome: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id: string
          login?: string | null
          matricula?: string | null
          nome?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          login?: string | null
          matricula?: string | null
          nome?: string | null
        }
        Relationships: []
      }
      recebimentos_veiculos: {
        Row: {
          ano: number
          atualizado_em: string
          atualizado_por: string
          bem_id: string
          criado_em: string
          dados: Json
          numero: number
        }
        Insert: {
          ano: number
          atualizado_em?: string
          atualizado_por?: string
          bem_id: string
          criado_em?: string
          dados?: Json
          numero: number
        }
        Update: {
          ano?: number
          atualizado_em?: string
          atualizado_por?: string
          bem_id?: string
          criado_em?: string
          dados?: Json
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_veiculos_bem_id_fkey"
            columns: ["bem_id"]
            isOneToOne: true
            referencedRelation: "bens"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos_veiculos_contadores: {
        Row: {
          ano: number
          ultimo_numero: number
        }
        Insert: {
          ano: number
          ultimo_numero?: number
        }
        Update: {
          ano?: number
          ultimo_numero?: number
        }
        Relationships: []
      }
      retiradas_veiculos: {
        Row: {
          ano: number
          bem_id: string
          criado_em: string
          criado_por: string
          numero: number
        }
        Insert: {
          ano: number
          bem_id: string
          criado_em?: string
          criado_por: string
          numero: number
        }
        Update: {
          ano?: number
          bem_id?: string
          criado_em?: string
          criado_por?: string
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "retiradas_veiculos_bem_id_fkey"
            columns: ["bem_id"]
            isOneToOne: true
            referencedRelation: "recebimentos_veiculos"
            referencedColumns: ["bem_id"]
          },
        ]
      }
      salas: {
        Row: {
          created_at: string
          data_termo: string | null
          departamento_id: string | null
          endereco: string | null
          id: string
          nome: string
          responsavel: string | null
          unidade: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_termo?: string | null
          departamento_id?: string | null
          endereco?: string | null
          id?: string
          nome: string
          responsavel?: string | null
          unidade?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_termo?: string | null
          departamento_id?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          responsavel?: string | null
          unidade?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_bens: {
        Row: {
          ativa: boolean
          bem_id: string | null
          codigo_red: string
          created_at: string
          descricao: string
          destino: string | null
          id: string
          local_origem: string
          observacao: string
          sala_id: string | null
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          ativa?: boolean
          bem_id?: string | null
          codigo_red: string
          created_at?: string
          descricao: string
          destino?: string | null
          id?: string
          local_origem: string
          observacao?: string
          sala_id?: string | null
          tipo: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Update: {
          ativa?: boolean
          bem_id?: string | null
          codigo_red?: string
          created_at?: string
          descricao?: string
          destino?: string | null
          id?: string
          local_origem?: string
          observacao?: string
          sala_id?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_bens_bem_id_fkey"
            columns: ["bem_id"]
            isOneToOne: true
            referencedRelation: "bens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_bens_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_bens_leituras: {
        Row: {
          admin_id: string
          solicitacao_id: string
          versao_lida: string
        }
        Insert: {
          admin_id?: string
          solicitacao_id: string
          versao_lida: string
        }
        Update: {
          admin_id?: string
          solicitacao_id?: string
          versao_lida?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_bens_leituras_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_bens"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_numeracao_contador: {
        Row: {
          id: boolean
          ultimo_numero: number
        }
        Insert: {
          id?: boolean
          ultimo_numero?: number
        }
        Update: {
          id?: boolean
          ultimo_numero?: number
        }
        Relationships: []
      }
      transferencias_bens_itens: {
        Row: {
          bem_id: string
          codigo_red: string
          created_at: string
          descricao: string
          destino_nome: string
          destino_sala_id: string
          estornado_em: string | null
          estornado_por: string | null
          estorno_pedido: string | null
          id: number
          numero: number
          origem_importacao_id: string | null
          origem_nome: string
          origem_sala_id: string | null
          termo_ano: number | null
          transferencia_id: string
          valor: number
        }
        Insert: {
          bem_id: string
          codigo_red: string
          created_at?: string
          descricao: string
          destino_nome: string
          destino_sala_id: string
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_pedido?: string | null
          id?: never
          numero: number
          origem_importacao_id?: string | null
          origem_nome: string
          origem_sala_id?: string | null
          termo_ano?: number | null
          transferencia_id: string
          valor: number
        }
        Update: {
          bem_id?: string
          codigo_red?: string
          created_at?: string
          descricao?: string
          destino_nome?: string
          destino_sala_id?: string
          estornado_em?: string | null
          estornado_por?: string | null
          estorno_pedido?: string | null
          id?: never
          numero?: number
          origem_importacao_id?: string | null
          origem_nome?: string
          origem_sala_id?: string | null
          termo_ano?: number | null
          transferencia_id?: string
          valor?: number
        }
        Relationships: []
      }
      transferencias_numeros_reservados: {
        Row: {
          ano: number
          criado_em: string
          numero: number
          pedido: string
          user_id: string
        }
        Insert: {
          ano: number
          criado_em?: string
          numero: number
          pedido: string
          user_id: string
        }
        Update: {
          ano?: number
          criado_em?: string
          numero?: number
          pedido?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_salas: {
        Row: {
          sala_id: string
          user_id: string
        }
        Insert: {
          sala_id: string
          user_id: string
        }
        Update: {
          sala_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_salas_sala_id_fkey"
            columns: ["sala_id"]
            isOneToOne: false
            referencedRelation: "salas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      fornecedores_notas_fiscais: {
        Args: Record<PropertyKey, never>
        Returns: { fornecedor: string }[]
      }
      bens_da_nota_fiscal: {
        Args: { _fornecedor: string; _numero: string }
        Returns: Database["public"]["Tables"]["bens"]["Row"][]
      }
      associar_checklist_veiculo: {
        Args: { _bem_id: string; _checklist_id: string }
        Returns: Json
      }
      associar_checklist_veiculo_por_red: {
        Args: { _checklist_id: string; _codigo_red: string; _sala_id?: string }
        Returns: Json
      }
      buscar_ultima_transferencia: { Args: { _codigo: string }; Returns: Json }
      can_edit: { Args: { _user_id: string }; Returns: boolean }
      chave_codigo_red_importacao: {
        Args: { _codigo: string }
        Returns: string
      }
      consultar_bens_importacao: {
        Args: { _bens: Json }
        Returns: {
          codigo_red: string
          id: string
          sala_id: string
          sala_nome: string
        }[]
      }
      consultar_proximo_numero_transferencia: { Args: never; Returns: Json }
      criar_termo_bens_sala: {
        Args: { _itens: string[]; _pedido: string; _sala: string }
        Returns: Json
      }
      dados_responsavel_sala_termo: {
        Args: { _sala_id: string }
        Returns: Json
      }
      data_br_segura: { Args: { _t: string }; Returns: string }
      demonstrativo_bens_incorporados: {
        Args: { _fim: string; _inicio: string }
        Returns: {
          quantidade: number
          sem_codigo: number
          tipo: string
          total: number
        }[]
      }
      emitir_retirada_veiculo: { Args: { _bem_id: string }; Returns: Json }
      estornar_bens_inserviveis: {
        Args: { _sala_id: string; _solicitacoes: string[] }
        Returns: number
      }
      estornar_solicitacoes_transferencia: {
        Args: { _sala_id: string; _solicitacoes: string[] }
        Returns: number
      }
      estornar_transferencia: {
        Args: { _itens: string[]; _pedido: string; _transferencia: string }
        Returns: Json
      }
      excluir_importacoes_sala: {
        Args: { _importacao_id?: string; _modo: string; _sala_id: string }
        Returns: undefined
      }
      excluir_sala_vazia: { Args: { _sala_id: string }; Returns: undefined }
      excluir_termo_sala: {
        Args: { _sala: string; _termo: string }
        Returns: Json
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_bens_html: {
        Args: {
          _arquivo: string
          _bens: Json
          _cabecalho: Json
          _sala_id: string
        }
        Returns: Json
      }
      importar_bens_html_com_opcao: {
        Args: {
          _arquivo: string
          _bens: Json
          _cabecalho: Json
          _existentes: Json
          _gerar_termo: boolean
          _sala_id: string
        }
        Returns: Json
      }
      importar_bens_html_confirmado: {
        Args: {
          _arquivo: string
          _bens: Json
          _cabecalho: Json
          _existentes: Json
          _sala_id: string
        }
        Returns: Json
      }
      importar_bens_pdf: {
        Args: { _arquivo: string; _bens: Json; _sala_id: string }
        Returns: Json
      }
      incluir_bens_no_termo: {
        Args: { _itens: string[]; _sala: string; _termo: string }
        Returns: Json
      }
      marcar_conferido: {
        Args: { _bem_id: string; _valor: boolean }
        Returns: undefined
      }
      normalizar_texto_pesquisa_bens: {
        Args: { _texto: string }
        Returns: string
      }
      pesquisar_bens_salas: {
        Args: { _termo: string }
        Returns: {
          bem: Json
          local_nome: string
        }[]
      }
      pode_ver_sala: {
        Args: { _sala_id: string; _user_id: string }
        Returns: boolean
      }
      reservar_numero_transferencia: {
        Args: { _pedido: string }
        Returns: Json
      }
      salvar_conferencia: {
        Args: { _bens_ids: string[]; _localizados: string[]; _sala_id: string }
        Returns: undefined
      }
      salvar_observacao: {
        Args: { _bem_id: string; _obs: string }
        Returns: undefined
      }
      salvar_observacao_solicitacao: {
        Args: {
          _bem_id: string
          _destino?: string
          _obs: string
          _tipo: string
        }
        Returns: undefined
      }
      salvar_recebimento_termo: {
        Args: { _cpf: string; _importacao_id: string; _recebedor: string }
        Returns: Json
      }
      transferir_bens: {
        Args: { _destino: string; _itens: Json; _pedido: string }
        Returns: Json
      }
      vincular_dados_fornecedor: {
        Args: { _itens: Json }
        Returns: {
          codigo_red: string
          vinculados: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "visualizador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operador", "visualizador"],
    },
  },
} as const
