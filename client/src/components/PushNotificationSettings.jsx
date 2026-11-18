
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Check, X } from 'lucide-react';
import { API_BASE, useWorkforce } from '../context/workforceShared';
import { useToast } from '../context/ToastContext';

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from(rawData, char => char.charCodeAt(0));
};

const PushNotificationSettings = () => {
    const { token } = useWorkforce();
    const { showToast } = useToast();
    const popupRef = useRef(null);

    const [open, setOpen] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [supported, setSupported] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    const [reminder, setReminder] = useState({
        enabled: true,
        time: '18:00'
    });

    useEffect(() => {
        const available = Boolean(
            API_BASE &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );

        setSupported(available);

        if (!available) return;

        const initialize = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                const currentSubscription = await registration.pushManager.getSubscription();
                setSubscription(currentSubscription);
            } catch {
                showToast('Unable to initialize notifications.', 'error');
            }
        };

        initialize();
    }, [showToast]);

    useEffect(() => {
        if (!open) return;

        const handleOutsideClick = (event) => {
            if (popupRef.current && !popupRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('pointerdown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('pointerdown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    const loadReminderSettings = useCallback(async () => {
        if (!API_BASE || !token) return;

        try {
            const response = await fetch(
                `${API_BASE}/api/attendance-reminder-settings`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unable to load reminder settings.');
            }

            setReminder({
                enabled: data.enabled,
                time: `${String(data.hour).padStart(2, '0')}:${String(data.minute).padStart(2, '0')}`
            });

            setSettingsLoaded(true);
        } catch (error) {
            showToast(error.message || 'Unable to load reminder settings.', 'error');
        }
    }, [token, showToast]);

    useEffect(() => {
        if (open && !settingsLoaded) {
            loadReminderSettings();
        }
    }, [open, settingsLoaded, loadReminderSettings]);

    const saveReminderSettings = async () => {
        if (!API_BASE || !token || saving || !settingsLoaded) return;

        const [hour, minute] = reminder.time.split(':').map(Number);

        setSaving(true);

        try {
            const response = await fetch(
                `${API_BASE}/api/attendance-reminder-settings`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        enabled: reminder.enabled,
                        hour,
                        minute
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unable to save reminder settings.');
            }

            showToast('Attendance reminder settings saved.', 'success');
            setOpen(false);
        } catch (error) {
            showToast(error.message || 'Unable to save settings.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const enableNotifications = async () => {
        if (!token || loading || !supported) return;

        setLoading(true);

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

            if (!keyResponse.ok) {
                throw new Error('Unable to retrieve push configuration.');
            }

            const { publicKey } = await keyResponse.json();

            if (!publicKey) {
                throw new Error('Push public key is missing.');
            }

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
                throw new Error(result.error || 'Unable to save subscription.');
            }

            setSubscription(currentSubscription);
            showToast('Notifications enabled successfully.', 'success');
        } catch (error) {
            showToast(error.message || 'Unable to enable notifications.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const disableNotifications = async () => {
        if (!subscription || loading) return;

        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/push/subscription`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Unable to remove subscription.');
            }

            await subscription.unsubscribe();
            setSubscription(null);
            showToast('Notifications disabled.', 'success');
        } catch (error) {
            showToast(error.message || 'Unable to disable notifications.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const modal = open && typeof document !== 'undefined'
        ? createPortal(
            <div
                onClick={() => setOpen(false)}
style={{
    position: 'fixed',
    inset: 0,
    zIndex: 999999,
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(15px)',
    WebkitBackdropFilter: 'blur(15px)'
}}
            >
                <div
                    ref={popupRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Notification settings"
                    onClick={event => event.stopPropagation()}
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 360,
                        maxHeight: '85dvh',
                        overflowY: 'auto',
                        boxSizing: 'border-box',
                        padding: 20,
                        border: '1px solid var(--border-color, #8884)',
                        borderRadius: 14,
                        background: 'var(--card-bg, #fff)',
                        color: 'var(--text-primary, inherit)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.3)'
                    }}
                >
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 16
                    }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Bell size={18} /> Notifications
                        </strong>

                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Close"
                            style={{
                                display: 'grid',
                                placeItems: 'center',
                                width: 30,
                                height: 30,
                                border: 0,
                                borderRadius: 7,
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
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border-color, #8884)'
                    }}>
                        <div>
                            <strong style={{ fontSize: 14 }}>Notify</strong>
                            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.65 }}>
                                Attendance reminder
                            </p>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={reminder.enabled}
                            aria-label="Attendance reminder"
                            onClick={() => setReminder(prev => ({
                                ...prev,
                                enabled: !prev.enabled
                            }))}
                            style={{
                                width: 44,
                                height: 25,
                                padding: 3,
                                border: 0,
                                borderRadius: 20,
                                background: reminder.enabled ? '#16a34a' : '#9ca3af',
                                cursor: 'pointer',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: reminder.enabled ? 'flex-end' : 'flex-start'
                            }}
                        >
                            <span style={{
                                width: 19,
                                height: 19,
                                borderRadius: '50%',
                                background: '#fff',
                                boxShadow: '0 1px 3px #0003'
                            }} />
                        </button>
                    </div>

                    {reminder.enabled && (
                        <div style={{ marginTop: 16 }}>
                            <label
                                htmlFor="attendance-reminder-time"
                                style={{
                                    display: 'block',
                                    marginBottom: 8,
                                    fontSize: 13,
                                    fontWeight: 600
                                }}
                            >
                                Reminder time
                            </label>

                            <input
                                id="attendance-reminder-time"
                                type="time"
                                value={reminder.time}
                                onChange={event => setReminder(prev => ({
                                    ...prev,
                                    time: event.target.value
                                }))}
                                disabled={!settingsLoaded}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: 11,
                                    border: '1px solid var(--border-color, #8884)',
                                    borderRadius: 8,
                                    background: 'var(--input-bg, var(--card-bg, #fff))',
                                    color: 'inherit',
                                    fontSize: 14,
                                    colorScheme: 'light dark'
                                }}
                            />

                            <p style={{ margin: '7px 0 0', fontSize: 11, opacity: 0.6 }}>
                                Time zone: Asia/Kolkata
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={saveReminderSettings}
                        disabled={!settingsLoaded || saving}
                        style={{
                            width: '100%',
                            marginTop: 16,
                            padding: 11,
                            border: 0,
                            borderRadius: 8,
                            background: 'var(--primary, #2563eb)',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: settingsLoaded && !saving ? 'pointer' : 'not-allowed',
                            opacity: settingsLoaded && !saving ? 1 : 0.6
                        }}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </button>

                    <div style={{
                        margin: '18px 0',
                        borderTop: '1px solid var(--border-color, #8884)'
                    }} />

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 12
                    }}>
                        {subscription
                            ? <Check size={19} color="#16a34a" />
                            : <BellOff size={19} />}

                        <div>
                            <strong style={{ fontSize: 13 }}>
                                {subscription
                                    ? 'Browser notifications enabled'
                                    : 'Browser notifications disabled'}
                            </strong>

                            <p style={{ margin: '3px 0 0', fontSize: 11, opacity: 0.65 }}>
                                {subscription
                                    ? 'This device is subscribed.'
                                    : 'Enable to receive push notifications on this device.'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={subscription ? disableNotifications : enableNotifications}
                        disabled={!supported || loading || !token}
                        style={{
                            width: '100%',
                            padding: 10,
                            border: '1px solid var(--border-color, #8884)',
                            borderRadius: 8,
                            background: 'transparent',
                            color: 'inherit',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: supported && !loading ? 'pointer' : 'not-allowed',
                            opacity: supported && !loading ? 1 : 0.55
                        }}
                    >
                        {loading
                            ? 'Please wait...'
                            : subscription
                                ? 'Disable browser notifications'
                                : 'Enable browser notifications'}
                    </button>

                    {!API_BASE && (
                        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#dc2626' }}>
                            API URL is not configured.
                        </p>
                    )}

                    {!supported && API_BASE && (
                        <p style={{ margin: '10px 0 0', fontSize: 11, color: '#dc2626' }}>
                            Push notifications are not supported in this browser.
                        </p>
                    )}
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Notification settings"
                aria-expanded={open}
                title="Notification settings"
                style={{
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    padding: 0,
                    border: '1px solid var(--border-color, #8884)',
                    borderRadius: 9,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer'
                }}
            >
                <Bell size={19} />
                {subscription && (
                    <span style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#22c55e',
                        border: '2px solid var(--card-bg, #fff)'
                    }} />
                )}
            </button>

            {modal}
        </>
    );
};

export default PushNotificationSettings;
