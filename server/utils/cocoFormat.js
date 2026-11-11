// COCO JSON → SMART MongoDB schema converter
function normalizeDate(rawDate) {
    if (!rawDate) return '';
    const s = String(rawDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2}|\d{4})$/);
    if (!m) return '';
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const day = a > 12 ? a : (b > 12 ? b : a);
    const month = a > 12 ? b : (b > 12 ? a : b);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function normalizeTime(rawTime) {
    if (!rawTime || rawTime === '-') return '';
    const s = String(rawTime).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!m) return s;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const period = (m[3] || '').toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + min;
}

function deriveStatus(cocoRecord) {
    if (cocoRecord.weekOff === 'Yes') return 'weekoff';
    if (cocoRecord.halfDay === 'Yes') return 'half-day';
    const perm = String(cocoRecord.permission || '').trim();
    const hasPermission = perm && perm !== '-';
    const hasIn = cocoRecord.checkIn && cocoRecord.checkIn !== '-';
    const hasOut = cocoRecord.checkOut && cocoRecord.checkOut !== '-';
    if (hasPermission || hasIn || hasOut) return 'present';
    return 'absent';
}

function buildAliasMap(mappings) {
    if (!mappings) mappings = [];
    const map = new Map();
    for (const m of mappings) {
        const empId = String(m.empId || '').trim();
        if (!empId) continue;
        const official = String(m.employeeName || '').trim().toLowerCase();
        if (official) map.set(official, empId);
        for (const alias of m.aliases || []) {
            const k = String(alias || '').trim().toLowerCase();
            if (k) map.set(k, empId);
        }
    }
    return map;
}

function resolveEmpId(name, aliasMap) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return aliasMap.get(key) || null;
}

function convertAttendance(cocoRecords, mappings) {
    if (!cocoRecords) cocoRecords = [];
    const aliasMap = buildAliasMap(mappings);
    const out = [];
    for (const r of cocoRecords) {
        const date = normalizeDate(r.date);
        if (!date) continue;
        const name = String(r.name || '').trim();
        if (!name) continue;

        const checkIns = (r.checkIns || []).map(normalizeTime).filter(Boolean);
        const checkOuts = (r.checkOuts || []).map(normalizeTime).filter(Boolean);
        const checkIn = checkIns[0] || normalizeTime(r.checkIn);
        const checkOut = checkOuts[0] || normalizeTime(r.checkOut);

        out.push({
            date,
            employeeId: resolveEmpId(name, aliasMap),
            name,
            status: deriveStatus(r),
            checkIn,
            checkOut,
            checkIns,
            checkOuts,
            workTime: String(r.workTime || ''),
            halfDay: r.halfDay === 'Yes' ? 'Yes' : 'No',
            permission: String(r.permission || '-'),
            weekOff: r.weekOff === 'Yes' ? 'Yes' : 'No',
            source: 'coco_analyze',
            isCoco: true,
            uploadedAt: new Date(),
            uploadedBy: 'admin'
        });
    }
    return out;
}

function convertPenalty(cocoRecords, mappings) {
    if (!cocoRecords) cocoRecords = [];
    const aliasMap = buildAliasMap(mappings);
    const out = [];
    for (const r of cocoRecords) {
        const date = normalizeDate(r.date);
        if (!date) continue;
        const name = String(r.name || '').trim();
        if (!name) continue;
        const amount = parseFloat(r.penalty || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        out.push({
            date,
            employeeId: r.empId || resolveEmpId(name, aliasMap),
            name,
            displayName: String(r.displayName || name),
            penalty: amount,
            penaltyReason: String(r.penaltyReason || ''),
            source: 'coco_penalty',
            uploadedAt: new Date(),
            uploadedBy: 'admin'
        });
    }
    return out;
}

module.exports = {
    convertAttendance,
    convertPenalty,
    normalizeDate,
    normalizeTime,
    buildAliasMap
};

