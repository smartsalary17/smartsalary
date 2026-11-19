
import React, { useState, useEffect, useRef } from 'react';
import { MONTHS } from '../context/workforceShared';
import PushNotificationSettings from './PushNotificationSettings';
import { Moon, Sun, Waves, ChevronDown, Check } from 'lucide-react';

const Topbar = ({ activePage }) => {
    const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem('wf_theme') || 'dark');
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef(null);

    const titleMap = {
        dashboard: 'Dashboard',
        employees: 'Employees',
        attendance: 'Attendance',
        calculator: 'Salary Calculator',
        analyzer: 'Whatsapp Analyzer',
        'attendance-report': 'Attendance Report',
        'penalty-report': 'Penalty Report',
        'name-mappings': 'Name Mappings',
        reports: 'Reports',
        'export-pdf': 'Attendance PDF'
    };

    const themes = {
        dark: { label: 'Dark', icon: Moon },
        light: { label: 'Light', icon: Sun },
        ocean: { label: 'Ocean', icon: Waves }
    };

    const changeTheme = (theme) => {
        setCurrentTheme(theme);
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('wf_theme', theme);
        setOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false);
            }
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const now = new Date();
    const dateDisplay = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const ThemeIcon = themes[currentTheme]?.icon || Moon;

    return (
        <div className="topbar">
            <span className="pt">{titleMap[activePage] || 'Dashboard'}</span>

            <div
                className="topbar-right"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    flexWrap: 'nowrap',
                    gap: '10px',
                    minWidth: 0
                }}
            >
                <PushNotificationSettings />

                <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        aria-label="Select theme"
                        aria-expanded={open}
                        aria-haspopup="true"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '7px',
                            width: 'auto',
                            minWidth: '38px',
                            height: '36px',
                            padding: '0 9px',
                            borderRadius: '8px',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer'
                        }}
                    >
                        <ThemeIcon size={17} />
                        <span className="theme-label" style={{ fontSize: '0.8rem' }}>
                            {themes[currentTheme]?.label || 'Dark'}
                        </span>
                        <ChevronDown size={14} />
                    </button>

                    {open && (
                        <div
                            role="menu"
                            aria-label="Theme options"
                            style={{
                                position: 'absolute',
                                top: 'calc(100% + 6px)',
                                right: 0,
                                zIndex: 1000,
                                width: '140px',
                                padding: '4px',
                                borderRadius: '8px',
                                background: 'var(--input-bg)',
                                border: '1px solid var(--border-color)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }}
                        >
                            {Object.entries(themes).map(([value, theme]) => {
                                const Icon = theme.icon;

                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={currentTheme === value}
                                        onClick={() => changeTheme(value)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '9px',
                                            width: '100%',
                                            padding: '9px',
                                            border: 'none',
                                            borderRadius: '6px',
                                            background: currentTheme === value
                                                ? 'var(--border-color)'
                                                : 'transparent',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <Icon size={17} />
                                        <span style={{ flex: 1 }}>{theme.label}</span>
                                        {currentTheme === value && <Check size={15} />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <span className="topbar-date">{dateDisplay}</span>
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .theme-label {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
};

export default Topbar;
