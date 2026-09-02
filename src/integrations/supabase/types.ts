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
      batch_job_items: {
        Row: {
          attempts: number
          batch_job_id: string
          created_at: string
          cut_id: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          label: string | null
          payload: Json
          render_job_id: string | null
          status: string
          template_instance_id: string | null
          updated_at: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          attempts?: number
          batch_job_id: string
          created_at?: string
          cut_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          label?: string | null
          payload?: Json
          render_job_id?: string | null
          status?: string
          template_instance_id?: string | null
          updated_at?: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          attempts?: number
          batch_job_id?: string
          created_at?: string
          cut_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          label?: string | null
          payload?: Json
          render_job_id?: string | null
          status?: string
          template_instance_id?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_job_items_batch_job_id_fkey"
            columns: ["batch_job_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_job_items_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_job_items_template_instance_id_fkey"
            columns: ["template_instance_id"]
            isOneToOne: false
            referencedRelation: "template_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          failed_items: number
          id: string
          lock_id: string | null
          locked_at: string | null
          paused_reason: string | null
          processed_items: number
          settings: Json
          started_at: string | null
          status: string
          successful_items: number
          template_id: string | null
          total_items: number
          type: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_items?: number
          id?: string
          lock_id?: string | null
          locked_at?: string | null
          paused_reason?: string | null
          processed_items?: number
          settings?: Json
          started_at?: string | null
          status?: string
          successful_items?: number
          template_id?: string | null
          total_items?: number
          type?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_items?: number
          id?: string
          lock_id?: string | null
          locked_at?: string | null
          paused_reason?: string | null
          processed_items?: number
          settings?: Json
          started_at?: string | null
          status?: string
          successful_items?: number
          template_id?: string | null
          total_items?: number
          type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          failed: number
          id: string
          mode: string
          ok: number
          platforms: string[]
          seconds: number
          template_name: string | null
          user_id: string
          videos: number
        }
        Insert: {
          created_at?: string
          failed?: number
          id?: string
          mode?: string
          ok?: number
          platforms?: string[]
          seconds?: number
          template_name?: string | null
          user_id: string
          videos?: number
        }
        Update: {
          created_at?: string
          failed?: number
          id?: string
          mode?: string
          ok?: number
          platforms?: string[]
          seconds?: number
          template_name?: string | null
          user_id?: string
          videos?: number
        }
        Relationships: []
      }
      cleaner_jobs: {
        Row: {
          created_at: string
          detections: Json
          error: string | null
          filename: string
          id: string
          masks: Json
          metrics: Json | null
          mode: string
          options: Json
          preset: string
          preview_url: string | null
          probe: Json | null
          progress: number
          result_url: string | null
          size_bytes: number | null
          stage: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detections?: Json
          error?: string | null
          filename: string
          id?: string
          masks?: Json
          metrics?: Json | null
          mode?: string
          options?: Json
          preset?: string
          preview_url?: string | null
          probe?: Json | null
          progress?: number
          result_url?: string | null
          size_bytes?: number | null
          stage?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detections?: Json
          error?: string | null
          filename?: string
          id?: string
          masks?: Json
          metrics?: Json | null
          mode?: string
          options?: Json
          preset?: string
          preview_url?: string | null
          probe?: Json | null
          progress?: number
          result_url?: string | null
          size_bytes?: number | null
          stage?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clip_outcomes: {
        Row: {
          clip_seconds: number
          created_at: string
          id: string
          post_id: string | null
          predicted_score: number
          source: string
          tags: string[]
          user_id: string
        }
        Insert: {
          clip_seconds?: number
          created_at?: string
          id?: string
          post_id?: string | null
          predicted_score?: number
          source?: string
          tags?: string[]
          user_id: string
        }
        Update: {
          clip_seconds?: number
          created_at?: string
          id?: string
          post_id?: string | null
          predicted_score?: number
          source?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_outcomes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          confirmation_code: string
          id: string
          platforms: string[]
          reason: string | null
          request_type: string
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          confirmation_code?: string
          id?: string
          platforms?: string[]
          reason?: string | null
          request_type?: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          confirmation_code?: string
          id?: string
          platforms?: string[]
          reason?: string | null
          request_type?: string
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exports: {
        Row: {
          bytes: number
          caption: string | null
          created_at: string
          file_name: string
          id: string
          mode: string
          platform: string | null
          seconds: number
          source_name: string | null
          storage_path: string | null
          thumb_url: string | null
          user_id: string
          variant: string | null
        }
        Insert: {
          bytes?: number
          caption?: string | null
          created_at?: string
          file_name: string
          id?: string
          mode: string
          platform?: string | null
          seconds?: number
          source_name?: string | null
          storage_path?: string | null
          thumb_url?: string | null
          user_id: string
          variant?: string | null
        }
        Update: {
          bytes?: number
          caption?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mode?: string
          platform?: string | null
          seconds?: number
          source_name?: string | null
          storage_path?: string | null
          thumb_url?: string | null
          user_id?: string
          variant?: string | null
        }
        Relationships: []
      }
      post_insights: {
        Row: {
          comments: number
          created_at: string
          fetched_at: string
          id: string
          impressions: number
          likes: number
          platform_data: Json
          post_id: string
          reach: number
          saves: number
          shares: number
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          comments?: number
          created_at?: string
          fetched_at?: string
          id?: string
          impressions?: number
          likes?: number
          platform_data?: Json
          post_id: string
          reach?: number
          saves?: number
          shares?: number
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          comments?: number
          created_at?: string
          fetched_at?: string
          id?: string
          impressions?: number
          likes?: number
          platform_data?: Json
          post_id?: string
          reach?: number
          saves?: number
          shares?: number
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_insights_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          data: Json
          id: string
          mode: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          mode: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          mode?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      render_batches: {
        Row: {
          callback_seq: number
          created_at: string
          done: number
          errors: number
          heartbeat_at: string | null
          id: string
          label: string | null
          metrics: Json
          preset: Json
          status: string
          tool: string
          total: number
          updated_at: string
          user_id: string
          worker_version: string | null
        }
        Insert: {
          callback_seq?: number
          created_at?: string
          done?: number
          errors?: number
          heartbeat_at?: string | null
          id?: string
          label?: string | null
          metrics?: Json
          preset?: Json
          status?: string
          tool?: string
          total?: number
          updated_at?: string
          user_id: string
          worker_version?: string | null
        }
        Update: {
          callback_seq?: number
          created_at?: string
          done?: number
          errors?: number
          heartbeat_at?: string | null
          id?: string
          label?: string | null
          metrics?: Json
          preset?: Json
          status?: string
          tool?: string
          total?: number
          updated_at?: string
          user_id?: string
          worker_version?: string | null
        }
        Relationships: []
      }
      render_items: {
        Row: {
          attempts: number
          batch_id: string
          callback_seq: number
          created_at: string
          error: string | null
          heartbeat_at: string | null
          id: string
          metrics: Json
          name: string
          overrides: Json
          progress: number
          result_path: string | null
          source_url: string | null
          stage: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          batch_id: string
          callback_seq?: number
          created_at?: string
          error?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          name: string
          overrides?: Json
          progress?: number
          result_path?: string | null
          source_url?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          batch_id?: string
          callback_seq?: number
          created_at?: string
          error?: string | null
          heartbeat_at?: string | null
          id?: string
          metrics?: Json
          name?: string
          overrides?: Json
          progress?: number
          result_path?: string | null
          source_url?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "render_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error: string | null
          format: string
          fps: number
          height: number
          id: string
          idempotency_key: string | null
          output_path: string | null
          output_url: string | null
          progress: number
          project_id: string | null
          started_at: string | null
          status: string
          template_instance_id: string | null
          updated_at: string
          user_id: string
          video_id: string | null
          width: number
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          format?: string
          fps?: number
          height?: number
          id?: string
          idempotency_key?: string | null
          output_path?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          started_at?: string | null
          status?: string
          template_instance_id?: string | null
          updated_at?: string
          user_id: string
          video_id?: string | null
          width?: number
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error?: string | null
          format?: string
          fps?: number
          height?: number
          id?: string
          idempotency_key?: string | null
          output_path?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          started_at?: string | null
          status?: string
          template_instance_id?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_template_instance_id_fkey"
            columns: ["template_instance_id"]
            isOneToOne: false
            referencedRelation: "template_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          account_id: string | null
          attempts: number
          caption: string
          created_at: string
          error: string | null
          error_code: string | null
          file_name: string | null
          id: string
          kind: string
          lock_id: string | null
          locked_at: string | null
          media_type: string
          next_attempt_at: string | null
          permalink: string | null
          provider_container_id: string | null
          provider_post_id: string | null
          published_at: string | null
          scheduled_at: string
          status: string
          updated_at: string
          user_id: string
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          account_id?: string | null
          attempts?: number
          caption?: string
          created_at?: string
          error?: string | null
          error_code?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          lock_id?: string | null
          locked_at?: string | null
          media_type?: string
          next_attempt_at?: string | null
          permalink?: string | null
          provider_container_id?: string | null
          provider_post_id?: string | null
          published_at?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id: string
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          account_id?: string | null
          attempts?: number
          caption?: string
          created_at?: string
          error?: string | null
          error_code?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          lock_id?: string | null
          locked_at?: string | null
          media_type?: string
          next_attempt_at?: string | null
          permalink?: string | null
          provider_container_id?: string | null
          provider_post_id?: string | null
          published_at?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_primary: boolean
          platform: string
          provider: string
          provider_account_id: string | null
          status: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_primary?: boolean
          platform?: string
          provider?: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_primary?: boolean
          platform?: string
          provider?: string
          provider_account_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      social_connection_credentials: {
        Row: {
          access_token_ciphertext: string
          connection_id: string
          created_at: string
          expires_at: string
          refresh_expires_at: string | null
          refresh_token_ciphertext: string | null
          token_kind: string
          updated_at: string
        }
        Insert: {
          access_token_ciphertext: string
          connection_id: string
          created_at?: string
          expires_at: string
          refresh_expires_at?: string | null
          refresh_token_ciphertext?: string | null
          token_kind?: string
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string
          connection_id?: string
          created_at?: string
          expires_at?: string
          refresh_expires_at?: string | null
          refresh_token_ciphertext?: string | null
          token_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connection_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          provider_account_id: string | null
          social_account_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          provider_account_id?: string | null
          social_account_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          provider_account_id?: string | null
          social_account_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_connections_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_sync_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          next_run_at: string
          provider: string
          social_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          provider?: string
          social_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string
          provider?: string
          social_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_sync_schedules_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          credits: number
          period_end: string
          plan: string
          simulated: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits?: number
          period_end?: string
          plan?: string
          simulated?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          period_end?: string
          plan?: string
          simulated?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_instances: {
        Row: {
          created_at: string
          cut_id: string | null
          id: string
          instance_data: Json
          label: string | null
          project_id: string | null
          template_id: string | null
          template_version: number | null
          updated_at: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          cut_id?: string | null
          id?: string
          instance_data?: Json
          label?: string | null
          project_id?: string | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          cut_id?: string | null
          id?: string
          instance_data?: Json
          label?: string | null
          project_id?: string | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          label: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          label?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          label?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          data: Json
          id: string
          local_id: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          local_id?: string | null
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          local_id?: string | null
          name?: string
          updated_at?: string
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
      video_cuts: {
        Row: {
          caption: string | null
          created_at: string
          cut_key: string
          end_sec: number
          id: string
          score: number
          source_id: string
          source_name: string
          start_sec: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          cut_key: string
          end_sec?: number
          id?: string
          score?: number
          source_id: string
          source_name: string
          start_sec?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          cut_key?: string
          end_sec?: number
          id?: string
          score?: number
          source_id?: string
          source_name?: string
          start_sec?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_templates: {
        Row: {
          aspect_ratio: string
          canvas_height: number
          canvas_width: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          tags: string[]
          template_data: Json
          template_version: number
          thumbnail_url: string | null
          updated_at: string
          usage_count: number
          user_id: string
          visibility: string
          workspace_id: string | null
        }
        Insert: {
          aspect_ratio?: string
          canvas_height?: number
          canvas_width?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tags?: string[]
          template_data?: Json
          template_version?: number
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id: string
          visibility?: string
          workspace_id?: string | null
        }
        Update: {
          aspect_ratio?: string
          canvas_height?: number
          canvas_width?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          tags?: string[]
          template_data?: Json
          template_version?: number
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          visibility?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      video_transcripts: {
        Row: {
          created_at: string
          duration: number
          id: string
          language: string
          project_id: string | null
          scenes: Json
          speakers: Json
          status: string
          text: string
          updated_at: string
          user_id: string
          video_id: string
          words: Json
        }
        Insert: {
          created_at?: string
          duration?: number
          id?: string
          language?: string
          project_id?: string | null
          scenes?: Json
          speakers?: Json
          status?: string
          text?: string
          updated_at?: string
          user_id: string
          video_id: string
          words?: Json
        }
        Update: {
          created_at?: string
          duration?: number
          id?: string
          language?: string
          project_id?: string | null
          scenes?: Json
          speakers?: Json
          status?: string
          text?: string
          updated_at?: string
          user_id?: string
          video_id?: string
          words?: Json
        }
        Relationships: [
          {
            foreignKeyName: "video_transcripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_due_scheduled_posts: {
        Args: {
          p_limit: number
          p_lock_id: string
          p_lock_timeout_seconds: number
          p_max_attempts: number
        }
        Returns: {
          account_id: string
          attempts: number
          caption: string
          id: string
          kind: string
          media_type: string
          user_id: string
          video_path: string
          video_url: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      link_global_meta_account: {
        Args: {
          p_provider_account_id: string
          p_user_id: string
          p_username: string
        }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          platform: string
          provider: string
          provider_account_id: string
          status: string
          username: string
        }[]
      }
      link_meta_oauth_account: {
        Args: {
          p_access_token_ciphertext: string
          p_expires_at: string
          p_provider_account_id: string
          p_user_id: string
          p_username: string
        }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          platform: string
          provider: string
          provider_account_id: string
          status: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
