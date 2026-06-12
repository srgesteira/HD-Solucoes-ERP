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
      accounts_payable: {
        Row: {
          amount_locked: boolean
          category: string
          created_at: string
          current_amount: number
          description: string
          due_date: string
          id: string
          installment_index: number | null
          is_forecast: boolean
          notes: string | null
          original_amount: number
          payment_date: string | null
          purchase_order_id: string | null
          source_kind: string
          status: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_locked?: boolean
          category: string
          created_at?: string
          current_amount: number
          description: string
          due_date: string
          id?: string
          installment_index?: number | null
          is_forecast?: boolean
          notes?: string | null
          original_amount: number
          payment_date?: string | null
          purchase_order_id?: string | null
          source_kind?: string
          status?: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_locked?: boolean
          category?: string
          created_at?: string
          current_amount?: number
          description?: string
          due_date?: string
          id?: string
          installment_index?: number | null
          is_forecast?: boolean
          notes?: string | null
          original_amount?: number
          payment_date?: string | null
          purchase_order_id?: string | null
          source_kind?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cash_flow_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          date: string
          description: string
          id: string
          reference_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          date: string
          description: string
          id?: string
          reference_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          reference_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_entries_tenant_id_fkey"
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
          cash_flow_opening_balance: number
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
          focusnfe_environment: string | null
          focusnfe_token: string | null
          id: string
          logo_url: string | null
          municipal_registration: string | null
          nfse_codigo_indicador_operacao: string | null
          nfse_codigo_nbs: string | null
          nfse_codigo_tributario_municipio: string | null
          nfse_ibs_cbs_classificacao_tributaria: string | null
          nfse_iss_aliquota: number | null
          nfse_item_lista_servico: string | null
          nfse_prestador_codigo_municipio: string | null
          nfse_use_sao_paulo_payload: boolean
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
          cash_flow_opening_balance?: number
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
          focusnfe_environment?: string | null
          focusnfe_token?: string | null
          id?: string
          logo_url?: string | null
          municipal_registration?: string | null
          nfse_codigo_indicador_operacao?: string | null
          nfse_codigo_nbs?: string | null
          nfse_codigo_tributario_municipio?: string | null
          nfse_ibs_cbs_classificacao_tributaria?: string | null
          nfse_iss_aliquota?: number | null
          nfse_item_lista_servico?: string | null
          nfse_prestador_codigo_municipio?: string | null
          nfse_use_sao_paulo_payload?: boolean
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
          cash_flow_opening_balance?: number
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
          focusnfe_environment?: string | null
          focusnfe_token?: string | null
          id?: string
          logo_url?: string | null
          municipal_registration?: string | null
          nfse_codigo_indicador_operacao?: string | null
          nfse_codigo_nbs?: string | null
          nfse_codigo_tributario_municipio?: string | null
          nfse_ibs_cbs_classificacao_tributaria?: string | null
          nfse_iss_aliquota?: number | null
          nfse_item_lista_servico?: string | null
          nfse_prestador_codigo_municipio?: string | null
          nfse_use_sao_paulo_payload?: boolean
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
      credit_analysis: {
        Row: {
          analyzed_at: string | null
          analyzed_by: string | null
          approved_amount: number | null
          created_at: string
          customer_credit_limit: number | null
          customer_id: string
          customer_name: string
          customer_open_balance: number
          customer_overdue_balance: number
          customer_score: string | null
          id: string
          observations: string | null
          order_total: number
          rejection_reason: string | null
          sales_order_number: string
          sales_order_ref: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          analyzed_at?: string | null
          analyzed_by?: string | null
          approved_amount?: number | null
          created_at?: string
          customer_credit_limit?: number | null
          customer_id: string
          customer_name: string
          customer_open_balance?: number
          customer_overdue_balance?: number
          customer_score?: string | null
          id?: string
          observations?: string | null
          order_total: number
          rejection_reason?: string | null
          sales_order_number: string
          sales_order_ref: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          analyzed_at?: string | null
          analyzed_by?: string | null
          approved_amount?: number | null
          created_at?: string
          customer_credit_limit?: number | null
          customer_id?: string
          customer_name?: string
          customer_open_balance?: number
          customer_overdue_balance?: number
          customer_score?: string | null
          id?: string
          observations?: string | null
          order_total?: number
          rejection_reason?: string | null
          sales_order_number?: string
          sales_order_ref?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_analysis_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_analysis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          credit_limit: number | null
          credit_score: string | null
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          credit_score?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number | null
          credit_score?: string | null
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          allocation_driver: string
          code: string
          created_at: string
          driver_config: Json
          id: string
          is_support: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          allocation_driver?: string
          code: string
          created_at?: string
          driver_config?: Json
          id?: string
          is_support?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          allocation_driver?: string
          code?: string
          created_at?: string
          driver_config?: Json
          id?: string
          is_support?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_allocations: {
        Row: {
          allocation_percentage: number
          created_at: string
          department_id: string | null
          employee_id: string
          end_date: string | null
          id: string
          start_date: string
          tenant_id: string
          work_center_id: string | null
        }
        Insert: {
          allocation_percentage: number
          created_at?: string
          department_id?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          start_date: string
          tenant_id: string
          work_center_id?: string | null
        }
        Update: {
          allocation_percentage?: number
          created_at?: string
          department_id?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          start_date?: string
          tenant_id?: string
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_allocations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_allocations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_allocations_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admission_date: string | null
          allocation_percentage: number
          created_at: string
          department_id: string | null
          document: string | null
          email: string | null
          id: string
          monthly_salary: number | null
          name: string
          notes: string | null
          phone: string | null
          position: string | null
          status: string
          tenant_id: string
          updated_at: string
          work_center_id: string | null
        }
        Insert: {
          admission_date?: string | null
          allocation_percentage?: number
          created_at?: string
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          monthly_salary?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          work_center_id?: string | null
        }
        Update: {
          admission_date?: string | null
          allocation_percentage?: number
          created_at?: string
          department_id?: string | null
          document?: string | null
          email?: string | null
          id?: string
          monthly_salary?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
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
      event_log: {
        Row: {
          event_name: string
          id: string
          idempotency_key: string | null
          payload: Json
          processed_by: Json
          published_at: string
          tenant_id: string
        }
        Insert: {
          event_name: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_by?: Json
          published_at?: string
          tenant_id: string
        }
        Update: {
          event_name?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_by?: Json
          published_at?: string
          tenant_id?: string
        }
        Relationships: []
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
      incoming_inspections: {
        Row: {
          approved_at: string | null
          created_at: string
          id: string
          po_number: string
          purchase_order_id: string
          rejected_at: string | null
          rejection_notes: string | null
          status: string
          stock_posted: boolean
          supplier_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          id?: string
          po_number: string
          purchase_order_id: string
          rejected_at?: string | null
          rejection_notes?: string | null
          status?: string
          stock_posted?: boolean
          supplier_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          id?: string
          po_number?: string
          purchase_order_id?: string
          rejected_at?: string | null
          rejection_notes?: string | null
          status?: string
          stock_posted?: boolean
          supplier_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          id: string
          last_counted_at: string | null
          product_id: string
          quantity_on_hand: number
          reorder_point: number | null
          reorder_quantity: number | null
          reserved_quantity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          product_id: string
          quantity_on_hand?: number
          reorder_point?: number | null
          reorder_quantity?: number | null
          reserved_quantity?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_counted_at?: string | null
          product_id?: string
          quantity_on_hand?: number
          reorder_point?: number | null
          reorder_quantity?: number | null
          reserved_quantity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          origin: string | null
          product_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          origin?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          origin?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
      labor_costs: {
        Row: {
          allocated_cost: number | null
          allocated_hourly_rate: number | null
          calculated_at: string
          direct_cost: number | null
          direct_hourly_rate: number | null
          hourly_rate: number
          id: string
          month: number
          tenant_id: string
          total_hours_base: number
          total_salary_base: number
          work_center_id: string
          year: number
        }
        Insert: {
          allocated_cost?: number | null
          allocated_hourly_rate?: number | null
          calculated_at?: string
          direct_cost?: number | null
          direct_hourly_rate?: number | null
          hourly_rate: number
          id?: string
          month: number
          tenant_id: string
          total_hours_base: number
          total_salary_base: number
          work_center_id: string
          year: number
        }
        Update: {
          allocated_cost?: number | null
          allocated_hourly_rate?: number | null
          calculated_at?: string
          direct_cost?: number | null
          direct_hourly_rate?: number | null
          hourly_rate?: number
          id?: string
          month?: number
          tenant_id?: string
          total_hours_base?: number
          total_salary_base?: number
          work_center_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "labor_costs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_costs_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
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
      nfes: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          nfe_key: string | null
          nfe_number: string | null
          pdf_url: string | null
          sales_order_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          nfe_key?: string | null
          nfe_number?: string | null
          pdf_url?: string | null
          sales_order_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          nfe_key?: string | null
          nfe_number?: string | null
          pdf_url?: string | null
          sales_order_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfes_tenant_id_fkey"
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
          apontamento_end_at: string | null
          apontamento_start_at: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string
          estimated_hours: number | null
          id: string
          is_suggestion: boolean
          item_number: number | null
          line_id: string | null
          notes: string | null
          order_id: string
          pcp_deadline: string | null
          product_id: string | null
          production_end: string | null
          production_notes: string | null
          production_start: string | null
          quality_control: string | null
          quantity: number
          sales_order_item_id: string | null
          status: string
          tenant_id: string
          unit: string | null
          updated_at: string
          warehouse_supplied_at: string | null
          warehouse_supplied_by: string | null
        }
        Insert: {
          actual_hours?: number | null
          apontamento_end_at?: string | null
          apontamento_start_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description: string
          estimated_hours?: number | null
          id?: string
          is_suggestion?: boolean
          item_number?: number | null
          line_id?: string | null
          notes?: string | null
          order_id: string
          pcp_deadline?: string | null
          product_id?: string | null
          production_end?: string | null
          production_notes?: string | null
          production_start?: string | null
          quality_control?: string | null
          quantity?: number
          sales_order_item_id?: string | null
          status?: string
          tenant_id: string
          unit?: string | null
          updated_at?: string
          warehouse_supplied_at?: string | null
          warehouse_supplied_by?: string | null
        }
        Update: {
          actual_hours?: number | null
          apontamento_end_at?: string | null
          apontamento_start_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string
          estimated_hours?: number | null
          id?: string
          is_suggestion?: boolean
          item_number?: number | null
          line_id?: string | null
          notes?: string | null
          order_id?: string
          pcp_deadline?: string | null
          product_id?: string | null
          production_end?: string | null
          production_notes?: string | null
          production_start?: string | null
          quality_control?: string | null
          quantity?: number
          sales_order_item_id?: string | null
          status?: string
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          warehouse_supplied_at?: string | null
          warehouse_supplied_by?: string | null
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
            foreignKeyName: "order_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
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
      password_reset_tokens: {
        Row: {
          created_at: string
          created_ip: unknown
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_ip?: unknown
          email: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_ip?: unknown
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_users"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_suggestions: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sales_order_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sales_order_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_suggestions_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_suggestions_tenant_id_fkey"
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
          is_external_labor: boolean
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
          is_external_labor?: boolean
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
          is_external_labor?: boolean
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
          prefix_id: string | null
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
          prefix_id?: string | null
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
          prefix_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_families_prefix_id_fkey"
            columns: ["prefix_id"]
            isOneToOne: false
            referencedRelation: "product_prefixes"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "product_prefixes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          position: number
          price_type: string
          product_id: string
          quote_date: string
          tax_deduction_percent: number | null
          tenant_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          position: number
          price_type: string
          product_id: string
          quote_date?: string
          tax_deduction_percent?: number | null
          tenant_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          position?: number
          price_type?: string
          product_id?: string
          quote_date?: string
          tax_deduction_percent?: number | null
          tenant_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_price_history_tenant_id_fkey"
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
          work_center_id: string | null
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
          work_center_id?: string | null
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
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_lines_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      production_quality_finish_blocks: {
        Row: {
          block_reason: string
          blocked_at: string
          blocked_by: string | null
          created_at: string
          id: string
          order_item_id: string
          release_action: string | null
          released_at: string | null
          released_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          block_reason: string
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          release_action?: string | null
          released_at?: string | null
          released_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          block_reason?: string
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          release_action?: string | null
          released_at?: string | null
          released_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_quality_finish_blocks_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_quality_finish_blocks_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_quality_finish_blocks_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_quality_finish_blocks_tenant_id_fkey"
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
          is_suggestion: boolean
          notes: string | null
          order_number: string
          pcp_deadline: string | null
          pdf_path: string | null
          production_deadline: string | null
          source_kind: string
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
          is_suggestion?: boolean
          notes?: string | null
          order_number: string
          pcp_deadline?: string | null
          pdf_path?: string | null
          production_deadline?: string | null
          source_kind?: string
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
          is_suggestion?: boolean
          notes?: string | null
          order_number?: string
          pcp_deadline?: string | null
          pdf_path?: string | null
          production_deadline?: string | null
          source_kind?: string
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
          composition_requested_at: string | null
          cost_price: number
          created_at: string
          custom_profit_margin: number | null
          custom_tax_rate: number | null
          default_is_external_labor: boolean
          default_labor_cost: number | null
          default_production_line_id: string | null
          default_work_center_id: string | null
          description: string | null
          engineering_released_at: string | null
          engineering_workflow_status: string | null
          family_id: string | null
          finish_id: string | null
          has_composition: boolean
          id: string
          is_active: boolean
          material_id: string | null
          name: string
          ncm: string | null
          preferred_supplier_id: string | null
          prefix_id: string | null
          product_nature: string | null
          purchase_lead_time_days: number | null
          released_for_sale: boolean
          released_for_sale_at: string | null
          selling_price: number
          source_quote_id: string | null
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
          composition_requested_at?: string | null
          cost_price?: number
          created_at?: string
          custom_profit_margin?: number | null
          custom_tax_rate?: number | null
          default_is_external_labor?: boolean
          default_labor_cost?: number | null
          default_production_line_id?: string | null
          default_work_center_id?: string | null
          description?: string | null
          engineering_released_at?: string | null
          engineering_workflow_status?: string | null
          family_id?: string | null
          finish_id?: string | null
          has_composition?: boolean
          id?: string
          is_active?: boolean
          material_id?: string | null
          name: string
          ncm?: string | null
          preferred_supplier_id?: string | null
          prefix_id?: string | null
          product_nature?: string | null
          purchase_lead_time_days?: number | null
          released_for_sale?: boolean
          released_for_sale_at?: string | null
          selling_price?: number
          source_quote_id?: string | null
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
          composition_requested_at?: string | null
          cost_price?: number
          created_at?: string
          custom_profit_margin?: number | null
          custom_tax_rate?: number | null
          default_is_external_labor?: boolean
          default_labor_cost?: number | null
          default_production_line_id?: string | null
          default_work_center_id?: string | null
          description?: string | null
          engineering_released_at?: string | null
          engineering_workflow_status?: string | null
          family_id?: string | null
          finish_id?: string | null
          has_composition?: boolean
          id?: string
          is_active?: boolean
          material_id?: string | null
          name?: string
          ncm?: string | null
          preferred_supplier_id?: string | null
          prefix_id?: string | null
          product_nature?: string | null
          purchase_lead_time_days?: number | null
          released_for_sale?: boolean
          released_for_sale_at?: string | null
          selling_price?: number
          source_quote_id?: string | null
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
            foreignKeyName: "products_default_production_line_id_fkey"
            columns: ["default_production_line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_work_center_id_fkey"
            columns: ["default_work_center_id"]
            isOneToOne: false
            referencedRelation: "work_centers"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "products_preferred_supplier_id_fkey"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
            foreignKeyName: "products_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
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
          actual_delivery_date: string | null
          created_at: string
          description: string
          expected_delivery_date: string | null
          follow_up_date: string | null
          icms_rate: number
          icms_value: number
          id: string
          is_suggestion: boolean
          ipi_rate: number
          ipi_value: number
          need_date: string | null
          product_id: string | null
          production_item_id: string | null
          production_order_id: string | null
          production_order_item_id: string | null
          purchase_order_id: string | null
          quantity: number
          quotation_sent_at: string | null
          received_quantity: number
          sales_order_item_id: string | null
          status: string
          suggested_supplier_id: string | null
          tax_base: number
          tenant_id: string
          total_price: number
          trace_key: string | null
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          description: string
          expected_delivery_date?: string | null
          follow_up_date?: string | null
          icms_rate?: number
          icms_value?: number
          id?: string
          is_suggestion?: boolean
          ipi_rate?: number
          ipi_value?: number
          need_date?: string | null
          product_id?: string | null
          production_item_id?: string | null
          production_order_id?: string | null
          production_order_item_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          quotation_sent_at?: string | null
          received_quantity?: number
          sales_order_item_id?: string | null
          status?: string
          suggested_supplier_id?: string | null
          tax_base?: number
          tenant_id: string
          total_price?: number
          trace_key?: string | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          description?: string
          expected_delivery_date?: string | null
          follow_up_date?: string | null
          icms_rate?: number
          icms_value?: number
          id?: string
          is_suggestion?: boolean
          ipi_rate?: number
          ipi_value?: number
          need_date?: string | null
          product_id?: string | null
          production_item_id?: string | null
          production_order_id?: string | null
          production_order_item_id?: string | null
          purchase_order_id?: string | null
          quantity?: number
          quotation_sent_at?: string | null
          received_quantity?: number
          sales_order_item_id?: string | null
          status?: string
          suggested_supplier_id?: string | null
          tax_base?: number
          tenant_id?: string
          total_price?: number
          trace_key?: string | null
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
            foreignKeyName: "purchase_order_items_production_order_item_id_fkey"
            columns: ["production_order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
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
            foreignKeyName: "purchase_order_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_suggested_supplier_id_fkey"
            columns: ["suggested_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          finance_blocked: boolean
          finance_blocked_at: string | null
          finance_blocked_reason: string | null
          fiscal_status: string
          freight_cost: number
          id: string
          insurance_cost: number
          internal_notes: string | null
          is_suggestion: boolean
          notes: string | null
          order_date: string
          other_costs: number
          payment_days_between_installments: number
          payment_days_to_first_due: number
          payment_installments: number
          po_number: string
          requested_by: string | null
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          tenant_id: string
          total: number
          total_icms: number
          total_ipi: number
          total_tax_base: number
          total_tax_non_creditable: number
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          expected_delivery?: string | null
          finance_blocked?: boolean
          finance_blocked_at?: string | null
          finance_blocked_reason?: string | null
          fiscal_status?: string
          freight_cost?: number
          id?: string
          insurance_cost?: number
          internal_notes?: string | null
          is_suggestion?: boolean
          notes?: string | null
          order_date?: string
          other_costs?: number
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          po_number: string
          requested_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id: string
          total?: number
          total_icms?: number
          total_ipi?: number
          total_tax_base?: number
          total_tax_non_creditable?: number
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          discount?: number
          expected_delivery?: string | null
          finance_blocked?: boolean
          finance_blocked_at?: string | null
          finance_blocked_reason?: string | null
          fiscal_status?: string
          freight_cost?: number
          id?: string
          insurance_cost?: number
          internal_notes?: string | null
          is_suggestion?: boolean
          notes?: string | null
          order_date?: string
          other_costs?: number
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          po_number?: string
          requested_by?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          tenant_id?: string
          total?: number
          total_icms?: number
          total_ipi?: number
          total_tax_base?: number
          total_tax_non_creditable?: number
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
          client_notes: string | null
          created_at: string
          description: string
          id: string
          markup_percent: number | null
          product_id: string | null
          quantity: number
          quote_id: string
          show_product_description: boolean
          tenant_id: string
          total_price: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          client_notes?: string | null
          created_at?: string
          description: string
          id?: string
          markup_percent?: number | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          show_product_description?: boolean
          tenant_id: string
          total_price?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          client_notes?: string | null
          created_at?: string
          description?: string
          id?: string
          markup_percent?: number | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          show_product_description?: boolean
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
      quote_rejections: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          quote_id: string
          rejection_reason_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          quote_id: string
          rejection_reason_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          quote_id?: string
          rejection_reason_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_rejections_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_rejections_rejection_reason_id_fkey"
            columns: ["rejection_reason_id"]
            isOneToOne: false
            referencedRelation: "rejection_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_rejections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          awaiting_commercial_finalize: boolean
          base_cost: number | null
          bdi_percentage: number | null
          bdi_value: number | null
          client_email: string | null
          client_name: string
          converted_to_sale_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivery_deadline: string | null
          discount: number
          expected_delivery_date: string | null
          freight_cost: number
          id: string
          notes: string | null
          payment_days_between_installments: number
          payment_days_to_first_due: number
          payment_installments: number
          payment_terms: string | null
          quote_date: string
          quote_number: string
          revision_notes: string | null
          revision_number: number
          shipping_type: string
          show_product_descriptions: boolean
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
          valid_until: string | null
          validity_days: number
        }
        Insert: {
          awaiting_commercial_finalize?: boolean
          base_cost?: number | null
          bdi_percentage?: number | null
          bdi_value?: number | null
          client_email?: string | null
          client_name: string
          converted_to_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_deadline?: string | null
          discount?: number
          expected_delivery_date?: string | null
          freight_cost?: number
          id?: string
          notes?: string | null
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          payment_terms?: string | null
          quote_date?: string
          quote_number: string
          revision_notes?: string | null
          revision_number?: number
          shipping_type?: string
          show_product_descriptions?: boolean
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          validity_days?: number
        }
        Update: {
          awaiting_commercial_finalize?: boolean
          base_cost?: number | null
          bdi_percentage?: number | null
          bdi_value?: number | null
          client_email?: string | null
          client_name?: string
          converted_to_sale_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivery_deadline?: string | null
          discount?: number
          expected_delivery_date?: string | null
          freight_cost?: number
          id?: string
          notes?: string | null
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          payment_terms?: string | null
          quote_date?: string
          quote_number?: string
          revision_notes?: string | null
          revision_number?: number
          shipping_type?: string
          show_product_descriptions?: boolean
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          validity_days?: number
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
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      rbac_permissions: {
        Row: {
          action: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          module: string
          name: string
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          module: string
          name: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          module?: string
          name?: string
        }
        Relationships: []
      }
      rbac_role_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_role_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "rbac_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          legacy_role_key: string | null
          name: string
          slug: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          legacy_role_key?: string | null
          name: string
          slug: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          legacy_role_key?: string | null
          name?: string
          slug?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_roles_legacy_fk"
            columns: ["legacy_role_key"]
            isOneToOne: false
            referencedRelation: "role_permissions"
            referencedColumns: ["role_key"]
          },
          {
            foreignKeyName: "rbac_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rbac_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          installment_index: number | null
          interest_amount: number
          is_forecast: boolean
          issue_date: string
          notes: string | null
          original_amount: number
          paid_amount: number
          payment_date: string | null
          sales_order_id: string | null
          source_kind: string
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
          installment_index?: number | null
          interest_amount?: number
          is_forecast?: boolean
          issue_date?: string
          notes?: string | null
          original_amount: number
          paid_amount?: number
          payment_date?: string | null
          sales_order_id?: string | null
          source_kind?: string
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
          installment_index?: number | null
          interest_amount?: number
          is_forecast?: boolean
          issue_date?: string
          notes?: string | null
          original_amount?: number
          paid_amount?: number
          payment_date?: string | null
          sales_order_id?: string | null
          source_kind?: string
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
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          day_of_month: number | null
          description: string
          end_date: string | null
          id: string
          notes: string | null
          recurrence: string
          start_date: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          amount: number
          category?: string
          created_at?: string
          day_of_month?: number | null
          description: string
          end_date?: string | null
          id?: string
          notes?: string | null
          recurrence: string
          start_date: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          day_of_month?: number | null
          description?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          recurrence?: string
          start_date?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rejection_reasons: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reason: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rejection_reasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          description: string | null
          module_key: string
          module_keys: string[] | null
          permissions: Json
          role_key: string
          role_name: string
        }
        Insert: {
          description?: string | null
          module_key: string
          module_keys?: string[] | null
          permissions?: Json
          role_key: string
          role_name: string
        }
        Update: {
          description?: string | null
          module_key?: string
          module_keys?: string[] | null
          permissions?: Json
          role_key?: string
          role_name?: string
        }
        Relationships: []
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
          icms_rate: number | null
          icms_value: number | null
          id: string
          ipi_rate: number | null
          ipi_value: number | null
          line_number: number
          pcp_deadline: string | null
          product_id: string | null
          production_order_id: string | null
          profit: number | null
          quantity: number
          sales_order_id: string
          tax_base: number | null
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
          icms_rate?: number | null
          icms_value?: number | null
          id?: string
          ipi_rate?: number | null
          ipi_value?: number | null
          line_number?: number
          pcp_deadline?: string | null
          product_id?: string | null
          production_order_id?: string | null
          profit?: number | null
          quantity?: number
          sales_order_id: string
          tax_base?: number | null
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
          icms_rate?: number | null
          icms_value?: number | null
          id?: string
          ipi_rate?: number | null
          ipi_value?: number | null
          line_number?: number
          pcp_deadline?: string | null
          product_id?: string | null
          production_order_id?: string | null
          profit?: number | null
          quantity?: number
          sales_order_id?: string
          tax_base?: number | null
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
            foreignKeyName: "sales_order_items_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
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
      sales_order_logs: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_name: string | null
          id: string
          new_value: string | null
          notes: string | null
          old_value: string | null
          sales_order_id: string
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          sales_order_id: string
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_name?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          old_value?: string | null
          sales_order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_logs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_logs_tenant_id_fkey"
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
          comercial_pcp_observation: string | null
          comercial_pcp_observation_at: string | null
          comercial_pcp_observation_by: string | null
          created_at: string
          created_by: string | null
          discount: number
          expected_delivery: string | null
          finance_blocked: boolean
          finance_blocked_at: string | null
          finance_blocked_reason: string | null
          fiscal_status: string
          id: string
          mrp_processed: boolean
          notes: string | null
          order_date: string
          order_number: string
          payment_days_between_installments: number
          payment_days_to_first_due: number
          payment_installments: number
          pcp_deadline: string | null
          pcp_reply_comercial_observation: string | null
          pcp_reply_comercial_observation_at: string | null
          pcp_reply_comercial_observation_by: string | null
          production_order_id: string | null
          quote_id: string | null
          ready_for_invoice: boolean
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          total_icms: number | null
          total_ipi: number | null
          total_tax_base: number | null
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          comercial_pcp_observation?: string | null
          comercial_pcp_observation_at?: string | null
          comercial_pcp_observation_by?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery?: string | null
          finance_blocked?: boolean
          finance_blocked_at?: string | null
          finance_blocked_reason?: string | null
          fiscal_status?: string
          id?: string
          mrp_processed?: boolean
          notes?: string | null
          order_date?: string
          order_number: string
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          pcp_deadline?: string | null
          pcp_reply_comercial_observation?: string | null
          pcp_reply_comercial_observation_at?: string | null
          pcp_reply_comercial_observation_by?: string | null
          production_order_id?: string | null
          quote_id?: string | null
          ready_for_invoice?: boolean
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          total_icms?: number | null
          total_ipi?: number | null
          total_tax_base?: number | null
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          comercial_pcp_observation?: string | null
          comercial_pcp_observation_at?: string | null
          comercial_pcp_observation_by?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          expected_delivery?: string | null
          finance_blocked?: boolean
          finance_blocked_at?: string | null
          finance_blocked_reason?: string | null
          fiscal_status?: string
          id?: string
          mrp_processed?: boolean
          notes?: string | null
          order_date?: string
          order_number?: string
          payment_days_between_installments?: number
          payment_days_to_first_due?: number
          payment_installments?: number
          pcp_deadline?: string | null
          pcp_reply_comercial_observation?: string | null
          pcp_reply_comercial_observation_at?: string | null
          pcp_reply_comercial_observation_by?: string | null
          production_order_id?: string | null
          quote_id?: string | null
          ready_for_invoice?: boolean
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          total_icms?: number | null
          total_ipi?: number | null
          total_tax_base?: number | null
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
      supplier_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          line_index: number
          product_code: string | null
          product_id: string | null
          purchase_order_id: string | null
          purchase_order_item_id: string | null
          quantity: number
          supplier_invoice_id: string
          tenant_id: string
          total_price: number | null
          unit: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_index?: number
          product_code?: string | null
          product_id?: string | null
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity: number
          supplier_invoice_id: string
          tenant_id: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_index?: number
          product_code?: string | null
          product_id?: string | null
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          quantity?: number
          supplier_invoice_id?: string
          tenant_id?: string
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          access_key: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_number: string | null
          invoice_series: string | null
          issue_date: string | null
          notes: string | null
          supplier_document: string | null
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string
          total_amount: number | null
        }
        Insert: {
          access_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_date?: string | null
          notes?: string | null
          supplier_document?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id: string
          total_amount?: number | null
        }
        Update: {
          access_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_date?: string | null
          notes?: string | null
          supplier_document?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_tenant_id_fkey"
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
          credit_limit: number | null
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
          credit_limit?: number | null
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
          credit_limit?: number | null
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
          enabled_modules: string[] | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          enabled_modules?: string[] | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          enabled_modules?: string[] | null
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
          enabled_modules: string[] | null
          full_name: string | null
          id: string
          is_active: boolean | null
          permissions: Json | null
          role: string
          role_keys: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          enabled_modules?: string[] | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          role_keys?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          enabled_modules?: string[] | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          role_keys?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "v_users"
            referencedColumns: ["id"]
          },
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
          default_monthly_hours: number
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
          default_monthly_hours?: number
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
          default_monthly_hours?: number
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
      v_users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          email_confirmed_at: string | null
          enabled_modules: string[] | null
          id: string | null
          is_active: boolean | null
          last_sign_in_at: string | null
          legacy_permissions: Json | null
          name: string | null
          role_keys: string[] | null
          system_role: string | null
          tenant_id: string | null
          updated_at: string | null
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
      generate_simplified_technical_code: {
        Args: {
          p_finish_code: string
          p_material_code: string
          p_prefix_code: string
          p_sequence: number
        }
        Returns: string
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
      user_has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      user_permission_names: { Args: { p_user_id: string }; Returns: string[] }
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
