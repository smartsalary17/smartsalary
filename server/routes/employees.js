const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const EmployeeAsset = require('../models/EmployeeAsset');
const mockStore = require('../config/mockStore');
const { shouldUseMockStore, ensurePersistentStore, respondStorageUnavailable } = require('../config/db');
const axios = require('axios');
const { getBiometricConfigs, getBiometricCredentials } = require('../services/biometricSync');
const NameMapping = require('../models/NameMapping');

const ASSET_TYPES = new Set(['photo', 'aadhaar', 'bank', 'voterId', 'drivingLicence']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ASSET_SIZE = 5 * 1024 * 1024;

const assetKey = (employeeId, type) => `${employeeId}:${type}`;

const sanitizeFileName = (fileName = 'document') => String(fileName)
    .replace(/[\r\n"\\/]/g, '_')
    .slice(0, 180) || 'document';

const serializeAsset = (asset) => ({
    type: asset.type,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.size,
    updatedAt: asset.updatedAt || null
});

const getAssetBuffer = (data) => {
    if (Buffer.isBuffer(data)) return data;

    if (data && typeof data.value === 'function') {
        const value = data.value(true);
        if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
            return Buffer.from(value);
        }
    }

    if (data instanceof Uint8Array) return Buffer.from(data);
    if (data?.buffer instanceof Uint8Array) return Buffer.from(data.buffer);
    return null;
};

const getEmployees = async () => {
    let employees;
    if (shouldUseMockStore()) {
        employees = [...mockStore.mockEmployees];
    } else {
        employees = await Employee.find().lean();
        if (employees.length === 0 && mockStore.mockEmployees.length > 0) {
            await Employee.insertMany(mockStore.mockEmployees, { ordered: true });
            employees = await Employee.find().lean();
        }
    }
    employees.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' }));
    return employees;
};

const syncEmployees = async (employees = []) => {
    if (!Array.isArray(employees)) {
        throw new Error('Employees must be an array.');
    }

    if (shouldUseMockStore()) {
        const employeeMap = new Map(
            mockStore.mockEmployees.map(emp => [String(emp.id), emp])
        );

        employees.forEach(emp => {
            if (emp?.id == null) return;
            employeeMap.set(String(emp.id), { ...employeeMap.get(String(emp.id)), ...emp });
        });

        mockStore.mockEmployees = [...employeeMap.values()].sort((a, b) =>
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
        );
        return;
    }

    if (employees.length === 0) return;

    await Employee.bulkWrite(
        employees.filter(emp => emp?.id != null).map(emp => {
            const employeeData = { ...emp };
            delete employeeData._id;
            delete employeeData.__v;

            return {
                updateOne: {
                    filter: { id: String(emp.id) },
                    update: { $set: employeeData },
                    upsert: true
                }
            };
        }),
        { ordered: false }
    );
};

router.get('/', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }
        res.json(await getEmployees());
    } catch (e) { next(e); }
});

router.post('/sync', async (req, res, next) => {
    try {
        const { employees } = req.body;
        if (!Array.isArray(employees)) {
            return res.status(400).json({ error: 'employees must be an array.' });
        }

        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        await syncEmployees(employees);
        req.app.get('io').emit('state_changed', { type: 'employees' });
        res.json({ success: true });
    } catch (e) { next(e); }
});

router.get('/biometric-ids', async (req, res, next) => {
    try {
        const date = new Date();
        const apiDateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

        const configs = getBiometricConfigs();
        let uniqueBiometricIds = [];
        const seenIds = new Set();

        for (const config of configs) {
            const credentials = getBiometricCredentials(config);
            const url = `https://api.etimeoffice.com/api/DownloadInOutPunchData?Empcode=ALL&FromDate=${apiDateStr}&ToDate=${apiDateStr}`;

            try {
                const response = await axios.get(url, { headers: { 'Authorization': credentials } });
                const data = response.data.InOutPunchData || [];

                data.forEach(record => {
                    if (!seenIds.has(record.Empcode)) {
                        seenIds.add(record.Empcode);
                        uniqueBiometricIds.push({
                            id: record.Empcode,
                            name: record.Name,
                            corpId: config.corpId
                        });
                    }
                });
            } catch (err) {
                console.error(`Error fetching biometric IDs from ${config.corpId}:`, err.message);
            }
        }

        // Sort by ID
        uniqueBiometricIds.sort((a, b) => a.id.localeCompare(b.id));

        res.json(uniqueBiometricIds);
    } catch (e) {
        next(e);
    }
});

router.get('/:id/assets', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        let assets;
        if (shouldUseMockStore()) {
            assets = Array.from(mockStore.mockEmployeeAssets.values())
                .filter(asset => asset.employeeId === id)
                .map(serializeAsset);
        } else {
            assets = await EmployeeAsset.find({ employeeId: id })
                .select('type fileName mimeType size updatedAt')
                .lean();
        }

        res.json(assets);
    } catch (e) { next(e); }
});

router.get('/:id/assets/:type', async (req, res, next) => {
    try {
        const { id, type } = req.params;
        if (!ASSET_TYPES.has(type)) {
            return res.status(400).json({ error: 'Unsupported employee document type.' });
        }
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const asset = shouldUseMockStore()
            ? mockStore.mockEmployeeAssets.get(assetKey(id, type))
            : await EmployeeAsset.findOne({ employeeId: id, type }).select('+data').lean();

        if (!asset) {
            return res.status(404).json({ error: 'Employee document not found.' });
        }

        const fileBuffer = getAssetBuffer(asset.data);
        if (!fileBuffer?.length) {
            const error = new Error('The stored employee document has no file data.');
            error.statusCode = 500;
            throw error;
        }

        res.setHeader('Content-Type', asset.mimeType);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(asset.fileName)}"`);
        res.end(fileBuffer);
    } catch (e) { next(e); }
});

router.put('/:id/assets/:type', async (req, res, next) => {
    try {
        const { id, type } = req.params;
        const { fileName, mimeType, data } = req.body;
        if (!ASSET_TYPES.has(type)) {
            return res.status(400).json({ error: 'Unsupported employee document type.' });
        }
        if (!fileName || !mimeType || !data) {
            return res.status(400).json({ error: 'File name, type and data are required.' });
        }

        const allowedMimeTypes = type === 'photo' ? PHOTO_MIME_TYPES : DOCUMENT_MIME_TYPES;
        if (!allowedMimeTypes.has(mimeType)) {
            return res.status(400).json({ error: type === 'photo' ? 'Photo must be a JPG, PNG or WEBP image.' : 'Document must be a PDF, JPG, PNG or WEBP file.' });
        }

        const fileBuffer = Buffer.from(data, 'base64');
        if (!fileBuffer.length || fileBuffer.length > MAX_ASSET_SIZE) {
            return res.status(400).json({ error: 'File must be smaller than 5 MB.' });
        }
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const assetData = {
            employeeId: id,
            type,
            fileName: sanitizeFileName(fileName),
            mimeType,
            size: fileBuffer.length,
            data: fileBuffer,
            updatedAt: new Date()
        };

        let savedAsset;
        if (shouldUseMockStore()) {
            mockStore.mockEmployeeAssets.set(assetKey(id, type), assetData);
            savedAsset = assetData;
        } else {
            savedAsset = await EmployeeAsset.findOneAndUpdate(
                { employeeId: id, type },
                { $set: assetData },
                { new: true, upsert: true, runValidators: true }
            ).lean();
        }

        res.json({ success: true, asset: serializeAsset(savedAsset) });
    } catch (e) { next(e); }
});

router.post('/sync/biometric', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const date = new Date();
        const apiDateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

        const configs = getBiometricConfigs();
        const biometricEmployees = [];
        const seenIds = new Set();

        for (const config of configs) {
            const credentials = getBiometricCredentials(config);
            const url = `https://api.etimeoffice.com/api/DownloadInOutPunchData?Empcode=ALL&FromDate=${apiDateStr}&ToDate=${apiDateStr}`;

            try {
                const response = await axios.get(url, { headers: { 'Authorization': credentials } });
                const data = response.data.InOutPunchData || [];

                data.forEach(record => {
                    if (record.Empcode && !seenIds.has(record.Empcode)) {
                        seenIds.add(record.Empcode);
                        biometricEmployees.push({
                            id: record.Empcode,
                            name: record.Name || `Biometric Employee ${record.Empcode}`,
                            role: 'Employee',
                            dept: 'Biometric',
                            salary: 0,
                            checkin: '09:00',
                            weekoffs: []
                        });
                    }
                });
            } catch (err) {
                console.error(`Error fetching biometric IDs from ${config.corpId}:`, err.message);
            }
        }

        if (biometricEmployees.length === 0) {
            return res.json({ success: true, count: 0, message: 'No biometric employees found active today.' });
        }

        // Fetch current employees to avoid overwriting existing metadata (role, dept, salary, checkin, weekoffs)
        let currentEmployees;
        if (shouldUseMockStore()) {
            currentEmployees = mockStore.mockEmployees;
        } else {
            currentEmployees = await Employee.find().lean();
        }

        const currentEmpMap = new Map(currentEmployees.map(e => [e.id, e]));
        const mergedEmployees = [];

        biometricEmployees.forEach(bioEmp => {
            const existing = currentEmpMap.get(bioEmp.id);
            if (existing) {
                // If it already exists, update name if it matches placeholder or if we want to ensure latest name, 
                // but keep all existing role, dept, salary, checkin, weekoffs etc.
                mergedEmployees.push({
                    ...existing,
                    name: existing.name || bioEmp.name
                });
            } else {
                mergedEmployees.push(bioEmp);
            }
        });

        // Also carry over current employees who are NOT in today's biometric list (so we don't delete them!)
        currentEmployees.forEach(currEmp => {
            if (!seenIds.has(currEmp.id)) {
                mergedEmployees.push(currEmp);
            }
        });

        await syncEmployees(mergedEmployees);
        req.app.get('io').emit('state_changed', { type: 'employees' });

        res.json({
            success: true,
            count: biometricEmployees.length,
            message: `Successfully synced ${biometricEmployees.length} employee(s) from biometric system.`
        });
    } catch (e) {
        next(e);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        if (shouldUseMockStore()) {
            const index = mockStore.mockEmployees.findIndex(emp => String(emp.id) === String(id));

            if (index === -1) {
                return res.status(404).json({ error: 'Employee not found.' });
            }

            mockStore.mockEmployees.splice(index, 1);

            for (const [key, asset] of mockStore.mockEmployeeAssets.entries()) {
                if (String(asset.employeeId) === String(id)) {
                    mockStore.mockEmployeeAssets.delete(key);
                }
            }
        } else {
            const deletedEmployee = await Employee.findOneAndDelete({ id });

            if (!deletedEmployee) {
                return res.status(404).json({ error: 'Employee not found.' });
            }

            await NameMapping.deleteOne({ empId: id });
            await EmployeeAsset.deleteMany({ employeeId: id });
        }

        req.app.get('io').emit('state_changed', { type: 'employees' });
        res.json({ success: true });
    } catch (e) {
        next(e);
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        let updatedEmployee;
        if (shouldUseMockStore()) {
            const idx = mockStore.mockEmployees.findIndex(e => e.id === id);
            if (idx !== -1) {
                const updateData = { ...req.body };
                delete updateData._id;
                delete updateData.id;
                mockStore.mockEmployees[idx] = { ...mockStore.mockEmployees[idx], ...updateData };
                updatedEmployee = mockStore.mockEmployees[idx];
            }
        } else {
            const updateData = { ...req.body };
            delete updateData._id;
            delete updateData.id;
            updatedEmployee = await Employee.findOneAndUpdate({ id }, updateData, { new: true });
        }

        if (!updatedEmployee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        req.app.get('io').emit('state_changed', { type: 'employees' });
        res.json({ success: true, employee: updatedEmployee });
    } catch (e) {
        next(e);
    }
});

module.exports = { route: router, getEmployees, syncEmployees };
