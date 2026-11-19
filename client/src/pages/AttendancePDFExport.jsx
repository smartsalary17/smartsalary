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
    const [dataSource, setDataSource] = useState('system');
    const [attRecords, setAttRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const parseTime = (t) => {
        if (!t || t === '--:--' || t === '---') return 0;
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

    const [whatsappEmployees, setWhatsappEmployees] = useState([]);

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
                    fetch(`${API_BASE}/api/attendance?month=${month}&year=${year}`, { headers }).then(r => r.json())
                ]);

                const empList = Array.isArray(empRes) ? empRes : [];
                setEmployees(empList);

                const whatsapp = whatsappRes.records || [];
const whatsappEmpList = [...new Map(
    whatsapp
        .filter(r => r.name?.trim())
        .map(r => {
            const matchedEmp = empList.find(
                e => String(e.id) === String(r.employeeId) ||
                     e.name?.trim().toLowerCase() === r.name.trim().toLowerCase()
            );
            return [
                r.name.trim().toLowerCase(),
                {
                    id: matchedEmp ? String(matchedEmp.id) : `${r.name.trim().toLowerCase()}`,
                    name: r.name.trim()
                }
            ];
        })
).values()];

setWhatsappEmployees(whatsappEmpList);

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

    const selectionEmployees = dataSource === 'whatsapp' ? whatsappEmployees : employees;

    const toggleEmployee = (id) => {
        setSelectedEmpIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
    };

const toggleAll = () => {
    if (selectedEmpIds.length === selectionEmployees.length) setSelectedEmpIds([]);
    else setSelectedEmpIds(selectionEmployees.map(e => String(e.id)));
};

const previewData = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return selectedEmpIds.map(empId => {
        const emp = selectionEmployees.find(e => String(e.id) === String(empId));
        if (!emp) return null;

        const stats = { P: 0, A: 0, WO: 0, HL: 0, LV: 0, workMins: 0 };

        const empRecords = attRecords.filter(r =>
            dataSource === 'whatsapp'
                ? String(r.name || '').trim().toLowerCase() === emp.name.trim().toLowerCase()
                : String(r.employeeId) === String(empId) ||
                  String(r.name || '').trim().toLowerCase() === emp.name.trim().toLowerCase()
        );

        const daily = dates.map(d => {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = empRecords.find(r => r.date === dateStr);
            const st = mapStatus(record?.status);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, month - 1, d).getDay()];

            if (st === 'P' || st === 'HD') stats.P++;
            else if (st === 'A') stats.A++;
            else if (st === 'WO') stats.WO++;
            else if (st === 'HL') stats.HL++;
            else if (st === 'LV') stats.LV++;

            const isEmpty = !record;
            const isOff = ['WO', 'A', 'HL', 'LV'].includes(st);
            const isNoWork = isEmpty || isOff;

            let workTime = record?.workTime || '00:00';
            let breakTime = record?.breakTime || '01:00';

            if (dataSource === 'whatsapp' && !isNoWork) {
                const checkIn = record?.checkIn || record?.checkIns?.[0] || '';
                const checkOut = record?.checkOut || record?.checkOuts?.[0] || '';

                if (checkIn && checkOut) {
                    let duration = parseTime(checkOut) - parseTime(checkIn);
                    if (duration < 0) duration += 1440;
                    workTime = formatTime(Math.max(0, duration - 60));
                } else {
                    workTime = '00:00';
                }

                breakTime = '01:00';
            }

            if (!isNoWork && workTime !== '00:00' && workTime !== '--:--') {
                stats.workMins += parseTime(workTime);
            }

            return {
                in: isNoWork ? '---' : (record?.checkIn || record?.checkIns?.[0] || '---'),
                out: isNoWork ? '---' : (record?.checkOut || record?.checkOuts?.[0] || '---'),
                work: isNoWork ? '---' : workTime,
                break: isNoWork ? '---' : breakTime,
                st: st === '--' ? 'A' : st,
                dayName
            };
        });

        return { emp, records: daily, stats, dates };
    }).filter(Boolean);
}, [selectedEmpIds, selectionEmployees, attRecords, dataSource, month, year]);

    const generatePDF = () => {
        if (selectedEmpIds.length === 0) return alert("Please select at least one employee.");
        setGenerating(true);
        try {
            const doc = new jsPDF('l', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            let currentY = 15; 

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
                if (currentY > pageHeight - 65) {
                    doc.addPage();
                    currentY = 15;
                }

                // Top Header Block (OT ?????????????)
                autoTable(doc, {
                    startY: currentY,
                    body: [
                        [
                            `Empcode`, String(emp.id), `Name`, emp.name, 
                            `Present`, String(stats.P), `WO`, String(stats.WO), 
                            `HL`, String(stats.HL), `LV`, String(stats.LV), 
                            `Absent`, String(stats.A), 
                            `Tot. Work`, formatTime(stats.workMins) // OT ?????????????
                        ]
                    ],
                    theme: 'grid',
                    styles: { fontSize: 7, cellPadding: 1.5, halign: 'left', textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.1 },
                    columnStyles: {
                        0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' }, 4: { fontStyle: 'bold', textColor: [22, 163, 74] },
                        6: { fontStyle: 'bold' }, 8: { fontStyle: 'bold' }, 10: { fontStyle: 'bold' },
                        12: { fontStyle: 'bold', textColor: [220, 38, 38] }, 14: { fontStyle: 'bold' }
                    }
                });

                const dayRow = ['Day', ...dates.map(d => String(d))];
                const dayNameRow = ['', ...records.map(r => r.dayName)];
                const inRow = ['IN', ...records.map(r => r.in)];
                const outRow = ['OUT', ...records.map(r => r.out)];
                const workRow = ['WORK', ...records.map(r => r.work)];
                const breakRow = ['Break', ...records.map(r => r.break)];
                const statusRow = ['Status', ...records.map(r => r.st)];

                // Main Table (OT Row ?????????????)
                autoTable(doc, {
                    startY: doc.lastAutoTable.finalY,
                    head: [dayRow, dayNameRow],
                    body: [inRow, outRow, workRow, breakRow, statusRow], // OT Row ?????????????
                    theme: 'grid',
                    pageBreak: 'avoid',
                    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center', textColor: [0, 0, 0], lineColor: [200, 200, 200], lineWidth: 0.1, overflow: 'linebreak' },
                    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'normal', halign: 'center' },
                    columnStyles: { 
                        0: { fontStyle: 'bold', halign: 'center', cellWidth: 15 } 
                    },
                    didParseCell: function (data) {
                        // Status row is now index 4 (0:IN, 1:OUT, 2:WORK, 3:Break, 4:Status)
                        if (data.row.index === 4 && data.section === 'body') { 
                            if (data.cell.text[0] === 'P') data.cell.styles.textColor = [22, 163, 74];
                            else if (data.cell.text[0] === 'A') data.cell.styles.textColor = [220, 38, 38];
                            else if (data.cell.text[0] === 'WO') data.cell.styles.textColor = [99, 102, 241];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                });

                currentY = doc.lastAutoTable.finalY + 8; 
            });
            
            doc.save(`TimeOffice_Report_${MONTHS[month - 1]}_${year}.pdf`);
        } catch (err) {
            console.error(err); alert("Failed to generate PDF.");
        } finally { setGenerating(false); }
    };

    return (
        <div className="pg active export-layout" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 120px)', alignItems: 'flex-start' }}>
            <style>{`
                .custom-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(148, 163, 184, 0.6) transparent;
                }
                .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scroll::-webkit-scrollbar-track { background: transparent; }
                .custom-scroll::-webkit-scrollbar-thumb { 
                    background: rgba(148, 163, 184, 0.6); 
                    border-radius: 10px; 
                }
                .custom-scroll::-webkit-scrollbar-thumb:hover { 
                    background: rgba(148, 163, 184, 0.9); 
                }
                .preview-scroll-wrapper {
                    width: 100%;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .preview-inner {
                    min-width: 1300px;
                    width: 100%;
                }
                .preview-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    white-space: nowrap;
                }
                .preview-table td {
                    border: 1px solid var(--border-color);
                    padding: 6px 4px;
                    text-align: center;
                    white-space: nowrap;
                }
            `}</style>

            {/* LEFT SIDE: PREVIEW */}
            <div className="custom-scroll" style={{ flex: 1, background: 'var(--input-bg)', padding: '20px', borderRadius: '12px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {selectedEmpIds.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                        <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                        <h3>No Employee Selected</h3>
                        <p>Select employees from the right panel to preview and generate PDF.</p>
                    </div>
                ) : (
                    previewData.map(({ emp, records, stats, dates }) => (
                        <div key={emp.id} style={{ background: 'var(--card-bg)', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
                            
                            <div className="preview-scroll-wrapper custom-scroll">
                                <div className="preview-inner">
                                    
                                    {/* Top Summary Block (OT ?????????????) */}
                                    <table style={{ borderCollapse: 'collapse', fontSize: '11px', whiteSpace: 'nowrap', width: '100%', marginBottom: '10px' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>Empcode</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{emp.id}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>Name</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{emp.name}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)', color: '#16a34a' }}>Present</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', color: '#16a34a' }}>{stats.P}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>WO</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{stats.WO}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>HL</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{stats.HL}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>LV</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{stats.LV}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)', color: '#dc2626' }}>Absent</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', color: '#dc2626' }}>{stats.A}</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px', fontWeight: 'bold', background: 'var(--input-bg)' }}>Tot. Work</td>
                                                <td style={{ border: '1px solid var(--border-color)', padding: '4px 8px' }}>{formatTime(stats.workMins)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Main Grid Table (OT Row ?????????????) */}
                                    <table className="preview-table">
                                        <tbody>
                                            <tr style={{ background: 'var(--input-bg)', fontWeight: 'bold' }}>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px' }}>Day</td>
                                                {dates.map(d => <td key={d}>{d}</td>)}
                                            </tr>
                                            <tr>
                                                <td></td>
                                                {records.map((r, i) => <td key={i} style={{ color: 'var(--text-secondary)' }}>{r.dayName}</td>)}
                                            </tr>
                                            <tr>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold' }}>IN</td>
                                                {records.map((r, i) => <td key={i}>{r.in}</td>)}
                                            </tr>
                                            <tr>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold' }}>OUT</td>
                                                {records.map((r, i) => <td key={i}>{r.out}</td>)}
                                            </tr>
                                            <tr>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold' }}>WORK</td>
                                                {records.map((r, i) => <td key={i}>{r.work}</td>)}
                                            </tr>
                                            <tr>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold' }}>Break</td>
                                                {records.map((r, i) => <td key={i}>{r.break}</td>)}
                                            </tr>
                                            {/* OT Row ????????????? */}
                                            <tr>
                                                <td style={{ textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold' }}>Status</td>
                                                {records.map((r, i) => (
                                                    <td key={i} style={{ color: r.st === 'P' ? '#16a34a' : r.st === 'A' ? '#dc2626' : r.st === 'WO' ? '#6366f1' : 'var(--text-secondary)', fontWeight: 'bold' }}>
                                                        {r.st}
                                                    </td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* RIGHT SIDE: EXPORT SETTINGS */}
            <div className="export-settings" style={{ width: '350px', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', margin: 0, backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '24px' }}>
                <div style={{ marginBottom: '1rem', borderBottom: '1px dotted var(--border-color)', paddingBottom: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Export Settings</h2>
                </div>
                
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', backgroundColor: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                    <button className={'small-btn ' + (dataSource === 'system' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('system')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>System</button>
                    <button className={'small-btn ' + (dataSource === 'whatsapp' ? 'primary-btn' : 'secondary-btn')} onClick={() => setDataSource('whatsapp')} style={{ padding: '0.4rem 0.8rem', width: '100%', flex: 1 }}>WhatsApp</button>
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
                        {selectedEmpIds.length > 0 && selectedEmpIds.length !== selectionEmployees.length && (
                            <button onClick={() => setSelectedEmpIds([])} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', width: 'auto' }}>
                                Clear
                            </button>
                        )}
                        <button onClick={toggleAll} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', width: 'auto' }}>
                            {selectedEmpIds.length === selectionEmployees.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                </div>

                <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', backgroundColor: 'var(--input-bg)', marginBottom: '1.5rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={24} className="animate-spin" color="var(--text-primary)" /></div>
                    ) : selectionEmployees.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)' }}>No employees found.</div>
                    ) : (
                        selectionEmployees.map(emp => {
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

<button
    className="primary-btn"
    onClick={generatePDF}
    disabled={generating || selectedEmpIds.length === 0}
    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '1rem', marginTop: 'auto' }}
>
    {generating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
    {generating ? 'Generating PDF...' : 'Download PDF'}
</button>
            </div>
        </div>
    );
};

export default AttendancePDFExport;
