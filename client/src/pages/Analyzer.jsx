import React, { useState } from 'react';
import { Upload, FileText, Loader2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';

const Analyzer = ({ setPage }) => {
    const [text, setText] = useState('');
    const [fileName, setFileName] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setFileName(files.map(f => f.name).join(', '));
        const contents = await Promise.all(files.map(f => f.text()));
        setText(contents.join('\n\n'));
        setError('');
        setResult(null);
        e.target.value = '';
    };

    const handleAnalyze = async () => {
        if (!text.trim()) { setError('Please upload a file or paste WhatsApp text.'); return; }
        setLoading(true); setError(''); setResult(null);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ text, type: 'whatsapp' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
            setResult(data);
        } catch (err) {
            setError(err.message || 'Analysis failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pg active">
            <div className="card">
                <div className="ch">
                    <h2 className="ct">COCO Analyzer</h2>
                </div>
                
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Upload a WhatsApp chat export (.txt) or paste text. The parser will extract attendance and penalties and save them to the database.
                </p>

                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label>WhatsApp File(s)</label>
                    <div style={{ background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
                        <Upload size={32} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--text-secondary)' }}>Click to browse or drag files here</p>
                        <input type="file" accept=".txt" multiple onChange={handleFiles} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                    {fileName && <p style={{ fontSize: '0.85rem', color: 'var(--success)', marginTop: '0.5rem' }}>📄 {fileName}</p>}
                </div>

                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label>Or Paste Text</label>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste WhatsApp chat text here..." style={{ minHeight: '150px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', width: '100%', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px' }} />
                </div>

                {error && (
                    <div style={{ padding: '0.9rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', color: 'var(--danger)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertTriangle size={18} /> {error}
                    </div>
                )}

                {result && (
                    <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--success)' }}>
                            <CheckCircle2 size={18} /> <strong>Analysis Complete</strong>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            ✅ Attendance: {result.attendanceRows} rows<br />
                            ✅ Penalties: {result.penaltyRows} rows<br />
                            💾 Saved: attendance={result.savedAttendance}, penalty={result.savedPenalty}
                        </div>
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <button className="small-btn primary-btn" onClick={() => setPage('attendance-report')} style={{ width: 'auto', padding: '0.5rem 1rem' }}>View Attendance →</button>
                            <button className="small-btn secondary-btn" onClick={() => setPage('penalty-report')} style={{ width: 'auto', padding: '0.5rem 1rem' }}>View Penalties →</button>
                        </div>
                    </div>
                )}

                <div className="action-row">
                    <button className="primary-btn" onClick={handleAnalyze} disabled={loading} style={{ width: 'auto' }}>
                        {loading ? <><Loader2 size={18} style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Send size={18} style={{ marginRight: '8px' }} /> Analyze & Save</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Analyzer;
