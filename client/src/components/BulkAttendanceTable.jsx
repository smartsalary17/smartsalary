import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWorkforce } from '../context/workforceShared';
import { FileText, Lock, Unlock } from 'lucide-react';
import { API_BASE } from '../context/workforceShared';

const normalizeDate = (value) => {
    const dateStr = String(value || '').trim();
    if (!dateStr) return '';
    
    // 👇 Handle ISO strings
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    const match = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (!match) return '';

    const [, first, second, rawYear] = match;
    const year = rawYear.length === 2
        ? Number(rawYear) <= 49 ? `20${rawYear}` : `19${rawYear}`
        : rawYear;

    const isSlashDate = dateStr.includes('/');
    const month = isSlashDate
        ? Number(first)
        : Number(first) > 12 ? Number(second) : Number(first);
    const day = isSlashDate
        ? Number(second)
        : Number(first) > 12 ? Number(first) : Number(second);

    const parsed = new Date(Number(year), month - 1, day);
    if (
        month < 1 || month > 12 ||
        day < 1 ||
        parsed.getFullYear() !== Number(year) ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
    ) return '';

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const normalizeTime = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
    if (!match) return '';

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const period = match[3]?.toLowerCase();
    if (minutes > 59 || hours > (period ? 12 : 23) || (period && hours === 0)) return '';
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getCocoTime = (record, pluralKey, singularKey, edge = 'first') => {
    const values = Array.isArray(record[pluralKey]) ? record[pluralKey] : [record[singularKey]];
    const times = values.map(normalizeTime).filter(Boolean);
    return edge === 'last' ? times[times.length - 1] || '' : times[0] || '';
};

const calculateWorkTime = (inTime, outTime) => {
    if (!inTime || !outTime) return '';

    const toMinutes = value => {
        const [hours, minutes] = value.split(':').map(Number);
        return hours * 60 + minutes;
    };

    const checkInMinutes = toMinutes(inTime);
    let checkOutMinutes = toMinutes(outTime);
    if (checkOutMinutes < checkInMinutes) checkOutMinutes += 24 * 60;

    const duration = checkOutMinutes - checkInMinutes;
    return `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
};

const getAttendanceStatus = (checkIn, scheduledCheckIn, graceMinutes) => {
    const [checkInHours, checkInMinutes] = checkIn.split(':').map(Number);
    const [scheduledHours, scheduledMinutes] = scheduledCheckIn.split(':').map(Number);
    const actualMinutes = checkInHours * 60 + checkInMinutes;
    const graceLimit = scheduledHours * 60 + scheduledMinutes + graceMinutes;
    return actualMinutes > graceLimit ? 'late' : 'present';
};

const isCocoPresent = (record) => {
    const status = String(record.status || record.attendanceStatus || '').trim().toLowerCase();
    const weekOff = String(record.weekOff || record.weekoff || record.week_off || '').trim().toLowerCase();
    const hasPresentStatus = !status || ['present', 'p', 'working', 'worked', 'late', 'half-day', 'halfday'].includes(status);
    const isWeekOff = ['yes', 'true', '1', 'week off', 'weekoff', 'weekly off', 'off'].includes(weekOff);
    return hasPresentStatus && !isWeekOff;
};

const BulkAttendanceTable = ({ onOpenReport }) => {
    const { employees, attendance, rules, saveBulkAttendance } = useWorkforce();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isCocoSyncing, setIsCocoSyncing] = useState(false);
    const [dialog, setDialog] = useState(null);

    const selectedDateAttendance = useMemo(() => attendance[selectedDate] || {}, [attendance, selectedDate]);
    const hasSavedAttendance = Object.keys(selectedDateAttendance).length > 0;
    
    const bulkEntries = useMemo(() => {
        return employees.map(emp => ({
            id: emp.id,
            name: emp.name,
            status: selectedDateAttendance[emp.id]?.status || '',
            time: ['absent', 'weekoff'].includes(selectedDateAttendance[emp.id]?.status) ? '' : (selectedDateAttendance[emp.id]?.time || emp.checkin || '09:00'),
            outTime: selectedDateAttendance[emp.id]?.status === 'absent' ? '' : (selectedDateAttendance[emp.id]?.outTime || ''),
            workTime: selectedDateAttendance[emp.id]?.workTime || '',
            isBiometric: selectedDateAttendance[emp.id]?.isBiometric || false,
            isCoco: selectedDateAttendance[emp.id]?.isCoco || false
        }));
    }, [employees, selectedDateAttendance]);

    const bulkDraftKey = `${selectedDate}::${employees.map(emp => emp.id).join('|')}`;
    const [bulkDraft, setBulkDraft] = useState({ key: '', entries: [] });
    const [isManuallyUnlocked, setIsManuallyUnlocked] = useState(false);
    const hasUserEditedRef = useRef(false);
    
    const tempBulk = bulkDraft.key === bulkDraftKey ? bulkDraft.entries : bulkEntries;
    const isLocked = hasSavedAttendance && !isManuallyUnlocked;

    // Check if at least one employee has checked in
     const showHolidayButton = tempBulk.length > 0 && tempBulk.every(emp => ['weekoff', 'absent'].includes(emp.status));

    const showNotice = (title, message) => {
        setDialog({ mode: 'message', title, message, employees: [] });
    };

    const handleGlobalHoliday = () => {
        setBulkDraft(prev => {
            const currentEntries = prev.key === bulkDraftKey ? prev.entries : bulkEntries;
            return {
                key: bulkDraftKey,
                entries: currentEntries.map(item => {
                    // Apply holiday to ALL employees when this button is clicked
                    return { ...item, status: 'holiday', time: '', outTime: '', workTime: '' };
                })
            };
        });
        hasUserEditedRef.current = true;
        setIsManuallyUnlocked(true);
    };

    const updateTemp = (empId, fields) => {
        hasUserEditedRef.current = true;
        setBulkDraft(prev => {
            const currentEntries = prev.key === bulkDraftKey ? prev.entries : bulkEntries;
            return {
                key: bulkDraftKey,
                entries: currentEntries.map(item => {
                    if (item.id === empId) {
                        const updated = { ...item, ...fields };
                        
                        // Clear times for non-working statuses
                        if ('status' in fields) {
                            const offStatuses = ['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'];
                            if (offStatuses.includes(fields.status)) {
                                updated.time = '';
                                updated.outTime = '';
                                updated.workTime = '';
                            }
                        }
                        
                        // If check-in time is being changed
                        if ('time' in fields) {
                            const val = fields.time;
                            if (val && val.includes(':')) {
                                const emp = employees.find(e => e.id === empId);
                                const checkInTime = emp?.checkin || '09:00';
                                
                                const parseMins = (tStr) => {
                                    if (!tStr) return 0;
                                    const parts = tStr.split(':');
                                    const h = parseInt(parts[0], 10) || 0;
                                    const m = parseInt(parts[1], 10) || 0;
                                    return h * 60 + m;
                                };
                                
                                const addMinutes = (timeStr, mins) => {
                                    const [h, m] = timeStr.split(':').map(Number);
                                    const total = h * 60 + m + mins;
                                    const newH = String(Math.floor(total / 60) % 24).padStart(2, '0');
                                    const newM = String(total % 60).padStart(2, '0');
                                    return `${newH}:${newM}`;
                                };
                                
                                const inMins = parseMins(val);
                                const limitTime = addMinutes(checkInTime, 10);
                                const limitMins = parseMins(limitTime);
                                
                                const isEmpSaved = selectedDateAttendance[empId] !== undefined;

                                if (!isEmpSaved) {
                                    if (!updated.status || updated.status === 'present' || updated.status === 'late') {
                                        if (inMins > limitMins) {
                                            updated.status = 'late';
                                        } else {
                                            updated.status = 'present';
                                        }
                                    }
                                }
                            }
                        }
                        return updated;
                    }
                    return item;
                })
            };
        });
    };

    const handleSaveBulk = async () => {
        const offStatuses = ['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'];
        
        const records = tempBulk
            .filter(item => item.status)
            .map(item => ({
                date: selectedDate,
                employeeId: item.id,
                status: item.status,
                time: offStatuses.includes(item.status) ? '' : item.time,
                outTime: offStatuses.includes(item.status) ? '' : item.outTime,
                workTime: offStatuses.includes(item.status) ? '' : item.workTime,
                isBiometric: item.isBiometric,
                isCoco: item.isCoco
            }));
            
        await saveBulkAttendance(records);
        setBulkDraft({ key: '', entries: [] }); 
        hasUserEditedRef.current = false;
        setIsManuallyUnlocked(false);
        showNotice('Attendance saved', 'Attendance changes were saved successfully.');
    };

    const handleBiometricSync = async () => {
        setIsSyncing(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(`${API_BASE}/api/attendance/sync/etimeoffice`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ date: selectedDate, preview: true })
            });

            let data;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                data = await res.json();
            } else {
                const text = await res.text();
                throw new Error(`Server returned non-JSON response (Status ${res.status}): ${text.substring(0, 150)}`);
            }

            if (res.ok && data.success) {
                if (data.records && data.records.length > 0) {
                    setBulkDraft(prev => {
                        const currentEntries = prev.key === bulkDraftKey ? prev.entries : bulkEntries;
                        const newEntries = currentEntries.map(emp => {
                            const syncedRecord = data.records.find(r => r.employeeId === emp.id);
                            if (syncedRecord) {
                                return {
                                    ...emp,
                                    time: syncedRecord.status === 'absent' ? '' : (syncedRecord.time || emp.time),
                                    outTime: syncedRecord.status === 'absent' ? '' : (syncedRecord.outTime || emp.outTime),
                                    workTime: syncedRecord.status === 'absent' ? '' : (syncedRecord.workTime || emp.workTime),
                                    status: syncedRecord.status || emp.status,
                                    isBiometric: true,
                                    isCoco: false
                                };
                            }
                            return emp;
                        });
                        hasUserEditedRef.current = true;
                        return { key: bulkDraftKey, entries: newEntries };
                    });
                    setIsManuallyUnlocked(true);
                    showNotice('Biometric sync complete', `Fetched ${data.records.length} records. Review the table and click 'Save All Attendance' to update the database.`);
                } else {
                    showNotice('No biometric records', 'No biometric records were found for this date.');
                }
            } else {
                showNotice('Biometric sync failed', `Sync failed (Status ${res.status}): ${data.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error('Error syncing biometric data:', e);
            showNotice('Biometric sync failed', `Error syncing biometric data: ${e.message}`);
        }
        setIsSyncing(false);
    };

    const handleCocoSync = () => {
        const syncableStatuses = new Set(['weekoff', 'absent']);
        const eligibleEmployees = tempBulk
            .filter(employee => syncableStatuses.has(employee.status?.trim().toLowerCase()))
            .map(employee => {
                const details = employees.find(item => item.id === employee.id);
                return {
                    id: employee.id,
                    name: employee.name || 'Employee',
                    checkin: details?.checkin || '09:00'
                };
            });

        setDialog({
            mode: 'confirm',
            title: 'Confirm COCO sync',
            date: selectedDate,
            employees: eligibleEmployees,
            message: 'COCO attendance will be checked for Week Off and Absent employees.'
        });
    };

    const confirmCocoSync = async () => {
        if (dialog?.mode !== 'confirm') return;

        const confirmation = dialog;
        const { date, employees: eligibleEmployees } = confirmation;
        setDialog({ ...confirmation, mode: 'loading', title: 'Syncing COCO attendance' });
        setIsCocoSyncing(true);
        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(`${API_BASE}/api/coco-attendance/preview?date=${date}`, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });

            const contentType = res.headers.get('content-type') || '';
            
            if (!contentType.includes('application/json')) {
                setDialog({
                    mode: 'result',
                    title: 'No records found',
                    date,
                    employees: [],
                    message: `No COCO records found for ${new Date(date).toLocaleDateString('en-IN')}. Existing attendance was not changed.`
                });
                return;
            }

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || `COCO sync failed (Status ${res.status}).`);
            }

            const cocoRecords = Array.isArray(data.records) ? data.records : [];

            const cocoByEmployeeId = new Map(
                cocoRecords
                    .filter(record => normalizeDate(record.date) === date)
                    .map(record => {
                        // 👇 Strict ID check: Skip if employeeId is missing or starts with 'unmapped_'
                        const empId = record.employeeId || record.empId;
                        if (!empId || String(empId).toLowerCase().startsWith('unmapped_')) return null;
                        
                        return [String(empId).trim().toLowerCase(), record];
                    })
                    .filter(Boolean) // Removes nulls
            );

            const graceMinutes = Number.isFinite(Number(rules?.grace))
                ? Math.max(0, Number(rules.grace))
                : 10;

            const updates = eligibleEmployees
                .map(employee => {
                    const record = cocoByEmployeeId.get(String(employee.id).trim().toLowerCase());
                    const time = record && isCocoPresent(record) ? getCocoTime(record, 'checkIns', 'checkIn') : '';
                    const outTime = record && isCocoPresent(record) ? getCocoTime(record, 'checkOuts', 'checkOut', 'last') : '';
                    const scheduledCheckIn = normalizeTime(employee.checkin) || '09:00';
                    return {
                        ...employee,
                        time,
                        outTime,
                        status: time ? getAttendanceStatus(time, scheduledCheckIn, graceMinutes) : '',
                        workTime: calculateWorkTime(time, outTime)
                    };
                })
                .filter(update => update.time);

            if (!updates.length) {
                setDialog({
                    mode: 'result',
                    title: 'No attendance updated',
                    date,
                    employees: [],
                    message: 'No valid COCO attendance records matched these Week Off, Late, or Absent employees for this date. Existing attendance was not changed.'
                });
                return;
            }

            const updatesByEmployeeId = new Map(updates.map(update => [update.id, update]));
            setBulkDraft(prev => {
                const currentEntries = prev.key === bulkDraftKey ? prev.entries : bulkEntries;
                return {
                    key: bulkDraftKey,
                    entries: currentEntries.map(employee => {
                        const update = updatesByEmployeeId.get(employee.id);
                        return update
                            ? { ...employee, status: update.status, time: update.time, outTime: update.outTime, workTime: update.workTime, isBiometric: false, isCoco: true }
                            : employee;
                    })
                };
            });
            hasUserEditedRef.current = true;
            setIsManuallyUnlocked(true);
            setDialog({
                mode: 'result',
                title: 'COCO sync complete',
                date,
                employees: updates.map(({ id, name }) => ({ id, name })),
                message: `Updated ${updates.length} Week Off or Absent record${updates.length === 1 ? '' : 's'} from COCO. Review the table and click 'Save All Attendance' to save the changes.`
            });
        } catch (e) {
            console.error('Error syncing COCO attendance data:', e);
            setDialog({
                mode: 'result',
                title: 'COCO sync failed',
                date,
                employees: [],
                message: e.message || 'Unable to sync COCO attendance.'
            });
        } finally {
            setIsCocoSyncing(false);
        }
    };

    return (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="ch" style={{ flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span className="ct">Bulk Attendance Marking</span>
                    {isLocked ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', padding: '3px 12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            <Lock size={12} /> Saved & Locked
                        </span>
                    ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '20px', padding: '3px 12px', fontSize: '0.75rem', fontWeight: 700 }}>
                            <Unlock size={12} /> Editing
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {isLocked && (
                        <button
                            className="secondary-btn small-btn"
                            onClick={() => setIsManuallyUnlocked(true)}
                            style={{ borderColor: 'var(--warning)', color: 'var(--warning)', padding: '0.25rem 0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                            <Unlock size={14} /> Edit
                        </button>
                    )}
                    <button className="secondary-btn small-btn" onClick={handleBiometricSync} disabled={isSyncing || isCocoSyncing} style={{ borderColor: '#3b82f6', color: '#3b82f6', padding: '0.25rem 0.75rem' }}>
                        {isSyncing ? 'Syncing...' : 'Sync Biometric'}
                    </button>
                    <button className="secondary-btn small-btn" onClick={handleCocoSync} disabled={isSyncing || isCocoSyncing} style={{ borderColor: '#8b5cf6', color: '#8b5cf6', padding: '0.25rem 0.75rem' }}>
                        {isCocoSyncing ? 'Syncing COCO...' : 'Sync COCO'}
                    </button>
                    <button className="secondary-btn small-btn" onClick={onOpenReport} style={{ borderColor: 'var(--primary)', color: 'var(--primary)', padding: '0.25rem 0.75rem' }}>
                        <FileText size={16} /> Monthly Report
                    </button>
                    
                    {/* Show Set Holiday button ONLY if all employees are weekoff or absent */}
                    {showHolidayButton && (
                        <button className="secondary-btn small-btn" onClick={handleGlobalHoliday} disabled={isLocked || isSyncing || isCocoSyncing} style={{ borderColor: '#ec4899', color: '#ec4899', padding: '0.25rem 0.75rem' }}>
                            Set Holiday
                        </button>
                    )}

                    <input
                        type="date"
                        value={selectedDate}
                        max={new Date().toISOString().split('T')[0]}
                        disabled={Boolean(dialog)}
                        onChange={(e) => {
                            hasUserEditedRef.current = false;
                            setIsManuallyUnlocked(false);
                            setSelectedDate(e.target.value);
                        }}
                        className="bulk-time-input"
                        style={{ width: '150px' }}
                    />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '1rem' }}>
                {tempBulk.map(emp => (
                    <div key={emp.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(148, 163, 184, 0.2)', paddingBottom: '12px' }}>
                            <div className="av">{emp.name[0]}</div>
                            <span style={{ fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{emp.name}</span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {['present', 'late', 'absent', 'weekoff', 'half-day', 'sick_leave', 'holiday'].map(st => {
                                const hasTime = Boolean(emp.time);
                                
                                // Define Groups
                                const isTimeStatus = ['present', 'late', 'half-day'].includes(st);
                                const isOffStatus = ['absent', 'weekoff', 'sick_leave', 'holiday', 'office_leave'].includes(st);
                                
                                const currentIsTime = ['present', 'late', 'half-day'].includes(emp.status);
                                const currentIsOff = ['absent', 'weekoff', 'sick_leave', 'holiday', 'office_leave'].includes(emp.status);

                                let isDisabled = isLocked;

                                if (!isLocked) {
                                    if (currentIsTime) {
                                        // 1. If currently present/late/half-day, lock everything else
                                        isDisabled = emp.status !== st;
                                    } else if (currentIsOff) {
                                        // 2. If currently absent/weekoff/sick/holiday, allow switching to other off-statuses, but block time-statuses
                                        isDisabled = isTimeStatus;
                                    } else {
                                        // 3. If no status is set yet, use the time check
                                        if (hasTime && isOffStatus) isDisabled = true;
                                        if (!hasTime && isTimeStatus) isDisabled = true;
                                    }
                                }

                                return (
                                    <span
                                        key={st}
                                        className={`status-chip ${emp.status === st ? 'active' : ''}`}
                                        data-status={st}
                                        onClick={() => !isDisabled && updateTemp(emp.id, { status: st })}
                                        title={isLocked ? 'Attendance is locked.' : isDisabled ? 'Cannot change status.' : ''}
                                        style={{ 
                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                            padding: '4px 10px', 
                                            fontSize: '0.75rem'
                                        }}
                                    >
                                        {st.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                    </span>
                                );
                            })}
                        </div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            {/* IN Time Input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245,158,11,0.1)', padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>IN:</span>
                                <input
                                    type="time"
                                    value={['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'].includes(emp.status) ? '' : emp.time}
                                    className="bulk-time-input"
                                    disabled={isLocked || emp.isBiometric || ['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'].includes(emp.status)}
                                    style={{ border: 'none', background: 'transparent', padding: 0, height: 'auto', width: '85px', color: 'var(--warning)', fontWeight: 700, cursor: isLocked || emp.isBiometric ? 'not-allowed' : 'text' }}
                                    onChange={(e) => updateTemp(emp.id, { time: e.target.value })}
                                />
                            </div>

                            {/* OUT Time Input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245,158,11,0.1)', padding: '6px 10px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>OUT:</span>
                                <input
                                    type="time"
                                    value={['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'].includes(emp.status) ? '' : (emp.outTime !== '--:--' ? emp.outTime : '')}
                                    className="bulk-time-input"
                                    disabled={isLocked || emp.isBiometric || ['absent', 'weekoff', 'holiday', 'sick_leave', 'office_leave'].includes(emp.status)}
                                    style={{ border: 'none', background: 'transparent', padding: 0, height: 'auto', width: '85px', color: 'var(--warning)', fontWeight: 700, cursor: isLocked || emp.isBiometric ? 'not-allowed' : 'text' }}
                                    onChange={(e) => updateTemp(emp.id, { outTime: e.target.value })}
                                />
                            </div>
                            {emp.workTime && emp.workTime !== '--:--' && (
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>
                                    {emp.workTime} hrs
                                </div>
                            )}
                            {emp.isBiometric && (
                                <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '12px' }}>Biometric</span>
                            )}
                            {emp.isCoco && (
                                <span style={{ fontSize: '0.7rem', background: '#8b5cf6', color: 'white', padding: '2px 6px', borderRadius: '12px' }}>COCO</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {!isLocked && (
                <div className="action-row" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                    <button className="primary-btn" style={{ width: '300px' }} onClick={handleSaveBulk}>Save All Attendance</button>
                </div>
            )}

            {dialog && createPortal(
                <div
                    onMouseDown={event => {
                        if (event.target === event.currentTarget && dialog.mode !== 'loading') {
                            setDialog(null);
                        }
                    }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        width: '100vw',
                        minHeight: '100vh',
                        zIndex: 10000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        boxSizing: 'border-box',
                        background: 'rgba(15, 23, 42, 0.62)'
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bulk-attendance-dialog-title"
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            color: 'var(--text-primary)',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '16px',
                            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.3)'
                        }}
                    >
                        <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid var(--border-color)' }}>
                            <h2 id="bulk-attendance-dialog-title" style={{ margin: 0, fontSize: '1.1rem' }}>
                                {dialog.mode === 'confirm' ? 'Confirm COCO sync' : dialog.mode === 'loading' ? 'Syncing COCO attendance' : dialog.title}
                            </h2>
                            {dialog.date && (
                                <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Date: <strong style={{ color: 'var(--text-primary)' }}>{new Date(`${dialog.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                                </p>
                            )}
                        </div>

                        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
                            {dialog.message && (
                                <p style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {dialog.message}
                                </p>
                            )}
                            {dialog.mode === 'loading' && (
                                <p role="status" style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Checking the selected date and employee IDs in COCO...
                                </p>
                            )}

                            {dialog.employees?.length > 0 ? (
                                <div style={{ display: 'grid', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                                    {dialog.employees.map(employee => (
                                        <div key={employee.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'rgba(148, 163, 184, 0.1)', borderRadius: '10px' }}>
                                            <span style={{ fontWeight: 600 }}>{employee.name}</span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Emp ID: {employee.id}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                dialog.mode === 'confirm' && (
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        No Week Off employees are currently listed for this date.
                                    </p>
                                )
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 22px 20px', borderTop: '1px solid var(--border-color)' }}>
                            {dialog.mode === 'confirm' ? (
                                <>
                                    <button className="secondary-btn small-btn" onClick={() => setDialog(null)}>Cancel</button>
                                    <button className="primary-btn small-btn" onClick={confirmCocoSync} disabled={!dialog.employees.length}>
                                        Confirm Sync
                                    </button>
                                </>
                            ) : dialog.mode === 'loading' ? (
                                <button className="primary-btn small-btn" disabled>Syncing...</button>
                            ) : (
                                <button className="primary-btn small-btn" onClick={() => setDialog(null)}>OK</button>
                            )}
                        </div>
                    </section>
                </div>,
                document.body
            )}
        </div>
    );
};

export default BulkAttendanceTable;