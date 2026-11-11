"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOM_NAME_ORDER = void 0;
exports.normalizeNameForComparison = normalizeNameForComparison;
exports.isWeekOffDeclaration = isWeekOffDeclaration;
exports.createNameResolver = createNameResolver;
exports.getEmployeeNameMap = getEmployeeNameMap;
exports.resolveOriginalEmployeeName = resolveOriginalEmployeeName;
exports.normalizeEmployeeName = normalizeEmployeeName;
exports.normalizeAttendanceSenderName = normalizeAttendanceSenderName;
exports.sortByName = sortByName;
exports.getAppliesToNames = getAppliesToNames;
exports.getUniqueDates = getUniqueDates;
exports.getUniqueNames = getUniqueNames;
exports.convertRawDateToISO = convertRawDateToISO;
exports.normalizeDateSequence = normalizeDateSequence;
exports.formatDateDDMMYY = formatDateDDMMYY;
exports.parsePermissionDuration = parsePermissionDuration;
exports.timeToMinutes = timeToMinutes;
const DEFAULT_EMPLOYEES = [
    'Arunkumar',
    'Bhuvaneswaran',
    'Devesh',
    'Naresh',
    'Shruthi',
    'Tamilarasan',
    'Vasanth',
    'Vishnukumar',
    'Vishnupriya',
    'GUNASRI',
    'Ezhilarasan',
    'PRIYADHARSHINI',
    'Kalaivani',
    'Gokul',
    'Sivasankari',
    'Rajasekaran',
    'Meena',
    'JAYAMALA',
    'Girija',
    'Prathap',
    'Thilak',
    'Prabakaran',
    'Mohandass',
    'Gopinath',
    'Sarala',
    'AVINESH',
    'Sanjay',
    'Logeshwaran',
    'Sireesha',
];
exports.CUSTOM_NAME_ORDER = [...DEFAULT_EMPLOYEES];
function cleanName(name) {
    return String(name || '').trim();
}
function lowerName(name) {
    return cleanName(name).toLowerCase();
}
function normalizeNameForComparison(name) {
    return lowerName(name).replace(/[^a-z0-9]/g, '');
}
function isWeekOffDeclaration(text) {
    const normalizedText = String(text || '')
        .replace(/<\s*This message was edited\s*>/gi, ' ')
        .replace(/[*_~`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    const weekOffPattern = /\b(?:week\s*off|weekoff|weekly\s*off|wo)\b/i;
    if (!weekOffPattern.test(normalizedText)) {
        return false;
    }
    // Broadcasts, rules and questions mention week-off without declaring
    // attendance for the sender or a named employee.
    if (/@all\b|\b(?:everyone|everybody|all\s+(?:staff|employees?)|policy|announcement|should|must|allowed|only|month|monthly|converted?|already|taken|holiday|loss\s+of\s+pay|lop)\b/i.test(normalizedText) ||
        /\b(?:no|not|without)\s+(?:a\s+)?(?:week\s*off|weekoff|weekly\s*off|wo)\b/i.test(normalizedText) ||
        /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:days?\s+)?(?:week\s*off|weekoff|weekly\s*off|wo)\b/i.test(normalizedText) ||
        /\?|\b(?:who|when|why|how\s+many|can\s+i|may\s+i|should\s+i)\b/i.test(normalizedText) ||
        /\b(?:tomorrow|yesterday|next|last|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(normalizedText)) {
        return false;
    }
    const selfDeclaration = /\b(?:today\s+)?(?:i\s*am|i['’]?m|iam)\s+(?:(?:am\s+)?taking\s+|on\s+|a\s+)?(?:week\s*off|weekoff|weekly\s*off|wo)\b/i.test(normalizedText) ||
        /\b(?:today\s+(?:is\s+)?)?my\s+(?:week\s*off|weekoff|weekly\s*off|wo)\b/i.test(normalizedText) ||
        /\b(?:week\s*off|weekoff|weekly\s*off|wo)\s+(?:is\s+)?(?:my|mine)\b/i.test(normalizedText);
    if (selfDeclaration) {
        return true;
    }
    // Also allow concise status lines such as "week off today sir" or
    // "Vasanth week off today", while rejecting longer explanatory text.
    const remainingWords = normalizedText
        .replace(/\b(?:week\s*off|weekoff|weekly\s*off|wo)\b/gi, ' ')
        .replace(/[()[\]{}.,:;!?/\\|+-]/g, ' ')
        .split(/\s+/)
        .map(word => word.replace(/^@+|@+$/g, ''))
        .filter(Boolean)
        .filter(word => !new Set([
        'today',
        'i',
        'am',
        'iam',
        "i'm",
        'im',
        'my',
        'mine',
        'me',
        'is',
        'on',
        'for',
        'taking',
        'take',
        'leave',
        'day',
        'sir',
        'madam',
        'akka',
        'anna',
        'please',
    ]).has(word));
    return remainingWords.length <= 2;
}
function levenshteinDistance(a, b) {
    if (a === b) {
        return 0;
    }
    if (!a.length) {
        return b.length;
    }
    if (!b.length) {
        return a.length;
    }
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const insertCost = current[j - 1] + 1;
            const deleteCost = previous[j] + 1;
            const replaceCost = previous[j - 1] +
                (a[i - 1] === b[j - 1] ? 0 : 1);
            current[j] = Math.min(insertCost, deleteCost, replaceCost);
        }
        for (let j = 0; j < current.length; j++) {
            previous[j] = current[j];
        }
    }
    return previous[b.length];
}
function createNameResolver(allNames, mappings) {
    const aliasMap = new Map();
    const exactNameMap = new Map();
    const fuzzyCandidates = [];
    const fuzzyCache = new Map();
    const knownNameKeys = new Set();
    for (const mapping of mappings) {
        const employeeName = cleanName(mapping.employeeName);
        if (employeeName) {
            knownNameKeys.add(normalizeNameForComparison(employeeName));
        }
        for (const alias of mapping.aliases || []) {
            const cleanAlias = cleanName(alias);
            if (!cleanAlias) {
                continue;
            }
            const key = normalizeNameForComparison(cleanAlias);
            if (key && !aliasMap.has(key)) {
                aliasMap.set(key, employeeName);
            }
        }
    }
    for (const name of allNames) {
        const clean = cleanName(name);
        if (!clean) {
            continue;
        }
        const key = clean.toLowerCase();
        if (!exactNameMap.has(key)) {
            exactNameMap.set(key, clean);
        }
        knownNameKeys.add(normalizeNameForComparison(clean));
    }
    const candidateSet = new Set();
    const addFuzzyCandidate = (name) => {
        const clean = cleanName(name);
        const normalized = normalizeNameForComparison(clean);
        if (clean &&
            normalized &&
            !candidateSet.has(normalized)) {
            candidateSet.add(normalized);
            fuzzyCandidates.push({
                name: clean,
                normalized,
            });
        }
    };
    // Prefer the current employee master, then mapped/default employees.
    for (const name of allNames) {
        addFuzzyCandidate(name);
    }
    for (const mapping of mappings) {
        addFuzzyCandidate(mapping.employeeName);
    }
    for (const name of exports.CUSTOM_NAME_ORDER) {
        addFuzzyCandidate(name);
    }
    const findContainedEmployeeName = (input) => {
        const normalizedWords = String(input || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalizedWords) {
            return '';
        }
        const paddedInput = ` ${normalizedWords} `;
        const matches = fuzzyCandidates.filter(candidate => {
            const candidateWords = candidate.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            return (candidateWords.length >= 3 &&
                paddedInput.includes(` ${candidateWords} `));
        });
        if (matches.length === 0) {
            return '';
        }
        const longestLength = Math.max(...matches.map(candidate => candidate.normalized.length));
        const longestMatches = matches.filter(candidate => candidate.normalized.length ===
            longestLength);
        return longestMatches.length === 1
            ? longestMatches[0].name
            : '';
    };
    const resolve = (name) => {
        const clean = cleanName(name);
        if (!clean) {
            return '';
        }
        const lower = clean.toLowerCase();
        const normalizedInput = normalizeNameForComparison(clean);
        if (!normalizedInput) {
            return clean;
        }
        const mappedName = aliasMap.get(normalizedInput);
        if (mappedName !== undefined) {
            return mappedName;
        }
        const exactName = exactNameMap.get(lower);
        if (exactName !== undefined) {
            return exactName;
        }
        const cached = fuzzyCache.get(normalizedInput);
        if (cached !== undefined) {
            return cached;
        }
        const containedEmployeeName = findContainedEmployeeName(clean);
        if (containedEmployeeName) {
            fuzzyCache.set(normalizedInput, containedEmployeeName);
            return containedEmployeeName;
        }
        if (normalizedInput.length >= 4) {
            const prefixMatches = new Set(fuzzyCandidates
                .filter(candidate => candidate.normalized.startsWith(normalizedInput))
                .map(candidate => candidate.name));
            if (prefixMatches.size === 1) {
                const prefixMatch = Array.from(prefixMatches)[0];
                fuzzyCache.set(normalizedInput, prefixMatch);
                return prefixMatch;
            }
        }
        let bestMatch = '';
        let bestScore = 0;
        let secondBestScore = 0;
        for (const candidate of fuzzyCandidates) {
            const candidateNormalized = candidate.normalized;
            if (!candidateNormalized) {
                continue;
            }
            let score;
            if (normalizedInput === candidateNormalized) {
                score = 1;
            }
            else {
                const distance = levenshteinDistance(normalizedInput, candidateNormalized);
                score =
                    1 -
                        distance /
                            Math.max(normalizedInput.length, candidateNormalized.length);
            }
            if (score > bestScore) {
                secondBestScore = bestScore;
                bestScore = score;
                bestMatch = candidate.name;
            }
            else if (score > secondBestScore) {
                secondBestScore = score;
            }
        }
        const cleanLength = normalizedInput.length;
        const threshold = cleanLength <= 4
            ? 0.9
            : cleanLength <= 6
                ? 0.84
                : 0.78;
        const isAmbiguous = bestScore - secondBestScore < 0.05;
        const result = bestMatch &&
            bestScore >= threshold &&
            !isAmbiguous
            ? bestMatch
            : clean;
        fuzzyCache.set(normalizedInput, result);
        return result;
    };
    const resolveOriginal = (name) => {
        const clean = cleanName(name);
        if (!clean) {
            return '';
        }
        const normalizedInput = normalizeNameForComparison(clean);
        const mappedName = aliasMap.get(normalizedInput);
        if (mappedName) {
            return mappedName;
        }
        const exactName = exactNameMap.get(clean.toLowerCase());
        if (exactName) {
            return exactName;
        }
        return (findContainedEmployeeName(clean) || clean);
    };
    const isKnown = (name) => {
        const clean = cleanName(name);
        if (!clean) {
            return false;
        }
        const normalized = resolve(clean);
        if (!normalized) {
            return false;
        }
        const normalizedKey = normalizeNameForComparison(normalized);
        if (!normalizedKey) {
            return false;
        }
        return knownNameKeys.has(normalizedKey);
    };
    return {
        resolve,
        resolveOriginal,
        isKnown,
    };
}
function getEmployeeNameMap(mappings = []) {
    const map = {};
    for (const mapping of mappings) {
        for (const alias of mapping.aliases || []) {
            const cleanAlias = cleanName(alias);
            if (cleanAlias) {
                map[cleanAlias] = mapping.employeeName;
            }
        }
    }
    return map;
}
function resolveOriginalEmployeeName(name, mappings = []) {
    const clean = cleanName(name);
    if (!clean) {
        return '';
    }
    const comparisonKey = normalizeNameForComparison(clean);
    for (const mapping of mappings) {
        for (const alias of mapping.aliases || []) {
            if (normalizeNameForComparison(alias) ===
                comparisonKey) {
                return mapping.employeeName;
            }
        }
    }
    return clean;
}
function normalizeEmployeeName(name, allNames = exports.CUSTOM_NAME_ORDER, mappings = []) {
    return createNameResolver(allNames, mappings).resolve(name);
}
function normalizeAttendanceSenderName(sender, allNames, mappings = [], resolver) {
    const cleanSender = cleanName(sender);
    if (!cleanSender) {
        return '';
    }
    const lowerSender = cleanSender.toLowerCase();
    for (const name of allNames) {
        const cleanNameValue = cleanName(name);
        if (cleanNameValue &&
            cleanNameValue.toLowerCase() === lowerSender) {
            return cleanNameValue;
        }
    }
    return (resolver ||
        createNameResolver(allNames, mappings)).resolve(cleanSender);
}
function sortByName(a, b, employeeOrder = exports.CUSTOM_NAME_ORDER) {
    const nameA = lowerName(a.name);
    const nameB = lowerName(b.name);
    let indexA = -1;
    let indexB = -1;
    for (let i = 0; i < employeeOrder.length; i++) {
        const current = lowerName(employeeOrder[i]);
        if (indexA === -1 && current === nameA) {
            indexA = i;
        }
        if (indexB === -1 && current === nameB) {
            indexB = i;
        }
        if (indexA !== -1 &&
            indexB !== -1) {
            break;
        }
    }
    if (indexA !== -1 &&
        indexB !== -1) {
        return indexA - indexB;
    }
    if (indexA !== -1) {
        return -1;
    }
    if (indexB !== -1) {
        return 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
function getAppliesToNames(msg, allNames, mappings = [], resolver, fallbackToSender = true) {
    if (!msg) {
        return [];
    }
    const sender = cleanName(msg.sender);
    const message = String(msg.message || '');
    const nameResolver = resolver ||
        createNameResolver(allNames, mappings);
    if (!message) {
        return fallbackToSender && sender
            ? [nameResolver.resolveOriginal(sender)]
            : [];
    }
    const employeeNameMap = getEmployeeNameMap(mappings);
    const namesSet = new Set();
    const namesToCheck = [];
    for (const name of allNames) {
        const clean = cleanName(name);
        if (clean && !namesSet.has(clean)) {
            namesSet.add(clean);
            namesToCheck.push(clean);
        }
    }
    for (const name of Object.keys(employeeNameMap)) {
        const clean = cleanName(name);
        if (clean && !namesSet.has(clean)) {
            namesSet.add(clean);
            namesToCheck.push(clean);
        }
    }
    const mentioned = [];
    const normalizedMessage = normalizeNameForComparison(message);
    for (const name of namesToCheck) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`@?\\b${escapedName}\\b`, 'i');
        const normalizedName = normalizeNameForComparison(name);
        const matchesIgnoringSpacing = normalizedName.length >= 5 &&
            normalizedMessage.includes(normalizedName);
        if (regex.test(message) ||
            matchesIgnoringSpacing) {
            const resolved = nameResolver.resolveOriginal(name);
            if (resolved) {
                mentioned.push(resolved);
            }
        }
    }
    if (mentioned.length === 0) {
        const words = message
            .replace(/@⁨|⁩/g, ' ')
            .replace(/[^A-Za-z0-9._~-]+/g, ' ')
            .split(/\s+/)
            .filter(Boolean);
        for (const word of words) {
            const resolved = nameResolver.resolve(word);
            if (resolved &&
                nameResolver.isKnown(resolved) &&
                !mentioned.includes(resolved)) {
                mentioned.push(resolved);
            }
        }
    }
    if (mentioned.length > 0) {
        return [
            ...new Set(mentioned.filter(Boolean)),
        ];
    }
    return fallbackToSender && sender
        ? [nameResolver.resolveOriginal(sender)]
        : [];
}
function getUniqueDates(data) {
    const dateSet = new Set();
    for (const row of data) {
        const date = cleanName(row?.date);
        if (date) {
            dateSet.add(date);
        }
    }
    return Array.from(dateSet).sort((a, b) => convertRawDateToISO(b).localeCompare(convertRawDateToISO(a)));
}
function getUniqueNames(data, mappings = []) {
    const allNames = [
        ...exports.CUSTOM_NAME_ORDER,
        ...mappings.map(mapping => mapping.employeeName),
    ];
    const resolver = createNameResolver(allNames, mappings);
    const normalizedNames = new Set();
    for (const row of data) {
        const sender = cleanName(row?.sender);
        if (sender) {
            normalizedNames.add(resolver.resolve(sender));
        }
    }
    return Array.from(normalizedNames).sort((a, b) => sortByName({ name: a }, { name: b }));
}
function convertRawDateToISO(rawDate) {
    if (!rawDate) {
        return '';
    }
    const value = String(rawDate).trim();
    if (!value) {
        return '';
    }
    let year;
    let month;
    let day;
    let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    }
    else {
        match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
        if (!match) {
            return '';
        }
        const first = Number(match[1]);
        const second = Number(match[2]);
        const yearValue = match[3];
        year =
            yearValue.length === 2
                ? 2000 + Number(yearValue)
                : Number(yearValue);
        // Unambiguous DD/MM
        if (first > 12 && second <= 12) {
            day = first;
            month = second;
        }
        // Unambiguous MM/DD
        else if (second > 12 && first <= 12) {
            month = first;
            day = second;
        }
    // Default to DD/MM for Indian format
    else {
      day = first;
      month = second;
    }
    }
    if (year < 2000 ||
        year > 2100 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31) {
        return '';
    }
    const isoDate = `${String(year).padStart(4, '0')}-` +
        `${String(month).padStart(2, '0')}-` +
        `${String(day).padStart(2, '0')}`;
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    if (date.getFullYear() !== year ||
        date.getMonth() + 1 !== month ||
        date.getDate() !== day) {
        return '';
    }
    return isoDate;
}
function normalizeDateSequence(rawDates) {
    if (!rawDates.length) {
        return [];
    }
    const result = [];
    let previousISO = '';
    for (const rawDate of rawDates) {
        const value = String(rawDate ?? '').trim();
        if (!value) {
            result.push('');
            continue;
        }
        const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
        if (!match) {
            const iso = convertRawDateToISO(value);
            result.push(iso);
            if (iso) {
                previousISO = iso;
            }
            continue;
        }
        const first = Number(match[1]);
        const second = Number(match[2]);
        const yearValue = match[3];
        const year = yearValue.length === 2
            ? 2000 + Number(yearValue)
            : Number(yearValue);
        // Clearly DD/MM
        if (first > 12 && second <= 12) {
            const iso = `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
            result.push(iso);
            previousISO = iso;
            continue;
        }
        // Clearly MM/DD
        if (second > 12 && first <= 12) {
            const iso = `${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
            result.push(iso);
            previousISO = iso;
            continue;
        }
        // Ambiguous date:
        // 09/10/2026 can mean:
        // MM/DD -> 2026-09-10
        // DD/MM -> 2026-10-09
        const mmdd = `${year}-${String(first).padStart(2, '0')}-${String(second).padStart(2, '0')}`;
        const ddmm = `${year}-${String(second).padStart(2, '0')}-${String(first).padStart(2, '0')}`;
        if (previousISO) {
            const previousDate = new Date(`${previousISO}T00:00:00`);
            const mmddDate = new Date(`${mmdd}T00:00:00`);
            const ddmmDate = new Date(`${ddmm}T00:00:00`);
            const mmddDiff = mmddDate.getTime() -
                previousDate.getTime();
            const ddmmDiff = ddmmDate.getTime() -
                previousDate.getTime();
            // Prefer the interpretation that continues
            // naturally from the previous date.
            if (mmddDiff >= 0 &&
                mmddDiff <= 31 * 24 * 60 * 60 * 1000 &&
                (ddmmDiff < 0 ||
                    mmddDiff <= ddmmDiff)) {
                result.push(mmdd);
                previousISO = mmdd;
                continue;
            }
            if (ddmmDiff >= 0 &&
                ddmmDiff <= 31 * 24 * 60 * 60 * 1000) {
                result.push(ddmm);
                previousISO = ddmm;
                continue;
            }
        }
// Fallback to DD/MM
result.push(ddmm);
previousISO = ddmm;
    }
    return result;
}
function formatDateDDMMYY(rawDate) {
    if (!rawDate) {
        return '';
    }
    const isoDate = convertRawDateToISO(rawDate);
    if (!isoDate) {
        return rawDate;
    }
    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return rawDate;
    }
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    }).format(date);
}
function formatPermissionDuration(minutes) {
    if (minutes <= 0) {
        return '';
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    if (hours === 0) {
        return `${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
    }
    return `${hours}h ${remainingMinutes}m`;
}
function parsePermissionDuration(text) {
    const cleanText = String(text || '')
        .trim()
        .toLowerCase();
    if (!cleanText) {
        return {
            durationMinutes: null,
            displayDuration: '',
        };
    }
    // Common voice-to-text forms of "half an hour permission".
    if (/\bhalf\s+(?:(?:an?|one)\s+hour|never)\b/.test(cleanText)) {
        return {
            durationMinutes: 30,
            displayDuration: '30 minutes',
        };
    }
    // 11am-2pm / 11 am - 2 pm / 11am to 2pm
    const timeRangeWithAmPm = cleanText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (timeRangeWithAmPm) {
        const startHour = Number(timeRangeWithAmPm[1]);
        const startMinute = Number(timeRangeWithAmPm[2] || 0);
        const startPeriod = timeRangeWithAmPm[3];
        const endHour = Number(timeRangeWithAmPm[4]);
        const endMinute = Number(timeRangeWithAmPm[5] || 0);
        const endPeriod = timeRangeWithAmPm[6];
        const start = timeToMinutes(`${startHour}:${String(startMinute).padStart(2, '0')} ${startPeriod}`);
        const end = timeToMinutes(`${endHour}:${String(endMinute).padStart(2, '0')} ${endPeriod}`);
        if (start >= 0 && end >= 0) {
            let duration = end - start;
            if (duration < 0) {
                duration += 24 * 60;
            }
            if (duration > 0) {
                return {
                    durationMinutes: duration,
                    displayDuration: formatPermissionDuration(duration),
                };
            }
        }
    }
    // 11-2 / 11 - 2 / 11 to 2
    const numericTimeRange = cleanText.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\b/);
    if (numericTimeRange) {
        const startHour = Number(numericTimeRange[1]);
        const startMinute = Number(numericTimeRange[2] || 0);
        const endHour = Number(numericTimeRange[3]);
        const endMinute = Number(numericTimeRange[4] || 0);
        if (startHour <= 23 &&
            endHour <= 23 &&
            startMinute <= 59 &&
            endMinute <= 59) {
            let duration = endHour * 60 +
                endMinute -
                (startHour * 60 + startMinute);
            if (duration < 0) {
                duration += 12 * 60;
            }
            if (duration > 0) {
                return {
                    durationMinutes: duration,
                    displayDuration: formatPermissionDuration(duration),
                };
            }
        }
    }
    // 1 hour / 1 hours / 1 hr / 1 hrs / 1hour
    const hourMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr)\b/);
    if (hourMatch) {
        const hours = Number(hourMatch[1]);
        if (Number.isFinite(hours) &&
            hours > 0) {
            const minutes = Math.round(hours * 60);
            return {
                durationMinutes: minutes,
                displayDuration: formatPermissionDuration(minutes),
            };
        }
    }
    // 30 minutes / 30 mins / 30 min / 30minutes
    const minuteMatch = cleanText.match(/(\d+)\s*(?:minutes?|mins?|min)\b/);
    if (minuteMatch) {
        const minutes = Number(minuteMatch[1]);
        if (Number.isFinite(minutes) &&
            minutes > 0) {
            return {
                durationMinutes: minutes,
                displayDuration: formatPermissionDuration(minutes),
            };
        }
    }
    return {
        durationMinutes: null,
        displayDuration: '',
    };
}
function timeToMinutes(timeStr) {
    if (!timeStr) {
        return -1;
    }
    const cleanTime = String(timeStr)
        .trim()
        .toLowerCase();
    const match = cleanTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s(am|pm))?$/);
    if (!match) {
        return -1;
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[4];
    if (minutes < 0 ||
        minutes > 59) {
        return -1;
    }
    if (ampm &&
        (hours < 1 || hours > 12)) {
        return -1;
    }
    if (!ampm &&
        (hours < 0 || hours > 23)) {
        return -1;
    }
    if (ampm === 'pm' &&
        hours < 12) {
        hours += 12;
    }
    if (ampm === 'am' &&
        hours === 12) {
        hours = 0;
    }
    return hours * 60 + minutes;
}
