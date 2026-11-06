import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { API_BASE, MONTHS } from '../context/workforceShared';

const PenaltyReport = () => {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [records, setRecords] = useState([]);
    const [aggregated, setAggregated] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [view, setView] = useState('overall');

    const fetchData = async () => {
        setLoading(true); setError('');
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/penalty-report?month=' + month + '&year=' + year, {
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
            setRecords(data.records || []);
            setAggregated(data.aggregated || []);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, [month, year]);

    const visibleOverall = useMemo(() => !search.trim() ? aggregated : aggregated.filter(r => r.name.toLowerCase().includes(search.toLowerCase())), [aggregated, search]);
    const visibleExplicit = useMemo(() => {
        if (!search.trim()) return records;
        const s = search.toLowerCase();
        return records.filter(r => r.name.toLowerCase().includes(s) || (r.penaltyReason || '').toLowerCase().includes(s) || r.date.includes(s));
    }, [records, search]);

    const totalPenalty = visibleOverall.reduce((sum, r) => sum + r.total, 0);

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">Penalty Report</h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} style={{ padding: '0.5rem', width: 'auto' }}>
                            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                        </select>
                        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} style={{ width: '100px', padding: '0.5rem' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2.25rem', width: '100%' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <button className={'small-btn ' + (view === 'overall' ? 'primary-btn' : 'secondary-btn')} onClick={() => setView('overall')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>Overall</button>
                        <button className={'small-btn ' + (view === 'explicit' ? 'primary-btn' : 'secondary-btn')} onClick={() => setView('explicit')} style={{ padding: '0.4rem 0.8rem', width: 'auto' }}>Explicit</button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : error ? (
                    <div style={{ color: 'var(--danger)', padding: '1rem' }}>{error}</div>
                ) : view === 'overall' ? (
                    <>
                        <div className="stat-item" style={{ marginBottom: '1rem' }}>
                            <div className="stat-label">Total Penalties</div>
                            <div className="stat-value" style={{ color: 'var(--danger)' }}>₹{totalPenalty.toLocaleString('en-IN')}</div>
                        </div>
                        <table>
                            <thead><tr><th>Employee</th><th style={{ textAlign: 'center' }}>Count</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                            <tbody>
                                {visibleOverall.map((r, i) => (
                                    <tr key={i}>
                                        <td><strong>{r.name}</strong></td>
                                        <td style={{ textAlign: 'center' }}>{r.count}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>₹{r.total.toLocaleString('en-IN')}</td>
                                    </tr>
                                ))}
                                {visibleOverall.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No penalties</td></tr>}
                            </tbody>
                        </table>
                    </>
                ) : (
                    <table>
                        <thead><tr><th>Date</th><th>Employee</th><th>Reason</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>
                            {visibleExplicit.map((r, i) => (
                                <tr key={i}>
                                    <td>{r.date}</td>
                                    <td><strong>{r.name}</strong></td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{r.penaltyReason || '—'}</td>
                                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>₹{Number(r.penalty).toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                            {visibleExplicit.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No penalties</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default PenaltyReport;

