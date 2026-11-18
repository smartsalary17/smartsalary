const express = require('express');
const router = express.Router();
const PushSubscription = require('../models/PushSubscription');
const { ensurePersistentStore } = require('../config/db');
const {
    getVapidPublicKey,
    sendPushNotification
} = require('../services/webPush');

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};

const requireDatabase = async (res) => {
    const available = await ensurePersistentStore();
    if (available) return true;

    res.status(503).json({
        error: 'Persistent database is unavailable. Push subscriptions cannot be saved.'
    });
    return false;
};

router.use(requireAdmin);

router.get('/public-key', (req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', async (req, res, next) => {
    try {
        const { endpoint, keys, expirationTime } = req.body || {};

        if (
            typeof endpoint !== 'string' ||
            endpoint.length > 2048 ||
            typeof keys?.p256dh !== 'string' ||
            typeof keys?.auth !== 'string' ||
            keys.p256dh.length > 256 ||
            keys.auth.length > 256
        ) {
            return res.status(400).json({ error: 'Invalid push subscription.' });
        }

        let parsedEndpoint;
        try {
            parsedEndpoint = new URL(endpoint);
        } catch {
            return res.status(400).json({ error: 'Invalid subscription endpoint.' });
        }

        if (parsedEndpoint.protocol !== 'https:') {
            return res.status(400).json({ error: 'HTTPS subscription endpoint required.' });
        }

        if (!(await requireDatabase(res))) return;

        await PushSubscription.findOneAndUpdate(
            { endpoint },
            {
                $set: {
                    keys: {
                        p256dh: keys.p256dh,
                        auth: keys.auth
                    },
                    expirationTime: Number.isFinite(expirationTime)
                        ? expirationTime
                        : null
                }
            },
            { upsert: true, new: true, runValidators: true }
        );

        res.status(201).json({ success: true, message: 'Push subscription saved.' });
    } catch (error) {
        next(error);
    }
});

router.delete('/subscription', async (req, res, next) => {
    try {
        const { endpoint } = req.body || {};

        if (typeof endpoint !== 'string' || endpoint.length > 2048) {
            return res.status(400).json({ error: 'Valid subscription endpoint required.' });
        }

        if (!(await requireDatabase(res))) return;

        await PushSubscription.deleteOne({ endpoint });

        res.json({ success: true, message: 'Push subscription removed.' });
    } catch (error) {
        next(error);
    }
});

router.post('/test', async (req, res, next) => {
    try {
        if (!(await requireDatabase(res))) return;

        const subscriptions = await PushSubscription.find().lean();

        if (!subscriptions.length) {
            return res.status(404).json({
                error: 'No push subscriptions found. Enable notifications first.'
            });
        }

        const results = await Promise.allSettled(
            subscriptions.map(async (subscription) => {
                try {
                    await sendPushNotification(subscription, {
                        title: 'SmartSalary Test',
                        body: 'Push notifications are working successfully!',
                        url: '/',
                        tag: 'smartsalary-test'
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

        res.json({
            success: sent > 0,
            total: subscriptions.length,
            sent,
            failed
        });
    } catch (error) {
        next(error);
    }
});

module.exports = { route: router };