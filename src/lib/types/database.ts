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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bdi_settings: {
        Row: {
          admin_overhead: number | null
          commercial_overhead: number | null
          created_at: string | null
          financial_overhead: number | null
          id: string
          max_markup: number | null
          min_markup: number | null
          profit_margin: number | null
          tax_cofins: number | null
          tax_icms: number | null
          tax_ipi: number | null
          tax_iss: number | null
          tax_pis: number | null
          tenant_id: string
          updated_at: string | null
          use_compound_bdi: boolean | null
        }
        Insert: {
          admin_overhead?: number | null
          commercial_overhead?: number | null
          created_at?: string | null
          financial_overhead?: number | null
          id?: string
          max_markup?: number | null
          min_markup?: number | null
          profit_margin?: number | null
          tax_cofins?: number | null
          tax_icms?: number | null
          tax_ipi?: number | null
          tax_iss?: number | null
          tax_pis?: number | null
          tenant_id: string
          updated_at?: string | null
          use_compound_bdi?: boolean | null
        }
        Update: {
          admin_overhead?: number | null
          commercial_overhead?: number | null
          created_at?: string | null
          financial_overhead?: number | null
          id?: string
          max_markup?: number | null
          min_markup?: number | null
          profit_margin?: number | null
          tax_cofins?: number | null
          tax_icms?: number | null
          tax_ipi?: number | null
          tax_iss?: number | null
          tax_pis?: number | null
          tenant_id?: string
          updated_at?: string | null
          use_compound_bdi?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bdi_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_forecasts: {
        Row: {
          actual_value: number | null
          confidence_score: number | null
          created_at: string | null
          forecast_date: string
          forecast_type: string
          id: string
          model_version: string | null
          predicted_value: number
          tenant_id: string
        }
        Insert: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string | null
          forecast_date: string
          forecast_type: string
          id?: string
          model_version?: string | null
          predicted_value: number
          tenant_id: string
        }
        Update: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string | null
          forecast_date?: string
          forecast_type?: string
          id?: string
          model_version?: string | null
          predicted_value?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_forecasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_insights: {
        Row: {
          analysis_period: string | null
          analyzed_at: string | null
          created_at: string | null
          description: string
          id: string
          insight_type: string
          is_dismissed: boolean | null
          is_read: boolean | null
          metrics: Json | null
          priority: string | null
          recommendation: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          analysis_period?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          description: string
          id?: string
          insight_type: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metrics?: Json | null
          priority?: string | null
          recommendation?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          analysis_period?: string | null
          analyzed_at?: string | null
          created_at?: string | null
          description?: string
          id?: string
          insight_type?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          metrics?: Json | null
          priority?: string | null
          recommendation?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      board_columns: {
        Row: {
          board_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          board_id: string
          joined_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          board_id: string
          joined_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          board_id?: string
          joined_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_kpis: {
        Row: {
          created_at: string | null
          current_value: number | null
          id: string
          kpi_category: string | null
          kpi_name: string
          month: number
          target_value: number
          tenant_id: string
          unit: string | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          current_value?: number | null
          id?: string
          kpi_category?: string | null
          kpi_name: string
          month: number
          target_value: number
          tenant_id: string
          unit?: string | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          current_value?: number | null
          id?: string
          kpi_category?: string | null
          kpi_name?: string
          month?: number
          target_value?: number
          tenant_id?: string
          unit?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_kpis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          cnpj: string | null
          company_name: string
          created_at: string | null
          das_aliquot: number | null
          default_delivery_days: number | null
          default_ncm: string | null
          default_payment_terms: string | null
          document_footer: string | null
          document_header: string | null
          email: string | null
          id: string
          logo_url: string | null
          municipal_registration: string | null
          phone: string | null
          state_registration: string | null
          tax_regime: string | null
          tenant_id: string
          trade_name: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cnpj?: string | null
          company_name: string
          created_at?: string | null
          das_aliquot?: number | null
          default_delivery_days?: number | null
          default_ncm?: string | null
          default_payment_terms?: string | null
          document_footer?: string | null
          document_header?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          municipal_registration?: string | null
          phone?: string | null
          state_registration?: string | null
          tax_regime?: string | null
          tenant_id: string
          trade_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          cnpj?: string | null
          company_name?: string
          created_at?: string | null
          das_aliquot?: number | null
          default_delivery_days?: number | null
          default_ncm?: string | null
          default_payment_terms?: string | null
          document_footer?: string | null
          document_header?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          municipal_registration?: string | null
          phone?: string | null
          state_registration?: string | null
          tax_regime?: string | null
          tenant_id?: string
          trade_name?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      epics: {
        Row: {
          board_id: string
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_default: boolean
          sort_order: number
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          board_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_default?: boolean
          sort_order?: number
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          board_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_default?: boolean
          sort_order?: number
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "epics_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          id: string
          items: Json | null
          notes: string | null
          purchase_order_id: string
          receipt_date: string
          receipt_number: string
          received_by: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_id: string
          receipt_date?: string
          receipt_number: string
          received_by?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_id?: string
          receipt_date?: string
          receipt_number?: string
          received_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          is_recurring: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          board_id: string
          color: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          board_id: string
          color?: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          board_id?: string
          color?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      ncm_tax_benefits: {
        Row: {
          benefit_type: string
          created_at: string | null
          description: string | null
          effective_rate: number | null
          id: string
          ncm: string
          original_rate: number | null
          requirements: string | null
          savings_estimate: number | null
          tax_affected: string | null
          tenant_id: string
        }
        Insert: {
          benefit_type: string
          created_at?: string | null
          description?: string | null
          effective_rate?: number | null
          id?: string
          ncm: string
          original_rate?: number | null
          requirements?: string | null
          savings_estimate?: number | null
          tax_affected?: string | null
          tenant_id: string
        }
        Update: {
          benefit_type?: string
          created_at?: string | null
          description?: string | null
          effective_rate?: number | null
          id?: string
          ncm?: string
          original_rate?: number | null
          requirements?: string | null
          savings_estimate?: number | null
          tax_affected?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ncm_tax_benefits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_lines: {
        Row: {
          created_at: string
          id: string
          line_id: string
          tenant_id: string
          user_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_id: string
          tenant_id: string
          user_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          line_id?: string
          tenant_id?: string
          user_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_lines_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_lines_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          actual_hours: number | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string
          estimated_hours: number | null
          id: string
          item_number: number | null
          line_id: string | null
          notes: string | null
          order_id: string
          pcp_deadline: string | null
          product_id: string | null
          production_end: string | null
          production_start: string | null
          quantity: number
          status: string
          tenant_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description: string
          estimated_hours?: number | null
          id?: string
          item_number?: number | null
          line_id?: string | null
          notes?: string | null
          order_id: string
          pcp_deadline?: string | null
          product_id?: string | null
          production_end?: string | null
          production_start?: string | null
          quantity?: number
          status?: string
          tenant_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string
          estimated_hours?: number | null
          id?: string
          item_number?: number | null
          line_id?: string | null
          notes?: string | null
          order_id?: string
          pcp_deadline?: string | null
          product_id?: string | null
          production_end?: string | null
          production_start?: string | null
          quantity?: number
          status?: string
          tenant_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_consents: {
        Row: {
          accepted_at: string | null
          id: string
          ip_address: string | null
          tenant_id: string
          user_agent: string | null
          user_profile_id: string
          version: string | null
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          ip_address?: string | null
          tenant_id: string
          user_agent?: string | null
          user_profile_id: string
          version?: string | null
        }
        Update: {
          accepted_at?: string | null
          id?: string
          ip_address?: string | null
          tenant_id?: string
          user_agent?: string | null
          user_profile_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privacy_consents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_consents_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_components: {
        Row: {
          component_product_id: string | null
          created_at: string
          id: string
          is_labor: boolean
          parent_product_id: string
          quantity: number
          tenant_id: string
          unit_cost: number | null
          updated_at: string
          work_center_id: string | null
        }
        Insert: {
          component_product_id?: string | null
          created_at?: string
          id?: string
          is_labor?: boolean
          parent_product_id: string
          quantity: number
          tenant_id: string
          unit_cost?: number | null
          updated_at?: string
          work_center_id?: string | null
        }
        Update: {
          component_product_id?: string | null
          created_at?: string
          id?: string
          is_labor?: boolean
          parent_product_id?: string
          quantity?: number
          tenant_id?: string
          unit_cost?: number | null
          updated_at?: string
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_components_component_product_id_fkey"
            columns: ["component_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_components_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_families: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_families_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_finishes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          material_id: string | null
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          material_id?: string | null
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          material_id?: string | null
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_finishes_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "product_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_finishes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_materials: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prefixes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prefixes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_subfamilies: {
        Row: {
          code: string
          created_at: string
          description: string | null
          family_id: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          family_id: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          family_id?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_subfamilies_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_subfamilies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_lines: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          client_document: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          delivery_deadline: string | null
          description: string | null
          finished_at: string | null
          folder_path: string | null
          id: string
          notes: string | null
          order_number: string
          pcp_deadline: string | null
          pdf_path: string | null
          production_deadline: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_document?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_deadline?: string | null
          description?: string | null
          finished_at?: string | null
          folder_path?: string | null
          id?: string
          notes?: string | null
          order_number: string
          pcp_deadline?: string | null
          pdf_path?: string | null
          production_deadline?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_document?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          delivery_deadline?: string | null
          description?: string | null
          finished_at?: string | null
          folder_path?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          pcp_deadline?: string | null
          pdf_path?: string | null
          production_deadline?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string | null
          cost_price: number
          created_at: string
          custom_profit_margin: number | null
          custom_tax_rate: number | null
          description: string | null
          family_id: string | null
          finish_id: string | null
          has_composition: boolean
          id: string
          is_active: boolean
          material_id: string | null
          name: string
          ncm: string | null
          prefix_id: string | null
          selling_price: number
          subfamily_id: string | null
          technical_code: string
          technical_description: string | null
          tenant_id: string
          type: string
          unit: string | null
          updated_at: string
          use_custom_bdi: boolean | null
        }
        Insert: {
          code?: string | null
          cost_price?: number
          created_at?: string
          custom_profit_margin?: number | null
          custom_tax_rate?: number | null
          description?: string | null
          family_id?: string | null
          finish_id?: string | null
          has_composition?: boolean
          id?: string
          is_active?: boolean
          material_id?: string | null
          name: string
          ncm?: string | null
          prefix_id?: string | null
          selling_price?: number
          subfamily_id?: string | null
          technical_code: string
          technical_description?: string | null
          tenant_id: string
          type?: string
          unit?: string | null
          updated_at?: string
          use_custom_bdi?: boolean | null
        }
        Update: {
          code?: string | null
          cost_price?: number
          created_at?: string
          custom_profit_margin?: number | null
          custom_tax_rate?: number | null
          description?: string | null
          family_id?: string | null
          finish_id?: string | null
          has_composition?: boolean
          id?: string
          is_active?: boolean
          material_id?: string | null
          name?: string
          ncm?: string | null
          prefix_id?: string | null
          selling_price?: number
          subfamily_id?: string | null
          technical_code?: string
          technical_description?: string | null
          tenant_id?: string
          type?: string
          unit?: string | null
          updated_at?: string
          use_custom_bdi?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "product_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_finish_id_fkey"
            columns: ["finish_id"]
            isOneToOne: false
            referencedRelation: "product_finishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "product_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_prefix_id_fkey"
            columns: ["prefix_id"]
            isOneToOne: false
            referencedRelation: "product_prefixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subfamily_id_fkey"
            columns: ["subfamily_id"]
            isOneToOne: false
            referencedRelation: "product_subfamilies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          product_id: string | null
          production_item_id: string | null
          production_order_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          tenant_id: string
          total_price: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          production_item_id?: string | null
          production_order_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          tenant_id: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          production_item_id?: string | null
          production_order_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          tenant_id?: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_production_item_id_fkey"
            columns: ["production_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          discount: number
          expected_delivery: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          order_date: string
          po_number: string
          requested_by: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          expected_delivery?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          po_number: string
          requested_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          expected_delivery?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          po_number?: string
          requested_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          quote_id: string
          tenant_id: string
          total_price: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          tenant_id: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          tenant_id?: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          base_cost: number | null
          bdi_percentage: number | null
          bdi_value: number | null
          client_document: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          converted_to_sale_id: string | null
          created_at: string
          created_by: string | null
          discount: number
          id: string
          notes: string | null
          quote_date: string
          quote_number: string
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          base_cost?: number | null
          bdi_percentage?: number | null
          bdi_value?: number | null
          client_document?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          converted_to_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          notes?: string | null
          quote_date?: string
          quote_number: string
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          base_cost?: number | null
          bdi_percentage?: number | null
          bdi_value?: number | null
          client_document?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          converted_to_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          id?: string
          notes?: string | null
          quote_date?: string
          quote_number?: string
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_to_sale_fk"
            columns: ["converted_to_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          client_document: string | null
          client_name: string | null
          created_at: string
          current_amount: number
          description: string | null
          discount_amount: number
          document_number: string | null
          due_date: string
          id: string
          interest_amount: number
          issue_date: string
          notes: string | null
          original_amount: number
          paid_amount: number
          payment_date: string | null
          sales_order_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_document?: string | null
          client_name?: string | null
          created_at?: string
          current_amount: number
          description?: string | null
          discount_amount?: number
          document_number?: string | null
          due_date: string
          id?: string
          interest_amount?: number
          issue_date?: string
          notes?: string | null
          original_amount: number
          paid_amount?: number
          payment_date?: string | null
          sales_order_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_document?: string | null
          client_name?: string | null
          created_at?: string
          current_amount?: number
          description?: string | null
          discount_amount?: number
          document_number?: string | null
          due_date?: string
          id?: string
          interest_amount?: number
          issue_date?: string
          notes?: string | null
          original_amount?: number
          paid_amount?: number
          payment_date?: string | null
          sales_order_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          achieved_amount: number
          created_at: string
          goal_amount: number
          id: string
          month: number
          notes: string | null
          tenant_id: string
          updated_at: string
          user_profile_id: string | null
          year: number
        }
        Insert: {
          achieved_amount?: number
          created_at?: string
          goal_amount: number
          id?: string
          month: number
          notes?: string | null
          tenant_id: string
          updated_at?: string
          user_profile_id?: string | null
          year: number
        }
        Update: {
          achieved_amount?: number
          created_at?: string
          goal_amount?: number
          id?: string
          month?: number
          notes?: string | null
          tenant_id?: string
          updated_at?: string
          user_profile_id?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          product_id: string | null
          profit: number | null
          quantity: number
          sales_order_id: string
          tenant_id: string
          total_cost: number | null
          total_price: number
          unit: string
          unit_cost: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          profit?: number | null
          quantity?: number
          sales_order_id: string
          tenant_id: string
          total_cost?: number | null
          total_price?: number
          unit?: string
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          profit?: number | null
          quantity?: number
          sales_order_id?: string
          tenant_id?: string
          total_cost?: number | null
          total_price?: number
          unit?: string
          unit_cost?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          actual_delivery: string | null
          client_address: string | null
          client_document: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string | null
          discount: number
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          order_number: string
          payment_days_between_installments: number
          payment_days_to_first_due: number
          payment_installments: number
          production_order_id: string | null
          quote_id: string | null
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number: string
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          production_order_id?: string | null
          quote_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          order_number?: string
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          production_order_id?: string | null
          quote_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          code: string
          contact_person: string | null
          created_at: string
          delivery_terms: string | null
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          code: string
          contact_person?: string | null
          created_at?: string
          delivery_terms?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string
          delivery_terms?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          task_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          task_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          task_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          label_id: string
          task_id: string
        }
        Insert: {
          label_id: string
          task_id: string
        }
        Update: {
          label_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area_id: string | null
          assignee_id: string | null
          board_id: string
          column_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          epic_id: string | null
          external_ref_id: string | null
          external_ref_type: string | null
          id: string
          is_completed: boolean | null
          priority: string | null
          sort_order: number
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          assignee_id?: string | null
          board_id: string
          column_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          external_ref_id?: string | null
          external_ref_type?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string | null
          sort_order?: number
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          assignee_id?: string | null
          board_id?: string
          column_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          epic_id?: string | null
          external_ref_id?: string | null
          external_ref_type?: string | null
          id?: string
          is_completed?: boolean | null
          priority?: string | null
          sort_order?: number
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "work_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_epic_id_fkey"
            columns: ["epic_id"]
            isOneToOne: false
            referencedRelation: "epics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_analysis_history: {
        Row: {
          analysis: Json | null
          created_at: string | null
          id: string
          ncm: string | null
          product_id: string
          recommendation: string | null
          tax_regime_id: string | null
          tenant_id: string
        }
        Insert: {
          analysis?: Json | null
          created_at?: string | null
          id?: string
          ncm?: string | null
          product_id: string
          recommendation?: string | null
          tax_regime_id?: string | null
          tenant_id: string
        }
        Update: {
          analysis?: Json | null
          created_at?: string | null
          id?: string
          ncm?: string | null
          product_id?: string
          recommendation?: string | null
          tax_regime_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_analysis_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_analysis_history_tax_regime_id_fkey"
            columns: ["tax_regime_id"]
            isOneToOne: false
            referencedRelation: "tax_regimes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_analysis_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_regimes: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          tax_cofins: number | null
          tax_icms: number | null
          tax_ipi: number | null
          tax_pis: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          tax_cofins?: number | null
          tax_icms?: number | null
          tax_ipi?: number | null
          tax_pis?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          tax_cofins?: number | null
          tax_icms?: number | null
          tax_ipi?: number | null
          tax_pis?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_regimes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          permissions: Json | null
          role: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_areas: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_archived: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_centers: {
        Row: {
          code: string
          created_at: string
          description: string | null
          efficiency: number
          hourly_cost: number
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          efficiency?: number
          hourly_cost?: number
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          efficiency?: number
          hourly_cost?: number
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_bdi: {
        Args: {
          admin_overhead: number
          base_cost: number
          profit_margin: number
          tax_rate: number
        }
        Returns: number
      }
      calculate_selling_price: {
        Args: {
          p_cost: number
          p_custom_profit_pct?: number
          p_custom_tax_pct?: number
          p_tenant_id: string
        }
        Returns: number
      }
      generate_technical_code: {
        Args: {
          p_family_code: string
          p_finish_code: string
          p_material_code: string
          p_prefix_code: string
          p_sequence: number
          p_subfamily_code: string
        }
        Returns: string
      }
      get_current_tenant_id: { Args: never; Returns: string }
      is_board_admin: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      is_board_member: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      is_board_owner: {
        Args: { _board_id: string; _user_id: string }
        Returns: boolean
      }
      is_current_user_tenant_admin: { Args: never; Returns: boolean }
      is_same_tenant_user_profile: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      refresh_purchase_order_subtotal: {
        Args: { p_po_id: string }
        Returns: undefined
      }
      refresh_quote_subtotal: {
        Args: { p_quote_id: string }
        Returns: undefined
      }
      refresh_sales_order_subtotal: {
        Args: { p_order_id: string }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
