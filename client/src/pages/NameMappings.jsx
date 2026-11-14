import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Loader2, Pencil, Save, XCircle, Search, Check } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext';

const NameMappings = () => {
    const [mappings, setMappings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [unmappedNames, setUnmappedNames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { showToast } = useToast();
    // Top Form State
    const [newEmpId, setNewEmpId] = useState('');
    const [newAlias, setNewAlias] = useState('');
    const [saving, setSaving] = useState(false);

    // Inline Add State
    const [activeInlineEmpId, setActiveInlineEmpId] = useState(null);
    const [inlineAlias, setInlineAlias] = useState('');
    
    // Edit/Delete State
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editingAlias, setEditingAlias] = useState(null);
    const [editAliasValue, setEditAliasValue] = useState('');
    
    // Search State
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const headers = token ? { Authorization: 'Bearer ' + token } : {};
            
            const [res, unmappedRes] = await Promise.all([
                fetch(API_BASE + '/api/name-mappings', { headers }),
                fetch(API_BASE + '/api/name-mappings/unmapped', { headers })
            ]);
            
            const data = await res.json();
            const unmappedData = await unmappedRes.json();
            
            if (!res.ok) throw new Error(data.error);
            
            setMappings(data.mappings || []);
            setEmployees(data.employees || []);
            setUnmappedNames(unmappedData.unmappedNames || []);
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // Sort Employees by ID numerically
    const sortedEmployees = useMemo(() => {
        return [...employees].sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
        );
    }, [employees]);

    // Filter Dropdown: Hide names that exactly match an employee's name
    const filteredUnmappedNames = useMemo(() => {
        return unmappedNames
            .filter(name => !employees.some(e => e.name.toLowerCase() === name.toLowerCase()))
            .sort();
    }, [unmappedNames, employees]);

    // Search Filter for Table
    const filteredEmployees = useMemo(() => {
        if (!search.trim()) return sortedEmployees;
        const s = search.toLowerCase();
        return sortedEmployees.filter(emp => 
            String(emp.id).toLowerCase().includes(s) || emp.name.toLowerCase().includes(s)
        );
    }, [sortedEmployees, search]);

    // Top Form Submit Handler
    const handleTopAdd = async () => {
        if (!newEmpId || !newAlias.trim()) { showToast('Select employee and enter alias.', 'error'); return; }
        
        const emp = employees.find(e => String(e.id) === String(newEmpId));
        if (!emp) return;

        // Duplicate check
        const mapping = mappings.find(m => String(m.empId) === String(emp.id));
        const existingAliases = mapping ? mapping.aliases : [];
        if (existingAliases.some(a => a.toLowerCase() === newAlias.trim().toLowerCase())) {
            showToast(`Alias "${newAlias.trim()}" already exists for ${emp.name}.`, 'error');
            return;
        }

        setSaving(true); setError('');
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/name-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ employeeName: emp.name, empId: String(emp.id), alias: newAlias.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setNewAlias('');
            setNewEmpId('');
            await fetchData();
            showToast('Alias mapped successfully!', 'success'); 
        } catch (err) { showToast(err.message,'error'); }
        finally { setSaving(false); }
    };

    // Inline Add Handler
    const handleAddInline = async (emp) => {
        if (!inlineAlias.trim()) { setActiveInlineEmpId(null); return; }
        
        const mapping = mappings.find(m => String(m.empId) === String(emp.id));
        const existingAliases = mapping ? mapping.aliases : [];
        
        if (existingAliases.some(a => a.toLowerCase() === inlineAlias.trim().toLowerCase())) {
            showToast(`Alias "${inlineAlias.trim()}" already exists for ${emp.name}.`, 'error');
            return;
        }

        setSaving(true); setError('');
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/name-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ employeeName: emp.name, empId: String(emp.id), alias: inlineAlias.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            
            setInlineAlias('');
            setActiveInlineEmpId(null);
            await fetchData();
            showToast('Alias added successfully!', 'success');
        } catch (err) { showToast(err.message, 'error'); }
        finally { setSaving(false); }
    };

    const handleDeleteAlias = (empId, alias) => setDeleteTarget({ empId, alias });

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
            showToast('Alias deleted successfully!', 'success'); 
        } catch (err) { showToast(err.message, 'error'); }
    };

    const handleEditAlias = (empId, alias) => {
        setEditingAlias({ empId, oldAlias: alias });
        setEditAliasValue(alias);
    };

    const saveEditedAlias = async (empId) => {
        if (!editAliasValue.trim() || editAliasValue === editingAlias.oldAlias) {
            setEditingAlias(null); return;
        }
        
        const mapping = mappings.find(m => String(m.empId) === String(empId));
        if (mapping && mapping.aliases.some(a => a.toLowerCase() === editAliasValue.trim().toLowerCase() && a !== editingAlias.oldAlias)) {
            showToast('This alias already exists.', 'error');
            return;
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
            showToast('Alias updated successfully!', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    };

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">Name Mappings</h2>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{mappings.length} mapped</span>
                </div>
                
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Map WhatsApp saved names to official SMART employees. You can use the form below or add aliases directly from the table.
                </p>

                {/* 🔍 Search Box */}
                <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: '400px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Search by Employee ID or Name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem 1rem 0.75rem 2.5rem',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            outline: 'none'
                        }}
                    />
                </div>

                {/* 📝 Top Form (Dropdown + Input) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.75rem', marginBottom: '1.5rem', background: 'rgba(148, 163, 184, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
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
                                onKeyDown={(e) => e.key === 'Enter' && handleTopAdd()}
                                style={{ flex: 1 }} 
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="primary-btn" onClick={handleTopAdd} disabled={saving} style={{ padding: '0.75rem 1.25rem', width: 'auto', height: '42px' }}>
                            {saving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <><Plus size={18} /> Map</>}
                        </button>
                    </div>
                </div>

                {error && <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '10px', marginBottom: '1rem' }}>{error}</div>}

                {/* 📋 Employee Table */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}><Loader2 size={32} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : (
                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                        <table style={{ margin: 0 }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--sidebar-bg)', zIndex: 1 }}>
                                <tr>
                                    <th style={{ width: '35%' }}>Employee</th>
                                    <th>Aliases</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEmployees.map(emp => {
                                    const mapping = mappings.find(m => String(m.empId) === String(emp.id));
                                    const aliases = mapping ? mapping.aliases : [];
                                    const isAdding = activeInlineEmpId === emp.id;

                                    return (
                                        <tr key={emp.id}>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <strong style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>{emp.id} - {emp.name}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {aliases.map(alias => {
                                                        const isEditing = editingAlias && editingAlias.empId === emp.id && editingAlias.oldAlias === alias;
                                                        
                                                        if (isEditing) {
                                                            return (
                                                                <div key={alias} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'var(--input-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                                    <input type="text" value={editAliasValue} onChange={(e) => setEditAliasValue(e.target.value)} style={{ padding: '4px 8px', fontSize: '0.8rem', width: '150px', height: '28px', background: 'transparent', border: 'none', color: 'var(--text-primary)' }} autoFocus />
                                                                    <button onClick={() => saveEditedAlias(emp.id)} style={{ background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}><Save size={14} /></button>
                                                                    <button onClick={() => setEditingAlias(null)} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}><XCircle size={14} /></button>
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        return (
                                                            <span key={alias} className="pill p-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '5px 10px' }}>
                                                                {alias}
                                                                <button onClick={() => handleEditAlias(emp.id, alias)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', width: 'auto' }}><Pencil size={12} /></button>
                                                                <button onClick={() => handleDeleteAlias(emp.id, alias)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 2px', width: 'auto' }}><Trash2 size={12} /></button>
                                                            </span>
                                                        );
                                                    })}

                                                    {/* Inline Add Alias */}
                                                    {isAdding ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '4px', borderRadius: '8px' }}>
                                                            <input 
                                                                type="text" 
                                                                value={inlineAlias} 
                                                                onChange={(e) => setInlineAlias(e.target.value)} 
                                                                placeholder="Type alias..." 
                                                                style={{ padding: '6px 10px', fontSize: '0.8rem', width: '150px', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px' }} 
                                                                autoFocus
                                                                onKeyDown={(e) => e.key === 'Enter' && handleAddInline(emp)}
                                                            />
                                                            <button onClick={() => handleAddInline(emp)} disabled={saving} style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                {saving ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} /> Save</>}
                                                            </button>
                                                            <button onClick={() => { setActiveInlineEmpId(null); setInlineAlias(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', width: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                <XCircle size={16} /> Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => { setActiveInlineEmpId(emp.id); setInlineAlias(''); setError(''); }} 
                                                            className="secondary-btn small-btn" 
                                                            style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem', borderStyle: 'dashed' }}
                                                        >
                                                            <Plus size={14} /> Add Alias
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredEmployees.length === 0 && (
                                    <tr><td colSpan={2} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>No employees found matching your search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
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