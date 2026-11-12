import React, { useState, useEffect, useMemo } from 'react';
import { Download, Loader2, FileText, CheckSquare, Square } from 'lucide-react';
import { API_BASE, MONTHS } from '../context/workforceShared';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function transformBiometric(attendanceMap, employees) {
    const records = [];
    for (const [date, empMap] of Object.entries(attendanceMap || {})) {
        for (const [empId, data] of Object.entries(empMap || {})) {
            if (!data?.status) continue;
            const emp = employees.find(e => String(e.id) === String(empId));
            records.push({
                date, employeeId: empId, name: emp?.name || 'Employee ' + empId,
                status: data.status, checkIn: data.time || '', checkOut: data.outTime || '',
                workTime: data.workTime || '', halfDay: data.status === 'half-day' ? 'Yes' : 'No',
                permission: '-', weekOff: data.status === 'weekoff' ? 'Yes' : 'No'
            });
        }
    }
    return records;
}

const AttendancePDFExport = () => {
    const now = new Date();
    const [employees, setEmployees] = useState([]);
    const [selectedEmpIds, setSelectedEmpIds] = useState([]);
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [dataSource, setDataSource] = useState('system'); // 'system' | 'whatsapp' | 'both'
    const [attRecords, setAttRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Helpers for Time Office Logic
    const parseTime = (t) => {
        if (!t || t === '--:--') return 0;
        const [h, m] = t.split(':').map(Number);
        return (h * 60) + m;
    };

    const formatTime = (mins) => {
        if (mins <= 0) return '00:00';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const mapStatus = (status) => {
        if (!status) return '--';
        if (status === 'present' || status === 'late') return 'P';
        if (status === 'absent') return 'A';
        if (status === 'weekoff') return 'WO';
        if (status === 'half-day') return 'HD';
        if (status === 'sick_leave' || status.includes('leave')) return 'LV';
        if (status === 'holiday') return 'HL';
        return status.substring(0, 2).toUpperCase();
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('wf_auth_token');
                const headers = { Authorization: `Bearer ${token}` };
                const prefix = `${year}-${String(month).padStart(2, '0')}-`;

                const [empRes, whatsappRes, biometricRes] = await Promise.all([
                    fetch(`${API_BASE}/api/employees`, { headers }).then(r => r.json()),
                    fetch(`${API_BASE}/api/attendance-report?month=${month}&year=${year}`, { headers }).then(r => r.json()),
                    fetch(`${API_BASE}/api/attendance`, { headers }).then(r => r.json())
                ]);

                const empList = Array.isArray(empRes) ? empRes : [];
                setEmployees(empList);

                const whatsapp = whatsappRes.records || [];
                const biometric = transformBiometric(biometricRes, empList).filter(r => r.date.startsWith(prefix));

                let combined = [];
                if (dataSource === 'whatsapp') combined = whatsapp;
                else if (dataSource === 'system') combined = biometric;
                else combined = [...whatsapp, ...biometric];

                setAttRecords(combined);
            } catch (err) { console.error("API Error:", err); }
            finally { setLoading(false); }
        };
        fetchData();
    }, [month, year, dataSource]);

    const toggleEmployee = (id) => {
        setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
    };

    const toggleAll = () => {
        if (selectedEmpIds.length === employees.length) setSelectedEmpIds([]);
        else setSelectedEmpIds(employees.map(e => String(e.id)));
    };

    // Prepare Preview Data (Time Office Format exactly like the image)
    const previewData = useMemo(() => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        return selectedEmpIds.map(empId => {
            const emp = employees.find(e => String(e.id) === String(empId));
            const stats = { P: 0, A: 0, WO: 0, HL: 0, LV: 0, workMins: 0 };

            const empRecords = attRecords.filter(r => 
                String(r.employeeId) === String(empId) || String(r.name).toLowerCase() === String(emp?.name).toLowerCase()
            );

            const daily = dates.map(d => {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const record = empRecords.find(r => r.date === dateStr);
                const st = mapStatus(record?.status);
                
                if (st === 'P' || st === 'HD') stats.P++;
                else if (st === 'A') stats.A++;
                else if (st === 'WO') stats.WO++;
                else if (st === 'HL') stats.HL++;
                else if (st === 'LV') stats.LV++;
                
                const workTime = record?.workTime || '00:00';
                if (workTime !== '00:00' && workTime !== '--:--') stats.workMins += parseTime(workTime);

                // Force empty times for non-working statuses
                const isOff = ['WO', 'A', 'HL', 'LV'].includes(st);

                return {
                    in: isOff ? '---' : (record?.checkIn || '---'),
                    out: isOff ? '---' : (record?.checkOut || '---'),
                    work: isOff ? '00:00' : (workTime === '--:--' ? '00:00' : workTime),
                    st
                };
            });

            return { emp, records: daily, stats, dates };
        }).filter(item => item.emp);
    }, [selectedEmpIds, employees, attRecords, month, year]);

    const generatePDF = () => {
        if (selectedEmpIds.length === 0) return alert("Please select at least one employee.");
        setGenerating(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            let currentY = 15; 
            let recordsOnPage = 0; // Track how many employee records are on the current page

            // 🌟 MAIN HEADER
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text("SMART SALARY", 14, 15);
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text("Microbotware Technology", 14, 21);

            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text("TIME OFFICE REPORT", pageWidth - 14, 15, { align: 'right' });
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(`${MONTHS[month - 1]} ${year}`, pageWidth - 14, 21, { align: 'right' });

            doc.setDrawColor(198, 63, 63);
            doc.setLineWidth(0.5);
            doc.line(14, 26, pageWidth - 14, 26);
            
            currentY = 33;

            previewData.forEach(({ emp, records, stats, dates }) => {
                // CHECK: 3 records per page or near bottom of page
                if (recordsOnPage >= 3 || currentY > pageHeight - 40) {
                    doc.addPage();
                    currentY = 15;
                    recordsOnPage = 0;
                }

                // 🌟 EMPLOYEE HEADER
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                doc.text(`${emp.id} - ${emp.name} (${dataSource === 'system' ? 'Biometric' : dataSource === 'whatsapp' ? 'WhatsApp' : 'Both'})`, 14, currentY);

                doc.setTextColor(99, 102, 241);
                doc.text(`P:${stats.P} | A:${stats.A} | WO:${stats.WO} | LV:${stats.LV} | Work: ${formatTime(stats.workMins)}`, pageWidth - 14, currentY, { align: 'right' });

                // 🌟 TABLE DATA
                const dayRow = ['Day', ...dates.map(d => String(d))];
                const inRow = ['IN', ...records.map(r => r.in)];
                const outRow = ['OUT', ...records.map(r => r.out)];
                const workRow = ['Work', ...records.map(r => r.work)];
                const statusRow = ['St.', ...records.map(r => r.st)];

                autoTable(doc, {
                    startY: currentY + 3,
                    head: [dayRow],
                    body: [inRow, outRow, workRow, statusRow],
                    theme: 'grid',
                    pageBreak: 'avoid', // 👈 IMPORTANT: Prevents table from splitting across pages
                    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', textColor: [0, 0, 0] },
                    headStyles: { fillColor: [44, 62, 80], textColor: 255, fontSize: 7, fontStyle: 'bold' },
                    columnStyles: { 
                        0: { fontStyle: 'bold', halign: 'left', fillColor: [245, 245, 245], cellWidth: 15 } 
                    },
                    margin: { left: 14, right: 14, bottom: 15 },
                    didParseCell: function (data) {
                        if (data.row.index === 3) { 
                            if (data.cell.text[0] === 'P') data.cell.styles.textColor = [22, 163, 74]; 
                            else if (data.cell.text[0] === 'A') data.cell.styles.textColor = [220, 38, 38]; 
                            else if (data.cell.text[0] === 'WO') data.cell.styles.textColor = [99, 102, 241]; 
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                });

                currentY = doc.lastAutoTable.finalY + 10;
                recordsOnPage++; // Increment record count
            });
            
            doc.save(`TimeOffice_Report_${MONTHS[month - 1]}_${year}.pdf`);
        } catch (err) {
            console.error(err); alert("Failed to generate PDF.");
        } finally { setGenerating(false); }
    };

    return (
        <div className="pg active" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 120px)', alignItems: 'flex-start' }}>
            <style>{`
                .custom-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
                }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-scroll::-webkit-scrollbar-thumb { 
                    background: rgba(148, 163, 184, 0.6); 
                    border-radius: 10px; 
                }
                .custom-scroll::-webkit-scrollbar-thumb:hover { 
                    background: rgba(148, 163, 184, 0.9); 
                }
            `}</style>

            {/* LEFT SIDE: PREVIEW (Time Office Style) */}
            <div className="custom-scroll" style={{ flex: 1, background: '#e2e8f0', padding: '20px', borderRadius: '12px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {selectedEmpIds.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                        <h3>No Employee Selected</h3>
                        <p>Select employees from the right panel to preview and generate PDF.</p>
                    </div>
                ) : (
                    previewData.map(({ emp, records, stats, dates }) => (
                        <div key={emp.id} style={{ background: '#fff', padding: '20px', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', color: '#000', width: '100%', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px', fontSize: '12px', fontWeight: 'bold' }}>
                                <span style={{ color: '#1e293b' }}>{emp.id} - {emp.name} ({dataSource === 'system' ? 'Biometric' : dataSource === 'whatsapp' ? 'WhatsApp' : 'Both'})</span>
                                <span style={{ color: '#6366f1' }}>
                                    P:{stats.P} | A:{stats.A} | WO:{stats.WO} | LV:{stats.LV} | Work: {formatTime(stats.workMins)}
                                </span>
                            </div>
                            
                            {/* Wrapper added for horizontal scroll only on the table */}
                            <div style={{ overflowX: 'auto', width: '100%' }}>
                                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '10px' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '4px', fontWeight: 'bold', color: '#000', position: 'sticky', left: 0 }}>Day</td>
                                            {dates.map(d => <td key={d} style={{ border: '1px solid #ddd', padding: '4px', color: '#000', textAlign: 'center' }}>{d}</td>)}
                                        </tr>
                                        <tr>
                                            <td style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '4px', fontWeight: 'bold', color: '#000', position: 'sticky', left: 0 }}>IN</td>
                                            {records.map((d, i) => <td key={i} style={{ border: '1px solid #ddd', padding: '4px', color: '#000', textAlign: 'center' }}>{d.in}</td>)}
                                        </tr>
                                        <tr>
                                            <td style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '4px', fontWeight: 'bold', color: '#000', position: 'sticky', left: 0 }}>OUT</td>
                                            {records.map((d, i) => <td key={i} style={{ border: '1px solid #ddd', padding: '4px', color: '#000', textAlign: 'center' }}>{d.out}</td>)}
                                        </tr>
                                        <tr>
                                            <td style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '4px', fontWeight: 'bold', color: '#000', position: 'sticky', left: 0 }}>Work</td>
                                            {records.map((d, i) => <td key={i} style={{ border: '1px solid #ddd', padding: '4px', color: '#000', textAlign: 'center' }}>{d.work}</td>)}
                                        </tr>
                                        <tr>
                                            <td style={{ background: '#f5f5f5', border: '1px solid #ddd', padding: '4px', fontWeight: 'bold', color: '#000', position: 'sticky', left: 0 }}>St.</td>
                                            {records.map((d, i) => (
                                                <td key={i} style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center', color: d.st === 'P' ? '#16a34a' : d.st === 'A' ? '#dc2626' : d.st === 'WO' ? '#6366f1' : '#666', fontWeight: 'bold' }}>
                                                    {d.st}
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* RIGHT SIDE: EXPORT SETTINGS (Theme Adaptive) */}
            <div style={{ width: '350px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', margin: 0, backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ marginBottom: '1rem', borderBottom: '1px dotted var(--border-color)', paddingBottom: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Export Settings</h2>
                </div>
                
                {/* Data Source Toggle */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', backgroundColor: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                    <button className={'small-btn ' + (dataSource === 'system' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('system')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>System</button>
                    <button className={'small-btn ' + (dataSource === 'whatsapp' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('whatsapp')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>WhatsApp</button>
                    <button className={'small-btn ' + (dataSource === 'both' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('both')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>Both</button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: '100px', padding: '0.5rem', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Select Employees ({selectedEmpIds.length})</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedEmpIds.length > 0 && (
                            <button onClick={() => setSelectedEmpIds([])} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', width: 'auto' }}>
                                Clear
                            </button>
                        )}
                        <button onClick={toggleAll} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', width: 'auto' }}>
                            {selectedEmpIds.length === employees.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                </div>

                <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', backgroundColor: 'var(--input-bg)', marginBottom: '1.5rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" color="var(--text-primary)" /></div>
                    ) : employees.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>No employees found.</div>
                    ) : (
                        employees.map(emp => {
                            const isSelected = selectedEmpIds.includes(String(emp.id));
                            return (
                                <div key={emp.id} onClick={() => toggleEmployee(String(emp.id))} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', borderRadius: '4px', background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent', transition: 'all 0.2s' }}>
                                    {isSelected ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="var(--text-secondary)" />}
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{emp.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{emp.id}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <button className="primary-btn" onClick={generatePDF} disabled={generating || selectedEmpIds.length === 0} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '1rem', marginTop: 'auto' }}>
                    {generating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {generating ? 'Generating PDF...' : 'Download PDF'}
                </button>
            </div>
        </div>
    );
};

export default AttendancePDFExport;