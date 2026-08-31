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
      ew_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon_key: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon_key?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ew_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ew_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_data_sources: {
        Row: {
          attribution_text: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          license_name: string | null
          license_url: string | null
          name: string
          source_type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          attribution_text?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          license_name?: string | null
          license_url?: string | null
          name: string
          source_type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          attribution_text?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          license_name?: string | null
          license_url?: string | null
          name?: string
          source_type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      ew_favorites: {
        Row: {
          created_at: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ew_favorites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "ew_places"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_ingestion_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_count: number
          id: string
          metadata: Json | null
          records_inserted: number
          records_received: number
          records_rejected: number
          records_unchanged: number
          records_updated: number
          records_valid: number
          region_code: string | null
          source_id: string
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          metadata?: Json | null
          records_inserted?: number
          records_received?: number
          records_rejected?: number
          records_unchanged?: number
          records_updated?: number
          records_valid?: number
          region_code?: string | null
          source_id: string
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_count?: number
          id?: string
          metadata?: Json | null
          records_inserted?: number
          records_received?: number
          records_rejected?: number
          records_unchanged?: number
          records_updated?: number
          records_valid?: number
          region_code?: string | null
          source_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ew_ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ew_data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_place_import_staging: {
        Row: {
          address: string | null
          category_source_code: string | null
          city: string | null
          country_code: string | null
          created_at: string
          currency_code: string | null
          dedupe_key: string | null
          district: string | null
          id: string
          ingestion_run_id: string
          latitude: number | null
          longitude: number | null
          name: string | null
          normalized_name: string | null
          phone_number: string | null
          processed_at: string | null
          region: string | null
          source_id: string
          source_payload: Json | null
          source_place_id: string | null
          source_updated_at: string | null
          timezone: string | null
          validation_errors: Json | null
          validation_status: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          category_source_code?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          dedupe_key?: string | null
          district?: string | null
          id?: string
          ingestion_run_id: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          normalized_name?: string | null
          phone_number?: string | null
          processed_at?: string | null
          region?: string | null
          source_id: string
          source_payload?: Json | null
          source_place_id?: string | null
          source_updated_at?: string | null
          timezone?: string | null
          validation_errors?: Json | null
          validation_status?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          category_source_code?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          dedupe_key?: string | null
          district?: string | null
          id?: string
          ingestion_run_id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          normalized_name?: string | null
          phone_number?: string | null
          processed_at?: string | null
          region?: string | null
          source_id?: string
          source_payload?: Json | null
          source_place_id?: string | null
          source_updated_at?: string | null
          timezone?: string | null
          validation_errors?: Json | null
          validation_status?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ew_place_import_staging_run_source_fkey"
            columns: ["ingestion_run_id", "source_id"]
            isOneToOne: false
            referencedRelation: "ew_ingestion_runs"
            referencedColumns: ["id", "source_id"]
          },
          {
            foreignKeyName: "ew_place_import_staging_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ew_data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_place_prices: {
        Row: {
          average_per_person_minor: number | null
          confidence_score: number | null
          created_at: string
          currency_code: string
          id: string
          last_verified_at: string | null
          max_amount_minor: number | null
          min_amount_minor: number | null
          place_id: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          average_per_person_minor?: number | null
          confidence_score?: number | null
          created_at?: string
          currency_code: string
          id?: string
          last_verified_at?: string | null
          max_amount_minor?: number | null
          min_amount_minor?: number | null
          place_id: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          average_per_person_minor?: number | null
          confidence_score?: number | null
          created_at?: string
          currency_code?: string
          id?: string
          last_verified_at?: string | null
          max_amount_minor?: number | null
          min_amount_minor?: number | null
          place_id?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ew_place_prices_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "ew_places"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_place_tags: {
        Row: {
          confidence_score: number
          created_at: string
          place_id: string
          source: string
          tag_id: string
          verified_at: string | null
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          place_id: string
          source: string
          tag_id: string
          verified_at?: string | null
        }
        Update: {
          confidence_score?: number
          created_at?: string
          place_id?: string
          source?: string
          tag_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ew_place_tags_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "ew_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ew_place_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "ew_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_places: {
        Row: {
          address: string | null
          category_id: string | null
          city: string | null
          country_code: string
          created_at: string
          default_currency: string
          description: string | null
          district: string | null
          id: string
          location: unknown
          name: string
          phone_number: string | null
          region: string | null
          source: string
          source_place_id: string
          source_updated_at: string | null
          status: string
          timezone: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          category_id?: string | null
          city?: string | null
          country_code: string
          created_at?: string
          default_currency: string
          description?: string | null
          district?: string | null
          id?: string
          location: unknown
          name: string
          phone_number?: string | null
          region?: string | null
          source: string
          source_place_id: string
          source_updated_at?: string | null
          status?: string
          timezone: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          category_id?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          default_currency?: string
          description?: string | null
          district?: string | null
          id?: string
          location?: unknown
          name?: string
          phone_number?: string | null
          region?: string | null
          source?: string
          source_place_id?: string
          source_updated_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ew_places_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ew_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ew_profiles: {
        Row: {
          country_code: string | null
          created_at: string
          currency_code: string | null
          display_name: string | null
          id: string
          locale: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          display_name?: string | null
          id: string
          locale?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          currency_code?: string | null
          display_name?: string | null
          id?: string
          locale?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ew_tags: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ew_user_preferences: {
        Row: {
          created_at: string
          id: string
          preference_type: string
          preference_value: string
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          preference_type: string
          preference_value: string
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          preference_type?: string
          preference_value?: string
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
