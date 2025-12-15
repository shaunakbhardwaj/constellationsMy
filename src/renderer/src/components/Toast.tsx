import React, { useState, useEffect, useCallback } from 'react'

interface Toast {
    id: string
    message: string
    type: 'info' | 'success' | 'warning' | 'error'
    progress?: number
    duration?: number
}

interface ToastManagerContextValue {
    addToast: (toast: Omit<Toast, 'id'>) => string
    removeToast: (id: string) => void
    updateToast: (id: string, updates: Partial<Toast>) => void
}

const ToastContext = React.createContext<ToastManagerContextValue | null>(null)

export function useToast(): ToastManagerContextValue {
    const context = React.useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastProvider')
    }
    return context
}

interface ToastProviderProps {
    children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps): React.JSX.Element {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const newToast: Toast = { ...toast, id }

        setToasts((prev) => [...prev, newToast])

        // Auto-dismiss after duration (default 5s, unless it has progress)
        if (!toast.progress && toast.duration !== 0) {
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id))
            }, toast.duration ?? 5000)
        }

        return id
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
        )
    }, [])

    return (
        <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
            {children}
            <div className="toast-container">
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    )
}

interface ToastItemProps {
    toast: Toast
    onClose: () => void
}

function ToastItem({ toast, onClose }: ToastItemProps): React.JSX.Element {
    return (
        <div className={`toast toast-${toast.type}`}>
            <div className="toast-content">
                <span className="toast-message">{toast.message}</span>
                <button className="toast-close" onClick={onClose} type="button">
                    ×
                </button>
            </div>
            {toast.progress !== undefined && toast.progress > 0 && (
                <div className="toast-progress">
                    <div
                        className="toast-progress-bar"
                        style={{ width: `${Math.min(100, toast.progress)}%` }}
                    />
                </div>
            )}
        </div>
    )
}

/**
 * Hook for indexing progress toasts
 */
export function useIndexingProgress(): void {
    const { addToast, updateToast, removeToast } = useToast()
    const [toastId, setToastId] = useState<string | null>(null)

    useEffect(() => {
        if (typeof window.api?.onScanProgress !== 'function') return

        const unsubscribe = window.api.onScanProgress((progress) => {
            if (progress.phase === 'indexing' && progress.filesTotal > 0) {
                const percent = Math.round((progress.newFiles + progress.updatedFiles) / progress.filesTotal * 100)
                const message = `Indexing: ${progress.currentFile ?? 'files'} (${progress.newFiles + progress.updatedFiles}/${progress.filesTotal})`

                if (!toastId) {
                    const id = addToast({
                        message,
                        type: 'info',
                        progress: percent,
                        duration: 0
                    })
                    setToastId(id)
                } else {
                    updateToast(toastId, { message, progress: percent })
                }
            } else if (progress.phase === 'complete' && toastId) {
                updateToast(toastId, {
                    message: `Indexing complete: ${progress.newFiles} new, ${progress.updatedFiles} updated`,
                    type: 'success',
                    progress: 100
                })
                setTimeout(() => {
                    removeToast(toastId)
                    setToastId(null)
                }, 3000)
            }
        })

        return unsubscribe
    }, [toastId, addToast, updateToast, removeToast])
}
