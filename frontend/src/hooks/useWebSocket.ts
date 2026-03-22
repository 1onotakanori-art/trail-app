import { useEffect, useRef, useCallback } from 'react'

type Handler = (data: unknown) => void

// 4-19: Request browser notification permission
let notificationPermissionRequested = false
function requestNotificationPermission() {
  if (notificationPermissionRequested) return
  notificationPermissionRequested = true
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

// 4-19: Show browser notification
function showBrowserNotification(data: { type?: string; title?: string; body?: string }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (document.hasFocus()) return // Don't show if tab is focused
  const title = data.title || (data.type === 'mention' ? 'メンション' : data.type === 'notification' ? '通知' : '新しいメッセージ')
  const body = data.body || ''
  try {
    new Notification(title, { body, icon: '/favicon.ico', tag: data.type || 'trail' })
  } catch {
    // Notifications not supported in this context
  }
}

export function useWebSocket(token: string | null, onMessage: Handler) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 4-1: Hold onMessage in ref to prevent reconnection on callback change
  const onMessageRef = useRef<Handler>(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!token) return
    // 4-19: Request notification permission on connect
    requestNotificationPermission()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws?token=${token}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] connected')
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessageRef.current(data)
        // 4-19: Browser notification for mentions, notifications, follow alerts
        const d = data as { type?: string; title?: string; body?: string }
        if (d.type && ['mention', 'notification', 'follow_alert'].includes(d.type)) {
          showBrowserNotification(d)
        }
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      console.log('[WS] disconnected, reconnecting in 3s...')
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [token])  // 4-1: Only depend on token, not onMessage

  useEffect(() => {
    if (!token) return
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [token, connect])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
