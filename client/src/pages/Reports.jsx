import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Table, CalendarCheck, FileText, CalendarDays, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { API_BASE, MONTHS } from '../context/workforceShared';
import AttendanceReport from './AttendanceReport';

function transformBiometric(attendanceMap, employees) {
    const records = [];
    for (const [date, empMap] of Object.entries(attendanceMap || {})) {
        for (const [empId, data] of Object.entries(empMap || {})) {
            if (!data?.status) continue;
            const emp = employees.find(e => String(e.id) === String(empId));
            records.push({
                date,
                employeeId: empId,
                name: emp?.name || 'Employee ' + empId,
                status: data.status,
                checkIn: data.time || '',
                checkOut: data.outTime || '',
                checkIns: data.time ? [data.time] : [],
                checkOuts: data.outTime ? [data.outTime] : [],
                halfDay: data.status === 'half-day' ? 'Yes' : 'No',
                permission: '-',
                weekOff: data.status === 'weekoff' ? 'Yes' : 'No'
            });
        }
    }
    return records;
}

const Reports = () => {
    const now = new Date();
    const [source, setSource] = useState(() => localStorage.getItem('default_report_source') || 'biometric');
    const [tab, setTab] = useState('daily');
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [attRecords, setAttRecords] = useState([]);
    const [mergedAttRecords, setMergedAttRecords] = useState([]);
    const [penRecords, setPenRecords] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [search, setSearch] = useState('');
    const [dateSearch, setDateSearch] = useState('');
    
    // Ported states from PdfSummaryReport
    const [selectedSummaryDates, setSelectedSummaryDates] = useState([]);
    const [timeZones, setTimeZones] = useState([{ start: '02:15', end: '02:45' }, { start: '05:00', end: '05:15' }, { start: '05:00', end: '06:30' }]);

    const deduplicatedAttRecords = useMemo(() => {
        const map = new Map();
        for (const r of attRecords) {
            const key = r.employeeId ? `${r.date}-${r.employeeId}` : `${r.date}-${r.name}`;
            if (!map.has(key)) {
                map.set(key, { ...r });
            } else {
                const existing = map.get(key);
                // Absent overrides, or record with time overrides empty
                if (r.status === 'absent') map.set(key, { ...r, checkIn: '', checkOut: '' });
                else if (!existing.checkIn && r.checkIn) map.set(key, r);
            }
        }
        return Array.from(map.values());
    }, [attRecords]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('wf_auth_token');
                const headers = token ? { Authorization: 'Bearer ' + token } : {};
                const prefix = year + '-' + String(month).padStart(2, '0') + '-';

                const empRes = await fetch(API_BASE + '/api/employees', { headers }).then(r => r.json());
                const empList = Array.isArray(empRes) ? empRes : [];
                setEmployees(empList);

                const [att, pen, attMap] = await Promise.all([
                    fetch(API_BASE + '/api/attendance-report?month=' + month + '&year=' + year, { headers }).then(r => r.json()),
                    fetch(API_BASE + '/api/penalty-report?month=' + month + '&year=' + year, { headers }).then(r => r.json()),
                    fetch(API_BASE + '/api/attendance', { headers }).then(r => r.json())
                ]);
                
                const biometric = transformBiometric(attMap, empList).filter(r => r.date.startsWith(prefix));
                const whatsapp = att.records || [];
                
                setMergedAttRecords([...whatsapp, ...biometric]);
                setPenRecords(pen.records || []);

                if (source === 'whatsapp') {
                    setAttRecords(whatsapp);
                } else {
                    setAttRecords(biometric);
                }
            } catch (err) { console.error(err); }
            finally { setLoading(false); }
        };
        fetchData();
    }, [month, year, source]);

    useEffect(() => {
        if (employees.length && !employees.some(e => String(e.id) === selectedEmployee)) {
            setSelectedEmployee(String(employees[0].id));
        }
    }, [employees, selectedEmployee]);

    const allDates = useMemo(() => Array.from(new Set(attRecords.map(r => r.date))).sort().reverse(), [attRecords]);
    const allMonthDates = useMemo(() => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const dates = [];
        for (let d = 1; d <= daysInMonth; d++) {
            dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
        return dates.reverse();
    }, [month, year]);
    useEffect(() => { if (allDates.length && !allDates.includes(selectedDate)) setSelectedDate(allDates[0]); }, [allDates, selectedDate]);

    const selectedEmpObj = useMemo(() => employees.find(e => String(e.id) === selectedEmployee), [employees, selectedEmployee]);

    const nameWiseData = useMemo(() => {
        if (!selectedEmpObj) return [];
        const empId = String(selectedEmpObj.id);
        const name = selectedEmpObj.name;
        return attRecords
            .filter(r => (r.employeeId && String(r.employeeId) === empId) || r.name === name)
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [attRecords, selectedEmpObj]);

        const dateWiseData = useMemo(() => {
        if (!selectedDate) return [];
        const filtered = deduplicatedAttRecords.filter(r => r.date === selectedDate);
        if (!dateSearch.trim()) return filtered;
        const s = dateSearch.toLowerCase();
        return filtered.filter(r => r.name.toLowerCase().includes(s) || (r.employeeId && r.employeeId.toLowerCase().includes(s)));
    }, [deduplicatedAttRecords, selectedDate, dateSearch]);

    const dailyData = useMemo(() => {
        if (!selectedDate) return [];
        const filtered = deduplicatedAttRecords.filter(r => r.date === selectedDate);
        if (!search.trim()) return filtered;
        return filtered.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    }, [attRecords, selectedDate, search]);

    const dailySummary = useMemo(() => ({
        total: dailyData.length,
        present: dailyData.filter(r => ['present', 'late', 'half-day'].includes(r.status)).length,
        halfDay: dailyData.filter(r => r.halfDay === 'Yes').length,
        weekOff: dailyData.filter(r => r.weekOff === 'Yes').length,
        permission: dailyData.filter(r => r.permission && r.permission !== '-').length
    }), [dailyData]);

    const summaryData = useMemo(() => {
        const map = new Map();
        for (const emp of employees) {
            map.set(String(emp.id), { name: emp.name, empId: emp.id, present: 0, halfDay: 0, weekOff: 0, permission: 0, penalty: 0 });
        }
        for (const rec of deduplicatedAttRecords) {
            const key = rec.employeeId ? String(rec.employeeId) : ('name:' + rec.name);
            const existing = map.get(key) || { name: rec.name, empId: rec.employeeId || '-', present: 0, halfDay: 0, weekOff: 0, permission: 0, penalty: 0 };
            if (['present', 'late'].includes(rec.status)) existing.present++;
            if (rec.halfDay === 'Yes') existing.halfDay++;
            if (rec.weekOff === 'Yes') existing.weekOff++;
            if (rec.permission && rec.permission !== '-') existing.permission++;
            map.set(key, existing);
        }
        for (const p of penRecords) {
            const key = p.employeeId ? String(p.employeeId) : ('name:' + p.name);
            const s = map.get(key);
            if (s) s.penalty += Number(p.penalty || 0);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [attRecords, penRecords, employees]);

    const tabs = [
        { id: 'daily', label: 'Daily Attendance', icon: CalendarDays },
        { id: 'name', label: 'Name Wise', icon: Table },
        { id: 'date', label: 'Date Wise', icon: CalendarCheck },
        { id: 'summary', label: 'Summary', icon: FileText }
    ];

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">Reports</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <button className={'small-btn ' + (source === 'biometric' ? 'primary-btn' : 'secondary-btn')} onClick={() => setSource('biometric')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>System Attendance</button>
                            <button className={'small-btn ' + (source === 'whatsapp' ? 'primary-btn' : 'secondary-btn')} onClick={() => setSource('whatsapp')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>WhatsApp Data</button>
                        </div>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', width: 'auto' }}>
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: '100px', padding: '0.5rem' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    {tabs.map(t => {
                        const Icon = t.icon;
                        return <button key={t.id} onClick={() => setTab(t.id)} className={'small-btn ' + (tab === t.id ? 'primary-btn' : 'secondary-btn')} style={{ padding: '0.5rem 1rem', width: 'auto' }}><Icon size={16} style={{ marginRight: '6px' }} /> {t.label}</button>;
                    })}
                </div>

                {loading ? ( // SPINNER
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
                        <Loader2 size={48} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                ) : tab === 'name' ? (
                    <>
                        <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} style={{ marginBottom: '1rem', maxWidth: '300px' }}>
                            {employees.length === 0 && <option value="">No employees in master</option>}
                            {employees.map(e => <option key={e.id} value={String(e.id)}>{e.id} — {e.name}</option>)}
                        </select>
                        <table>
                            <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th style={{ textAlign: 'center' }}>Half Day</th><th style={{ textAlign: 'center' }}>Permission</th><th style={{ textAlign: 'center' }}>Week Off</th><th style={{ textAlign: 'center' }}>Absent</th></tr></thead>
                            <tbody>
                                {nameWiseData.map((r, i) => {
                                    const dayPenalty = penRecords.filter(p => {
                                        const matchEmp = r.employeeId && p.employeeId && String(p.employeeId) === String(r.employeeId);
                                        const matchName = p.name === selectedEmpObj?.name;
                                        return (matchEmp || matchName) && p.date === r.date;
                                    }).reduce((s, p) => s + Number(p.penalty || 0), 0);
                                    return (
                                        <tr key={i}>
                                            <td>{r.date.split('-').reverse().join('/')}</td>
                                            <td style={{ color: 'var(--success)' }}>{r.status === 'absent' ? '-' : (r.checkIn || '-')}</td>
                                            <td style={{ color: 'var(--danger)' }}>{r.status === 'absent' ? '-' : (r.checkOut || '-')}</td>
                                            <td style={{ textAlign: 'center' }}>{r.halfDay === 'Yes' ? 'Yes' : '—'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.permission && r.permission !== '-' ? 'Yes' : '—'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.weekOff === 'Yes' ? 'Yes' : '—'}</td>
                                            <td style={{ textAlign: 'center' }}>{r.status === 'absent' ? 'Yes' : '—'}</td>
                                        </tr>
                                    );
                                })}
                                {nameWiseData.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No {source} records for this employee</td></tr>}
                            </tbody>
                        </table>
                    </>
                ) : tab === 'date' ? (
                    <>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={allDates[allDates.length - 1]} max={allDates[0]} style={{ maxWidth: '200px' }} />
                            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '400px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input type="text" placeholder="Search employee..." value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} style={{ paddingLeft: '2.25rem', width: '100%' }} />
                            </div>
                        </div>
                        <table>
                            <thead><tr><th>Employee</th><th>Check In</th><th>Check Out</th><th style={{ textAlign: 'center' }}>Half Day</th><th style={{ textAlign: 'center' }}>Permission</th><th style={{ textAlign: 'center' }}>Week Off</th><th style={{ textAlign: 'center' }}>Absent</th></tr></thead>
                            <tbody>
                                {dateWiseData.map((r, i) => (
                                    <tr key={i}>
                                        <td><strong>{r.name}</strong></td>
                                        <td style={{ color: 'var(--success)' }}>{r.status === 'absent' ? '-' : (r.checkIn || '-')}</td>
                                        <td style={{ color: 'var(--danger)' }}>{r.status === 'absent' ? '-' : (r.checkOut || '-')}</td>
                                        <td style={{ textAlign: 'center' }}>{r.halfDay === 'Yes' ? 'Yes' : '—'}</td>
                                        <td style={{ textAlign: 'center' }}>{r.permission && r.permission !== '-' ? 'Yes' : '—'}</td>
                                        <td style={{ textAlign: 'center' }}>{r.weekOff === 'Yes' ? 'Yes' : '—'}</td>
                                        <td style={{ textAlign: 'center' }}>{r.status === 'absent' ? 'Yes' : '—'}</td>
                                    </tr>
                                ))}
                                {dateWiseData.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No records on {selectedDate}</td></tr>}
                            </tbody>
                        </table>
                    </>
                ) : tab === 'daily' ? (
                    <AttendanceReport 
                        month={month} 
                        year={year} 
                        source={source} 
                        hideHeader={true} 
                        onMonthChange={(newMonth, newYear) => {
                            setMonth(newMonth);
                            setYear(newYear);
                        }}
                    />
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>1. Select Dates</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {allMonthDates.map(date => {
                                    const isSel = selectedSummaryDates.includes(date);
                                    const [y, m, d] = date.split('-');
                                    const displayDate = `${d}/${m}/${y}`;
                                    return <button key={date} type="button" onClick={() => setSelectedSummaryDates(prev => isSel ? prev.filter(d => d !== date) : [...prev, date])} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', background: isSel ? 'var(--primary)' : 'var(--input-bg)', color: isSel ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer', width: 'auto' }}>{displayDate}</button>;
                                })}
                            </div>
                        </div>
                        <div style={{ background: 'var(--card-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>2. Time Zones</h4>
                            {timeZones.map((zone, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Zone {i + 1}:</span>
                                    <input type="time" value={zone.start} onChange={e => setTimeZones(prev => prev.map((z, idx) => idx === i ? { ...z, start: e.target.value } : z))} style={{ padding: '0.3rem', width: '100px' }} />
                                    <span>-</span>
                                    <input type="time" value={zone.end} onChange={e => setTimeZones(prev => prev.map((z, idx) => idx === i ? { ...z, end: e.target.value } : z))} style={{ padding: '0.3rem', width: '100px' }} />
                                </div>
                            ))}
                        </div>

                        {selectedSummaryDates.length > 0 && (
                            <div className="summary-print-box" style={{ gridColumn: '1 / -1', padding: '2rem', borderRadius: '12px', overflowX: 'auto' }}>
                                <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Attendance Summary</h2>
                                <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    <strong>Selected Dates: </strong>
                                    {selectedSummaryDates.length > 0 
                                        ? selectedSummaryDates.map(d => d.split('-').reverse().join('/')).join(', ') 
                                        : 'None'}
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)' }}>Emp ID</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)' }}>Name</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{timeZones[0].start}</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{timeZones[1].start}</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{timeZones[2].start}</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>Permission</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>Half Day</th>
                                            <th style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>Week Off</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const map = new Map();
                                            for (const emp of employees) {
                                                map.set(String(emp.id), { name: emp.name, empId: emp.id, c1: 0, c2: 0, c3: 0, perm: 0, hd: 0, wo: 0 });
                                            }
                                            for (const r of mergedAttRecords) {
                                                if (!selectedSummaryDates.includes(r.date)) continue;
                                                const key = r.employeeId ? String(r.employeeId) : ('name:' + r.name);
                                                const s = map.get(key) || { name: r.name, empId: r.employeeId || '-', c1: 0, c2: 0, c3: 0, perm: 0, hd: 0, wo: 0 };
                                                
                                                if (r.checkIn) {
                                                    const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                                                    const tm = toMins(r.checkIn);
                                                    if (tm >= toMins(timeZones[0].start) && tm <= toMins(timeZones[0].end)) s.c1++;
                                                    if (tm >= toMins(timeZones[1].start) && tm <= toMins(timeZones[1].end)) s.c2++;
                                                    if (tm >= toMins(timeZones[2].start) && tm <= toMins(timeZones[2].end)) s.c3++;
                                                }
                                                if (r.permission && r.permission !== '-') s.perm++;
                                                if (r.halfDay === 'Yes') s.hd++;
                                                if (r.weekOff === 'Yes') s.wo++;
                                                map.set(key, s);
                                            }
                                            return Array.from(map.values()).map(row => (
                                                <tr key={row.empId + row.name}>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)' }}>{row.empId}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', fontWeight: 'bold' }}>{row.name}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.c1 || 'NIL'}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.c2 || 'NIL'}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.c3 || 'NIL'}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.perm || 'NIL'}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.hd || 'NIL'}</td>
                                                    <td style={{ padding: '0.5rem', border: '1px solid var(--border-color)', textAlign: 'center' }}>{row.wo || 'NIL'}</td>
                                                </tr>
                                            ));
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;












