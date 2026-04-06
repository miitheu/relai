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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_entity_resolutions: {
        Row: {
          canonical_name: string | null
          client_id: string
          confidence_score: number | null
          created_at: string
          entity_type: string | null
          id: string
          manually_confirmed: boolean | null
          match_candidates: Json | null
          matched_by: string | null
          normalized_name: string | null
          resolution_status: string
          resolved_at: string | null
          resolved_by: string | null
          sec_cik: string | null
          sec_filer_name: string | null
          source_name: string
          updated_at: string
        }
        Insert: {
          canonical_name?: string | null
          client_id: string
          confidence_score?: number | null
          created_at?: string
          entity_type?: string | null
          id?: string
          manually_confirmed?: boolean | null
          match_candidates?: Json | null
          matched_by?: string | null
          normalized_name?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sec_cik?: string | null
          sec_filer_name?: string | null
          source_name: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string | null
          client_id?: string
          confidence_score?: number | null
          created_at?: string
          entity_type?: string | null
          id?: string
          manually_confirmed?: boolean | null
          match_candidates?: Json | null
          matched_by?: string | null
          normalized_name?: string | null
          resolution_status?: string
          resolved_at?: string | null
          resolved_by?: string | null
          sec_cik?: string | null
          sec_filer_name?: string | null
          source_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_entity_resolutions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      account_intelligence_signals: {
        Row: {
          client_id: string
          confidence: number | null
          created_at: string
          evidence_json: Json | null
          id: string
          run_id: string
          signal_category: string | null
          signal_type: string
          signal_value: string | null
        }
        Insert: {
          client_id: string
          confidence?: number | null
          created_at?: string
          evidence_json?: Json | null
          id?: string
          run_id: string
          signal_category?: string | null
          signal_type: string
          signal_value?: string | null
        }
        Update: {
          client_id?: string
          confidence?: number | null
          created_at?: string
          evidence_json?: Json | null
          id?: string
          run_id?: string
          signal_category?: string | null
          signal_type?: string
          signal_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_intelligence_signals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_intelligence_signals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      account_intelligence_sources: {
        Row: {
          client_id: string
          created_at: string
          id: string
          metadata_json: Json | null
          run_id: string
          source_date: string | null
          source_identifier: string | null
          source_status: string
          source_type: string
          source_url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
          run_id: string
          source_date?: string | null
          source_identifier?: string | null
          source_status?: string
          source_type: string
          source_url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
          run_id?: string
          source_date?: string | null
          source_identifier?: string | null
          source_status?: string
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_intelligence_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_intelligence_sources_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      account_intelligence_summaries: {
        Row: {
          client_id: string
          created_at: string
          freshness_checked_at: string | null
          freshness_status: string
          generated_at: string
          id: string
          new_source_available: boolean | null
          new_source_metadata: Json | null
          recommended_approach: string | null
          run_id: string | null
          sector_summary: string | null
          strategy_summary: string | null
          suggested_messaging: string | null
          theme_summary: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          freshness_checked_at?: string | null
          freshness_status?: string
          generated_at?: string
          id?: string
          new_source_available?: boolean | null
          new_source_metadata?: Json | null
          recommended_approach?: string | null
          run_id?: string | null
          sector_summary?: string | null
          strategy_summary?: string | null
          suggested_messaging?: string | null
          theme_summary?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          freshness_checked_at?: string | null
          freshness_status?: string
          generated_at?: string
          id?: string
          new_source_available?: boolean | null
          new_source_metadata?: Json | null
          recommended_approach?: string | null
          run_id?: string | null
          sector_summary?: string | null
          strategy_summary?: string | null
          suggested_messaging?: string | null
          theme_summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_intelligence_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_intelligence_summaries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      account_merge_events: {
        Row: {
          created_at: string
          id: string
          merge_summary_json: Json
          merged_at: string
          merged_by: string
          primary_account_id: string
          secondary_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          merge_summary_json?: Json
          merged_at?: string
          merged_by: string
          primary_account_id: string
          secondary_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          merge_summary_json?: Json
          merged_at?: string
          merged_by?: string
          primary_account_id?: string
          secondary_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_merge_events_primary_account_id_fkey"
            columns: ["primary_account_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_merge_events_secondary_account_id_fkey"
            columns: ["secondary_account_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      action_dismissals: {
        Row: {
          action_key: string
          created_at: string
          dismissed_until: string
          id: string
          user_id: string
        }
        Insert: {
          action_key: string
          created_at?: string
          dismissed_until: string
          id?: string
          user_id: string
        }
        Update: {
          action_key?: string
          created_at?: string
          dismissed_until?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      activities: {
        Row: {
          activity_type: string
          client_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          opportunity_id: string | null
        }
        Insert: {
          activity_type: string
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          opportunity_id?: string | null
        }
        Update: {
          activity_type?: string
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          opportunity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          performed_by: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          performed_by?: string
        }
        Relationships: []
      }
      campaign_targets: {
        Row: {
          campaign_id: string
          client_id: string | null
          contacted_at: string | null
          created_at: string
          fit_rationale: Json | null
          fit_score: number | null
          id: string
          is_existing_client: boolean | null
          meeting_booked_at: string | null
          notes: string | null
          opportunity_id: string | null
          outreach_status: string | null
          owner_id: string | null
          product_fit_analysis: Json | null
          prospect_name: string | null
          prospect_type: string | null
          recommended_approach: string | null
          recommended_contacts: Json | null
          recommended_messaging: string | null
          responded_at: string | null
          status: string
          target_personas: Json | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          client_id?: string | null
          contacted_at?: string | null
          created_at?: string
          fit_rationale?: Json | null
          fit_score?: number | null
          id?: string
          is_existing_client?: boolean | null
          meeting_booked_at?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outreach_status?: string | null
          owner_id?: string | null
          product_fit_analysis?: Json | null
          prospect_name?: string | null
          prospect_type?: string | null
          recommended_approach?: string | null
          recommended_contacts?: Json | null
          recommended_messaging?: string | null
          responded_at?: string | null
          status?: string
          target_personas?: Json | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string | null
          contacted_at?: string | null
          created_at?: string
          fit_rationale?: Json | null
          fit_score?: number | null
          id?: string
          is_existing_client?: boolean | null
          meeting_booked_at?: string | null
          notes?: string | null
          opportunity_id?: string | null
          outreach_status?: string | null
          owner_id?: string | null
          product_fit_analysis?: Json | null
          prospect_name?: string | null
          prospect_type?: string | null
          recommended_approach?: string | null
          recommended_contacts?: Json | null
          recommended_messaging?: string | null
          responded_at?: string | null
          status?: string
          target_personas?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_targets_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_type: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          execution_plan: Json | null
          focus: string | null
          id: string
          include_existing_clients: boolean | null
          include_prospects: boolean | null
          max_targets: number | null
          messaging_guidance: Json | null
          metrics: Json | null
          name: string
          owner_id: string | null
          scoring_weights: Json | null
          started_at: string | null
          status: string
          target_account_types: string[] | null
          target_geographies: string[] | null
          target_product_ids: string[] | null
          target_segments: string[] | null
          updated_at: string
        }
        Insert: {
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          execution_plan?: Json | null
          focus?: string | null
          id?: string
          include_existing_clients?: boolean | null
          include_prospects?: boolean | null
          max_targets?: number | null
          messaging_guidance?: Json | null
          metrics?: Json | null
          name: string
          owner_id?: string | null
          scoring_weights?: Json | null
          started_at?: string | null
          status?: string
          target_account_types?: string[] | null
          target_geographies?: string[] | null
          target_product_ids?: string[] | null
          target_segments?: string[] | null
          updated_at?: string
        }
        Update: {
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          execution_plan?: Json | null
          focus?: string | null
          id?: string
          include_existing_clients?: boolean | null
          include_prospects?: boolean | null
          max_targets?: number | null
          messaging_guidance?: Json | null
          metrics?: Json | null
          name?: string
          owner_id?: string | null
          scoring_weights?: Json | null
          started_at?: string | null
          status?: string
          target_account_types?: string[] | null
          target_geographies?: string[] | null
          target_product_ids?: string[] | null
          target_segments?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      client_aliases: {
        Row: {
          alias_name: string
          alias_type: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          normalized_alias: string
          source: string | null
        }
        Insert: {
          alias_name: string
          alias_type?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_alias: string
          source?: string | null
        }
        Update: {
          alias_name?: string
          alias_type?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_alias?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_aliases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_provenance: {
        Row: {
          client_id: string
          created_at: string
          id: string
          imported_at: string | null
          imported_by: string | null
          source_identifier: string | null
          source_metadata: Json | null
          source_name: string | null
          source_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          source_identifier?: string | null
          source_metadata?: Json | null
          source_name?: string | null
          source_type?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          source_identifier?: string | null
          source_metadata?: Json | null
          source_name?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_provenance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          aum: string | null
          client_tier: string
          client_type: string
          created_at: string
          created_by: string | null
          headquarters_country: string | null
          id: string
          import_source: string | null
          is_merged: boolean
          merged_into_client_id: string | null
          name: string
          normalized_name: string | null
          notes: string | null
          owner_id: string | null
          primary_domain: string | null
          relationship_status: string
          strategy_focus: string | null
          updated_at: string
        }
        Insert: {
          aum?: string | null
          client_tier?: string
          client_type?: string
          created_at?: string
          created_by?: string | null
          headquarters_country?: string | null
          id?: string
          import_source?: string | null
          is_merged?: boolean
          merged_into_client_id?: string | null
          name: string
          normalized_name?: string | null
          notes?: string | null
          owner_id?: string | null
          primary_domain?: string | null
          relationship_status?: string
          strategy_focus?: string | null
          updated_at?: string
        }
        Update: {
          aum?: string | null
          client_tier?: string
          client_type?: string
          created_at?: string
          created_by?: string | null
          headquarters_country?: string | null
          id?: string
          import_source?: string | null
          is_merged?: boolean
          merged_into_client_id?: string | null
          name?: string
          normalized_name?: string | null
          notes?: string | null
          owner_id?: string | null
          primary_domain?: string | null
          relationship_status?: string
          strategy_focus?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          file_name: string | null
          id: string
          imported_rows: number | null
          name: string
          notes: string | null
          processed_rows: number | null
          skipped_rows: number | null
          status: string
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          name?: string
          notes?: string | null
          processed_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          name?: string
          notes?: string | null
          processed_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
        }
        Relationships: []
      }
      contact_import_staging: {
        Row: {
          batch_id: string
          company_match_confidence: string | null
          company_match_method: string | null
          contact_match_type: string | null
          created_at: string
          email_domain: string | null
          id: string
          imported_at: string | null
          imported_contact_id: string | null
          is_duplicate_contact: boolean | null
          matched_client_id: string | null
          matched_contact_id: string | null
          normalized_company_name: string | null
          normalized_email: string | null
          raw_company: string | null
          raw_contact_title: string | null
          raw_deals: string | null
          raw_email: string | null
          raw_name: string | null
          raw_organization_type: string | null
          raw_people: string | null
          raw_phone: string | null
          raw_source: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_client_id: string | null
          row_number: number | null
          suggested_client_ids: string[] | null
          validation_errors: string[] | null
          validation_status: string | null
          validation_warnings: string[] | null
        }
        Insert: {
          batch_id: string
          company_match_confidence?: string | null
          company_match_method?: string | null
          contact_match_type?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          imported_at?: string | null
          imported_contact_id?: string | null
          is_duplicate_contact?: boolean | null
          matched_client_id?: string | null
          matched_contact_id?: string | null
          normalized_company_name?: string | null
          normalized_email?: string | null
          raw_company?: string | null
          raw_contact_title?: string | null
          raw_deals?: string | null
          raw_email?: string | null
          raw_name?: string | null
          raw_organization_type?: string | null
          raw_people?: string | null
          raw_phone?: string | null
          raw_source?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_client_id?: string | null
          row_number?: number | null
          suggested_client_ids?: string[] | null
          validation_errors?: string[] | null
          validation_status?: string | null
          validation_warnings?: string[] | null
        }
        Update: {
          batch_id?: string
          company_match_confidence?: string | null
          company_match_method?: string | null
          contact_match_type?: string | null
          created_at?: string
          email_domain?: string | null
          id?: string
          imported_at?: string | null
          imported_contact_id?: string | null
          is_duplicate_contact?: boolean | null
          matched_client_id?: string | null
          matched_contact_id?: string | null
          normalized_company_name?: string | null
          normalized_email?: string | null
          raw_company?: string | null
          raw_contact_title?: string | null
          raw_deals?: string | null
          raw_email?: string | null
          raw_name?: string | null
          raw_organization_type?: string | null
          raw_people?: string | null
          raw_phone?: string | null
          raw_source?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_client_id?: string | null
          row_number?: number | null
          suggested_client_ids?: string[] | null
          validation_errors?: string[] | null
          validation_status?: string | null
          validation_warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "contact_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_staging_imported_contact_id_fkey"
            columns: ["imported_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_staging_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_staging_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_import_staging_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          influence_level: string | null
          last_interaction_date: string | null
          linkedin: string | null
          name: string
          notes: string | null
          phone: string | null
          raw_import_data: Json | null
          relationship_strength: string | null
          source: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          influence_level?: string | null
          last_interaction_date?: string | null
          linkedin?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          raw_import_data?: Json | null
          relationship_strength?: string | null
          source?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          influence_level?: string | null
          last_interaction_date?: string | null
          linkedin?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          raw_import_data?: Json | null
          relationship_strength?: string | null
          source?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "contact_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_id: string
          contract_type: string
          contract_value: number
          created_at: string
          created_by: string | null
          dataset_id: string | null
          end_date: string | null
          id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          contract_type?: string
          contract_value?: number
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      dataset_aliases: {
        Row: {
          alias_name: string
          created_at: string
          created_by: string | null
          dataset_id: string
          id: string
          normalized_alias: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          created_by?: string | null
          dataset_id: string
          id?: string
          normalized_alias: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          created_by?: string | null
          dataset_id?: string
          id?: string
          normalized_alias?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_aliases_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          coverage: string | null
          created_at: string
          description: string | null
          example_use_cases: string | null
          id: string
          is_active: boolean
          name: string
          update_frequency: string | null
          updated_at: string
        }
        Insert: {
          coverage?: string | null
          created_at?: string
          description?: string | null
          example_use_cases?: string | null
          id?: string
          is_active?: boolean
          name: string
          update_frequency?: string | null
          updated_at?: string
        }
        Update: {
          coverage?: string | null
          created_at?: string
          description?: string | null
          example_use_cases?: string | null
          id?: string
          is_active?: boolean
          name?: string
          update_frequency?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          access_status: string | null
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          delivery_date: string
          delivery_method: string
          delivery_type: string
          id: string
          notes: string | null
          opportunity_id: string | null
          owner_id: string | null
          status: string | null
          trial_end_date: string | null
          trial_start_date: string | null
        }
        Insert: {
          access_status?: string | null
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          delivery_date?: string
          delivery_method?: string
          delivery_type?: string
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          status?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
        }
        Update: {
          access_status?: string | null
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          delivery_date?: string
          delivery_method?: string
          delivery_type?: string
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          status?: string | null
          trial_end_date?: string | null
          trial_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          client_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          email_date: string
          id: string
          key_takeaways: string | null
          opportunity_id: string | null
          subject: string
          summary: string | null
        }
        Insert: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          email_date?: string
          id?: string
          key_takeaways?: string | null
          opportunity_id?: string | null
          subject?: string
          summary?: string | null
        }
        Update: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          email_date?: string
          id?: string
          key_takeaways?: string | null
          opportunity_id?: string | null
          subject?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_constituent_snapshots: {
        Row: {
          as_of_date: string
          constituent_security_id: string
          created_at: string
          etf_security_id: string
          id: string
          source_reference: string | null
          source_type: string
          weight_pct: number
        }
        Insert: {
          as_of_date: string
          constituent_security_id: string
          created_at?: string
          etf_security_id: string
          id?: string
          source_reference?: string | null
          source_type?: string
          weight_pct?: number
        }
        Update: {
          as_of_date?: string
          constituent_security_id?: string
          created_at?: string
          etf_security_id?: string
          id?: string
          source_reference?: string | null
          source_type?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "etf_constituent_snapshots_constituent_security_id_fkey"
            columns: ["constituent_security_id"]
            isOneToOne: false
            referencedRelation: "security_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etf_constituent_snapshots_etf_security_id_fkey"
            columns: ["etf_security_id"]
            isOneToOne: false
            referencedRelation: "security_master"
            referencedColumns: ["id"]
          },
        ]
      }
      external_source_mappings: {
        Row: {
          client_id: string
          confidence_score: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          external_entity_name: string
          external_identifier: string | null
          external_source_type: string
          id: string
          manually_confirmed: boolean | null
          match_method: string | null
          match_reasons: Json | null
          metadata_json: Json | null
          resolution_id: string | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_entity_name: string
          external_identifier?: string | null
          external_source_type: string
          id?: string
          manually_confirmed?: boolean | null
          match_method?: string | null
          match_reasons?: Json | null
          metadata_json?: Json | null
          resolution_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_entity_name?: string
          external_identifier?: string | null
          external_source_type?: string
          id?: string
          manually_confirmed?: boolean | null
          match_method?: string | null
          match_reasons?: Json | null
          metadata_json?: Json | null
          resolution_id?: string | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_source_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_source_mappings_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "account_entity_resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_effective_exposure: {
        Row: {
          created_at: string
          direct_weight_pct: number | null
          fund_id: string
          id: string
          implied_etf_weight_pct: number | null
          report_date: string
          security_id: string
          source_breakdown_json: Json | null
          total_weight_pct: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          direct_weight_pct?: number | null
          fund_id: string
          id?: string
          implied_etf_weight_pct?: number | null
          report_date: string
          security_id: string
          source_breakdown_json?: Json | null
          total_weight_pct?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          direct_weight_pct?: number | null
          fund_id?: string
          id?: string
          implied_etf_weight_pct?: number | null
          report_date?: string
          security_id?: string
          source_breakdown_json?: Json | null
          total_weight_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_effective_exposure_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_effective_exposure_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "security_master"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_filings: {
        Row: {
          created_at: string
          filing_date: string
          filing_type: string
          fund_id: string
          id: string
          raw_metadata_json: Json | null
          source_identifier: string | null
          source_type: string
          source_url: string | null
        }
        Insert: {
          created_at?: string
          filing_date: string
          filing_type?: string
          fund_id: string
          id?: string
          raw_metadata_json?: Json | null
          source_identifier?: string | null
          source_type?: string
          source_url?: string | null
        }
        Update: {
          created_at?: string
          filing_date?: string
          filing_type?: string
          fund_id?: string
          id?: string
          raw_metadata_json?: Json | null
          source_identifier?: string | null
          source_type?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_filings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_holdings_snapshot: {
        Row: {
          created_at: string
          cusip: string | null
          id: string
          issuer_name: string
          portfolio_weight: number | null
          position_value: number | null
          relevance_flags_json: Json | null
          run_id: string
          sector: string | null
          shares: number | null
          ticker: string | null
        }
        Insert: {
          created_at?: string
          cusip?: string | null
          id?: string
          issuer_name: string
          portfolio_weight?: number | null
          position_value?: number | null
          relevance_flags_json?: Json | null
          run_id: string
          sector?: string | null
          shares?: number | null
          ticker?: string | null
        }
        Update: {
          created_at?: string
          cusip?: string | null
          id?: string
          issuer_name?: string
          portfolio_weight?: number | null
          position_value?: number | null
          relevance_flags_json?: Json | null
          run_id?: string
          sector?: string | null
          shares?: number | null
          ticker?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_holdings_snapshot_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_intelligence_results: {
        Row: {
          client_id: string
          confidence_score: number | null
          created_at: string
          id: string
          portfolio_theme_summary: string | null
          recommended_approach: string | null
          relevant_datasets_json: Json | null
          run_id: string
          sector_exposure_summary: string | null
          strategy_summary: string | null
          suggested_engagement_plan_json: Json | null
          suggested_messaging: string | null
          suggested_target_personas_json: Json | null
          updated_at: string
        }
        Insert: {
          client_id: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          portfolio_theme_summary?: string | null
          recommended_approach?: string | null
          relevant_datasets_json?: Json | null
          run_id: string
          sector_exposure_summary?: string | null
          strategy_summary?: string | null
          suggested_engagement_plan_json?: Json | null
          suggested_messaging?: string | null
          suggested_target_personas_json?: Json | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          portfolio_theme_summary?: string | null
          recommended_approach?: string | null
          relevant_datasets_json?: Json | null
          run_id?: string
          sector_exposure_summary?: string | null
          strategy_summary?: string | null
          suggested_engagement_plan_json?: Json | null
          suggested_messaging?: string | null
          suggested_target_personas_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_intelligence_results_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_intelligence_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_intelligence_runs: {
        Row: {
          client_id: string
          completed_at: string | null
          completed_steps: number | null
          created_at: string
          current_step: string | null
          error_message: string | null
          filing_cik: string | null
          filing_date: string | null
          filing_source: string
          filing_type: string
          filing_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          playbook_type: string
          run_reason: string | null
          run_status: string
          total_steps: number | null
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          completed_steps?: number | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          filing_cik?: string | null
          filing_date?: string | null
          filing_source?: string
          filing_type?: string
          filing_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          playbook_type?: string
          run_reason?: string | null
          run_status?: string
          total_steps?: number | null
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          completed_steps?: number | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          filing_cik?: string | null
          filing_date?: string | null
          filing_source?: string
          filing_type?: string
          filing_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          playbook_type?: string
          run_reason?: string | null
          run_status?: string
          total_steps?: number | null
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_intelligence_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_reported_holdings: {
        Row: {
          created_at: string
          cusip: string | null
          filing_id: string
          fund_id: string
          id: string
          is_etf: boolean | null
          issuer_name: string
          position_value: number | null
          report_date: string
          security_id: string | null
          security_type: string | null
          shares: number | null
          ticker: string | null
          weight_pct: number | null
        }
        Insert: {
          created_at?: string
          cusip?: string | null
          filing_id: string
          fund_id: string
          id?: string
          is_etf?: boolean | null
          issuer_name: string
          position_value?: number | null
          report_date: string
          security_id?: string | null
          security_type?: string | null
          shares?: number | null
          ticker?: string | null
          weight_pct?: number | null
        }
        Update: {
          created_at?: string
          cusip?: string | null
          filing_id?: string
          fund_id?: string
          id?: string
          is_etf?: boolean | null
          issuer_name?: string
          position_value?: number | null
          report_date?: string
          security_id?: string | null
          security_type?: string | null
          shares?: number | null
          ticker?: string | null
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fund_reported_holdings_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "fund_filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_reported_holdings_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_reported_holdings_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "security_master"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_run_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          output_json: Json | null
          output_summary: string | null
          run_id: string
          started_at: string | null
          step_name: string
          step_order: number
          step_status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          output_json?: Json | null
          output_summary?: string | null
          run_id: string
          started_at?: string | null
          step_name: string
          step_order?: number
          step_status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          output_json?: Json | null
          output_summary?: string | null
          run_id?: string
          started_at?: string | null
          step_name?: string
          step_order?: number
          step_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          id: string
          key_questions: string | null
          meeting_date: string
          next_steps: string | null
          opportunity_id: string | null
          participants: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          key_questions?: string | null
          meeting_date?: string
          next_steps?: string | null
          opportunity_id?: string | null
          participants?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          key_questions?: string | null
          meeting_date?: string
          next_steps?: string | null
          opportunity_id?: string | null
          participants?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          client_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          opportunity_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          contact_id?: string | null
          content: string
          created_at?: string
          created_by: string
          id?: string
          opportunity_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          contact_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          notification_type: string
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          notification_type?: string
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          notification_type?: string
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          actual_close_date: string | null
          ball_status: string | null
          campaign_id: string | null
          campaign_target_id: string | null
          client_id: string
          contact_ids: string[] | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          deal_type: string | null
          expected_close: string | null
          id: string
          import_batch_id: string | null
          imported_at: string | null
          last_activity_at: string | null
          name: string
          next_action_description: string | null
          next_action_due_date: string | null
          notes: string | null
          owner_id: string | null
          probability: number
          source: string | null
          source_created_date: string | null
          stage: string
          stage_entered_at: string | null
          updated_at: string
          value: number
          value_max: number | null
          value_min: number | null
        }
        Insert: {
          actual_close_date?: string | null
          ball_status?: string | null
          campaign_id?: string | null
          campaign_target_id?: string | null
          client_id: string
          contact_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          deal_type?: string | null
          expected_close?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          last_activity_at?: string | null
          name: string
          next_action_description?: string | null
          next_action_due_date?: string | null
          notes?: string | null
          owner_id?: string | null
          probability?: number
          source?: string | null
          source_created_date?: string | null
          stage?: string
          stage_entered_at?: string | null
          updated_at?: string
          value?: number
          value_max?: number | null
          value_min?: number | null
        }
        Update: {
          actual_close_date?: string | null
          ball_status?: string | null
          campaign_id?: string | null
          campaign_target_id?: string | null
          client_id?: string
          contact_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          deal_type?: string | null
          expected_close?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string | null
          last_activity_at?: string | null
          name?: string
          next_action_description?: string | null
          next_action_due_date?: string | null
          notes?: string | null
          owner_id?: string | null
          probability?: number
          source?: string | null
          source_created_date?: string | null
          stage?: string
          stage_entered_at?: string | null
          updated_at?: string
          value?: number
          value_max?: number | null
          value_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_campaign_target_id_fkey"
            columns: ["campaign_target_id"]
            isOneToOne: false
            referencedRelation: "campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "opportunity_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_import_batches: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          file_name: string | null
          id: string
          imported_rows: number | null
          name: string
          notes: string | null
          processed_rows: number | null
          skipped_rows: number | null
          status: string
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          name?: string
          notes?: string | null
          processed_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          id?: string
          imported_rows?: number | null
          name?: string
          notes?: string | null
          processed_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
        }
        Relationships: []
      }
      opportunity_import_staging: {
        Row: {
          batch_id: string
          client_match_confidence: string | null
          client_match_method: string | null
          contact_match_confidence: string | null
          created_at: string
          dataset_match_confidence: string | null
          duplicate_opportunity_id: string | null
          duplicate_status: string | null
          id: string
          imported_at: string | null
          imported_opportunity_id: string | null
          matched_client_id: string | null
          matched_contact_ids: string[] | null
          matched_dataset_id: string | null
          matched_owner_id: string | null
          normalized_client_name: string | null
          normalized_owner_name: string | null
          normalized_product_name: string | null
          normalized_stage: string | null
          owner_match_confidence: string | null
          parsed_deal_creation_date: string | null
          parsed_expected_close_date: string | null
          parsed_renewal_due: string | null
          parsed_value_estimate: number | null
          parsed_value_max: number | null
          parsed_value_min: number | null
          raw_client_type: string | null
          raw_comment: string | null
          raw_contacts: string | null
          raw_deal_creation_date: string | null
          raw_deal_type: string | null
          raw_deal_value_max: string | null
          raw_deal_value_min: string | null
          raw_expected_close_date: string | null
          raw_name: string | null
          raw_owner: string | null
          raw_product: string | null
          raw_renewal_due: string | null
          raw_source: string | null
          raw_stage: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_client_id: string | null
          resolved_dataset_id: string | null
          resolved_owner_id: string | null
          row_number: number | null
          suggested_client_ids: string[] | null
          suggested_dataset_ids: string[] | null
          validation_errors: string[] | null
          validation_status: string | null
          validation_warnings: string[] | null
        }
        Insert: {
          batch_id: string
          client_match_confidence?: string | null
          client_match_method?: string | null
          contact_match_confidence?: string | null
          created_at?: string
          dataset_match_confidence?: string | null
          duplicate_opportunity_id?: string | null
          duplicate_status?: string | null
          id?: string
          imported_at?: string | null
          imported_opportunity_id?: string | null
          matched_client_id?: string | null
          matched_contact_ids?: string[] | null
          matched_dataset_id?: string | null
          matched_owner_id?: string | null
          normalized_client_name?: string | null
          normalized_owner_name?: string | null
          normalized_product_name?: string | null
          normalized_stage?: string | null
          owner_match_confidence?: string | null
          parsed_deal_creation_date?: string | null
          parsed_expected_close_date?: string | null
          parsed_renewal_due?: string | null
          parsed_value_estimate?: number | null
          parsed_value_max?: number | null
          parsed_value_min?: number | null
          raw_client_type?: string | null
          raw_comment?: string | null
          raw_contacts?: string | null
          raw_deal_creation_date?: string | null
          raw_deal_type?: string | null
          raw_deal_value_max?: string | null
          raw_deal_value_min?: string | null
          raw_expected_close_date?: string | null
          raw_name?: string | null
          raw_owner?: string | null
          raw_product?: string | null
          raw_renewal_due?: string | null
          raw_source?: string | null
          raw_stage?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_client_id?: string | null
          resolved_dataset_id?: string | null
          resolved_owner_id?: string | null
          row_number?: number | null
          suggested_client_ids?: string[] | null
          suggested_dataset_ids?: string[] | null
          validation_errors?: string[] | null
          validation_status?: string | null
          validation_warnings?: string[] | null
        }
        Update: {
          batch_id?: string
          client_match_confidence?: string | null
          client_match_method?: string | null
          contact_match_confidence?: string | null
          created_at?: string
          dataset_match_confidence?: string | null
          duplicate_opportunity_id?: string | null
          duplicate_status?: string | null
          id?: string
          imported_at?: string | null
          imported_opportunity_id?: string | null
          matched_client_id?: string | null
          matched_contact_ids?: string[] | null
          matched_dataset_id?: string | null
          matched_owner_id?: string | null
          normalized_client_name?: string | null
          normalized_owner_name?: string | null
          normalized_product_name?: string | null
          normalized_stage?: string | null
          owner_match_confidence?: string | null
          parsed_deal_creation_date?: string | null
          parsed_expected_close_date?: string | null
          parsed_renewal_due?: string | null
          parsed_value_estimate?: number | null
          parsed_value_max?: number | null
          parsed_value_min?: number | null
          raw_client_type?: string | null
          raw_comment?: string | null
          raw_contacts?: string | null
          raw_deal_creation_date?: string | null
          raw_deal_type?: string | null
          raw_deal_value_max?: string | null
          raw_deal_value_min?: string | null
          raw_expected_close_date?: string | null
          raw_name?: string | null
          raw_owner?: string | null
          raw_product?: string | null
          raw_renewal_due?: string | null
          raw_source?: string | null
          raw_stage?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_client_id?: string | null
          resolved_dataset_id?: string | null
          resolved_owner_id?: string | null
          row_number?: number | null
          suggested_client_ids?: string[] | null
          suggested_dataset_ids?: string[] | null
          validation_errors?: string[] | null
          validation_status?: string | null
          validation_warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_import_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "opportunity_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_duplicate_opportunity_id_fkey"
            columns: ["duplicate_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_imported_opportunity_id_fkey"
            columns: ["imported_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_matched_dataset_id_fkey"
            columns: ["matched_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_resolved_client_id_fkey"
            columns: ["resolved_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_import_staging_resolved_dataset_id_fkey"
            columns: ["resolved_dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_stage: string | null
          id: string
          opportunity_id: string
          to_stage: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_stage?: string | null
          id?: string
          opportunity_id: string
          to_stage: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_stage?: string | null
          id?: string
          opportunity_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fit_analyses: {
        Row: {
          client_id: string
          coverage_overlap_score: number | null
          created_at: string
          evidence_summary: string | null
          fit_score: number | null
          id: string
          is_latest: boolean | null
          product_id: string | null
          run_id: string | null
          sector_relevance: Json | null
          sector_relevance_score: number | null
          supporting_entities_json: Json | null
          timing_score: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          coverage_overlap_score?: number | null
          created_at?: string
          evidence_summary?: string | null
          fit_score?: number | null
          id?: string
          is_latest?: boolean | null
          product_id?: string | null
          run_id?: string | null
          sector_relevance?: Json | null
          sector_relevance_score?: number | null
          supporting_entities_json?: Json | null
          timing_score?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          coverage_overlap_score?: number | null
          created_at?: string
          evidence_summary?: string | null
          fit_score?: number | null
          id?: string
          is_latest?: boolean | null
          product_id?: string | null
          run_id?: string | null
          sector_relevance?: Json | null
          sector_relevance_score?: number | null
          supporting_entities_json?: Json | null
          timing_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_fit_analyses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fit_analyses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fit_analyses_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "fund_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          team: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id?: string
          is_active?: boolean
          team?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          team?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      renewals: {
        Row: {
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          id: string
          probability: number
          renewal_date: string
          status: string
          updated_at: string
          value: number
        }
        Insert: {
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          probability?: number
          renewal_date: string
          status?: string
          updated_at?: string
          value?: number
        }
        Update: {
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          probability?: number
          renewal_date?: string
          status?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "renewals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      research_signals: {
        Row: {
          client_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          dataset_id: string | null
          id: string
          notes: string | null
          source_type: string
          strength: string
          topic: string
        }
        Insert: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          notes?: string | null
          source_type?: string
          strength?: string
          topic: string
        }
        Update: {
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          dataset_id?: string | null
          id?: string
          notes?: string | null
          source_type?: string
          strength?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_signals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_signals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_signals_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      security_master: {
        Row: {
          created_at: string
          cusip: string | null
          id: string
          is_etf: boolean
          issuer_name: string
          sector: string | null
          security_type: string
          ticker: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cusip?: string | null
          id?: string
          is_etf?: boolean
          issuer_name: string
          sector?: string | null
          security_type?: string
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cusip?: string | null
          id?: string
          is_etf?: boolean
          issuer_name?: string
          sector?: string | null
          security_type?: string
          ticker?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          campaign_target_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_target_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_target_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_campaign_target_id_fkey"
            columns: ["campaign_target_id"]
            isOneToOne: false
            referencedRelation: "campaign_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_company_name: { Args: { raw_name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "sales_manager" | "sales_rep" | "viewer"
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
    Enums: {
      app_role: ["admin", "sales_manager", "sales_rep", "viewer"],
    },
  },
} as const
