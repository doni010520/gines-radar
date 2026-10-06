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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_referrals: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          matched_property_id: string | null
          raw: Json
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          matched_property_id?: string | null
          raw: Json
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          matched_property_id?: string | null
          raw?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ad_referrals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_referrals_matched_property_id_fkey"
            columns: ["matched_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_settings: {
        Row: {
          ai_disclosure: string | null
          assistant_name: string | null
          extra_instructions: string | null
          greeting: string | null
          handoff_message: string | null
          id: boolean
          identity: string | null
          optout_message: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          ai_disclosure?: string | null
          assistant_name?: string | null
          extra_instructions?: string | null
          greeting?: string | null
          handoff_message?: string | null
          id?: boolean
          identity?: string | null
          optout_message?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          ai_disclosure?: string | null
          assistant_name?: string | null
          extra_instructions?: string | null
          greeting?: string | null
          handoff_message?: string | null
          id?: boolean
          identity?: string | null
          optout_message?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_logs: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          meta: Json | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: number
          level: string
          message: string
          meta?: Json | null
          source: string
        }
        Update: {
          created_at?: string
          id?: number
          level?: string
          message?: string
          meta?: Json | null
          source?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          name: string | null
          name_confirmed: boolean
          phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          name_confirmed?: boolean
          phone: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          name_confirmed?: boolean
          phone?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          assigned_user_id: string | null
          bot_lock_until: string | null
          closed_at: string | null
          contact_id: string
          created_at: string
          followup_anchor_at: string | null
          followup_last_touch_at: string | null
          followup_last_touch_hours: number
          followup_next_touch_id: string | null
          followup_stage: number
          handoff_notified_at: string | null
          id: string
          last_followup_shift: string | null
          last_message_at: string
          material_sent_at: string | null
          next_followup_at: string | null
          opt_out: boolean
          property_id: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          summary: string | null
          tags: string[]
          visit_offered: boolean
          visit_offers_count: number
        }
        Insert: {
          ai_enabled?: boolean
          assigned_user_id?: string | null
          bot_lock_until?: string | null
          closed_at?: string | null
          contact_id: string
          created_at?: string
          followup_anchor_at?: string | null
          followup_last_touch_at?: string | null
          followup_last_touch_hours?: number
          followup_next_touch_id?: string | null
          followup_stage?: number
          handoff_notified_at?: string | null
          id?: string
          last_followup_shift?: string | null
          last_message_at?: string
          material_sent_at?: string | null
          next_followup_at?: string | null
          opt_out?: boolean
          property_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          summary?: string | null
          tags?: string[]
          visit_offered?: boolean
          visit_offers_count?: number
        }
        Update: {
          ai_enabled?: boolean
          assigned_user_id?: string | null
          bot_lock_until?: string | null
          closed_at?: string | null
          contact_id?: string
          created_at?: string
          followup_anchor_at?: string | null
          followup_last_touch_at?: string | null
          followup_last_touch_hours?: number
          followup_next_touch_id?: string | null
          followup_stage?: number
          handoff_notified_at?: string | null
          id?: string
          last_followup_shift?: string | null
          last_message_at?: string
          material_sent_at?: string | null
          next_followup_at?: string | null
          opt_out?: boolean
          property_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          summary?: string | null
          tags?: string[]
          visit_offered?: boolean
          visit_offers_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_followup_next_touch_id_fkey"
            columns: ["followup_next_touch_id"]
            isOneToOne: false
            referencedRelation: "followup_touches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_media: {
        Row: {
          file_name: string | null
          media_type: string
          storage_path: string
          touch: number
          updated_at: string
          url: string
        }
        Insert: {
          file_name?: string | null
          media_type: string
          storage_path: string
          touch: number
          updated_at?: string
          url: string
        }
        Update: {
          file_name?: string | null
          media_type?: string
          storage_path?: string
          touch?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      followup_settings: {
        Row: {
          apply_final_tag: boolean
          final_tag: string
          id: boolean
          updated_at: string
          window_days: number[]
          window_end_min: number
          window_start_min: number
        }
        Insert: {
          apply_final_tag?: boolean
          final_tag?: string
          id?: boolean
          updated_at?: string
          window_days?: number[]
          window_end_min?: number
          window_start_min?: number
        }
        Update: {
          apply_final_tag?: boolean
          final_tag?: string
          id?: boolean
          updated_at?: string
          window_days?: number[]
          window_end_min?: number
          window_start_min?: number
        }
        Relationships: []
      }
      followup_touches: {
        Row: {
          active: boolean
          created_at: string
          delay_hours: number
          fallback_text: string | null
          id: string
          media_file_name: string | null
          media_kind: string | null
          media_path: string | null
          media_url: string | null
          objective: string
          position: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          delay_hours: number
          fallback_text?: string | null
          id?: string
          media_file_name?: string | null
          media_kind?: string | null
          media_path?: string | null
          media_url?: string | null
          objective: string
          position?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          delay_hours?: number
          fallback_text?: string | null
          id?: string
          media_file_name?: string | null
          media_kind?: string | null
          media_path?: string | null
          media_url?: string | null
          objective?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          id: string
          is_internal: boolean
          media_type: string | null
          media_url: string | null
          status: Database["public"]["Enums"]["message_status"]
          tool_calls_json: Json | null
          tool_name: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          is_internal?: boolean
          media_type?: string | null
          media_url?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          tool_calls_json?: Json | null
          tool_name?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          is_internal?: boolean
          media_type?: string | null
          media_url?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          tool_calls_json?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      properties: {
        Row: {
          ad_ref_titles: string[]
          ad_source_ids: string[]
          address: string | null
          area_built: number | null
          area_land: number | null
          bedrooms: number | null
          city: string | null
          condo_fee: number | null
          copy: string
          created_at: string
          created_by: string | null
          features: string[]
          highlight_tecnico: string | null
          highlight_visual: string | null
          id: string
          iptu: number | null
          kind: string | null
          kind_synonyms: string[]
          neighborhood: string | null
          parking_spots: number | null
          pdf_url: string | null
          photo_urls: string[]
          price: number | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["property_status"]
          suites: number | null
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ad_ref_titles?: string[]
          ad_source_ids?: string[]
          address?: string | null
          area_built?: number | null
          area_land?: number | null
          bedrooms?: number | null
          city?: string | null
          condo_fee?: number | null
          copy: string
          created_at?: string
          created_by?: string | null
          features?: string[]
          highlight_tecnico?: string | null
          highlight_visual?: string | null
          id?: string
          iptu?: number | null
          kind?: string | null
          kind_synonyms?: string[]
          neighborhood?: string | null
          parking_spots?: number | null
          pdf_url?: string | null
          photo_urls?: string[]
          price?: number | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suites?: number | null
          title: string
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ad_ref_titles?: string[]
          ad_source_ids?: string[]
          address?: string | null
          area_built?: number | null
          area_land?: number | null
          bedrooms?: number | null
          city?: string | null
          condo_fee?: number | null
          copy?: string
          created_at?: string
          created_by?: string | null
          features?: string[]
          highlight_tecnico?: string | null
          highlight_visual?: string | null
          id?: string
          iptu?: number | null
          kind?: string | null
          kind_synonyms?: string[]
          neighborhood?: string | null
          parking_spots?: number | null
          pdf_url?: string | null
          photo_urls?: string[]
          price?: number | null
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["property_status"]
          suites?: number | null
          title?: string
          type?: Database["public"]["Enums"]["property_type"]
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_anuncios: {
        Row: {
          alertado_em: string | null
          anunciante: string | null
          area: number | null
          bairro_id: string | null
          criado_no_portal: string | null
          descartado: boolean
          descricao: string | null
          id: string
          motivo: string | null
          oportunidade: boolean
          palavras: string[]
          pct_abaixo: number | null
          portal: string
          preco: number | null
          preco_m2: number | null
          tipo: string | null
          titulo: string | null
          url: string | null
          visto_em: string
        }
        Insert: {
          alertado_em?: string | null
          anunciante?: string | null
          area?: number | null
          bairro_id?: string | null
          criado_no_portal?: string | null
          descartado?: boolean
          descricao?: string | null
          id: string
          motivo?: string | null
          oportunidade?: boolean
          palavras?: string[]
          pct_abaixo?: number | null
          portal: string
          preco?: number | null
          preco_m2?: number | null
          tipo?: string | null
          titulo?: string | null
          url?: string | null
          visto_em?: string
        }
        Update: {
          alertado_em?: string | null
          anunciante?: string | null
          area?: number | null
          bairro_id?: string | null
          criado_no_portal?: string | null
          descartado?: boolean
          descricao?: string | null
          id?: string
          motivo?: string | null
          oportunidade?: boolean
          palavras?: string[]
          pct_abaixo?: number | null
          portal?: string
          preco?: number | null
          preco_m2?: number | null
          tipo?: string | null
          titulo?: string | null
          url?: string | null
          visto_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_anuncios_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "radar_bairros"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_bairros: {
        Row: {
          aprendido_em: string | null
          ativo: boolean
          cidade: string
          created_at: string
          estado: string
          id: string
          nome: string
          pct_abaixo_media: number
          teto_m2: number | null
          tipos: string[]
          ultima_varredura: string | null
          zona: string
        }
        Insert: {
          aprendido_em?: string | null
          ativo?: boolean
          cidade?: string
          created_at?: string
          estado?: string
          id?: string
          nome: string
          pct_abaixo_media?: number
          teto_m2?: number | null
          tipos?: string[]
          ultima_varredura?: string | null
          zona?: string
        }
        Update: {
          aprendido_em?: string | null
          ativo?: boolean
          cidade?: string
          created_at?: string
          estado?: string
          id?: string
          nome?: string
          pct_abaixo_media?: number
          teto_m2?: number | null
          tipos?: string[]
          ultima_varredura?: string | null
          zona?: string
        }
        Relationships: []
      }
      radar_config: {
        Row: {
          alerta_numero: string | null
          ativo: boolean
          id: boolean
          intervalo_min: number
          updated_at: string
        }
        Insert: {
          alerta_numero?: string | null
          ativo?: boolean
          id?: boolean
          intervalo_min?: number
          updated_at?: string
        }
        Update: {
          alerta_numero?: string | null
          ativo?: boolean
          id?: boolean
          intervalo_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      radar_logs: {
        Row: {
          created_at: string
          id: number
          level: string
          message: string
          meta: Json | null
        }
        Insert: {
          created_at?: string
          id?: never
          level: string
          message: string
          meta?: Json | null
        }
        Update: {
          created_at?: string
          id?: never
          level?: string
          message?: string
          meta?: Json | null
        }
        Relationships: []
      }
      radar_palavras: {
        Row: {
          ativo: boolean
          categoria: string
          id: string
          termo: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          id?: string
          termo: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          id?: string
          termo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_imoveis_fuzzy: {
        Args: {
          p_localizacao?: string
          p_preco_max?: number
          p_preco_min?: number
          p_quartos_min?: number
          p_tipo?: string
          p_tipo_imovel?: string
        }
        Returns: {
          ad_ref_titles: string[]
          ad_source_ids: string[]
          address: string | null
          area_built: number | null
          area_land: number | null
          bedrooms: number | null
          city: string | null
          condo_fee: number | null
          copy: string
          created_at: string
          created_by: string | null
          features: string[]
          highlight_tecnico: string | null
          highlight_visual: string | null
          id: string
          iptu: number | null
          kind: string | null
          kind_synonyms: string[]
          neighborhood: string | null
          parking_spots: number | null
          pdf_url: string | null
          photo_urls: string[]
          price: number | null
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["property_status"]
          suites: number | null
          title: string
          type: Database["public"]["Enums"]["property_type"]
          updated_at: string
          video_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "properties"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      conversation_status: "bot" | "queued" | "open" | "closed"
      message_direction: "in" | "out"
      message_status: "sent" | "delivered" | "read" | "failed"
      property_status: "ativo" | "reservado" | "vendido" | "inativo"
      property_type: "venda" | "locacao"
      user_role: "admin" | "corretor"
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
      conversation_status: ["bot", "queued", "open", "closed"],
      message_direction: ["in", "out"],
      message_status: ["sent", "delivered", "read", "failed"],
      property_status: ["ativo", "reservado", "vendido", "inativo"],
      property_type: ["venda", "locacao"],
      user_role: ["admin", "corretor"],
    },
  },
} as const
