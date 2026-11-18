self.addEventListener('push', event => {
    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { body: event.data?.text() || 'You have a new notification.' };
    }

    event.waitUntil(
        self.registration.showNotification(payload.title || 'SmartSalary', {
            body: payload.body || 'You have a new notification.',
            data: { url: payload.url || '/' },
            tag: payload.tag || 'smartsalary-notification',
            renotify: false
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    event.waitUntil((async () => {
        const targetUrl = new URL(
            event.notification.data?.url || '/',
            self.location.origin
        );

        if (targetUrl.origin !== self.location.origin) return;

        const windows = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        for (const client of windows) {
            if (client.url.startsWith(self.location.origin)) {
                await client.focus();
                if ('navigate' in client) await client.navigate(targetUrl.href);
                return;
            }
        }

        await self.clients.openWindow(targetUrl.href);
    })());
});