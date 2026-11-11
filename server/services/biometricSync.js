const axios = require('axios');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const mockStore = require('../config/mockStore');
const { shouldUseMockStore } = require('../config/db');

const getBiometricConfigs = () => {
    // Array of machine configs
    return [
        {
            corpId: process.env.ETIMEO_CORPORATE_ID ,
            username: process.env.ETIMEO_USERNAME,
            password: process.env.ETIMEO_PASSWORD 
        },
        {
            corpId: process.env.ETIMEO_CORPORATE_ID_2 ,
            username: process.env.ETIMEO_USERNAME_2 ,
            password: process.env.ETIMEO_PASSWORD_2 
        }
    ].filter(config => config.corpId && config.username && config.password);
};

const getBiometricCredentials = (config) => {
    const rawString = `${config.corpId}:${config.username}:${config.password}:true`;
    return `Basic ${Buffer.from(rawString).toString('base64')}`;
};

// Helper to add minutes to a HH:mm string
const addMinutesToTime = (timeStr, minsToAdd) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(2000, 0, 1, h, m);
    date.setMinutes(date.getMinutes() + minsToAdd);
    const newH = String(date.getHours()).padStart(2, '0');
    const newM = String(date.getMinutes()).padStart(2, '0');
    return `${newH}:${newM}`;
};

const getWeekRange = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const dayOfWeek = d.getDay();
    
    const sun = new Date(d);
    sun.setDate(d.getDate() - dayOfWeek);
    
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    
    return {
        start: formatDate(sun),
        end: formatDate(sat)
    };
};

const getMonthRange = (dateStr) => {
    const [year, month] = dateStr.split('-');
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`
    };
};

const syncBiometricAttendance = async (dateStr, io, previewOnly = false) => {
    try {
        console.log(`[BiometricSync] Starting sync for date: ${dateStr}`);

        // Convert YYYY-MM-DD to DD/MM/YYYY for the API
        const [year, month, day] = dateStr.split('-');
        const apiDateStr = `${day}/${month}/${year}`;

        const configs = getBiometricConfigs();
        let allPunchData = [];

        for (const config of configs) {
            const credentials = getBiometricCredentials(config);
            const url = `https://api.etimeoffice.com/api/DownloadInOutPunchData?Empcode=ALL&FromDate=${apiDateStr}&ToDate=${apiDateStr}`;

            try {
                const response = await axios.get(url, {
                    headers: { 'Authorization': credentials }
                });

                if (response.data.Error || !response.data.InOutPunchData) {
                    console.error(`[BiometricSync] API returned error or no data for CorpID ${config.corpId}:`, response.data);
                } else {
                    allPunchData = allPunchData.concat(response.data.InOutPunchData);
                    console.log(`[BiometricSync] Fetched ${response.data.InOutPunchData.length} records from ${config.corpId}`);
                }
            } catch (err) {
                console.error(`[BiometricSync] Request failed for CorpID ${config.corpId}:`, err.message);
            }
        }

        if (allPunchData.length === 0) {
            console.error(`[BiometricSync] No data retrieved from any biometric machines.`);
            return { success: false, message: 'No data retrieved from any machine.' };
        }

        const punchData = allPunchData;
        let employees;
        if (shouldUseMockStore()) {
            employees = mockStore.mockEmployees;
        } else {
            employees = await Employee.find().lean();
        }

        const monthRange = getMonthRange(dateStr);
        const weekRange = getWeekRange(dateStr);
        
        let monthRecords = [];
        if (shouldUseMockStore()) {
            Object.entries(mockStore.mockAttendance).forEach(([date, empMap]) => {
                if (date >= monthRange.start && date <= monthRange.end) {
                    Object.entries(empMap).forEach(([employeeId, data]) => {
                        monthRecords.push({ date, employeeId, status: data.status });
                    });
                }
            });
        } else {
            monthRecords = await Attendance.find({
                date: { $gte: monthRange.start, $lte: monthRange.end }
            }).lean();
        }

        const empMap = {};
        const nameMap = {};

        employees.forEach(emp => {
            empMap[emp.id] = emp;
            // Create a normalized version of the name for fallback matching (lowercase, no spaces/special chars)
            if (emp.name) {
                const normalizedName = emp.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                nameMap[normalizedName] = emp;
            }
        });

        const recordsToUpdate = [];

        for (const emp of employees) {
            // Find their punch record from the biometric data, prioritizing ones with actual IN time
            let record = punchData.find(p => p.Empcode === emp.id && p.INTime && p.INTime !== '--:--');
            
            // If no valid punch found, fall back to any record (even empty) for this ID
            if (!record) {
                record = punchData.find(p => p.Empcode === emp.id);
            }
            
            // Fallback: Try to match by name if ID doesn't match
            if (!record && emp.name) {
                const localName = emp.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                // Prioritize records with actual IN time
                record = punchData.find(p => p.Name && p.Name.toLowerCase().replace(/[^a-z0-9]/g, '') === localName && p.INTime && p.INTime !== '--:--');
                
                if (!record) {
                    record = punchData.find(p => p.Name && p.Name.toLowerCase().replace(/[^a-z0-9]/g, '') === localName);
                }
                
                if (record) {
                    console.log(`[BiometricSync] Mapped Biometric ID ${record.Empcode} (${record.Name}) to Local Employee ${emp.id} (${emp.name}) via Name Match`);
                }
            }

            const inTime = record?.INTime && record.INTime !== '--:--' ? record.INTime : '';
            const outTime = record?.OUTTime && record.OUTTime !== '--:--' ? record.OUTTime : '';
            const workTime = record?.WorkTime && record.WorkTime !== '--:--' ? record.WorkTime : '';

            let finalStatus = '';

            if (inTime) {
                finalStatus = 'present';
                
                // Parse times safely into minutes from midnight to avoid string comparison bugs
                const parseMins = (tStr) => {
                    if (!tStr) return 0;
                    const cleaned = tStr.replace(/[^0-9:]/g, '');
                    const parts = cleaned.split(':');
                    if (parts.length === 0) return 0;
                    const h = parseInt(parts[0], 10) || 0;
                    const m = parseInt(parts[1], 10) || 0;
                    return h * 60 + m;
                };

                const inMins = parseMins(inTime);
                const checkInTime = emp.checkin || '09:00';
                const graceMins = 10; // Hardcoded to 10
                const limitTime = addMinutesToTime(checkInTime, graceMins);
                const limitMins = parseMins(limitTime);

                // Early AM check-ins (2:15 AM - 2:30 AM) should NOT be counted as late
                const isEarlyAM = (inMins >= 2 * 60 + 15) && (inMins <= 2 * 60 + 30);

                if (inMins > limitMins && !isEarlyAM) {
                    finalStatus = 'late';
                }

                // Apply half-day logic
                const outMins = parseMins(outTime);
                const halfDayLimitMins = 13 * 60; // 13:00
                if (outTime && outMins < halfDayLimitMins) {
                    finalStatus = 'half-day';
                }
            } else {
                // If there is NO punch in, check weekoff limits
                const empMonthRecords = monthRecords.filter(r => r.employeeId === emp.id && r.date !== dateStr);
                const weekoffsInMonth = empMonthRecords.filter(r => r.status === 'weekoff').length;
                const hasWeekoffInWeek = empMonthRecords.some(r => r.status === 'weekoff' && r.date >= weekRange.start && r.date <= weekRange.end);

                if (weekoffsInMonth >= 4 || hasWeekoffInWeek) {
                    finalStatus = 'absent';
                } else {
                    finalStatus = 'weekoff';
                }
            }

            recordsToUpdate.push({
                date: dateStr,
                employeeId: emp.id,
                status: finalStatus,
                time: inTime,
                outTime: outTime,
                workTime: workTime,
                isBiometric: true,
                isCoco: false
            });
        }

        if (recordsToUpdate.length > 0 && !previewOnly) {
            if (shouldUseMockStore()) {
                recordsToUpdate.forEach(rec => {
                    if (!mockStore.mockAttendance[rec.date]) mockStore.mockAttendance[rec.date] = {};
                    mockStore.mockAttendance[rec.date][rec.employeeId] = {
                        status: rec.status,
                        time: rec.time,
                        outTime: rec.outTime,
                        workTime: rec.workTime,
                        isBiometric: rec.isBiometric,
                        isCoco: rec.isCoco
                    };
                });
            } else {
                await Attendance.bulkWrite(
                    recordsToUpdate.map(rec => ({
                        updateOne: {
                            filter: { date: rec.date, employeeId: rec.employeeId },
                            update: { $set: rec },
                            upsert: true
                        }
                    })),
                    { ordered: false }
                );
            }
            console.log(`[BiometricSync] Synced ${recordsToUpdate.length} records to DB/MockStore.`);
            if (io) {
                io.emit('state_changed', { type: 'attendance' });
            }
        } else if (previewOnly) {
            console.log(`[BiometricSync] Preview mode: Fetched ${recordsToUpdate.length} records without updating DB.`);
        }

        return { success: true, count: recordsToUpdate.length, records: recordsToUpdate };
    } catch (error) {
        console.error('[BiometricSync] Error syncing:', error.message);
        return { success: false, message: error.message };
    }
};

module.exports = { syncBiometricAttendance, getBiometricConfigs, getBiometricCredentials };

