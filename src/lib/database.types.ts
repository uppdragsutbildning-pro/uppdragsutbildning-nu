// Auto-genererad från Supabase (staging: eyksngvbrupmxpjzadqp).
// Regenerera med Supabase MCP generate_typescript_types efter varje schemaändring.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          company: string
          department: string | null
          id: string
          notes: string | null
          scheduled_start_id: string
          status: string
          student_email: string
          student_name: string
          student_phone: string
          submitted_at: string
          training_id: string
          updated_at: string
        }
        Insert: {
          company?: string
          department?: string | null
          id?: string
          notes?: string | null
          scheduled_start_id: string
          status?: string
          student_email: string
          student_name: string
          student_phone?: string
          submitted_at?: string
          training_id: string
          updated_at?: string
        }
        Update: {
          company?: string
          department?: string | null
          id?: string
          notes?: string | null
          scheduled_start_id?: string
          status?: string
          student_email?: string
          student_name?: string
          student_phone?: string
          submitted_at?: string
          training_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_scheduled_start_id_fkey"
            columns: ["scheduled_start_id"]
            isOneToOne: false
            referencedRelation: "scheduled_starts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cpi_results: {
        Row: {
          company_name: string
          company_size: string | null
          created_at: string
          esco_skills: Json | null
          freetext: Json | null
          id: string
          industry: string | null
          li_preferences: Json | null
          respondent_role: string | null
          scores: Json
          si_scores: Json | null
        }
        Insert: {
          company_name: string
          company_size?: string | null
          created_at?: string
          esco_skills?: Json | null
          freetext?: Json | null
          id?: string
          industry?: string | null
          li_preferences?: Json | null
          respondent_role?: string | null
          scores: Json
          si_scores?: Json | null
        }
        Update: {
          company_name?: string
          company_size?: string | null
          created_at?: string
          esco_skills?: Json | null
          freetext?: Json | null
          id?: string
          industry?: string | null
          li_preferences?: Json | null
          respondent_role?: string | null
          scores?: Json
          si_scores?: Json | null
        }
        Relationships: []
      }
      curriculum_modules: {
        Row: {
          created_at: string | null
          id: string
          order_index: number
          title: string
          topics: string[]
          training_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_index: number
          title: string
          topics: string[]
          training_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_index?: number
          title?: string
          topics?: string[]
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_modules_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_requests: {
        Row: {
          ai_score: string
          budget: string | null
          company: string
          contact_email: string
          contact_name: string
          contact_phone: string
          course_topic: string
          description: string
          escalated_at: string | null
          id: string
          participants_count: string
          response: string | null
          response_deadline: string | null
          status: string
          submitted_at: string
          timeline: string
          training_id: string | null
          updated_at: string
        }
        Insert: {
          ai_score?: string
          budget?: string | null
          company: string
          contact_email: string
          contact_name: string
          contact_phone?: string
          course_topic: string
          description?: string
          escalated_at?: string | null
          id?: string
          participants_count?: string
          response?: string | null
          response_deadline?: string | null
          status?: string
          submitted_at?: string
          timeline?: string
          training_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_score?: string
          budget?: string | null
          company?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          course_topic?: string
          description?: string
          escalated_at?: string | null
          id?: string
          participants_count?: string
          response?: string | null
          response_deadline?: string | null
          status?: string
          submitted_at?: string
          timeline?: string
          training_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_requests_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          message_type: string
          provider_message_id: string | null
          recipient_email: string
          related_id: string | null
          related_table: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type: string
          provider_message_id?: string | null
          recipient_email: string
          related_id?: string | null
          related_table?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          message_type?: string
          provider_message_id?: string | null
          recipient_email?: string
          related_id?: string | null
          related_table?: string | null
          status?: string
        }
        Relationships: []
      }
      marketplace_branding: {
        Row: {
          hero_image_url: string | null
          logo_url: string | null
          marketplace_id: string
          primary_color: string | null
          secondary_color: string | null
          tagline: string | null
        }
        Insert: {
          hero_image_url?: string | null
          logo_url?: string | null
          marketplace_id: string
          primary_color?: string | null
          secondary_color?: string | null
          tagline?: string | null
        }
        Update: {
          hero_image_url?: string | null
          logo_url?: string | null
          marketplace_id?: string
          primary_color?: string | null
          secondary_color?: string | null
          tagline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_branding_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: true
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_trainings: {
        Row: {
          added_at: string | null
          added_by: string | null
          id: string
          marketplace_id: string
          removed_at: string | null
          training_id: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          marketplace_id: string
          removed_at?: string | null
          training_id: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          id?: string
          marketplace_id?: string
          removed_at?: string | null
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_trainings_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trainings_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_trainings_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplaces: {
        Row: {
          access_mode: string
          created_at: string | null
          id: string
          name: string
          owner_type: string
          partner_organization_id: string | null
          provider_id: string | null
          slug: string
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          access_mode?: string
          created_at?: string | null
          id?: string
          name: string
          owner_type: string
          partner_organization_id?: string | null
          provider_id?: string | null
          slug: string
          status?: string
          type: string
          updated_at?: string | null
        }
        Update: {
          access_mode?: string
          created_at?: string | null
          id?: string
          name?: string
          owner_type?: string
          partner_organization_id?: string | null
          provider_id?: string | null
          slug?: string
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplaces_partner_organization_id_fkey"
            columns: ["partner_organization_id"]
            isOneToOne: false
            referencedRelation: "partner_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplaces_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_organizations: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          name: string
          org_number: string | null
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_number?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          provider_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          provider_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          provider_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          type: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          type: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          type?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      scheduled_starts: {
        Row: {
          admission_requirements: string | null
          application_deadline: string
          available_spots: number
          created_at: string
          id: string
          language: string
          location: string | null
          max_participants: number
          price: number
          start_date: string
          status: string
          training_id: string
          updated_at: string
        }
        Insert: {
          admission_requirements?: string | null
          application_deadline: string
          available_spots?: number
          created_at?: string
          id?: string
          language?: string
          location?: string | null
          max_participants?: number
          price?: number
          start_date: string
          status: string
          training_id: string
          updated_at?: string
        }
        Update: {
          admission_requirements?: string | null
          application_deadline?: string
          available_spots?: number
          created_at?: string
          id?: string
          language?: string
          location?: string | null
          max_participants?: number
          price?: number
          start_date?: string
          status?: string
          training_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_starts_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_faq: {
        Row: {
          answer: string
          created_at: string | null
          id: string
          order_index: number
          question: string
          training_id: string
        }
        Insert: {
          answer: string
          created_at?: string | null
          id?: string
          order_index: number
          question: string
          training_id: string
        }
        Update: {
          answer?: string
          created_at?: string | null
          id?: string
          order_index?: number
          question?: string
          training_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_faq_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          category_id: string
          contact_person_email: string | null
          contact_person_name: string | null
          contact_person_phone: string | null
          contact_person_response_time: string | null
          contact_person_title: string | null
          course_code: string | null
          created_at: string
          credits: number
          description: string
          duration: string
          esco_skills: Json | null
          featured: boolean
          format: string
          id: string
          image_url: string
          instructor_bio: string | null
          instructor_name: string | null
          instructor_title: string | null
          is_active: boolean
          is_popular: boolean
          leads: number
          learning_outcomes: string[] | null
          provider_id: string
          target_audience: string
          title: string
          training_type: string
          updated_at: string
          views: number
        }
        Insert: {
          category_id: string
          contact_person_email?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          contact_person_response_time?: string | null
          contact_person_title?: string | null
          course_code?: string | null
          created_at?: string
          credits?: number
          description?: string
          duration?: string
          esco_skills?: Json | null
          featured?: boolean
          format: string
          id?: string
          image_url?: string
          instructor_bio?: string | null
          instructor_name?: string | null
          instructor_title?: string | null
          is_active?: boolean
          is_popular?: boolean
          leads?: number
          learning_outcomes?: string[] | null
          provider_id: string
          target_audience?: string
          title: string
          training_type: string
          updated_at?: string
          views?: number
        }
        Update: {
          category_id?: string
          contact_person_email?: string | null
          contact_person_name?: string | null
          contact_person_phone?: string | null
          contact_person_response_time?: string | null
          contact_person_title?: string | null
          course_code?: string | null
          created_at?: string
          credits?: number
          description?: string
          duration?: string
          esco_skills?: Json | null
          featured?: boolean
          format?: string
          id?: string
          image_url?: string
          instructor_bio?: string | null
          instructor_name?: string | null
          instructor_title?: string | null
          is_active?: boolean
          is_popular?: boolean
          leads?: number
          learning_outcomes?: string[] | null
          provider_id?: string
          target_audience?: string
          title?: string
          training_type?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "trainings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_business_days: {
        Args: { num_days: number; start_ts: string }
        Returns: string
      }
      get_user_provider_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
