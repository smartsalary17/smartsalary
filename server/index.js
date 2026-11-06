require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
    console.warn('Failed to set custom DNS servers, using system default:', e.message);
}
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cron = require('node-cron');
const { syncBiometricAttendance } = require('./services/biometricSync');

const { initDB } = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');
const verifyToken = require('./middlewares/auth');

const authRouter = require('./routes/auth').route;
const employeesRouter = require('./routes/employees').route;
const attendanceRouter = require('./routes/attendance').route;
const rulesRouter = require('./routes/rules').route;
const systemRouter = require('./routes/system').route;
const analyzerRouter = require('./routes/analyzer').route;
const attendanceReportRouter = require('./routes/attendanceReport').route;
const penaltyReportRouter = require('./routes/penaltyReport').route;
const nameMappingsRouter = require('./routes/nameMappings').route;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('io', io); 

const PORT = Number(process.env.PORT) || 3000;

initDB();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Public Auth routes
app.use('/api/auth', authRouter);

// Protect all other /api routes
app.use('/api', verifyToken);

// App routes
app.use('/api/analyzer', analyzerRouter);
app.use('/api/attendance-report', attendanceReportRouter);
app.use('/api/penalty-report', penaltyReportRouter);
app.use('/api/name-mappings', nameMappingsRouter);

app.use('/', systemRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/rules', rulesRouter);

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../client/dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/dist', 'index.html')));
}

app.use(errorHandler);

// Automatic biometric sync is TURNED OFF.
// Biometric data will ONLY sync when the user manually clicks the "Sync eTimeOffice" button in the UI.
// (15-minute automatic cron sync disabled)

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use.`);
        console.error('Stop the process using that port or change PORT in .env, then restart the server.');
        process.exit(1);
    }
    console.error('Server failed to start:', error);
    process.exit(1);
});

// Trigger reload to 3002
server.listen(PORT, () => {
    console.log(`🚀 MERN Backend ACTIVE at http://localhost:${PORT}`);
});
