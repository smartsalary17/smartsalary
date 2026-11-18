import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { API_BASE, defaultRules, WorkforceContext } from './workforceShared';

axios.interceptors.request.use(config => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wf_auth_token') : null;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            if (typeof window !== 'undefined') {
                const url = new URL(error.config.url, window.location.origin);
                if (url.pathname !== '/api/auth/login') {
                    const existingToken = localStorage.getItem('wf_auth_token');
                    if (existingToken) {
                        localStorage.removeItem('wf_auth_token');
                        window.location.reload();
                    }
                }
            }
        }
        return Promise.reject(error);
    }
);

const LOCAL_CACHE_KEY = 'wf_data_cache';
const LOCAL_SYNC_META_KEY = 'wf_sync_meta';
const DEFAULT_STORAGE_STATUS = {
    mode: API_BASE ? 'checking' : 'mock',
    persistent: !API_BASE,
    available: true,
    message: API_BASE ? null : 'Demo mode is active. Configure the backend database to keep data permanently.'
};

const readCachedState = () => {
    if (typeof window === 'undefined') {
        return { employees: [], attendance: {}, rules: defaultRules };
    }

    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (!raw) return { employees: [], attendance: {}, rules: defaultRules };

        const parsed = JSON.parse(raw);
        return {
            employees: Array.isArray(parsed.employees) ? parsed.employees : [],
            attendance: parsed.attendance && typeof parsed.attendance === 'object' ? parsed.attendance : {},
            rules: parsed.rules && typeof parsed.rules === 'object' ? { ...defaultRules, ...parsed.rules } : defaultRules
        };
    } catch (error) {
        console.error('Unable to read local cache:', error);
        return { employees: [], attendance: {}, rules: defaultRules };
    }
};

const readSyncMeta = () => {
    if (typeof window === 'undefined') {
        return { hasPendingSync: false };
    }

    try {
        const raw = localStorage.getItem(LOCAL_SYNC_META_KEY);
        if (!raw) return { hasPendingSync: false };

        const parsed = JSON.parse(raw);
        return { hasPendingSync: Boolean(parsed.hasPendingSync) };
    } catch (error) {
        console.error('Unable to read sync metadata:', error);
        return { hasPendingSync: false };
    }
};

const mergeAttendanceRecord = (prevAttendance, record) => ({
    ...prevAttendance,
    [record.date]: {
        ...(prevAttendance[record.date] || {}),
        [record.employeeId]: {
            status: record.status,
            time: record.time,
            outTime: record.outTime,
            workTime: record.workTime,
            isBiometric: record.isBiometric,
            isCoco: record.isCoco
        }
    }
});

const mergeAttendanceRecords = (prevAttendance, records) => {
    let nextAttendance = prevAttendance;
    records.forEach(record => {
        nextAttendance = mergeAttendanceRecord(nextAttendance, record);
    });
    return nextAttendance;
};

const getErrorMessage = (error, fallbackMessage) => (
    error?.response?.data?.error ||
    error?.message ||
    fallbackMessage
);

const isRecoverableSyncFailure = (error) => (
    !error?.response ||
    error?.response?.status === 503 ||
    error?.response?.data?.code === 'STORAGE_UNAVAILABLE'
);

const isNotFoundError = (error) => error?.response?.status === 404;

export const WorkforceProvider = ({ children }) => {
    const [token, setToken] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('wf_auth_token') : null);
    const cachedState = readCachedState();
    const cachedSyncMeta = readSyncMeta();
    const [employees, setEmployees] = useState(cachedState.employees);
    const [attendance, setAttendance] = useState(cachedState.attendance);
    const [rules, setRules] = useState(cachedState.rules);
    const [loading, setLoading] = useState(true);
    const [storageStatus, setStorageStatus] = useState(DEFAULT_STORAGE_STATUS);
    const [syncError, setSyncError] = useState(null);
    const [hasPendingSync, setHasPendingSync] = useState(cachedSyncMeta.hasPendingSync);

    const login = async (username, password) => {
        const res = await axios.post(`${API_BASE}/api/auth/login`, { username, password });
        const newToken = res.data.token;
        localStorage.setItem('wf_auth_token', newToken);
        setLoading(true);
        setToken(newToken);
        return true;
    };

    const logout = () => {
        localStorage.removeItem('wf_auth_token');
        setToken(null);
    };

    const captureSyncError = useCallback((error, fallbackMessage) => {
        const nextStatus = error?.response?.data?.storage;
        if (nextStatus) {
            setStorageStatus(nextStatus);
        }
        setSyncError(getErrorMessage(error, fallbackMessage));
    }, []);

    const markPendingSync = useCallback((message) => {
        setHasPendingSync(true);
        setSyncError(message || null);
    }, []);

    const clearPendingSync = useCallback(() => {
        setHasPendingSync(false);
        setSyncError(null);
    }, []);

    const fetchLegacyStorageStatus = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE}/api/system/status`);
            return response.data?.storage || DEFAULT_STORAGE_STATUS;
        } catch (error) {
            const nextStatus = error?.response?.data?.storage;
            if (nextStatus) {
                return nextStatus;
            }
            throw error;
        }
    }, []);

    const fetchLegacySnapshot = useCallback(async () => {
        const [storage, empRes, attRes, rulesRes] = await Promise.all([
            fetchLegacyStorageStatus(),
            axios.get(`${API_BASE}/api/employees`),
            axios.get(`${API_BASE}/api/attendance`),
            axios.get(`${API_BASE}/api/rules`)
        ]);

        return {
            storage,
            employees: Array.isArray(empRes.data) ? empRes.data : [],
            attendance: attRes.data && typeof attRes.data === 'object' ? attRes.data : {},
            rules: rulesRes.data || defaultRules
        };
    }, [fetchLegacyStorageStatus]);

    const applyServerSnapshot = useCallback((snapshot) => {
        const nextStorage = snapshot?.storage || DEFAULT_STORAGE_STATUS;
        const serverEmployees = Array.isArray(snapshot?.employees) ? snapshot.employees : [];
        const serverAttendance = snapshot?.attendance && typeof snapshot.attendance === 'object' ? snapshot.attendance : {};
        const serverRules = snapshot?.rules || defaultRules;

        setStorageStatus(nextStorage);

        const serverHasAttendance = Object.keys(serverAttendance).length > 0;

        if (!serverHasAttendance) {
            const cached = readCachedState();
            const cachedHasAttendance = Object.keys(cached.attendance).length > 0;

            if (cachedHasAttendance) {
                console.warn('Server attendance is empty; keeping the local cache until sync completes.');
                setAttendance(cached.attendance);
                markPendingSync(null);
            } else {
                setAttendance({});
            }
        } else {
            const cached = readCachedState();
            const merged = { ...cached.attendance };

            Object.entries(serverAttendance).forEach(([date, empMap]) => {
                merged[date] = { ...(merged[date] || {}), ...empMap };
            });

            setAttendance(merged);
        }

        setEmployees(serverEmployees);
        setRules(serverRules);
        setSyncError(null);
    }, [markPendingSync]);

    const syncLocalCacheToServer = useCallback(async () => {
        try {
            const response = await axios.post(`${API_BASE}/api/sync`, { employees, attendance, rules });
            applyServerSnapshot(response.data);
        } catch (error) {
            if (!isNotFoundError(error)) {
                throw error;
            }

            const records = [];
            Object.entries(attendance).forEach(([date, empMap]) => {
                if (!empMap || typeof empMap !== 'object') return;

                Object.entries(empMap).forEach(([employeeId, data]) => {
                    if (!data?.status) return;
                    records.push({ 
                        date, 
                        employeeId, 
                        status: data.status, 
                        time: data.time || '',
                        outTime: data.outTime || '',
                        workTime: data.workTime || '',
                        isBiometric: data.isBiometric || false,
                        isCoco: data.isCoco || false
                    });
                });
            });

            await axios.post(`${API_BASE}/api/employees/sync`, { employees });
            if (records.length > 0) {
                await axios.post(`${API_BASE}/api/attendance/bulk`, { records });
            }
            await axios.post(`${API_BASE}/api/rules`, rules);

            const snapshot = await fetchLegacySnapshot();
            applyServerSnapshot(snapshot);
        }

        clearPendingSync();
    }, [applyServerSnapshot, attendance, clearPendingSync, employees, fetchLegacySnapshot, rules]);

    const refreshData = useCallback(async () => {
        try {
            let snapshot;

            try {
                const bootstrapResponse = await axios.get(`${API_BASE}/api/bootstrap`);
                snapshot = bootstrapResponse.data;
            } catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }

                snapshot = await fetchLegacySnapshot();
            }

            const nextStatus = snapshot?.storage || DEFAULT_STORAGE_STATUS;
            if (nextStatus?.persistent && nextStatus?.available === false) {
                setStorageStatus(nextStatus);
                if (hasPendingSync) {
                    markPendingSync(null);
                }
                return;
            }

            if (hasPendingSync && Array.isArray(employees) && employees.length > 0) {
                await syncLocalCacheToServer();
                return;
            } else if (hasPendingSync) {
                clearPendingSync();
            }

            applyServerSnapshot(snapshot);
        } catch (error) {
            console.error('Migration/Fetch Error:', error);
            if (isRecoverableSyncFailure(error)) {
                markPendingSync(null);
            } else {
                captureSyncError(error, 'Unable to sync with the backend right now.');
            }
        } finally {
            setLoading(false);
        }
    }, [applyServerSnapshot, captureSyncError, fetchLegacySnapshot, hasPendingSync, markPendingSync, syncLocalCacheToServer, clearPendingSync, employees]);

    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        refreshData();

        const newSocket = io(API_BASE);

        newSocket.on('state_changed', (data) => {
            // console.log('Live update received:', data);
            refreshData();
        });

        return () => newSocket.close();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    // Persist every state change to localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ employees, attendance, rules }));
        } catch (error) {
            console.error('Unable to write local cache:', error);
        }
    }, [employees, attendance, rules]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(LOCAL_SYNC_META_KEY, JSON.stringify({ hasPendingSync }));
        } catch (error) {
            console.error('Unable to write sync metadata:', error);
        }
    }, [hasPendingSync]);

    const saveEmployees = async (newEmployees) => {
        const previousEmployees = employees;
        setEmployees(newEmployees);
        try {
            await axios.post(`${API_BASE}/api/employees/sync`, { employees: newEmployees });
            clearPendingSync();
        } catch (error) {
            if (isRecoverableSyncFailure(error)) {
                markPendingSync(null);
                return { queued: true };
            }
            setEmployees(previousEmployees);
            captureSyncError(error, 'Unable to save employees right now.');
            throw error;
        }
    };

    const saveAttendanceRecord = async (record) => {
        const previousAttendance = attendance;
        const nextAttendance = mergeAttendanceRecord(previousAttendance, record);
        setAttendance(nextAttendance);
        try {
            await axios.post(`${API_BASE}/api/attendance`, record);
            clearPendingSync();
        } catch (error) {
            if (isRecoverableSyncFailure(error)) {
                markPendingSync(null);
                return { queued: true };
            }
            setAttendance(previousAttendance);
            captureSyncError(error, 'Unable to save attendance right now.');
            throw error;
        }
    };

    const saveBulkAttendance = async (records) => {
        const previousAttendance = attendance;
        const nextAttendance = mergeAttendanceRecords(previousAttendance, records);
        setAttendance(nextAttendance);
        try {
            await axios.post(`${API_BASE}/api/attendance/bulk`, { records });
            clearPendingSync();
        } catch (error) {
            if (isRecoverableSyncFailure(error)) {
                markPendingSync(null);
                return { queued: true };
            }
            setAttendance(previousAttendance);
            captureSyncError(error, 'Unable to save attendance right now.');
            throw error;
        }
    };

    const saveRules = async (newRules) => {
        const previousRules = rules;
        const nextRules = { ...defaultRules, ...newRules };
        setRules(nextRules);
        try {
            await axios.post(`${API_BASE}/api/rules`, nextRules);
            clearPendingSync();
        } catch (error) {
            if (isRecoverableSyncFailure(error)) {
                markPendingSync(null);
                return { queued: true };
            }
            setRules(previousRules);
            captureSyncError(error, 'Unable to save rules right now.');
            throw error;
        }
    };

    const value = {
        token,
        login,
        logout,
        employees,
        attendance,
        rules,
        loading,
        storageStatus,
        syncError,
        hasPendingSync,
        refreshData,
        saveEmployees,
        saveAttendanceRecord,
        saveBulkAttendance,
        saveRules
    };

    return (
        <WorkforceContext.Provider value={value}>
            {children}
        </WorkforceContext.Provider>
    );
};
