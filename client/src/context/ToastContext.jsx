
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const toastStyles = {
    success: {
        icon: CheckCircle2,
        bg: '#14532D',
        border: '#166534',
        color: '#4ADE80',
        text: '#F0FDF4'
    },
    error: {
        icon: AlertTriangle,
        bg: '#7F1D1D',
        border: '#991B1B',
        color: '#F87171',
        text: '#FEF2F2'
    },
    info: {
        icon: Info,
        bg: '#1E3A8A',
        border: '#1D4ED8',
        color: '#60A5FA',
        text: '#EFF6FF'
    }
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const timers = useRef(new Map());
    const counter = useRef(0);

    const removeToast = useCallback((id) => {
        clearTimeout(timers.current.get(id));
        timers.current.delete(id);
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);


const showToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${++counter.current}`;
    const toastType = toastStyles[type] ? type : 'info';

    setToasts(prev => {
        const updated = [...prev, { id, message, type: toastType }];

        // Remove oldest toasts and clear their timers
        if (updated.length > 4) {
            const removed = updated.slice(0, updated.length - 4);
            removed.forEach(toast => {
                clearTimeout(timers.current.get(toast.id));
                timers.current.delete(toast.id);
            });
        }

        return updated.slice(-4);
    });

    timers.current.set(id, setTimeout(() => {
        removeToast(id);
    }, 4000));
}, [removeToast]);


    useEffect(() => {
        return () => {
            timers.current.forEach(clearTimeout);
            timers.current.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            <div className="toast-container" aria-label="Notifications" aria-live="polite">
                {toasts.map(toast => {
                    const config = toastStyles[toast.type];
                    const Icon = config.icon;

                    return (
                        <div
                            key={toast.id}
                            className="premium-toast"
                            role={toast.type === 'error' ? 'alert' : 'status'}
                            style={{
                                background: config.bg,
                                borderColor: config.border,
                                color: config.text
                            }}
                        >
                            <div
                                className="toast-icon"
                                style={{
                                    background: `${config.color}20`,
                                    color: config.color
                                }}
                            >
                                <Icon size={21} />
                            </div>

                            <span className="toast-message">{toast.message}</span>

                            <button
                                className="toast-close"
                                onClick={() => removeToast(toast.id)}
                                aria-label="Dismiss notification"
                            >
                                <X size={17} />
                            </button>

                            <div
                                className="toast-progress"
                                style={{
                                    background: config.color,
                                    animationDuration: '4s'
                                }}
                            />
                        </div>
                    );
                })}
            </div>

            <style>{`
                .toast-container {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    width: min(400px, calc(100vw - 32px));
                    pointer-events: none;
                }

                .premium-toast {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 16px 18px;
                    border: 1px solid;
                    border-left-width: 4px;
                    border-radius: 14px;
                    box-shadow: 0 12px 30px rgba(0,0,0,0.3);
                    min-width: 0;
                    pointer-events: auto;
                    overflow: hidden;
                    animation: slideInRight 0.35s cubic-bezier(0.16,1,0.3,1) both;
                }

                .toast-icon {
                    flex-shrink: 0;
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .toast-message {
                    flex: 1;
                    font-size: 0.92rem;
                    font-weight: 500;
                    line-height: 1.5;
                    overflow-wrap: anywhere;
                }

                .toast-close {
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    height: 30px;
                    padding: 0;
                    border: none;
                    border-radius: 8px;
                    background: transparent;
                    color: inherit;
                    opacity: 0.65;
                    cursor: pointer;
                    transition: 0.2s;
                }

                .toast-close:hover {
                    opacity: 1;
                    background: rgba(255,255,255,0.12);
                }

                .toast-progress {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 3px;
                    width: 100%;
                    opacity: 0.9;
                    animation: progressBar linear forwards;
                }

                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(60px) scale(0.96); }
                    to { opacity: 1; transform: translateX(0) scale(1); }
                }

                @keyframes progressBar {
                    from { width: 100%; }
                    to { width: 0%; }
                }

                @media (max-width: 600px) {
                    .toast-container {
                        bottom: 16px;
                        right: 16px;
                        left: 16px;
                        width: auto;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .premium-toast, .toast-progress {
                        animation: none;
                    }
                }
            `}</style>
        </ToastContext.Provider>
    );
};
