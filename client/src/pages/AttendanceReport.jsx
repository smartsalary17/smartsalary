import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Search, Loader2 } from 'lucide-react';
import { API_BASE, MONTHS } from '../context/workforceShared';

function transformBiometric(attendanceMap, employees) {
    const records = [];
    for (const [date, empMap] of Object.entries(attendanceMap || {})) {
        for (const [empId, data] of Object.entries(empMap || {})) {
            if (!data?.status) continue;
            
            // FIX: Find the employee. If not in master list, skip this record.
            const emp = employees.find(e => String(e.id) === String(empId));
            if (!emp) continue; 

            records.push({
                date,
                employeeId: empId,
                name: emp.name, // Now we can safely use emp.name directly
                status: data.status,
                checkIn: data.time || '',
                checkOut: data.outTime || '',
                checkIns: data.time ? [data.time] : [],
                checkOuts: data.outTime ? [data.outTime] : [],
                workTime: data.workTime || '', // (Add this if your version has it)
                halfDay: data.status === 'half-day' ? 'Yes' : 'No',
                permission: '-',
                weekOff: data.status === 'weekoff' ? 'Yes' : 'No',
                isBiometric: true
            });
        }
    }
    return records;
}

const AttendanceReport = ({ month: propMonth, year: propYear, source: propSource, hideHeader = false, onMonthChange }) => {
    const now = new Date();
    const [source, setSource] = useState(propSource || 'biometric');
    const [month, setMonth] = useState(propMonth || now.getMonth() + 1);
    const [year, setYear] = useState(propYear || now.getFullYear());
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const hasAutoSwitched = useRef(false);
    const isFirstLoad = useRef(true);

    const handleDateChange = (newDateStr) => {
        setSelectedDate(newDateStr);
        if (newDateStr && onMonthChange) {
            const [y, m] = newDateStr.split('-');
            if (parseInt(y) !== year || parseInt(m) !== month) {
                onMonthChange(parseInt(m), parseInt(y)); // Parent state update
            }
        }
    };

    const shiftDate = (dateStr, days) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    };


    
    useEffect(() => {
        if (propSource) setSource(propSource);
        if (propMonth) setMonth(propMonth);
        if (propYear) setYear(propYear);
    }, [propSource, propMonth, propYear]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true); setError('');
            try {
                const token = localStorage.getItem('wf_auth_token');
                const headers = token ? { Authorization: 'Bearer ' + token } : {};
            if (source === 'whatsapp') {
                const res = await fetch(API_BASE + '/api/attendance-report?month=' + month + '&year=' + year, { headers });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);

                // Auto-switch code removed. Just set records.
                setRecords(data.records || []);
            } else {
                    // Add month and year to the biometric API call
                    const [attRes, empRes] = await Promise.all([
                        fetch(API_BASE + `/api/attendance?month=${month}&year=${year}`, { headers }).then(r => r.json()),
                        fetch(API_BASE + '/api/employees', { headers }).then(r => r.json())
                    ]);
                    const transformed = transformBiometric(attRes, Array.isArray(empRes) ? empRes : []);
                    const prefix = year + '-' + String(month).padStart(2, '0') + '-';
                    // Filtering here is fine as a safety net, but data is already filtered by backend
                    setRecords(transformed.filter(r => r.date.startsWith(prefix)));
                }
                setSelectedDate('');
            } catch (err) { setError(err.message); }
            finally { setLoading(false); }
        };
        fetchData();
    }, [month, year, source]);

    const dates = useMemo(() => Array.from(new Set(records.map(r => r.date))).sort().reverse(), [records]);
    const activeDate = selectedDate || dates[0] || '';

    const todayStr = new Date().toISOString().split('T')[0];
    const nextDateStr = shiftDate(activeDate, 1);
    const isFutureDate = nextDateStr > todayStr;

    const dayRecords = useMemo(() => {
        if (!activeDate) return [];
        const filtered = records.filter(r => r.date === activeDate);
        if (!search.trim()) return filtered;
        return filtered.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    }, [records, activeDate, search]);

    const summary = useMemo(() => ({
        total: dayRecords.length,
        present: dayRecords.filter(r => ['present', 'late', 'half-day'].includes(r.status)).length,
        absent: dayRecords.filter(r => r.status === 'absent').length,
        halfDay: dayRecords.filter(r => r.halfDay === 'Yes').length,
        weekOff: dayRecords.filter(r => r.weekOff === 'Yes').length,
        permission: dayRecords.filter(r => r.permission && r.permission !== '-').length
    }), [dayRecords]);

    return (
        <div className="pg active">
            <div className="card">
                {!hideHeader && (
                <div className="ch">
                    <h2 className="ct">Attendance Report</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <button className={'small-btn ' + (source === 'biometric' ? 'primary-btn' : 'secondary-btn')} onClick={() => setSource('biometric')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>Biometric</button>
                            <button className={'small-btn ' + (source === 'whatsapp' ? 'primary-btn' : 'secondary-btn')} onClick={() => setSource('whatsapp')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>WhatsApp</button>
                        </div>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', width: 'auto' }}>
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: '100px', padding: '0.5rem' }} />
                    </div>
                </div>
                )}

                {loading ? (
                    <div style={{ color: 'var(--spinner)', textAlign: 'center', padding: '3rem' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : error ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem' }}>{error}</div>
                ) : records.length === 0 ? (
                    <div className="empty-state">No {source} records for {MONTHS[month - 1]} {year}.</div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* 👇 Prev Button Fixed */}
                            <button className="small-btn secondary-btn" onClick={() => handleDateChange(shiftDate(activeDate, -1))} style={{ width: 'auto' }}>
                                <ChevronLeft size={16} />
                            </button>
                            
                            <input type="date" value={activeDate} onChange={(e) => handleDateChange(e.target.value)} max={todayStr} style={{ padding: '0.5rem', width: 'auto' }} />
                            
                            {/* 👇 Next Button Fixed */}
                            <button className="small-btn secondary-btn" onClick={() => handleDateChange(nextDateStr)} disabled={isFutureDate} style={{ width: 'auto', opacity: isFutureDate ? 0.5 : 1, cursor: isFutureDate ? 'not-allowed' : 'pointer' }}>
                                <ChevronRight size={16} />
                            </button>
                            
                            <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                <input type="text" placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2.25rem', width: '100%' }} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div className="stat-item"><div className="stat-label">Total</div><div className="stat-value">{summary.total}</div></div>
                            <div className="stat-item"><div className="stat-label">Present</div><div className="stat-value" style={{ color: 'var(--success)' }}>{summary.present}</div></div>
                            <div className="stat-item"><div className="stat-label">Absent</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{summary.absent || 0}</div></div>
                            <div className="stat-item"><div className="stat-label">Half Day</div><div className="stat-value" style={{ color: 'var(--warning)' }}>{summary.halfDay}</div></div>
                            <div className="stat-item"><div className="stat-label">Permission</div><div className="stat-value" style={{ color: '#60a5fa' }}>{summary.permission}</div></div>
                            <div className="stat-item"><div className="stat-label">Week Off</div><div className="stat-value" style={{ color: '#c084fc' }}>{summary.weekOff}</div></div>
                        </div>

                        <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <table>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)', zIndex: 1 }}>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Check In</th>
                                        <th>Check Out</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dayRecords.map((r, i) => (
                                        <tr key={i}>
                                            <td><strong>{r.name}</strong>{r.employeeId && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '6px' }}>({r.employeeId})</span>}</td>
                                            <td style={{ color: 'var(--success)' }}>{r.checkIns?.length ? r.checkIns.join(', ') : (r.checkIn || '-')}</td>
                                            <td style={{ color: 'var(--danger)' }}>{r.checkOuts?.length ? r.checkOuts.join(', ') : (r.checkOut || '-')}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                {r.status === 'absent' && <span className="pill p-red">Absent</span>}
                                                {r.status === 'weekoff' && <span className="pill p-sl">Week Off</span>}
                                                {r.status === 'present' && <span className="pill p-green">Present</span>}
                                                {r.status === 'late' && <span className="pill p-amber">Late</span>}
                                                {r.halfDay === 'Yes' && <span className="pill p-amber">Half Day</span>}
                                                {r.permission && r.permission !== '-' && <span className="pill p-blue">Permission</span>}
                                                {!r.status && r.halfDay !== 'Yes' && (!r.permission || r.permission === '-') && '—'}
                                            </div>
                                        </td>
                                        </tr>
                                    ))}
                                    {dayRecords.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No records on {activeDate}</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AttendanceReport;




