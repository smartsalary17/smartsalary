
import React from 'react';
import { MONTHS } from '../context/workforceShared';
import PushNotificationSettings from './PushNotificationSettings';

const Topbar = ({ activePage }) => {
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

    const changeTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('wf_theme', theme);
    };

    const currentTheme = localStorage.getItem('wf_theme') || 'dark';
    const now = new Date();
    const dateDisplay = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

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

                <select
                    className="theme-select theme-select-desktop"
                    defaultValue={currentTheme}
                    onChange={(e) => changeTheme(e.target.value)}
                    aria-label="Select theme"
                >
                    <option value="dark">🌙 Dark</option>
                    <option value="light">☀️ Light</option>
                    <option value="ocean">🌊 Ocean</option>
                </select>

                <select
                    className="theme-select theme-select-mobile"
                    defaultValue={currentTheme}
                    onChange={(e) => changeTheme(e.target.value)}
                    aria-label="Select theme"
                >
                    <option value="dark">🌙</option>
                    <option value="light">☀️</option>
                    <option value="ocean">🌊</option>
                </select>

                <span className="topbar-date">{dateDisplay}</span>
            </div>
        </div>
    );
};

export default Topbar;
