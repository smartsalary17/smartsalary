const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { runAttendanceReminder } = require('../services/attendanceReminder');

const verifySchedulerSecret = (req, res, next) => {
    const expected = process.env.SCHEDULER_SECRET;
    const received = req.get('x-scheduler-secret');

    if (!expected || !received) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    next();
};

router.post('/attendance-reminder', verifySchedulerSecret, async (req, res, next) => {
    try {
        const result = await runAttendanceReminder();
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
});

module.exports = { route: router };