const webPush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

if (!publicKey || !privateKey || !subject) {
    throw new Error('Web Push VAPID configuration is incomplete.');
}

if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('VAPID_SUBJECT must be a mailto: or HTTPS URL.');
}

webPush.setVapidDetails(subject, publicKey, privateKey);

const sendPushNotification = (subscription, payload) => (
    webPush.sendNotification(
        subscription,
        JSON.stringify(payload),
        { TTL: 3600, urgency: 'normal' }
    )
);

module.exports = {
    getVapidPublicKey: () => publicKey,
    sendPushNotification
};