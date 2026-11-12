import React from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { X } from 'lucide-react';
import { useWorkforce, MONTHS } from '../context/workforceShared';

const MonthlyReportModal = ({ onClose }) => {
    const { employees, attendance } = useWorkforce();
    const [viewMonth, setViewMonth] = React.useState(new Date().getMonth());
    const [viewYear, setViewYear] = React.useState(new Date().getFullYear());
    const [format, setFormat] = React.useState('summary');
    const [isDownloading, setIsDownloading] = React.useState(false);

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const downloadPDF = async () => {
        const el = document.getElementById('report-capture-area');
        if (!el) return;

        setIsDownloading(true); 

        try {
            // Temporarily adjust for capture
            const originalWidth = el.style.width;
            const originalMaxWidth = el.style.maxWidth;
            const originalHeight = el.style.height;
            const originalOverflow = el.style.overflow;

            el.style.width = 'max-content';
            el.style.maxWidth = 'none';
            el.style.height = 'max-content';
            el.style.overflow = 'visible';

            // Get Y-coordinates of blocks to prevent cutting rows
            const containerRect = el.getBoundingClientRect();
            const blocks = Array.from(el.querySelectorAll('.pdf-block'));
            const blockBoundsInCSS = blocks.map(b => {
                const rect = b.getBoundingClientRect();
                return {
                    top: rect.top - containerRect.top,
                    bottom: rect.bottom - containerRect.top
                };
            });

            const canvas = await html2canvas(el, { 
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: el.scrollWidth,
                width: el.scrollWidth,
                height: el.scrollHeight
            });

            // Restore styles
            el.style.width = originalWidth;
            el.style.maxWidth = originalMaxWidth;
            el.style.height = originalHeight;
            el.style.overflow = originalOverflow;

            const scale = canvas.width / containerRect.width;
            const blockBounds = blockBoundsInCSS.map(b => ({
                top: b.top * scale,
                bottom: b.bottom * scale
            }));

            const pdf = new jsPDF('l', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // 👇 ADD MARGINS HERE
            const marginX = 10; // 10mm left/right
            const marginY = 10; // 10mm top/bottom
            const usableWidth = pdfWidth - (marginX * 2);
            const usableHeight = pdfHeight - (marginY * 2);

            const ratio = usableWidth / canvas.width;
            const pxToMm = ratio; 
            const pageHeightPx = usableHeight / pxToMm;

            let currentY = 0;
            let pageIndex = 0;

            while (currentY < canvas.height) {
                let nextY = currentY + pageHeightPx;

                // Smart Slicing: Find the exact block bottom to avoid cutting in the middle
                if (nextY < canvas.height) {
                    const crossingBlocks = blockBounds.filter(b => b.top < nextY && b.bottom > nextY);
                    if (crossingBlocks.length > 0) {
                        const earliestCrossingBlock = crossingBlocks.reduce((prev, current) => (prev.top < current.top) ? prev : current);
                        nextY = earliestCrossingBlock.top;
                    }
                } else {
                    nextY = canvas.height;
                }

                const sliceHeight = nextY - currentY;
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = canvas.width;
                sliceCanvas.height = sliceHeight;
                const ctx = sliceCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, currentY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

                const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
                
                if (pageIndex > 0) pdf.addPage();
                
                // 👇 ADD IMAGE WITH MARGINS
                pdf.addImage(imgData, 'JPEG', marginX, marginY, usableWidth, sliceHeight * pxToMm);

                currentY = nextY;
                pageIndex++;
            }

            pdf.save(`Attendance_${format === 'summary' ? 'Summary' : 'Detailed'}_${MONTHS[viewMonth]}_${viewYear}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsDownloading(false); 
        }
    };

    const parseTime = (t) => {
        if (!t || t === '--:--') return 0;
        const [h, m] = t.split(':').map(Number);
        return (h * 60) + m;
    };

    const formatTime = (mins) => {
        if (mins <= 0) return '00:00';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const calculateBreakTime = (inTime, outTime, workTime) => {
        if (!inTime || !outTime || !workTime || outTime === '--:--' || inTime === '--:--' || workTime === '--:--') return '00:00';
        const inMins = parseTime(inTime);
        const outMins = parseTime(outTime);
        const workMins = parseTime(workTime);
        let totalMins = outMins - inMins;
        if (totalMins < 0) totalMins += 24 * 60;
        const breakMins = totalMins - workMins;
        return breakMins > 0 ? formatTime(breakMins) : '00:00';
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

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content report-preview-card" style={{ maxWidth: '95vw', width: format === 'detailed' ? '1200px' : '900px', height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <h3 style={{ color: 'var(--primary)', margin: 0 }}>Attendance Report Preview</h3>
                    
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <select 
                            value={format} 
                            onChange={(e) => setFormat(e.target.value)} 
                            style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                        >
                            <option value="summary" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>Summary Grid</option>
                            <option value="detailed" style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>Time-Office (Detailed)</option>
                        </select>
                        
                        <select 
                            value={viewMonth} 
                            onChange={(e) => setViewMonth(parseInt(e.target.value))} 
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            {MONTHS.map((m, i) => (
                                <option key={i} value={i} style={{ background: 'var(--card-bg)', color: 'var(--text-primary)' }}>{m}</option>
                            ))}
                        </select>
                        
                        <input 
                            type="number" 
                            value={viewYear} 
                            onChange={(e) => setViewYear(parseInt(e.target.value))} 
                            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontWeight: 600, width: '80px', padding: '5px 10px', borderRadius: '8px', textAlign: 'center' }} 
                        />
                        <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-primary)' }}><X size={20} /></button>
                    </div>
                </div>

                <div className="report-document-wrapper" style={{ overflow: 'auto' }}>
                    <div id="report-capture-area" className="report-document">
                        {/* Add pdf-block class for smart pagination */}
                        <div className="pdf-block" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '2px solid #c63f3f', paddingBottom: '1rem' }}>
                            <div>
                                <h1 style={{ color: '#1e293b', margin: 0, fontSize: '1.5rem' }}>SMART SALARY</h1>
                                <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Microbotware Technology</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <h2 style={{ color: '#1e293b', margin: 0, fontSize: '1.1rem' }}>{format === 'summary' ? 'MONTHLY SUMMARY' : 'TIME OFFICE'} REPORT</h2>
                                <p style={{ color: '#64748b', fontWeight: 600 }}>{MONTHS[viewMonth]} {viewYear}</p>
                            </div>
                        </div>

                        {format === 'summary' ? (
                            <table className="report-table">
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>Employee</th>
                                        {dates.map(d => <th key={d} style={{ fontSize: '10px' }}>{d}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map(emp => (
                                        // Add pdf-block class here to prevent row splitting
                                        <tr key={emp.id} className="pdf-block">
                                            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{emp.name}</td>
                                            {dates.map(d => {
                                                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                const att = attendance[dateStr]?.[emp.id];
                                                const st = att?.status;
                                                let cls = '';
                                                if (st === 'present') cls = 'r-present';
                                                else if (st === 'late') cls = 'r-late';
                                                else if (st === 'absent') cls = 'r-absent';
                                                else if (st === 'weekoff') cls = 'r-weekoff';
                                                else if (st === 'sick_leave') cls = 'r-sick';
                                                else if (st === 'holiday') cls = 'r-holiday';
                                                else if (st === 'half-day') cls = 'r-halfday';

                                                let marker = '-';
                                                if (st === 'present') marker = 'P';
                                                else if (st === 'late') marker = 'L';
                                                else if (st === 'absent') marker = 'A';
                                                else if (st === 'weekoff') marker = 'W';
                                                else if (st === 'sick_leave') marker = 'SL';
                                                else if (st === 'holiday') marker = 'H';
                                                else if (st === 'half-day') marker = 'HD';
                                                else if (st?.includes('leave')) marker = 'LV';

                                                return (
                                                    <td key={d} style={{ textAlign: 'center' }}>
                                                        <span className={`r-cell ${cls}`}>{marker}</span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="detailed-report-view">
                                {employees.map(emp => {
                                    const stats = { P: 0, A: 0, WO: 0, HL: 0, LV: 0, workMins: 0 };
                                    const daily = dates.map(d => {
                                        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                        const record = attendance[dateStr]?.[emp.id];
                                        const st = mapStatus(record?.status);
                                        if (st === 'P' || st === 'HD') stats.P++;
                                        else if (st === 'A') stats.A++;
                                        else if (st === 'WO') stats.WO++;
                                        else if (st === 'HL') stats.HL++;
                                        else if (st === 'LV') stats.LV++;
                                        
                                        const workTime = record?.workTime || '00:00';
                                        if (workTime !== '00:00' && workTime !== '--:--') stats.workMins += parseTime(workTime);

                                        // Check if the day is empty OR if it's an off-status
                                        const isEmpty = !record;
                                        const isOff = ['WO', 'A', 'HL', 'LV'].includes(st);
                                        const isNoWork = isEmpty || isOff;

                                        return {
                                            in: isNoWork ? '--:--' : (record?.time || '--:--'),
                                            out: isNoWork ? '--:--' : (record?.outTime || '--:--'),
                                            work: isNoWork ? '--:--' : workTime,
                                            break: isNoWork ? '00:00' : calculateBreakTime(record?.time, record?.outTime, workTime),
                                            st
                                        };
                                    });

                                    return (
                                        /* Added pdf-block class for exact pagination */
                                        <div key={emp.id} className="pdf-block" style={{ marginBottom: '1.5rem', border: '1px solid #e2e8f0', padding: '10px', background: '#fff' }}>
                                            
                                            {/* FIX: Forced dark text color for detailed header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px', fontSize: '12px', fontWeight: 'bold', color: '#1e293b' }}>
                                                <span>{emp.id} - {emp.name} ({emp.dept || 'Default'})</span>
                                                <span style={{ color: '#4f46e5' }}>
                                                    P:{stats.P} | A:{stats.A} | WO:{stats.WO} | LV:{stats.LV} | Work: {formatTime(stats.workMins)}
                                                </span>
                                            </div>
                                            
                                            {/* FIX: Forced dark text color for table cells */}
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', color: '#1e293b' }}>
                                                <tbody>
                                                    <tr>
                                                        <td style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '4px', fontWeight: 'bold' }}>Day</td>
                                                        {dates.map(d => <td key={d} style={{ border: '1px solid #e2e8f0', padding: '4px', color: '#1e293b' }}>{d}</td>)}
                                                    </tr>
                                                    <tr>
                                                        <td style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '4px', fontWeight: 'bold' }}>IN</td>
                                                        {daily.map((d, i) => <td key={i} style={{ border: '1px solid #e2e8f0', padding: '4px', color: '#1e293b' }}>{d.in}</td>)}
                                                    </tr>
                                                    <tr>
                                                        <td style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '4px', fontWeight: 'bold' }}>OUT</td>
                                                        {daily.map((d, i) => <td key={i} style={{ border: '1px solid #e2e8f0', padding: '4px', color: '#1e293b' }}>{d.out}</td>)}
                                                    </tr>
                                                    <tr>
                                                        <td style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '4px', fontWeight: 'bold' }}>Work</td>
                                                        {daily.map((d, i) => <td key={i} style={{ border: '1px solid #e2e8f0', padding: '4px', color: '#1e293b' }}>{d.work}</td>)}
                                                    </tr>
                                                    <tr>
                                                        <td style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '4px', fontWeight: 'bold' }}>St.</td>
                                                        {daily.map((d, i) => (
                                                            <td key={i} style={{ border: '1px solid #e2e8f0', padding: '4px', color: d.st === 'P' ? '#16a34a' : d.st === 'A' ? '#dc2626' : '#64748b', fontWeight: 'bold' }}>
                                                                {d.st}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    {/* Updated Button with Loading State */}
                    <button 
                        className="primary-btn" 
                        style={{ 
                            width: '220px', 
                            opacity: isDownloading ? 0.7 : 1, 
                            cursor: isDownloading ? 'wait' : 'pointer' 
                        }} 
                        onClick={downloadPDF}
                        disabled={isDownloading}
                    >
                        {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                    </button>
                    <button className="secondary-btn" style={{ width: '120px' }} onClick={onClose} disabled={isDownloading}>Close</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default MonthlyReportModal;