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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      entries: {
        Row: {
          content: string
          content_json: Json | null
          content_storage: string
          created_at: string
          deleted_at: string | null
          id: string
          layout: Json
          parent_id: string | null
          pinned: boolean
          properties: Json
          search_tsv: unknown
          sort_order: number | null
          share_token: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          content_json?: Json | null
          content_storage?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          layout?: Json
          parent_id?: string | null
          pinned?: boolean
          properties?: Json
          search_tsv?: unknown
          sort_order?: number | null
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          content_json?: Json | null
          content_storage?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          layout?: Json
          parent_id?: string | null
          pinned?: boolean
          properties?: Json
          search_tsv?: unknown
          sort_order?: number | null
          share_token?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "shared_entries_view"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          allow_list: string[]
          created_at: string
          id: string
          name: string
          rules: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_list?: string[]
          created_at?: string
          id?: string
          name: string
          rules?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_list?: string[]
          created_at?: string
          id?: string
          name?: string
          rules?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entry_comments: {
        Row: {
          author_id: string
          block_id: string | null
          body: string
          created_at: string
          entry_id: string
          id: string
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          block_id?: string | null
          body: string
          created_at?: string
          entry_id: string
          id?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          block_id?: string | null
          body?: string
          created_at?: string
          entry_id?: string
          id?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "shared_entries_view"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_shares: {
        Row: {
          created_at: string
          created_by: string
          entry_id: string
          id: string
          role: string
          shared_with_email: string
          shared_with_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          entry_id: string
          id?: string
          role?: string
          shared_with_email: string
          shared_with_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_id?: string
          id?: string
          role?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_shares_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_shares_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "shared_entries_view"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_versions: {
        Row: {
          author_id: string | null
          content: string
          content_json: Json | null
          created_at: string
          entry_id: string
          id: string
        }
        Insert: {
          author_id?: string | null
          content?: string
          content_json?: Json | null
          created_at?: string
          entry_id: string
          id?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          content_json?: Json | null
          created_at?: string
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "shared_entries_view"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          accent_color: string
          created_at: string
          dark_surface_shift: number
          default_content_storage: string
          display_name: string
          id: string
          light_surface_shift: number
          sidebar_open: boolean
          theme: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          accent_color?: string
          created_at?: string
          dark_surface_shift?: number
          default_content_storage?: string
          display_name?: string
          id?: string
          light_surface_shift?: number
          sidebar_open?: boolean
          theme?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          accent_color?: string
          created_at?: string
          dark_surface_shift?: number
          default_content_storage?: string
          display_name?: string
          id?: string
          light_surface_shift?: number
          sidebar_open?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      shared_entries_view: {
        Row: {
          content: string | null
          created_at: string | null
          id: string | null
          share_token: string | null
          title: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          share_token?: string | null
          title?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string | null
          share_token?: string | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_email: { Args: never; Returns: string }
      entry_owner_id: { Args: { _entry_id: string }; Returns: string }
      has_entry_share_role: {
        Args: { _entry_id: string; _roles: string[] }
        Returns: boolean
      }
      is_entry_owner: { Args: { _entry_id: string }; Returns: boolean }
      get_shared_entry: {
        Args: { _token: string }
        Returns: {
          title: string
          content: string
          created_at: string
        }[]
      }
      list_my_shares: {
        Args: Record<PropertyKey, never>
        Returns: {
          entry_id: string
          role: string
          shared_with_user_id: string | null
        }[]
      }
      fetch_share_workspace: {
        Args: { _include_deleted?: boolean }
        Returns: Json
      }
      fetch_collaborator_entries: {
        Args: { _ids: string[]; _include_deleted?: boolean }
        Returns: {
          id: string
          content: string
          content_json: Json | null
          content_storage: string
          created_at: string
          user_id: string
          pinned: boolean
          parent_id: string | null
          title: string
          layout: Json
          deleted_at: string | null
          properties: Json
          sort_order: number | null
        }[]
      }
      lookup_username: { Args: { _user_id: string }; Returns: string }
      get_user_id_by_username: { Args: { _username: string }; Returns: string }
      is_username_available: {
        Args: { _username: string; _exclude_user_id?: string }
        Returns: boolean
      }
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
