import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { useWorkforce } from './context/workforceShared';
import logo from './assets/logo.png';

// Actual Page Components
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Calculator from './pages/Calculator';
import Login from './pages/Login';
import Analyzer from './pages/Analyzer';
import PenaltyReport from './pages/PenaltyReport';
import NameMappings from './pages/NameMappings';
import Reports from './pages/Reports';
import AttendancePDFExport from './pages/AttendancePDFExport';
import { ToastProvider } from './context/ToastContext';

const App = () => {
    const { loading, token, logout } = useWorkforce();
    const [page, setPage] = useState('dashboard');
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    useEffect(() => {
        const savedTheme = localStorage.getItem('wf_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }, []);

    const handleLogout = () => {
         setShowLogoutConfirm(false);
        logout();
        setPage('dashboard');
    };

    if (loading) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', color: 'white', fontFamily: 'Outfit, sans-serif', zIndex: 9999 }}>
                <div style={{ textAlign: 'center', animation: 'pulse 2s infinite' }}>
                    <img src={logo} alt="Logo" style={{ width: '300px', height: '300px', marginBottom: '1.25rem', borderRadius: '20px' }} />
                    <h1 style={{ marginBottom: '0.5rem', letterSpacing: '-0.02em', color: '#6366f1' }}>Smart Salary</h1>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Synchronizing with MongoDB Atlas...</p>
                </div>
            </div>
        );
    }

    if (!token) {
        return (
            <ToastProvider> {/* Wrap with ToastProvider */}
                <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
                    <div className="circle circle-1"></div>
                    <div className="circle circle-2"></div>
                    <Login />
                </div>
            </ToastProvider>
        );
    }

const renderPage = () => {
    switch(page) {
        case 'dashboard': return <Dashboard onViewAttendance={() => setPage('attendance')} />;
        case 'employees': return <Employees />;
        case 'attendance': return <Attendance />;
        case 'calculator': return <Calculator />;
        case 'analyzer': return <Analyzer setPage={setPage} />;
        case 'penalty-report': return <PenaltyReport />;
        case 'name-mappings': return <NameMappings />;
        case 'reports': return <Reports />;
        case 'export-pdf': return <AttendancePDFExport />;
        default: return <Dashboard onViewAttendance={() => setPage('attendance')} />;
    }
};

    return (
        <ToastProvider>
        <div style={{ position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
            {/* Background Decorations */}
            <div className="circle circle-1"></div>
            <div className="circle circle-2"></div>

            <div className="app">
                <Sidebar activePage={page} setPage={setPage} onLogout={() => setShowLogoutConfirm(true)} />
                <main className="main">
                    <Topbar activePage={page} onLogout={() => setShowLogoutConfirm(true)} />
                    <div className={`content ${page === 'dashboard' ? 'content-dashboard' : ''}`}>
                        {renderPage()}
                    </div>
                </main>
            </div>
          
{showLogoutConfirm && (
    <div
        role="presentation"
        onClick={() => setShowLogoutConfirm(false)}
        style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)'
        }}
    >
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onClick={(e) => e.stopPropagation()}
            style={{
                width: '100%',
                maxWidth: '400px',
                padding: '1.5rem',
                borderRadius: '16px',
                background: 'var(--card-bg, #1e293b)',
                color: 'var(--text-color, #fff)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
            }}
        >
            <h2 id="logout-title" style={{ marginBottom: '0.75rem' }}>
                Confirm Logout
            </h2>

            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                Are you sure you want to log out of Smart Salary?
            </p>

            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
            }}>
                <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    style={{
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer'
                    }}
                >
                    Cancel
                </button>

                <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#dc2626',
                        color: '#fff',
                        cursor: 'pointer'
                    }}
                >
                    Logout
                </button>
            </div>
        </div>
    </div>
)}

        </div>
        </ToastProvider>
    );
};


export default App;


