const express = require('express');
const router = express.Router();
const AttendanceRecord = require('../models/AttendanceRecord');

router.get('/preview', async (req, res) => {
    try {
        const { date } = req.query;
        let filter = { source: 'coco_analyze' };
        
        if (date) {
            filter.date = date;
        }
        
        const records = await AttendanceRecord.find(filter).lean();
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = { route: router };