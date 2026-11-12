import React, { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, Send, CheckCircle2, AlertTriangle, X, Trash2, FileText, Info } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';
import ConfirmModal from '../components/ConfirmModal';

const Analyzer = ({ setPage }) => {
    const [text, setText] = useState(() => localStorage.getItem('analyzer_text') || '');
    const [uploadedFiles, setUploadedFiles] = useState(() => {
        const saved = localStorage.getItem('analyzer_files');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [hasDbData, setHasDbData] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [result, setResult] = useState(() => {
        const saved = localStorage.getItem('analyzer_result');
        return saved ? JSON.parse(saved) : null;
    });
    const [error, setError] = useState('');
    
    const [toast, setToast] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        // Check if DB has COCO data
        const checkDb = async () => {
            try {
                const token = localStorage.getItem('wf_auth_token');
                const res = await fetch(API_BASE + '/api/analyzer/check', {
                    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) }
                });
                if (res.ok) {
                    const data = await res.json();
                    setHasDbData(data.hasData);
                }
            } catch (err) { console.error(err); }
        };
        checkDb();
    }, []);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    useEffect(() => {
        localStorage.setItem('analyzer_text', text);
        localStorage.setItem('analyzer_files', JSON.stringify(uploadedFiles));
        if (result) {
            localStorage.setItem('analyzer_result', JSON.stringify(result));
        } else {
            localStorage.removeItem('analyzer_result');
        }
    }, [text, uploadedFiles, result]);

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setResult(null);
        setError('');
        
        const newFiles = await Promise.all(files.map(async (f) => ({
            name: f.name,
            text: await f.text()
        })));

        let updatedFiles = [...uploadedFiles];
        
        newFiles.forEach(newFile => {
            const existingIndex = updatedFiles.findIndex(f => f.name === newFile.name);
            if (existingIndex > -1) {
                if (updatedFiles[existingIndex].text === newFile.text) {
                    showToast(`${newFile.name} already exists with the same content.`, 'error');
                } else {
                    updatedFiles[existingIndex] = newFile;
                    showToast(`${newFile.name} updated with new content.`, 'success');
                }
            } else {
                updatedFiles.push(newFile);
                showToast(`${newFile.name} added.`, 'success');
            }
        });

        setUploadedFiles(updatedFiles);
        setText(''); // Clear manual text paste
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (name) => {
        const updated = uploadedFiles.filter(f => f.name !== name);
        setUploadedFiles(updated);
        setResult(null);
        showToast(`${name} removed.`, 'info');
    };

    const clearAll = () => {
        setUploadedFiles([]);
        setText('');
        setResult(null);
        setError('');
        localStorage.removeItem('analyzer_files');
        localStorage.removeItem('analyzer_text');
        localStorage.removeItem('analyzer_result');
        if (fileInputRef.current) fileInputRef.current.value = '';
        showToast('All files and text cleared.', 'info');
    };

    const handleClearDatabase = async () => {
        setClearing(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/analyzer', {
                method: 'DELETE',
                headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Clear failed.');
            
            showToast(`Deleted ${data.deletedAttendance} WhatsApp attendance rows from DB.`, 'success');
            clearAll(); 
            setHasDbData(false);
        } catch (err) {
            showToast(err.message || 'Failed to clear data.', 'error');
        } finally {
            setClearing(false);
        }
    };

    const handleAnalyze = async () => {
        const combinedFileText = uploadedFiles.map(f => f.text).join('\n\n');
        const contentToAnalyze = combinedFileText || text;
        
        if (!contentToAnalyze.trim()) { 
            setError('Please upload a file or paste WhatsApp text.'); 
            return; 
        }
        
        setLoading(true); setError(''); setResult(null);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(API_BASE + '/api/analyzer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                body: JSON.stringify({ text: contentToAnalyze, type: 'whatsapp' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
            setResult(data);
            setHasDbData(true); // Now DB has data
            showToast('Analysis completed and saved to Database!', 'success');
        } catch (err) {
            setError(err.message || 'Analysis failed.');
            showToast('Analysis failed. Please check the data.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pg active">
            {/* Custom Toast Notification */}
            {toast && (
                <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 20px', borderRadius: '8px', background: toast.type === 'error' ? 'rgba(239,68,68,0.95)' : (toast.type === 'success' ? 'rgba(34,197,94,0.95)' : 'rgba(59,130,246,0.95)'), color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                    {toast.type === 'error' ? <AlertTriangle size={18} /> : (toast.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />)}
                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{toast.message}</span>
                </div>
            )}

            <div className="card">
                <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="ct">Whatsapp Analyzer</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {hasDbData && (
                            <button onClick={() => setShowClearModal(true)} disabled={clearing || loading} className="small-btn secondary-btn" style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}>
                                {clearing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={16} />} Clear DB (Attendance)
                            </button>
                        )}
                    </div>
                </div>
                
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                    Upload WhatsApp chat files (.txt) or paste text. The parser will extract attendance and penalties and save them to the database.
                </p>

                {/* FILE UPLOAD */}
                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label>WhatsApp File(s)</label>
                    <div style={{ background: 'var(--input-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
                        <Upload size={32} style={{ color: 'var(--primary)', marginBottom: '0.5rem' }} />
                        <p style={{ color: 'var(--text-secondary)' }}>Click to browse or drag files here (Multiple allowed)</p>
                        <input ref={fileInputRef} type="file" accept=".txt" multiple onChange={handleFiles} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                    
                    {/* DISPLAY UPLOADED FILES */}
                    {uploadedFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
                            {uploadedFiles.map(file => (
                                <div key={file.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(34,197,94,0.1)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                                        <FileText size={16} />
                                        <p style={{ fontSize: '0.85rem', margin: 0 }}>{file.name}</p>
                                    </div>
                                    <button onClick={() => removeFile(file.name)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', width: 'auto' }} title="Remove file">
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* PASTE TEXT */}
                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label>Or Paste Text</label>
                    <textarea 
                        value={text} 
                        onChange={(e) => {
                            setText(e.target.value);
                        }} 
                        placeholder="Paste WhatsApp chat text here..." 
                        style={{ minHeight: '150px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', width: '100%', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '12px' }} 
                    />
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
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} color="var(--success)"/> Attendance: {result.attendanceRows} rows</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={14} color="var(--success)"/> Penalties: {result.penaltyRows} rows</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Info size={14} color="var(--primary)"/> Saved: attendance={result.savedAttendance}, penalty={result.savedPenalty}</span>
                        </div>
                        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <button className="small-btn primary-btn" onClick={() => { localStorage.setItem('default_report_source', 'whatsapp'); setPage('reports'); }} style={{ width: 'auto', padding: '0.5rem 1rem' }}>View Reports →</button>
                        </div>
                    </div>
                )}

                <div className="action-row" style={{ display: 'flex', gap: '10px' }}>
                    <button className="primary-btn" onClick={handleAnalyze} disabled={loading || clearing} style={{ width: 'auto' }}>
                        {loading ? <><Loader2 size={18} style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Send size={18} style={{ marginRight: '8px' }} /> Analyze & Save</>}
                    </button>
                    {(uploadedFiles.length > 0 || text) && (
                        <button className="secondary-btn" onClick={clearAll} style={{ width: 'auto' }}>
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={showClearModal}
                title="Clear Database?"
                message="Are you sure? This will delete all WhatsApp analyzed Attendance data from the database. Penalty data and Biometric data will NOT be affected."
                confirmText="Yes, Clear DB"
                onConfirm={() => {
                    setShowClearModal(false);
                    handleClearDatabase();
                }}
                onCancel={() => setShowClearModal(false)}
                danger={true}
            />
        </div>
    );
};

export default Analyzer;

