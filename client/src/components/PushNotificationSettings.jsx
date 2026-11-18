
import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, CheckCircle2, X } from 'lucide-react';
import { API_BASE, useWorkforce } from '../context/workforceShared';

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from(rawData, char => char.charCodeAt(0));
};

const PushNotificationSettings = () => {
    const { token } = useWorkforce();
    const popupRef = useRef(null);
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [supported, setSupported] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const checkSupport = async () => {
            const available = Boolean(
                API_BASE &&
                'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window
            );

            setSupported(available);
            if (!available) return;

            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                setSubscription(await registration.pushManager.getSubscription());
            } catch {
                setMessage('Unable to initialize browser notifications.');
            }
        };

        checkSupport();
    }, []);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        document.addEventListener('pointerdown', handleOutsideClick);
        return () => document.removeEventListener('pointerdown', handleOutsideClick);
    }, []);

    const enableNotifications = async () => {
        if (!token || loading) return;

        setLoading(true);
        setMessage('');

        try {
            const permission = await Notification.requestPermission();

            if (permission !== 'granted') {
                throw new Error(
                    permission === 'denied'
                        ? 'Notifications are blocked in browser settings.'
                        : 'Notification permission was not granted.'
                );
            }

            const registration = await navigator.serviceWorker.register('/sw.js');
            const keyResponse = await fetch(`${API_BASE}/api/push/public-key`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!keyResponse.ok) throw new Error('Unable to retrieve push configuration.');

            const { publicKey } = await keyResponse.json();
            if (!publicKey) throw new Error('Push public key is missing.');

            let currentSubscription = await registration.pushManager.getSubscription();

            if (!currentSubscription) {
                currentSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
            }

            const saveResponse = await fetch(`${API_BASE}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(currentSubscription.toJSON())
            });

            if (!saveResponse.ok) {
                const result = await saveResponse.json();
                throw new Error(result.error || 'Unable to save push subscription.');
            }

            setSubscription(currentSubscription);
            setMessage('Notifications enabled successfully.');
        } catch (error) {
            setMessage(error.message || 'Unable to enable notifications.');
        } finally {
            setLoading(false);
        }
    };

    const disableNotifications = async () => {
        if (!subscription || loading) return;

        setLoading(true);
        setMessage('');

        try {
            const response = await fetch(`${API_BASE}/api/push/subscription`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Unable to remove subscription.');
            }

            await subscription.unsubscribe();
            setSubscription(null);
            setMessage('Notifications disabled.');
        } catch (error) {
            setMessage(error.message || 'Unable to disable notifications.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div ref={popupRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                aria-label="Notification settings"
                aria-expanded={open}
                title="Notification settings"
                style={{
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: '34px',
    height: '34px',
    padding: 0,
    border: '1px solid var(--border-color, #8884)',
    borderRadius: '9px',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer'
}}
            >
                <Bell size={19} />
                {subscription && (
                    <span style={{
                        position: 'absolute',
                        top: '7px',
                        right: '7px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        border: '2px solid var(--card-bg, #fff)'
                    }} />
                )}
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Notification settings"
                    style={{
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    zIndex: 1000,
    width: 'min(290px, calc(100vw - 24px))',
    boxSizing: 'border-box',
    padding: '15px',
    border: '1px solid var(--border-color, #8884)',
    borderRadius: '12px',
background: 'var(--card-bg, #fff)',
backdropFilter: 'none',
WebkitBackdropFilter: 'none',
opacity: 1,
boxShadow: '0 8px 24px rgba(0,0,0,0.20)'
}}
                >
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px'
                    }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                            <Bell size={18} /> Notifications
                        </strong>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close notification settings"
                            style={{
                                display: 'grid',
                                placeItems: 'center',
                                border: 0,
                                background: 'transparent',
                                color: 'inherit',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '13px',
                        borderRadius: '10px',
                        background: 'var(--bg-secondary, rgba(128,128,128,0.10))'
                    }}>
                        <span style={{ color: subscription ? '#16a34a' : 'inherit' }}>
                            {subscription ? <CheckCircle2 size={23} /> : <BellOff size={23} />}
                        </span>
                        <div>
                            <strong style={{ fontSize: '13px' }}>
                                {subscription ? 'Notifications enabled' : 'Notifications disabled'}
                            </strong>
                            <p style={{ margin: '4px 0 0', fontSize: '12px', opacity: 0.7 }}>
                                {subscription
                                    ? 'This browser is subscribed.'
                                    : 'Get attendance reminders on this browser.'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={subscription ? disableNotifications : enableNotifications}
                        disabled={!supported || loading || !token}
                        style={{
                            width: '100%',
                            marginTop: '14px',
                            padding: '11px',
                            border: 0,
                            borderRadius: '9px',
                            background: subscription ? '#dc2626' : 'var(--primary, #2563eb)',
                            color: '#fff',
                            fontWeight: 600,
                            cursor: supported && !loading ? 'pointer' : 'not-allowed',
                            opacity: supported && !loading ? 1 : 0.6
                        }}
                    >
                        {loading
                            ? 'Please wait...'
                            : subscription
                                ? 'Disable notifications'
                                : 'Enable notifications'}
                    </button>

                    {message && (
                        <p role="status" style={{
                            margin: '11px 0 0',
                            fontSize: '12px',
                            lineHeight: 1.5,
                            color: message.includes('successfully') || message.includes('disabled')
                                ? '#16a34a'
                                : '#dc2626'
                        }}>
                            {message}
                        </p>
                    )}

                    {!supported && (
                        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#dc2626' }}>
                            Push notifications are not supported or API is unavailable.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default PushNotificationSettings;
