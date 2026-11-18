
const express = require('express');
const router = express.Router();
const AttendanceReminderSetting = require('../models/AttendanceReminderSetting');
const { ensurePersistentStore, respondStorageUnavailable } = require('../config/db');
const fallbackConfig = require('../../shared/attendanceReminder.json');

const DEFAULT_CONFIG = {
    enabled: true,
    hour: fallbackConfig.hour,
    minute: fallbackConfig.minute,
    timezone: 'Asia/Kolkata'
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};

router.use(requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        if (!(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const setting = await AttendanceReminderSetting.findOne({
            key: 'attendance-reminder'
        }).lean();

        if (!setting) {
            return res.json({ ...DEFAULT_CONFIG, source: 'json' });
        }

        const { _id, __v, key, createdAt, updatedAt, ...config } = setting;
        res.json({ ...DEFAULT_CONFIG, ...config, source: 'database' });
    } catch (error) {
        next(error);
    }
});

router.put('/', async (req, res, next) => {
    try {
        const { enabled, hour, minute } = req.body;

        if (
            typeof enabled !== 'boolean' ||
            !Number.isInteger(hour) || hour < 0 || hour > 23 ||
            !Number.isInteger(minute) || minute < 0 || minute > 59
        ) {
            return res.status(400).json({ error: 'Invalid reminder settings.' });
        }

        if (!(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const setting = await AttendanceReminderSetting.findOneAndUpdate(
            { key: 'attendance-reminder' },
            {
                $set: {
                    enabled,
                    hour,
                    minute,
                    timezone: 'Asia/Kolkata'
                }
            },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        ).lean();

        res.json({
            success: true,
            enabled: setting.enabled,
            hour: setting.hour,
            minute: setting.minute,
            timezone: setting.timezone,
            source: 'database'
        });
    } catch (error) {
        next(error);
    }
});

module.exports = { route: router };
