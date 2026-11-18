const Attendance = require('../models/Attendance');
const PushSubscription = require('../models/PushSubscription');
const NotificationLog = require('../models/NotificationLog');
const { ensurePersistentStore } = require('../config/db');
const { sendPushNotification } = require('./webPush');
const config = require('../../shared/attendanceReminder.json');

const getLocalDateTime = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());

    return Object.fromEntries(parts.map(part => [part.type, part.value]));
};

const runAttendanceReminder = async () => {
    if (!(await ensurePersistentStore())) {
        throw new Error('Persistent database is unavailable.');
    }

    const now = getLocalDateTime();
    const today = `${now.year}-${now.month}-${now.day}`;
    const currentMinutes = Number(now.hour) * 60 + Number(now.minute);
    const scheduledMinutes = config.hour * 60 + config.minute;

    if (currentMinutes < scheduledMinutes) {
        return { status: 'not_due', date: today };
    }

    const attendanceExists = await Attendance.exists({ date: today });

    if (attendanceExists) {
        return { status: 'attendance_exists', date: today };
    }

    const key = `attendance-reminder:${today}`;

    try {
        await NotificationLog.create({
            key,
            date: today,
            type: 'attendance-reminder',
            status: 'processing'
        });
    } catch (error) {
        if (error.code === 11000) {
            return { status: 'already_processed', date: today };
        }
        throw error;
    }

    const subscriptions = await PushSubscription.find().lean();

    if (!subscriptions.length) {
        await NotificationLog.updateOne(
            { key },
            { $set: { status: 'no_subscriptions' } }
        );

        return { status: 'no_subscriptions', date: today };
    }

    const results = await Promise.allSettled(
        subscriptions.map(async subscription => {
            try {
                await sendPushNotification(subscription, {
                    title: 'SmartSalary Attendance Reminder',
                    body: 'Today attendance has not been recorded yet. Please update attendance.',
                    url: '/',
                    tag: `attendance-reminder-${today}`
                });

                return true;
            } catch (error) {
                if ([404, 410].includes(error.statusCode)) {
                    await PushSubscription.deleteOne({
                        _id: subscription._id
                    });
                }

                throw error;
            }
        })
    );

    const sent = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - sent;

    await NotificationLog.updateOne(
        { key },
        {
            $set: {
                status: failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'partial',
                total: subscriptions.length,
                sent,
                failed
            }
        }
    );

    return {
        status: failed === 0 ? 'sent' : 'partial',
        date: today,
        total: subscriptions.length,
        sent,
        failed
    };
};

module.exports = { runAttendanceReminder };