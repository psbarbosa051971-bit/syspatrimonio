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
      chat_push_config: {
        Row: { id: boolean; dispatch_token: string; vapid_public_key: string | null; vapid_private_key: string | null }
        Insert: { id?: boolean; dispatch_token?: string; vapid_public_key?: string | null; vapid_private_key?: string | null }
        Update: { dispatch_token?: string; vapid_public_key?: string | null; vapid_private_key?: string | null }
        Relationships: []
      }
      chat_push_assinaturas: {
        Row: { endpoint: string; user_id: string; p256dh: string; auth: string; criado_em: string }
        Insert: { endpoint: string; user_id: string; p256dh: string; auth: string; criado_em?: string }
        Update: { user_id?: string; p256dh?: string; auth?: string }
        Relationships: []
      }
      chat_conversas: {
        Row: { user_id: string; nome: string; criado_em: string }
        Insert: { user_id: string; nome?: string; criado_em?: string }
        Update: { user_id?: string; nome?: string; criado_em?: string }
        Relationships: []
      }
      chat_mensagens: {
        Row: { id: number; conversa_id: string; autor_id: string; conteudo: string; criado_em: string }
        Insert: { id?: never; conversa_id: string; autor_id: string; conteudo: string; criado_em?: string }
        Update: { id?: never; conversa_id?: string; autor_id?: string; conteudo?: string; criado_em?: string }
        Relationships: [{
          foreignKeyName: "chat_mensagens_conversa_id_fkey"
          columns: ["conversa_id"]
          isOneToOne: false
          referencedRelation: "chat_conversas"
          referencedColumns: ["user_id"]
        }]
      }
      bens: {
        Row: {
          codigo_red: string
          conferencia_finalizada: boolean
          conferido: boolean
          created_at: string
          descricao: string
          id: string
          importacao_id: string | null
          incorporacao: string | null
          observacao: string | null
          sala_id: string | null
          tipo: string | null
          user_id: string
          valor: number
        }
        Insert: {
          codigo_red: string
          conferencia_finalizada?: boolean
          conferido?: boolean
          created_at?: string
          descricao: string
          id?: string
          importacao_id?: string | null
          incorporacao?: string | null
          observacao?: string | null
          sala_id?: string | null
          tipo?: string | null
          user_id: string
          valor?: number
        }
        Update: {
          codigo_red?: string
          conferencia_finalizada?: boolean
          conferido?: boolean
          created_at?: string
          descricao?: string
          id?: string
          importacao_id?: string | null
          incorporacao?: string | null
          observacao?: string | null
          sala_id?: string | null
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
      checklists_veiculos: {
        Row: { id: string; user_id: string; dados: Json; bem_id: string | null; criado_em: string; atualizado_em: string }
        Insert: { id?: string; user_id?: string; dados?: Json; bem_id?: string | null; criado_em?: string; atualizado_em?: string }
        Update: { dados?: Json; atualizado_em?: string }
        Relationships: [{
          foreignKeyName: "checklists_veiculos_bem_id_fkey"
          columns: ["bem_id"]
          isOneToOne: true
          referencedRelation: "bens"
          referencedColumns: ["id"]
        }]
      }
      recebimentos_veiculos_contadores: {
        Row: { ano: number; ultimo_numero: number }
        Insert: { ano: number; ultimo_numero?: number }
        Update: { ano?: number; ultimo_numero?: number }
        Relationships: []
      }
      recebimentos_veiculos: {
        Row: {
          bem_id: string
          dados: Json
          atualizado_por: string
          atualizado_em: string
          numero: number
          ano: number
          criado_em: string
        }
        Insert: {
          bem_id: string
          dados?: Json
          atualizado_por?: string
          atualizado_em?: string
          numero?: number
          ano?: number
          criado_em?: string
        }
        Update: {
          bem_id?: string
          dados?: Json
          atualizado_por?: string
          atualizado_em?: string
          numero?: number
          ano?: number
          criado_em?: string
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
      associar_checklist_veiculo: {
        Args: { _checklist_id: string; _bem_id: string }
        Returns: Json
      }
      associar_checklist_veiculo_por_red: {
        Args: { _checklist_id: string; _codigo_red: string; _sala_id?: string }
        Returns: Json
      }
      salvar_recebimento_termo: {
        Args: { _importacao_id: string; _recebedor: string; _cpf: string }
        Returns: Json
      }
      buscar_ultima_transferencia: { Args: { _codigo: string }; Returns: Json }
      can_edit: { Args: { _user_id: string }; Returns: boolean }
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
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      consultar_bens_importacao: {
        Args: { _bens: Json }
        Returns: { id: string; sala_id: string | null; codigo_red: string; sala_nome: string }[]
      }
      importar_bens_html_confirmado: {
        Args: {
          _arquivo: string
          _bens: Json
          _cabecalho: Json
          _sala_id: string
          _existentes: Json
        }
        Returns: Json
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
      importar_bens_pdf: {
        Args: { _arquivo: string; _bens: Json; _sala_id: string }
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
      transferir_bens: {
        Args: { _destino: string; _itens: Json; _pedido: string }
        Returns: Json
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
