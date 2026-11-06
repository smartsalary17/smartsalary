import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';

const NameMappings = () => {
    const [mappings, setMappings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newEmpId, setNewEmpId] = useState('');
    const [newAlias, setNewAlias] = useState('');
    const [saving, setSaving] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/name-mappings', {
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMappings(data.mappings || []);
            setEmployees(data.employees || []);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAdd = async () => {
        if (!newEmpId || !newAlias.trim()) { setError('Select employee and enter alias.'); return; }
        setSaving(true); setError('');
        try {
            const emp = employees.find(e => String(e.id) === String(newEmpId));
            if (!emp) throw new Error('Employee not found');
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/name-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ employeeName: emp.name, empId: String(emp.id), alias: newAlias.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setNewAlias('');
            await fetchData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleDeleteAlias = async (empId, alias) => {
        if (!confirm('Remove alias "' + alias + '"?')) return;
        try {
            const token = localStorage.getItem('wf_auth_token');
            await fetch(API_BASE + '/api/name-mappings/' + encodeURIComponent(empId) + '/alias/' + encodeURIComponent(alias), {
                method: 'DELETE',
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            await fetchData();
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">Name Mappings</h2>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{mappings.length} mapped</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Map WhatsApp saved names to official SMART employees. New employees added in Employees page appear here automatically.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div className="input-group">
                        <label>Employee</label>
                        <select value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)}>
                            <option value="">Select employee...</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.id} — {e.name}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>WhatsApp Saved Name</label>
                        <input type="text" value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="e.g. Vasanth Smart" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="primary-btn" onClick={handleAdd} disabled={saving} style={{ padding: '0.75rem 1.25rem', width: 'auto' }}>
                            {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><Plus size={18} /> Add</>}
                        </button>
                    </div>
                </div>

                {error && <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '10px', marginBottom: '1rem' }}>{error}</div>}

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                    <table>
                        <thead><tr><th>Employee</th><th>Aliases</th></tr></thead>
                        <tbody>
                            {mappings.map(m => (
                                <tr key={m.empId}>
                                    <td><div><strong style={{ color: 'var(--primary)' }}>{m.empId}</strong></div><div style={{ fontSize: '0.85rem' }}>{m.employeeName}</div></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {m.aliases.map(alias => (
                                                <span key={alias} className="pill p-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    {alias}
                                                    <button onClick={() => handleDeleteAlias(m.empId, alias)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, width: 'auto' }}><Trash2 size={12} /></button>
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {mappings.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No mappings yet. Add one above.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default NameMappings;
