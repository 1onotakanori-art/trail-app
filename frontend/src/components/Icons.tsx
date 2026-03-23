/**
 * Shared icon components using lucide-react.
 * Centralizes state/feeling icon logic used across multiple components.
 */
import React from 'react'
import { CheckCircle2, Circle, Clock, AlertTriangle, MessageSquare } from 'lucide-react'

export type State = '進行中' | '待機中' | '完了'
export type Feeling = '順調' | 'やや不安' | '遅延しそう' | '相談したい'

interface StateIconProps {
  state: string
  size?: number
}

export function StateIcon({ state, size = 14 }: StateIconProps) {
  switch (state) {
    case '進行中':
      return <Circle size={size} color="#1565c0" fill="#1565c0" />
    case '待機中':
      return <Circle size={size} color="#9e9e9e" fill="#e0e0e0" />
    case '完了':
      return <CheckCircle2 size={size} color="#2e7d32" fill="#e8f5e9" />
    default:
      return <Circle size={size} color="#9e9e9e" />
  }
}

interface FeelingIconProps {
  feeling: string
  size?: number
}

export function FeelingIcon({ feeling, size = 13 }: FeelingIconProps) {
  switch (feeling) {
    case '順調':
      return <CheckCircle2 size={size} color="#2e7d32" />
    case 'やや不安':
      return <Clock size={size} color="#f57c00" />
    case '遅延しそう':
      return <AlertTriangle size={size} color="#d32f2f" />
    case '相談したい':
      return <MessageSquare size={size} color="#7b1fa2" />
    default:
      return null
  }
}

/** Inline icon wrapper for use in flexbox rows */
export function IconInline({ children, gap = 4 }: { children: React.ReactNode; gap?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {children}
    </span>
  )
}
