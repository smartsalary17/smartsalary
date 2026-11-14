import React, { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, Send, CheckCircle2, AlertTriangle, X, Trash2, FileText, Info, ArrowRight } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../context/ToastContext'; 

const Analyzer = ({ setPage }) => {
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'paste'

    const [text, setText] = useState(() => localStorage.getItem('analyzer_text') || '');
    const [uploadedFiles, setUploadedFiles] = useState(() => {
        const saved = localStorage.getItem('analyzer_files');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [loading, setLoading] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [hasDbData, setHasDbData] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState({
        isOpen: false,
        title: '',
        message: '',
        confirmText: '',
        onConfirm: null
    });
    const [result, setResult] = useState(() => {
        const saved = localStorage.getItem('analyzer_result');
        return saved ? JSON.parse(saved) : null;
    });
    const [error, setError] = useState('');
    const { showToast } = useToast();
    
    const fileInputRef = useRef(null);

    useEffect(() => {
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
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (name) => {
        const updated = uploadedFiles.filter(f => f.name !== name);
        setUploadedFiles(updated);
        setResult(null);
        showToast(`${name} removed.`, 'info');
    };

    const clearUpload = () => {
        setUploadedFiles([]);
        setResult(null);
        setError('');
        localStorage.removeItem('analyzer_files');
        if (fileInputRef.current) fileInputRef.current.value = '';
        showToast('Uploaded files cleared.', 'info');
    };

    const clearPaste = () => {
        setText('');
        setResult(null);
        setError('');
        localStorage.removeItem('analyzer_text');
        showToast('Pasted text cleared.', 'info');
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
        const contentToAnalyze = activeTab === 'upload'
            ? uploadedFiles.map(f => f.text).join('\n\n')
            : text;
        
        if (!contentToAnalyze.trim()) { 
            setError(activeTab === 'upload' ? 'Please upload at least one file.' : 'Please paste WhatsApp text.');
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
            setHasDbData(true);
            showToast('Analysis completed and saved to Database!', 'success');
        } catch (err) {
            setError(err.message || 'Analysis failed.');
            showToast('Analysis failed. Please check the data.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const hasContent = activeTab === 'upload' ? uploadedFiles.length > 0 : text.trim().length > 0;

    return (
        <div className="pg active" style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '3rem' }}>
            
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                        WhatsApp Analyzer
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                        Extract attendance and penalties effortlessly from chat logs.
                    </p>
                </div>

{hasDbData && (
    <button
        onClick={() => setShowClearModal(true)}
        disabled={clearing || loading}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '0.6rem 1rem',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--danger)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '10px',
            cursor: clearing || loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
            opacity: clearing || loading ? 0.6 : 1,
            transition: 'all 0.2s ease',
            width: 'auto',
            flexShrink: 0
        }}
        onMouseEnter={e => {
            if (!clearing && !loading) {
                e.currentTarget.style.background = 'rgba(239,68,68,0.15)';
                e.currentTarget.style.borderColor = 'var(--danger)';
            }
        }}
        onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
        }}
    >
        {clearing
            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : <Trash2 size={15} />
        }
        Delete DB Data
    </button>
)}

            </div>

            {/* Main Card */}
            <div style={{ 
                background: 'var(--card-bg)', 
                borderRadius: '16px', 
                border: '1px solid var(--border-color)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                overflow: 'hidden'
            }}>
                
                {/* Modern Tabs */}
                <div style={{ display: 'flex', padding: '1rem 1.5rem 0 1.5rem', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <button 
                        onClick={() => setActiveTab('upload')} 
                        style={{
                            padding: '0.8rem 1.5rem',
                            background: activeTab === 'upload' ? 'var(--card-bg)' : 'transparent',
                            border: '1px solid var(--border-color)',
                            borderBottom: activeTab === 'upload' ? '1px solid var(--card-bg)' : '1px solid transparent',
                            borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
                            color: activeTab === 'upload' ? 'var(--primary)' : 'var(--text-secondary)',
                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                            marginBottom: '-1px', transition: 'all 0.2s'
                        }}
                    >
                        <Upload size={18} /> Upload File
                    </button>
                    <button 
                        onClick={() => setActiveTab('paste')} 
                        style={{
                            padding: '0.8rem 1.5rem',
                            background: activeTab === 'paste' ? 'var(--card-bg)' : 'transparent',
                            border: '1px solid var(--border-color)',
                            borderBottom: activeTab === 'paste' ? '1px solid var(--card-bg)' : '1px solid transparent',
                            borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
                            color: activeTab === 'paste' ? 'var(--primary)' : 'var(--text-secondary)',
                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                            marginBottom: '-1px', transition: 'all 0.2s'
                        }}
                    >
                        <FileText size={18} /> Paste Text
                    </button>
                </div>

                <div style={{ padding: '2rem' }}>
                    
                    {/* UPLOAD TAB CONTENT */}
                    {activeTab === 'upload' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            
                            {/* Beautiful Dropzone */}
                            <div style={{ 
                                position: 'relative', border: '2px dashed var(--border-color)', borderRadius: '16px', 
                                padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-secondary)', transition: 'all 0.2s'
                            }}>
                                <div style={{ width: '64px', height: '64px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                                    <Upload size={32} style={{ color: 'var(--primary)' }} />
                                </div>
                                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Click or drag files to upload</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Supports .txt files (Multiple allowed)</p>
                                <input ref={fileInputRef} type="file" accept=".txt" multiple onChange={handleFiles} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                            </div>

{/* Modern Uploaded Files List */}
{uploadedFiles.length > 0 && (
    <div style={{ marginTop: '0.5rem' }}>
<div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem'
}}>
    <div>
        <h4 style={{
            margin: 0,
            fontSize: '0.95rem',
            fontWeight: 700,
            color: 'var(--text-primary)'
        }}>
            Uploaded Files
        </h4>
        <p style={{
            margin: '4px 0 0',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)'
        }}>
            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} ready for analysis
        </p>
    </div>
</div>
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '0.85rem'
        }}>
            {uploadedFiles.map((file, index) => (
                <div
                    key={file.name}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        transition: 'border-color 0.2s, transform 0.2s'
                    }}
                >
                    <div style={{
                        width: '44px',
                        height: '44px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                        background: 'rgba(59,130,246,0.1)',
                        color: 'var(--primary)'
                    }}>
                        <FileText size={21} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                            margin: 0,
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }} title={file.name}>
                            {file.name}
                        </p>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            marginTop: '6px'
                        }}>
                            <CheckCircle2 size={13} color="var(--success)" />
                            <span style={{
                                fontSize: '0.75rem',
                                color: 'var(--success)',
                                fontWeight: 500
                            }}>
                                Ready for analysis
                            </span>
                            
                        </div>
                    </div>

<button
    onClick={() => setConfirmAction({
        isOpen: true, 
        title: 'Remove File?', 
        message: `Are you sure you want to remove "${file.name}" from the list?`, 
        confirmText: 'Yes, Remove',
        onConfirm: () => { 
            removeFile(file.name); 
            setConfirmAction(prev => ({ ...prev, isOpen: false })); 
        }
    })}
    title={`Remove ${file.name}`}
    aria-label={`Remove ${file.name}`}
    style={{
        width: '36px',
        height: '36px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.18)',
        borderRadius: '10px',
        color: 'var(--danger)',
        cursor: 'pointer',
        padding: 0,
        transition: 'all 0.2s',
        overflow: 'hidden'
    }}
    onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(239,68,68,0.18)';
        e.currentTarget.style.borderColor = 'var(--danger)';
    }}
    onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
        e.currentTarget.style.borderColor = 'rgba(239,68,68,0.18)';
    }}
>
    <Trash2 size={17} />
</button>

                </div>
            ))}
        </div>
    </div>
)}

                        </div>
                    )}

                    {/* PASTE TAB CONTENT */}
                    {activeTab === 'paste' && (
                        <div>
                            <textarea 
                                value={text} 
                                onChange={(e) => setText(e.target.value)} 
                                placeholder="Paste your WhatsApp chat history here..." 
                                style={{ 
                                    minHeight: '250px', width: '100%', padding: '1.5rem', fontFamily: 'monospace', fontSize: '0.9rem',
                                    background: 'var(--bg-secondary)', color: 'var(--text-primary)', 
                                    border: '1px solid var(--border-color)', borderRadius: '12px', resize: 'vertical'
                                }} 
                            />
                            {text && (
                                <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                                    <button 
                                        onClick={() => setConfirmAction({
                                            isOpen: true, title: 'Clear Text?', message: 'Are you sure you want to clear the pasted text?', confirmText: 'Yes, Clear',
                                            onConfirm: () => { clearPaste(); setConfirmAction(prev => ({ ...prev, isOpen: false })); }
                                        })}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                                    >
                                        Clear Text
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {error && (
                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger)' }}>
                            <AlertTriangle size={20} />
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{error}</span>
                        </div>
                    )}

                    {/* DASHBOARD RESULT SECTION */}
                    {result && (
                        <div style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '16px', background: 'linear-gradient(to right bottom, rgba(34,197,94,0.08), transparent)', border: '1px solid rgba(34,197,94,0.3)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem' }}>
                                <CheckCircle2 size={24} color="var(--success)" />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--success)' }}>Analysis Successful</h3>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--card-bg)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Attendance Rows</p>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>{result.attendanceRows}</p>
                                </div>
                                <div style={{ background: 'var(--card-bg)', padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Penalty Rows</p>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>{result.penaltyRows}</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <Info size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }}/>
                                    Saved to DB: Attendance = {result.savedAttendance}, Penalty = {result.savedPenalty}
                                </p>
                                <button 
                                    onClick={() => { localStorage.setItem('default_report_source', 'whatsapp'); setPage('reports'); }} 
                                    style={{ background: 'var(--success)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    View Reports <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Action Bar */}
                <div style={{ padding: '1.5rem 2rem', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    {(uploadedFiles.length > 0 || text) && (
                        <button 
                            onClick={() => setConfirmAction({
                                isOpen: true, title: 'Clear All Data?', message: 'Are you sure you want to clear all files and text?', confirmText: 'Yes, Clear',
                                onConfirm: () => { clearAll(); setConfirmAction(prev => ({ ...prev, isOpen: false })); }
                            })}
                            style={{ padding: '0.8rem 1.5rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            Clear All
                        </button>
                    )}
                    <button 
                        onClick={handleAnalyze} 
                        disabled={loading || clearing || !hasContent}
                        style={{ 
                            padding: '0.8rem 2rem', 
                            background: hasContent ? 'var(--primary)' : 'var(--border-color)', 
                            color: hasContent ? 'white' : 'var(--text-secondary)', 
                            border: 'none', borderRadius: '8px', cursor: hasContent ? 'pointer' : 'not-allowed', 
                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: hasContent ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Send size={18} /> Analyze Data</>}
                    </button>
                </div>
            </div>

            {/* DB Delete Confirm Modal */}
            <ConfirmModal
                isOpen={showClearModal}
                title="Delete Data?"
                message="Are you sure? This will delete all WhatsApp analyzed Attendance data from the database. Penalty data and Biometric data will NOT be affected."
                confirmText="Yes, Delete Data"
                onConfirm={() => {
                    setShowClearModal(false);
                    handleClearDatabase();
                }}
                onCancel={() => setShowClearModal(false)}
                danger={true}
            />

            {/* Generic Action Confirm Modal */}
            <ConfirmModal
                isOpen={confirmAction.isOpen}
                title={confirmAction.title}
                message={confirmAction.message}
                confirmText={confirmAction.confirmText}
                onConfirm={confirmAction.onConfirm}
                onCancel={() => setConfirmAction(prev => ({ ...prev, isOpen: false }))}
                danger={true}
            />

        </div>
    );
};

export default Analyzer;