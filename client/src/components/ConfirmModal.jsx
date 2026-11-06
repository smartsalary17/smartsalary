import React from 'react';

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = true }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
            <div style={{ width: '100%', maxWidth: '400px', padding: '1.5rem', borderRadius: '16px', background: 'var(--sidebar-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: '0.75rem', fontSize: '1.15rem' }}>{title}</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>{message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button onClick={onCancel} style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'inherit', cursor: 'pointer', width: 'auto' }}>{cancelText}</button>
                    <button onClick={onConfirm} style={{ padding: '0.65rem 1rem', borderRadius: '8px', border: 'none', background: danger ? '#dc2626' : 'var(--primary)', color: '#fff', cursor: 'pointer', width: 'auto' }}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
