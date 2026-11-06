import React, { useState, useMemo } from 'react';
import { useWorkforce, MONTHS, DAYSHORT } from '../context/workforceShared';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Download } from 'lucide-react';

const IndividualReport = () => {
    const { employees, attendance } = useWorkforce();
    const [selectedEmp, setSelectedEmp] = useState('');
    const [viewMonth, setViewMonth] = useState(new Date().getMonth());
    const [viewYear, setViewYear] = useState(new Date().getFullYear());
    
    const activeEmployeeId = selectedEmp || employees[0]?.id || '';
    const activeEmployee = employees.find(e => e.id === activeEmployeeId);

    const downloadPDF = async () => {
        const el = document.getElementById('individual-report-capture');
        if (!el) return;
        const canvas = await html2canvas(el, { scale: 2 });
        const img = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(img, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const empName = activeEmployee ? activeEmployee.name.replace(/\s+/g, '_') : 'Employee';
        pdf.save(`Attendance_${empName}_${MONTHS[viewMonth]}_${viewYear}.pdf`);
    };

    const calendarData = useMemo(() => {
        if (!activeEmployeeId) return [];
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const firstDay = new Date(viewYear, viewMonth, 1).getDay();

        const days = [];
        for (let i = 0; i < firstDay; i++) days.push({ empty: true });

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const att = attendance[dateStr]?.[activeEmployeeId];
            days.push({ day: d, status: att?.status || 'none', time: att?.time });
        }
        return days;
    }, [activeEmployeeId, viewMonth, viewYear, attendance]);

    const totals = useMemo(() => {
        const stats = { P: 0, L: 0, A: 0, W: 0, HD: 0, LV: 0, SL: 0, HL: 0 };
        calendarData.forEach(d => {
            if (d.empty) return;
            if (d.status === 'present') stats.P++;
            else if (d.status === 'late') stats.L++;
            else if (d.status === 'absent') stats.A++;
            else if (d.status === 'weekoff') stats.W++;
            else if (d.status === 'half-day') stats.HD++;
            else if (d.status === 'sick_leave') stats.SL++;
            else if (d.status === 'holiday') stats.HL++;
            else if (d.status.includes('leave')) stats.LV++;
        });
        return stats;
    }, [calendarData]);

    return (
        <div className="card">
            <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <span className="ct">Individual Monthly Report</span>
                <button className="primary-btn small-btn" style={{ width: 'auto' }} onClick={downloadPDF}>
                    <Download size={16} style={{ marginRight: '6px' }} />
                    Download PDF
                </button>
            </div>
            <div id="individual-report-capture" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '10px', background: 'var(--card-bg)' }}>
                <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="input-group">
                        <label>Select Employee</label>
                        <select value={activeEmployeeId} onChange={(e) => setSelectedEmp(e.target.value)} className="theme-select" style={{ width: '100%' }}>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="divider" style={{ margin: '0.5rem 0', opacity: 0.1 }}></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>Monthly Totals</h4>
                        <div id="ind-attendance-totals" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {[
                                { label: 'Present', color: 'dot-present', val: totals.P + totals.L + totals.HD + totals.W},
                                { label: 'Late', color: 'dot-late', val: totals.L },
                                { label: 'Absent', color: 'dot-absent', val: totals.A },
                                { label: 'Week-off', color: 'dot-weekoff', val: totals.W },
                                { label: 'Half Day', color: 'dot-halfday', val: totals.HD },
                                { label: 'Leave', color: 'dot-leave', val: totals.LV },
                                { label: 'Sick Leave', color: 'dot-sl', val: totals.SL },
                                { label: 'Holiday', color: 'dot-hl', val: totals.HL }
                            ].map(t => (
                                <div key={t.label} className="total-grid-item">
                                    <div className={`total-dot ${t.color}`}></div>
                                    <div className="total-label">{t.label}</div>
                                    <div className="total-val">{t.val}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
                    <div id="ind-calendar-container" style={{ width: '100%', minHeight: '440px', background: 'var(--sidebar-bg)', borderRadius: '24px', padding: '1.5rem', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
<div style={{ marginBottom: '2rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={viewMonth} onChange={(e) => setViewMonth(parseInt(e.target.value))} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 800, padding: '8px 16px', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer' }}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <input type="number" value={viewYear} onChange={(e) => setViewYear(parseInt(e.target.value))} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 800, width: '110px', padding: '8px 16px', borderRadius: '12px', textAlign: 'center', fontSize: '1.1rem' }} />
    </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block' }}>Report View</span>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>ATTENDANCE MAP</span>
                            </div>
                        </div>
                        <div className="calendar-header-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600 }}>
                            {DAYSHORT.map(d => <span key={d}>{d.toUpperCase()}</span>)}
                        </div>
                        <div id="ind-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', gap: '6px', flex: 1 }}>
                            {calendarData.map((d, i) => (
                                <div key={i} className={`ind-cal-day ${d.empty ? 'empty' :
                                    d.status === 'present' ? 'ind-cal-p' :
                                        d.status === 'late' ? 'ind-cal-l' :
                                            d.status === 'absent' ? 'ind-cal-a' :
                                                d.status === 'weekoff' ? 'ind-cal-w' :
                                                    d.status === 'half-day' ? 'ind-cal-hd' :
                                                        d.status === 'sick_leave' ? 'ind-cal-sl' :
                                                            d.status === 'holiday' ? 'ind-cal-hl' :
                                                                d.status.includes('leave') ? 'ind-cal-lv' : ''
                                    }`}>
                                    <span className="ind-cal-date">{d.day || ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IndividualReport;
