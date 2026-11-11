import React, { useState, useEffect, useMemo } from 'react';
import { Download, Loader2, FileText, CheckSquare, Square } from 'lucide-react';
import { API_BASE, MONTHS } from '../context/workforceShared';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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

    const previewData = useMemo(() => {
        return selectedEmpIds.map(empId => {
            const emp = employees.find(e => String(e.id) === String(empId));
            const rawRecords = attRecords.filter(r => 
                String(r.employeeId) === String(empId) || String(r.name).toLowerCase() === String(emp?.name).toLowerCase()
            );
            const uniqueMap = new Map();
            rawRecords.forEach(r => {
                const key = `${r.date}-${r.employeeId || r.name}`;
                if (!uniqueMap.has(key)) uniqueMap.set(key, { ...r });
            });
            const records = Array.from(uniqueMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            return { emp, records };
        }).filter(item => item.emp);
    }, [selectedEmpIds, employees, attRecords]);

    const generatePDF = () => {
        if (selectedEmpIds.length === 0) return alert("Please select at least one employee.");
        setGenerating(true);
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            let isFirstPage = true;

            previewData.forEach(({ emp, records }) => {
                if (!isFirstPage) doc.addPage();
                isFirstPage = false;

                doc.setFontSize(16);
                doc.text("Attendance Report", pageWidth / 2, 15, { align: 'center' });
                doc.setFontSize(10);
                doc.text(`Employee: ${emp.name} (${emp.id})`, 14, 25);
                doc.text(`Department: ${emp.dept || 'N/A'}`, 14, 30);
                doc.text(`Month: ${MONTHS[month - 1]} ${year}`, pageWidth - 14, 25, { align: 'right' });

                const tableRows = records.map(r => [
                    r.date.split('-').reverse().join('/'),
                    r.checkIn || '-', r.checkOut || '-', r.workTime || '-', r.status || '-',
                    r.permission !== '-' ? 'Permission' : (r.halfDay === 'Yes' ? 'Half Day' : '-')
                ]);

                if (tableRows.length === 0) {
                    doc.text("No records found for this month.", 14, 45);
                } else {
                    doc.autoTable({
                        startY: 35,
                        head: [['Date', 'InTime', 'OutTime', 'Work Dur.', 'Status', 'Remarks']],
                        body: tableRows, theme: 'grid',
                        headStyles: { fillColor: [44, 62, 80], textColor: 255 },
                        styles: { fontSize: 9, cellPadding: 3 },
                        alternateRowStyles: { fillColor: [245, 245, 245] }
                    });
                }
            });
            doc.save(`Attendance_Report_${MONTHS[month - 1]}_${year}.pdf`);
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

            {/* LEFT SIDE: PREVIEW */}
            <div className="custom-scroll" style={{ flex: 1, background: '#e2e8f0', padding: '20px', borderRadius: '12px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {selectedEmpIds.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                        <h3>No Employee Selected</h3>
                        <p>Select employees from the right panel to preview and generate PDF.</p>
                    </div>
                ) : (
                    previewData.map(({ emp, records }) => (
                        <div key={emp.id} style={{ background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', minHeight: '500px', color: '#000', flexShrink: 0 }}>
                            <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: '10px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>Attendance Report</h2>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{emp.name} ({emp.id})</p>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '13px', color: '#64748b' }}>
                                    <p style={{ margin: 0 }}>{emp.dept || 'N/A'}</p>
                                    <p style={{ margin: 0 }}>{MONTHS[month - 1]} {year}</p>
                                </div>
                            </div>
                            
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#2c3e50' }}>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>Date</th>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>InTime</th>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>OutTime</th>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>Work Dur.</th>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>Status</th>
                                        <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'left', color: '#ffffff' }}>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.length === 0 ? (
                                        <tr><td colSpan={6} style={{ padding: '15px', textAlign: 'center', color: '#64748b' }}>No records found for this month.</td></tr>
                                    ) : (
                                        records.map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #cbd5e1', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.date.split('-').reverse().join('/')}</td>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.checkIn || '-'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.checkOut || '-'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.workTime || '-'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.status || '-'}</td>
                                                <td style={{ padding: '8px', border: '1px solid #cbd5e1', color: '#000000' }}>{r.permission !== '-' ? 'Permission' : (r.halfDay === 'Yes' ? 'Half Day' : '-')}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ))
                )}
            </div>

            {/* RIGHT SIDE: FORCED DARK BLOCK */}
            <div style={{ width: '350px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', margin: 0, backgroundColor: '#1e293b', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ marginBottom: '1rem', borderBottom: '1px dotted rgba(148, 163, 184, 0.2)', paddingBottom: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc' }}>Export Settings</h2>
                </div>
                
                {/* Data Source Toggle */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.1)', marginBottom: '1rem' }}>
                    <button className={'small-btn ' + (dataSource === 'system' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('system')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>System</button>
                    <button className={'small-btn ' + (dataSource === 'whatsapp' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('whatsapp')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>WhatsApp</button>
                    <button className={'small-btn ' + (dataSource === 'both' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('both')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>Both</button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', width: '100%', backgroundColor: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '8px' }}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: '100px', padding: '0.5rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', color: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '8px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#f8fafc' }}>Select Employees ({selectedEmpIds.length})</span>
                    <button onClick={toggleAll} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', width: 'auto' }}>
                        {selectedEmpIds.length === employees.length ? 'Clear All' : 'Select All'}
                    </button>
                </div>

                <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(148, 163, 184, 0.1)', borderRadius: '8px', padding: '0.5rem', backgroundColor: 'rgba(15, 23, 42, 0.4)', marginBottom: '1.5rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" color="#f8fafc" /></div>
                    ) : employees.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8' }}>No employees found.</div>
                    ) : (
                        employees.map(emp => {
                            const isSelected = selectedEmpIds.includes(String(emp.id));
                            return (
                                <div key={emp.id} onClick={() => toggleEmployee(String(emp.id))} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', cursor: 'pointer', borderRadius: '4px', background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent', transition: 'all 0.2s' }}>
                                    {isSelected ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="#94a3b8" />}
                                    <div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>{emp.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.id}</div>
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
