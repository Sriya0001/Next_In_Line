/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';

// ─── Context ──────────────────────────────────────────────────
const ToastContext = createContext(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

// ─── Toast Provider + Display ─────────────────────────────────
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} role="alert">
            <span aria-hidden="true">{ICONS[t.type] || 'ℹ️'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Default export — the ToastProvider IS the Toast component
export default function Toast() { return null; }
