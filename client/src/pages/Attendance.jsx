import React, { useState } from 'react';
import BulkAttendanceTable from '../components/BulkAttendanceTable';
import IndividualReport from '../components/IndividualReport';
import MonthlyReportModal from '../components/MonthlyReportModal';

const Attendance = () => {
    const [viewMode, setViewMode] = useState('bulk');
    const [isReportOpen, setIsReportOpen] = useState(false);

    return (
        <div className="pg active">
            {/* Toggle Buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <button 
                    className={`small-btn ${viewMode === 'bulk' ? 'primary-btn' : 'secondary-btn'}`} 
                    onClick={() => setViewMode('bulk')}
                    style={{ width: 'auto' }}
                >
                    Bulk Marking
                </button>
                <button 
                    className={`small-btn ${viewMode === 'individual' ? 'primary-btn' : 'secondary-btn'}`} 
                    onClick={() => setViewMode('individual')}
                    style={{ width: 'auto' }}
                >
                    Individual View
                </button>
            </div>

            {/* Render based on viewMode */}
            {viewMode === 'bulk' ? (
                <BulkAttendanceTable onOpenReport={() => setIsReportOpen(true)} />
            ) : (
                <IndividualReport />
            )}

            {/* Modal */}
            {isReportOpen && <MonthlyReportModal onClose={() => setIsReportOpen(false)} />}
        </div>
    );
};

export default Attendance;
