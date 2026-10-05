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
      companies: {
        Row: {
          ats_slug: string | null
          ats_type: Database["public"]["Enums"]["ats_type"]
          created_at: string
          domain: string | null
          id: string
          in_seed_list: boolean
          linkedin_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          ats_slug?: string | null
          ats_type?: Database["public"]["Enums"]["ats_type"]
          created_at?: string
          domain?: string | null
          id?: string
          in_seed_list?: boolean
          linkedin_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          ats_slug?: string | null
          ats_type?: Database["public"]["Enums"]["ats_type"]
          created_at?: string
          domain?: string | null
          id?: string
          in_seed_list?: boolean
          linkedin_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_sources: {
        Row: {
          apply_url: string | null
          company_id: string
          created_at: string
          external_id: string
          first_seen_at: string
          id: string
          is_active: boolean
          job_id: string
          last_checked_at: string
          last_seen_at: string
          source_type: Database["public"]["Enums"]["job_source_type"]
          url: string
        }
        Insert: {
          apply_url?: string | null
          company_id: string
          created_at?: string
          external_id: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          job_id: string
          last_checked_at?: string
          last_seen_at?: string
          source_type: Database["public"]["Enums"]["job_source_type"]
          url: string
        }
        Update: {
          apply_url?: string | null
          company_id?: string
          created_at?: string
          external_id?: string
          first_seen_at?: string
          id?: string
          is_active?: boolean
          job_id?: string
          last_checked_at?: string
          last_seen_at?: string
          source_type?: Database["public"]["Enums"]["job_source_type"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sources_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          ai_normalized_at: string | null
          closed_at: string | null
          company_id: string
          content_hash: string | null
          created_at: string
          deadline: string | null
          dedupe_key: string
          description: string | null
          duration: string | null
          eligibility_json: Json
          employment_type: Database["public"]["Enums"]["employment_type"]
          field: Database["public"]["Enums"]["job_field"]
          first_seen_at: string
          id: string
          last_seen_at: string
          locations: string[]
          locations_search: string
          pay_currency: string | null
          pay_max: number | null
          pay_min: number | null
          pay_period: string | null
          pay_text: string | null
          posted_at: string
          posted_at_source: Database["public"]["Enums"]["posted_at_source"]
          remote_type: Database["public"]["Enums"]["remote_type"]
          status: Database["public"]["Enums"]["job_status"]
          summary: string | null
          terms: string[]
          title: string
          updated_at: string
        }
        Insert: {
          ai_normalized_at?: string | null
          closed_at?: string | null
          company_id: string
          content_hash?: string | null
          created_at?: string
          deadline?: string | null
          dedupe_key: string
          description?: string | null
          duration?: string | null
          eligibility_json?: Json
          employment_type?: Database["public"]["Enums"]["employment_type"]
          field?: Database["public"]["Enums"]["job_field"]
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locations?: string[]
          locations_search?: string
          pay_currency?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string | null
          pay_text?: string | null
          posted_at?: string
          posted_at_source?: Database["public"]["Enums"]["posted_at_source"]
          remote_type?: Database["public"]["Enums"]["remote_type"]
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string | null
          terms?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          ai_normalized_at?: string | null
          closed_at?: string | null
          company_id?: string
          content_hash?: string | null
          created_at?: string
          deadline?: string | null
          dedupe_key?: string
          description?: string | null
          duration?: string | null
          eligibility_json?: Json
          employment_type?: Database["public"]["Enums"]["employment_type"]
          field?: Database["public"]["Enums"]["job_field"]
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          locations?: string[]
          locations_search?: string
          pay_currency?: string | null
          pay_max?: number | null
          pay_min?: number | null
          pay_period?: string | null
          pay_text?: string | null
          posted_at?: string
          posted_at_source?: Database["public"]["Enums"]["posted_at_source"]
          remote_type?: Database["public"]["Enums"]["remote_type"]
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string | null
          terms?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          grad_date: string | null
          major: string | null
          preferences: Json
          school: string | null
          updated_at: string
          user_id: string
          work_auth: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          grad_date?: string | null
          major?: string | null
          preferences?: Json
          school?: string | null
          updated_at?: string
          user_id: string
          work_auth?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string | null
          grad_date?: string | null
          major?: string | null
          preferences?: Json
          school?: string | null
          updated_at?: string
          user_id?: string
          work_auth?: string | null
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
      ats_type: "greenhouse" | "lever" | "ashby" | "workday" | "other"
      employment_type: "internship" | "co_op" | "new_grad" | "program"
      job_field:
        | "software"
        | "data_ml"
        | "hardware"
        | "product"
        | "design"
        | "quant_finance"
        | "business"
        | "research"
        | "other"
      job_source_type: "greenhouse" | "lever" | "ashby" | "simplify" | "manual"
      job_status: "open" | "closed"
      posted_at_source: "source" | "first_seen"
      remote_type: "remote" | "hybrid" | "onsite" | "unknown"
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
      ats_type: ["greenhouse", "lever", "ashby", "workday", "other"],
      employment_type: ["internship", "co_op", "new_grad", "program"],
      job_field: [
        "software",
        "data_ml",
        "hardware",
        "product",
        "design",
        "quant_finance",
        "business",
        "research",
        "other",
      ],
      job_source_type: ["greenhouse", "lever", "ashby", "simplify", "manual"],
      job_status: ["open", "closed"],
      posted_at_source: ["source", "first_seen"],
      remote_type: ["remote", "hybrid", "onsite", "unknown"],
    },
  },
} as const
