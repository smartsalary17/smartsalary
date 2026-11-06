import React, { useEffect, useId, useRef, useState } from 'react';
import { LayoutDashboard, Users, CalendarCheck, Calculator, Database, LogOut, Menu, X } from 'lucide-react';
import logo from '../assets/logo.png';
import { Upload, CalendarDays, Wallet, UserCheck, FileText, CalculatorIcon } from 'lucide-react';

const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'analyzer', label: 'Analyzer', icon: Upload },
    { id: 'penalty-report', label: 'Penalty Report', icon: Wallet },
    { id: 'name-mappings', label: 'Name Mappings', icon: UserCheck },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'calculator', label: 'Calculator', icon: CalculatorIcon }
];

// Styles are included so this component does not require a separate CSS file.
const styles = `
.ss-sidebar, .ss-sidebar * { box-sizing: border-box; }
.ss-sidebar {
  width: 248px; flex: 0 0 248px; height: 100dvh; position: sticky; top: 0;
  display: flex; flex-direction: column; padding: 24px 16px 16px;
  background: var(--sidebar-bg); color: var(--text-primary); border-right: 1px solid var(--border-color);
  font-family: Inter, system-ui, -apple-system, sans-serif;
}
.ss-brand { display: flex; align-items: center; gap: 12px; padding: 0 8px 28px; }
.ss-brand img { width: 40px; height: 40px; object-fit: contain; background: #fff; border-radius: 10px; padding: 4px; }
.ss-brand-title { font-size: 17px; font-weight: 700; letter-spacing: -.4px; }
.ss-brand-subtitle { margin-top: 4px; font-size: 12px; color: var(--text-secondary); }
.ss-section-label { margin: 0 12px 12px; font-size: 11px; font-weight: 600; letter-spacing: 1.4px; color: var(--text-secondary); }
.ss-nav { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; min-height: 0; padding: 4px; }
.ss-item {
  width: 100%; min-height: 46px; display: flex; align-items: center; gap: 12px;
  border: 0; border-radius: 10px; padding: 12px; background: transparent;
  color: var(--text-secondary); font: inherit; font-size: 14px; font-weight: 500; text-align: left;
  cursor: pointer; transition: background .15s ease, color .15s ease;
}
.ss-item svg { flex-shrink: 0; }
.ss-item:hover { background: var(--input-bg); color: var(--text-primary); }
.ss-item[aria-current="page"] { background: var(--primary); color: #fff; }
.ss-item:focus-visible, .ss-toggle:focus-visible, .ss-close:focus-visible {
  outline: 3px solid #93c5fd; outline-offset: 3px;
}
.ss-footer { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border-color); margin-top: auto; }
.ss-logout { color: var(--danger); }
.ss-logout:hover { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
.ss-toggle, .ss-close, .ss-backdrop { display: none; }
@media (max-width: 767px) {
  .ss-toggle {
    display: inline-flex; align-items: center; gap: 8px; position: fixed;
    top: 12px; left: 12px; z-index: 40; border: 1px solid #cbd5e1;
    border-radius: 10px; padding: 10px 12px; background: #fff; color: #0f172a;
    font: 600 14px system-ui, sans-serif; cursor: pointer;
  }
  .ss-sidebar {
    position: fixed; left: 0; top: 0; z-index: 60; width: min(280px, 85vw);
    transform: translateX(-100%); visibility: hidden; transition: transform .2s ease;
    box-shadow: 12px 0 40px #0003;
  }
  .ss-sidebar[data-open="true"] { transform: translateX(0); visibility: visible; }
  .ss-close { display: inline-flex; align-self: flex-end; padding: 8px; margin-bottom: 12px; border: 0; border-radius: 8px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; }
  .ss-backdrop { display: block; position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.6); }
}
@media (prefers-reduced-motion: reduce) {
  .ss-sidebar, .ss-item { transition: none; }
}
`;

const Sidebar = ({ activePage, setPage, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const sidebarId = useId();
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeRef = useRef(null);

  const closeDrawer = () => {
    setIsOpen(false);
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        toggleRef.current?.focus();
      }
      if (event.key === 'Tab') {
        const buttons = sidebarRef.current?.querySelectorAll('button');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
         }
    };
    const desktop = window.matchMedia('(min-width: 768px)');
    const handleResize = () => { if (desktop.matches) setIsOpen(false); };
    document.addEventListener('keydown', handleKeyDown);
    desktop.addEventListener('change', handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      desktop.removeEventListener('change', handleResize);
    };
  }, [isOpen]);

  return (
    <>
      <style>{styles}</style>
      <button ref={toggleRef} type="button" className="ss-toggle"
        aria-label="Open navigation" aria-expanded={isOpen} aria-controls={sidebarId}
        onClick={() => setIsOpen(true)}>
        <Menu size={20} aria-hidden="true" /> Menu
      </button>
      {isOpen && <div className="ss-backdrop" aria-hidden="true" onClick={closeDrawer} />}
      <aside ref={sidebarRef} id={sidebarId} className="ss-sidebar" data-open={isOpen}
        role={isOpen ? 'dialog' : undefined} aria-modal={isOpen ? true : undefined}
        aria-label="Smart Salary navigation">
        <button ref={closeRef} type="button" className="ss-close" aria-label="Close navigation" onClick={closeDrawer}>
          <X size={20} aria-hidden="true" />
        </button>
        <div className="ss-brand">
          <img src={logo} alt="" />
          <div>
            <div className="ss-brand-title">Smart Salary</div>
            <div className="ss-brand-subtitle">Admin Panel</div>
          </div>
        </div>
        <p className="ss-section-label">WORKSPACE</p>
        <nav className="ss-nav" aria-label="Main navigation">
          {menuItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="ss-item"
              aria-current={activePage === id ? 'page' : undefined}
              onClick={() => { setPage(id); if (isOpen) closeDrawer(); }}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="ss-footer">
          <button type="button" className="ss-item ss-logout"
            onClick={() => { if (isOpen) closeDrawer(); onLogout(); }}>
            <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


