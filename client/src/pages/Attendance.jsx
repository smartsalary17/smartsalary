
import React, { useState } from 'react';
import BulkAttendanceTable from '../components/BulkAttendanceTable';
import IndividualReport from '../components/IndividualReport';
import MonthlyReportModal from '../components/MonthlyReportModal';

const Attendance = () => {
    const [isReportOpen, setIsReportOpen] = useState(false);

    return (
        <div className="pg active">
            <BulkAttendanceTable onOpenReport={() => setIsReportOpen(true)} />
            <IndividualReport />

            {isReportOpen && (
                <MonthlyReportModal onClose={() => setIsReportOpen(false)} />
            )}
        </div>
    );
};

export default Attendance;
