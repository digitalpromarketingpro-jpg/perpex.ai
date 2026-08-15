// ─────────────────────────────────────────────────────────────
// Supabase / PostgreSQL Database Types
// Auto-derived from supabase/schema.sql — strict, zero `any`.
//
// Tables: profiles, active_positions, pending_orders, trade_history
// RPCs:   open_position, close_position, execute_pending_order
// ─────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          equity: number
          available_margin: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          equity?: number
          available_margin?: number
        }
        Update: {
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          equity?: number
          available_margin?: number
        }
      }
      active_positions: {
        Row: {
          id: string
          user_id: string
          symbol: string
          side: "long" | "short"
          size: number
          entry_price: number
          leverage: number
          margin: number
          liq_price: number
          opened_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          symbol: string
          side: "long" | "short"
          size: number
          entry_price: number
          leverage: number
          margin?: number
          liq_price?: number
        }
        Update: {
          symbol?: string
          side?: "long" | "short"
          size?: number
          entry_price?: number
          leverage?: number
          margin?: number
          liq_price?: number
        }
      }
      pending_orders: {
        Row: {
          id: string
          user_id: string
          symbol: string
          side: "long" | "short"
          order_type: "limit" | "stop-limit"
          size: number
          limit_price: number
          leverage: number
          stop_loss: number | null
          take_profit: number | null
          status: "pending" | "filled" | "cancelled"
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          symbol: string
          side: "long" | "short"
          order_type?: "limit" | "stop-limit"
          size: number
          limit_price: number
          leverage: number
          stop_loss?: number | null
          take_profit?: number | null
        }
        Update: {
          symbol?: string
          side?: "long" | "short"
          order_type?: "limit" | "stop-limit"
          size?: number
          limit_price?: number
          leverage?: number
          stop_loss?: number | null
          take_profit?: number | null
          status?: "pending" | "filled" | "cancelled"
        }
      }
      trade_history: {
        Row: {
          id: string
          user_id: string
          symbol: string
          side: "buy" | "sell"
          qty: number
          price: number
          realized_pnl: number
          fee: number
          status: "CLOSED" | "LIQUIDATED" | "FUNDING"
          closed_at: string
        }
        Insert: {
          user_id: string
          symbol: string
          side: "buy" | "sell"
          qty: number
          price: number
          realized_pnl?: number
          fee?: number
          status?: "CLOSED" | "LIQUIDATED" | "FUNDING"
        }
        Update: {
          symbol?: string
          side?: "buy" | "sell"
          qty?: number
          price?: number
          realized_pnl?: number
          fee?: number
          status?: "CLOSED" | "LIQUIDATED" | "FUNDING"
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      open_position: {
        Args: {
          p_user_id: string
          p_symbol: string
          p_side: string
          p_size: number
          p_entry_price: number
          p_leverage: number
        }
        Returns: string
      }
      close_position: {
        Args: {
          p_user_id: string
          p_position_id: string
          p_close_price: number
        }
        Returns: number
      }
      execute_pending_order: {
        Args: {
          p_user_id: string
          p_order_id: string
          p_fill_price: number
        }
        Returns: string
      }
      liquidate_position: {
        Args: {
          p_user_id: string
          p_position_id: string
          p_mark_price: number
        }
        Returns: number
      }
      apply_funding_payment: {
        Args: {
          p_user_id: string
          p_position_id: string
          p_symbol: string
          p_side: string
          p_size: number
          p_mark_price: number
          p_funding_rate: number
        }
        Returns: number
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

// ── Convenience aliases ─────────────────────────────────────

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"]
export type ActivePositionRow = Database["public"]["Tables"]["active_positions"]["Row"]
export type TradeHistoryRow = Database["public"]["Tables"]["trade_history"]["Row"]
export type PendingOrderRow = Database["public"]["Tables"]["pending_orders"]["Row"]

export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"]
export type ActivePositionInsert = Database["public"]["Tables"]["active_positions"]["Insert"]
export type TradeHistoryInsert = Database["public"]["Tables"]["trade_history"]["Insert"]
export type PendingOrderInsert = Database["public"]["Tables"]["pending_orders"]["Insert"]
