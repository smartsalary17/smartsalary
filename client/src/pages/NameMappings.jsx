import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Pencil, Save, XCircle } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';
import ConfirmModal from '../components/ConfirmModal';

const NameMappings = () => {
    const [mappings, setMappings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [unmappedNames, setUnmappedNames] = useState([]); // 👈 New state
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newEmpId, setNewEmpId] = useState('');
    const [newAlias, setNewAlias] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editingAlias, setEditingAlias] = useState(null);
    const [editAliasValue, setEditAliasValue] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const headers = token ? { Authorization: 'Bearer ' + token } : {};
            
            // Fetch mappings and unmapped names together
            const [res, unmappedRes] = await Promise.all([
                fetch(API_BASE + '/api/name-mappings', { headers }),
                fetch(API_BASE + '/api/name-mappings/unmapped', { headers })
            ]);
            
            const data = await res.json();
            const unmappedData = await unmappedRes.json();
            
            if (!res.ok) throw new Error(data.error);
            
            setMappings(data.mappings || []);
            setEmployees(data.employees || []);
            setUnmappedNames(unmappedData.unmappedNames || []); // Set unmapped names
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
            await fetchData(); // Refetch to update dropdown and table
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleDeleteAlias = (empId, alias) => {
        setDeleteTarget({ empId, alias });
    };

    const confirmDeleteAlias = async () => {
        if (!deleteTarget) return;
        try {
            const token = localStorage.getItem('wf_auth_token');
            await fetch(API_BASE + '/api/name-mappings/' + encodeURIComponent(deleteTarget.empId) + '/alias/' + encodeURIComponent(deleteTarget.alias), {
                method: 'DELETE',
                headers: token ? { Authorization: 'Bearer ' + token } : {}
            });
            setDeleteTarget(null);
            await fetchData();
        } catch (err) { setError(err.message); }
    };

    const handleEditAlias = (empId, alias) => {
        setEditingAlias({ empId, oldAlias: alias });
        setEditAliasValue(alias);
    };

    const saveEditedAlias = async (empId) => {
        if (!editAliasValue.trim() || editAliasValue === editingAlias.oldAlias) {
            setEditingAlias(null); return;
        }
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/name-mappings/' + encodeURIComponent(empId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ oldAlias: editingAlias.oldAlias, newAlias: editAliasValue.trim() })
            });
            if (!res.ok) throw new Error('Failed to update alias');
            setEditingAlias(null);
            await fetchData();
        } catch (err) { setError(err.message); }
    };
    // 1. Sort Employees by ID numerically
    const sortedEmployees = React.useMemo(() => {
        return [...employees].sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
        );
    }, [employees]);

    // 2. Sort Mappings by Emp ID numerically
    const sortedMappings = React.useMemo(() => {
        return [...mappings].sort((a, b) => 
            String(a.empId).localeCompare(String(b.empId), undefined, { numeric: true })
        );
    }, [mappings]);

    // 3. Filter Dropdown: Hide names that exactly match an employee's name
    const filteredUnmappedNames = React.useMemo(() => {
        return unmappedNames
            .filter(name => !employees.some(e => e.name.toLowerCase() === name.toLowerCase()))
            .sort();
    }, [unmappedNames, employees]);

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">Name Mappings</h2>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{mappings.length} mapped</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Map WhatsApp saved names to official SMART employees. Select an Analyzer name from the dropdown to easily map unmapped records.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div className="input-group">
                        <label>Employee (ID - Name)</label>
                        <select value={newEmpId} onChange={(e) => setNewEmpId(e.target.value)}>
                            <option value="">Select employee...</option>
                            {sortedEmployees.map(e => <option key={e.id} value={e.id}>{e.id} — {e.name}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>WhatsApp Saved Name</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select 
                                onChange={(e) => setNewAlias(e.target.value)} 
                                value={filteredUnmappedNames.includes(newAlias) ? newAlias : ''}
                                style={{ flex: 1 }}
                            >
                                <option value="">-- Select Unmapped Name --</option>
                                {filteredUnmappedNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <input 
                                type="text" 
                                value={newAlias} 
                                onChange={(e) => setNewAlias(e.target.value)} 
                                placeholder="Or type manually..." 
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                style={{ flex: 1 }} 
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="primary-btn" onClick={handleAdd} disabled={saving} style={{ padding: '0.75rem 1.25rem', width: 'auto' }}>
                            {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><Plus size={18} /> Map</>}
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
                            {sortedMappings.map(m => {
                                const emp = employees.find(e => String(e.id) === String(m.empId));
                                const displayName = m.employeeName || emp?.name || 'Unknown';
                                
                                return (
                                <tr key={m.empId}>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <strong style={{ color: 'var(--primary)' }}>{m.empId} - {displayName}</strong>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            {m.aliases.map(alias => {
                                                const isEditing = editingAlias && editingAlias.empId === m.empId && editingAlias.oldAlias === alias;
                                                
                                                if (isEditing) {
                                                    return (
                                                        <div key={alias} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--input-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                            <input type="text" value={editAliasValue} onChange={(e) => setEditAliasValue(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.8rem', width: '150px', height: '28px', background: 'transparent', border: 'none', color: 'var(--text-primary)' }} autoFocus />
                                                            <button onClick={() => saveEditedAlias(m.empId)} style={{ background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}><Save size={14} /> Save</button>
                                                            <button onClick={() => setEditingAlias(null)} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}><XCircle size={14} /> Cancel</button>
                                                        </div>
                                                    );
                                                }
                                                
                                                return (
                                                    <span key={alias} className="pill p-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        {alias}
                                                        <button onClick={() => handleEditAlias(m.empId, alias)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', width: 'auto' }}><Pencil size={12} /></button>
                                                        <button onClick={() => handleDeleteAlias(m.empId, alias)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', width: 'auto' }}><Trash2 size={12} /></button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                            {mappings.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No mappings yet. Add one above.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
            <ConfirmModal
                isOpen={!!deleteTarget}
                title="Delete Alias?"
                message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.alias}"?` : ''}
                onConfirm={confirmDeleteAlias}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default NameMappings;