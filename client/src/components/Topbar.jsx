import React from 'react';
import { MONTHS } from '../context/workforceShared';

const Topbar = ({ activePage }) => {
  const titleMap = {
    'dashboard': 'Dashboard',
    'employees': 'Employees',
    'attendance': 'Attendance',
    'calculator': 'Salary Calculator',
    'analyzer': 'COCO Analyzer',
    'attendance-report': 'Attendance Report',
    'penalty-report': 'Penalty Report',
    'name-mappings': 'Name Mappings',
    'reports': 'Reports',
    'export-pdf': 'Attendance PDF'
  };

  const changeTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wf_theme', theme);
  };

  const now = new Date();
  const dateDisplay = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="topbar">
      <span className="pt">{titleMap[activePage] || 'Dashboard'}</span>
      <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <select 
          className="theme-select" 
          defaultValue={localStorage.getItem('wf_theme') || 'dark'}
          onChange={(e) => changeTheme(e.target.value)}
        >
          <option value="dark">🌙 Dark</option>
          <option value="light">☀️ Light</option>
          <option value="ocean">🌊 Ocean</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {dateDisplay}
        </span>
      </div>
    </div>
  );
};

export default Topbar;
