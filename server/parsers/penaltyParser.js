"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePenalty = parsePenalty;
const attendanceUtils_1 = require("./attendanceUtils");
const INVALID_PENALTY_TARGET_WORDS = new Set([
    'for', 'and', 'or', 'also', 'due', 'of', 'to', 'in', 'on', 'with', 'from', 'the',
    'penalty', 'add', 'amount', 'salary', 'statement', 'each', 'person',
]);
function cleanWhatsAppText(text) {
    return String(text || '')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066\u2067]/g, '')
        .trim();
}
function isValidPenaltyTarget(name) {
    const cleanName = cleanWhatsAppText(name)
        .replace(/^@/, '')
        .trim();
    if (!cleanName)
        return false;
    return !INVALID_PENALTY_TARGET_WORDS.has(cleanName.toLowerCase());
}
function extractPenaltyAmounts(text) {
    const cleanText = cleanWhatsAppText(text);
    const amounts = [];
    const currencyRegex = /(?:₹|rs\.?|inr)\s*(\d+(?:,\d{3})*(?:\.\d+)?)\b|\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:rupees?|rs\.?|inr)\b/gi;
    let match;
    while ((match = currencyRegex.exec(cleanText)) !== null) {
        const value = match[1] || match[2];
        if (value) {
            amounts.push(parseFloat(value.replace(/,/g, '')));
        }
    }
    if (amounts.length > 0) {
        return amounts;
    }
    /*
     * Preserve support for penalty messages where the amount is
     * written without ₹ / Rs / INR.
     *
     * Example:
     * "Penalty for missing data ... 2000 in food list @vasanth"
     */
    if (/\bpenn?alty\b/i.test(cleanText)) {
        const bareAmountRegex = /\b(\d{2,6}(?:\.\d+)?)\b(?!\s*(?:days?|day|hours?|hrs?|minutes?|mins?))(?!(?:\s*[.)]))/gi;
        while ((match = bareAmountRegex.exec(cleanText)) !== null) {
            const value = match[1];
            if (!value)
                continue;
            // Ignore year-like values such as 2024.
            if (/^(?:19|20)\d{2}$/.test(value)) {
                continue;
            }
            const before = cleanText.slice(Math.max(0, match.index - 20), match.index);
            if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i.test(before)) {
                continue;
            }
            if (/\b(?:no|number|num)\s*$/i.test(before)) {
                continue;
            }
            amounts.push(parseFloat(value.replace(/,/g, '')));
        }
    }
    return amounts;
}
function extractPenaltyAmount(text) {
    return extractPenaltyAmounts(text)[0] ?? null;
}
function extractWhatsAppMentions(text) {
    const cleanText = cleanWhatsAppText(text);
    const mentions = [];
    let match;
    const specialMentionRegex = /@⁨([^⁩]+)⁩/g;
    while ((match = specialMentionRegex.exec(cleanText)) !== null) {
        const name = cleanWhatsAppText(match[1])
            .replace(/^@/, '')
            .trim();
        if (name && isValidPenaltyTarget(name)) {
            mentions.push(name);
        }
    }
    const normalMentionRegex = /@\s*([~A-Za-z][A-Za-z0-9._~-]*)/g;
    while ((match = normalMentionRegex.exec(cleanText)) !== null) {
        const name = cleanWhatsAppText(match[1]).trim();
        if (name && isValidPenaltyTarget(name)) {
            mentions.push(name);
        }
    }
    return [...new Set(mentions)];
}
function resolveMentionToEmployee(mention, allNames, mappings = [], resolver, exactNameMap) {
    const cleanMention = cleanWhatsAppText(mention)
        .replace(/^@/, '')
        .replace(/⁨|⁩/g, '')
        .replace(/^~/, '')
        .replace(/[,:;]+$/, '')
        .trim();
    const exactName = allNames.find(name => name.trim().toLowerCase() === cleanMention.toLowerCase());
    if (exactName) {
        return exactName;
    }
    const mapped = resolver?.resolveOriginal(cleanMention);
    if (mapped && mapped !== cleanMention) {
        return mapped;
    }
    if (!cleanMention || !isValidPenaltyTarget(cleanMention)) {
        return '';
    }
    const mappedName = resolver
        ? resolver.resolveOriginal(cleanMention)
        : (0, attendanceUtils_1.resolveOriginalEmployeeName)(cleanMention, mappings);
    if (mappedName &&
        mappedName.trim().toLowerCase() !== cleanMention.toLowerCase()) {
        return mappedName.trim();
    }
    const key = cleanMention.toLowerCase();
    const exactMatch = exactNameMap
        ? exactNameMap.get(key)
        : allNames.find(name => name.trim().toLowerCase() === key);
    if (exactMatch) {
        return exactMatch.trim();
    }
    return cleanMention;
}
function getDirectPenaltyTargets(msg, allNames, mappings = [], resolver, exactNameMap) {
    const text = cleanWhatsAppText(String(msg?.message || ''));
    const mentions = extractWhatsAppMentions(text);
    if (mentions.length === 0) {
        return [];
    }
    /*
     * Important:
     *
     * In WhatsApp exports the first @mention is frequently the
     * person who is being notified / referenced, not the employee
     * receiving the penalty.
     *
     * Examples:
     * @Sheesha Smart Penalty ... for @Smart Help Foundation
     * @Sheesha Smart Note ... @AK also penalty ₹1300
     *
     * Therefore, if a structural target exists after "for",
     * prefer that target instead of treating every mention equally.
     */
    const forMentionMatches = [
        ...text.matchAll(/\bfor\s+@\s*(?:⁨([^⁩]+)⁩|([A-Za-z][A-Za-z0-9._-]*))/gi),
    ];
    if (forMentionMatches.length > 0) {
        const targets = [];
        for (const match of forMentionMatches) {
            const mention = match[1] || match[2] || '';
            const resolved = resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap);
            if (resolved &&
                isValidPenaltyTarget(resolved)) {
                targets.push(resolved);
            }
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    /*
     * Pattern:
     * "Rs.500 penalty @vasanth"
     *
     * Here mentions appearing after the penalty/amount are
     * genuine targets.
     */
    const penaltyIndex = text.search(/\bpenn?alty\b/i);
    const amountPositions = extractAmountPositions(text);
    if (penaltyIndex !== -1) {
        const firstAmountIndex = amountPositions[0]?.index ?? text.length;
        const afterPenalty = text.slice(penaltyIndex, firstAmountIndex);
        const afterPenaltyMentions = extractWhatsAppMentions(afterPenalty);
        if (afterPenaltyMentions.length > 0) {
            const targets = afterPenaltyMentions
                .map(mention => resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap))
                .filter(target => target && isValidPenaltyTarget(target));
            if (targets.length > 0) {
                return [...new Set(targets)];
            }
        }
    }
    /*
     * Pattern:
     * "@BLACKY smart & @vignesh penalty ..."
     *
     * Multiple mentions before the word penalty are targets.
     *
     * But when a single leading mention is immediately followed
     * by "Penalty", retain it as a valid target because examples
     * such as "@BRO Rs.50 penalty" use exactly this form.
     */
    const penaltyMentionMatches = [
        ...text.matchAll(/@\s*(?:⁨([^⁩]+)⁩|([A-Za-z][A-Za-z0-9._~-]*))/g),
    ];
    if (penaltyMentionMatches.length > 0) {
        const targets = [];
        for (const match of penaltyMentionMatches) {
            const mention = match[1] || match[2] || '';
            const mentionIndex = match.index ?? -1;
            if (mentionIndex < 0)
                continue;
            const afterMention = text.slice(mentionIndex + match[0].length);
            const beforeMention = text.slice(0, mentionIndex);
            /*
             * A leading notification mention such as:
             * "@Sheesha Smart Penalty ... @AK"
             *
             * should not win when another explicit target exists.
             */
            if (/\b(?:penalty|pennalty)\b/i.test(afterMention.slice(0, 25)) &&
                penaltyMentionMatches.length > 1) {
                continue;
            }
            const resolved = resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap);
            if (resolved &&
                isValidPenaltyTarget(resolved)) {
                targets.push(resolved);
            }
            void beforeMention;
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    return [];
}
function getExplicitPenaltyTargets(text, allNames, mappings = [], resolver) {
    const cleanText = cleanWhatsAppText(text);
    const numberedMatches = [
        ...cleanText.matchAll(/(?:^|[,;.]|\s)(\d+)\s*[.)]\s*([^,;]+?)(?=\s*(?:[,;]|\d+\s*[.)]|$))/gi),
    ];
    if (numberedMatches.length === 0) {
        return [];
    }
    const targets = [];
    for (const match of numberedMatches) {
        const candidate = String(match[2] || '')
            .replace(/[.]+$/g, '')
            .trim();
        if (!candidate)
            continue;
        const normalized = resolver
            ? resolver.resolve(candidate)
            : (0, attendanceUtils_1.normalizeEmployeeName)(candidate, allNames, mappings);
        const resolved = resolver
            ? resolver.resolveOriginal(normalized)
            : (0, attendanceUtils_1.resolveOriginalEmployeeName)(normalized, mappings);
        if (resolved &&
            isValidPenaltyTarget(resolved)) {
            targets.push(resolved);
        }
    }
    return [...new Set(targets)];
}
function getNamedPenaltyTargets(text, allNames, mappings = [], resolver, canonicalNameKeys) {
    const cleanText = cleanWhatsAppText(text);
    const penaltyIndex = cleanText.search(/\bpenn?alty\b/i);
    if (penaltyIndex === -1) {
        return [];
    }
    const afterPenalty = cleanText.slice(penaltyIndex);
    const nameSectionMatch = afterPenalty.match(/(?:\bfor\b|:)\s+(.+)$/i);
    if (!nameSectionMatch) {
        return [];
    }
    let nameSection = nameSectionMatch[1];
    nameSection = nameSection
        .replace(/(?:₹|rs\.?|inr)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, ' ')
        .replace(/\d+(?:,\d{3})*(?:\.\d+)?\s*(?:rupees?|rs\.?|inr)\b/gi, ' ')
        .replace(/\b\d+\s*[.)]\s*/g, ' ');
    nameSection = nameSection
        .replace(/@\s*(?:⁨[^⁩]+⁩|[A-Za-z][A-Za-z0-9._-]*)/g, ' ');
    const candidates = nameSection
        .split(/,|&|\band\b/i)
        .map(value => value.replace(/[.]+$/g, '').trim())
        .filter(Boolean);
    const targets = [];
    for (const candidate of candidates) {
        if (!isValidPenaltyTarget(candidate)) {
            continue;
        }
        const normalized = resolver
            ? resolver.resolve(candidate)
            : (0, attendanceUtils_1.normalizeEmployeeName)(candidate, allNames, mappings);
        const resolved = resolver
            ? resolver.resolveOriginal(normalized)
            : (0, attendanceUtils_1.resolveOriginalEmployeeName)(normalized, mappings);
        const key = resolved.trim().toLowerCase();
        const isKnown = canonicalNameKeys
            ? canonicalNameKeys.has(key)
            : allNames.some(name => name.trim().toLowerCase() === key);
        if (isKnown &&
            isValidPenaltyTarget(resolved)) {
            targets.push(resolved);
        }
    }
    return [...new Set(targets)];
}
function getContextPenaltyTargets(index, data, date, allNames, mappings = [], resolver, exactNameMap, directTargetCache) {
    const previousTargets = [];
    const nextTargets = [];
    const getCachedTargets = (message) => {
        if (directTargetCache) {
            const cached = directTargetCache.get(message);
            if (cached) {
                return cached;
            }
            const targets = getDirectPenaltyTargets(message, allNames, mappings, resolver, exactNameMap);
            directTargetCache.set(message, targets);
            return targets;
        }
        return getDirectPenaltyTargets(message, allNames, mappings, resolver, exactNameMap);
    };
    if (index > 0) {
        const previousMessage = data[index - 1];
        if (String(previousMessage?.date || '') === date) {
            previousTargets.push(...getCachedTargets(previousMessage));
        }
    }
    if (index + 1 < data.length) {
        const nextMessage = data[index + 1];
        if (String(nextMessage?.date || '') === date) {
            nextTargets.push(...getCachedTargets(nextMessage));
        }
    }
    return [...new Set([
            ...previousTargets,
            ...nextTargets,
        ])];
}
function extractPenaltyReason(text) {
    let reason = cleanWhatsAppText(text);
    reason = reason.replace(/@⁨[^⁩]+⁩/g, ' ');
    reason = reason.replace(/@\s*[A-Za-z][A-Za-z0-9._-]*/gi, ' ');
    reason = reason.replace(/\bpenn?alty\b/gi, ' ');
    reason = reason.replace(/(?:₹|rs\.?|inr)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, ' ');
    reason = reason.replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:rupees?|rs\.?|inr)\b/gi, ' ');
    reason = reason.replace(/\b(?:each|each person|each amount|per person)\b/gi, ' ');
    reason = reason.replace(/\b\d+\s*[.)]\s*/g, ' ');
    return reason
        .replace(/[:\-–—]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function isCancelledPenalty(text) {
    return /\b(?:penalty\s+)?cancel(?:led|ed)\b/i.test(cleanWhatsAppText(text));
}
function hasEachIndicator(text) {
    return /\b(?:each|each person|each amount|per person)\b/i.test(cleanWhatsAppText(text));
}
function extractAmountPositions(text) {
    const cleanText = cleanWhatsAppText(text);
    const amountRegex = /(?:₹|rs\.?|inr)\s*\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:rupees?|rs\.?|inr)\b/gi;
    const positions = [];
    let match;
    while ((match = amountRegex.exec(cleanText)) !== null) {
        const numberMatch = match[0].match(/\d+(?:,\d{3})*(?:\.\d+)?/);
        if (!numberMatch)
            continue;
        positions.push({
            amount: parseFloat(numberMatch[0].replace(/,/g, '')),
            index: match.index,
            end: match.index + match[0].length,
        });
    }
    /*
     * Bare amount fallback.
     */
    if (positions.length === 0 &&
        /\bpenn?alty\b/i.test(cleanText)) {
        const bareAmountRegex = /\b(\d{2,6}(?:\.\d+)?)\b(?!\s*(?:days?|day|hours?|hrs?|minutes?|mins?))(?!(?:\s*[.)]))/gi;
        while ((match = bareAmountRegex.exec(cleanText)) !== null) {
            const value = match[1];
            if (!value)
                continue;
            // Ignore year-like values such as 2024.
            if (/^(?:19|20)\d{2}$/.test(value)) {
                continue;
            }
            positions.push({
                amount: parseFloat(value.replace(/,/g, '')),
                index: match.index,
                end: match.index + match[0].length,
            });
        }
    }
    return positions;
}
function resolveKnownTarget(candidate, allNames, mappings = [], resolver, exactNameMap) {
    const cleanCandidate = cleanWhatsAppText(candidate)
        .replace(/^@/, '')
        .replace(/[,:;]+$/, '')
        .trim();
    if (!cleanCandidate) {
        return '';
    }
    const mentionResolved = resolveMentionToEmployee(cleanCandidate, allNames, mappings, resolver, exactNameMap);
    if (mentionResolved &&
        isValidPenaltyTarget(mentionResolved)) {
        const key = mentionResolved
            .trim()
            .toLowerCase();
        if (exactNameMap?.has(key) ||
            allNames.some(name => name.trim().toLowerCase() === key) ||
            mappings.some(mapping => mapping.employeeName
                .trim()
                .toLowerCase() === key)) {
            return mentionResolved;
        }
    }
    const normalized = resolver
        ? resolver.resolve(cleanCandidate)
        : (0, attendanceUtils_1.normalizeEmployeeName)(cleanCandidate, allNames, mappings);
    const resolved = resolver
        ? resolver.resolveOriginal(normalized)
        : (0, attendanceUtils_1.resolveOriginalEmployeeName)(normalized, mappings);
    const key = resolved
        .trim()
        .toLowerCase();
    const isKnown = exactNameMap?.has(key) ||
        allNames.some(name => name.trim().toLowerCase() === key) ||
        mappings.some(mapping => mapping.employeeName
            .trim()
            .toLowerCase() === key);
    return isKnown && isValidPenaltyTarget(resolved)
        ? resolved
        : '';
}
function extractMentionTargetsBeforeAmount(text, start, end, allNames, mappings = [], resolver, exactNameMap) {
    const before = text.slice(start, end);
    const matches = [
        ...before.matchAll(/@\s*(?:⁨([^⁩]+)⁩|([~A-Za-z][A-Za-z0-9._~-]*))/g),
    ];
    const targets = [];
    for (const match of matches) {
        const mention = match[1] || match[2] || '';
        const mentionIndex = match.index ?? -1;
        if (mentionIndex < 0)
            continue;
        const afterMention = before.slice(mentionIndex + match[0].length);
        // A leading sender/notification mention such as
        // "@Sheesha Smart Penalty ..." is not a target when
        // another explicit target exists.
        if (/\b(?:penalty|pennalty)\b/i.test(afterMention.slice(0, 25)) &&
            matches.length > 1) {
            continue;
        }
        const resolved = resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap);
        if (resolved &&
            isValidPenaltyTarget(resolved)) {
            targets.push(resolved);
        }
    }
    return [...new Set(targets)];
}
function extractAmountSpecificTargets(text, current, previousAmountEnd, nextAmountIndex, allNames, mappings = [], resolver, exactNameMap) {
    const beforeAmount = text.slice(previousAmountEnd, current.index);
    const afterAmount = text.slice(current.end, nextAmountIndex);
    const afterForMatch = afterAmount.match(/^\s*for\s+(.+?)(?=\s+for\s+(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?\b|\s+(?:due|of|also|penalty)\b|$)/i);
    if (afterForMatch) {
        const mentionTargets = extractWhatsAppMentions(afterForMatch[1])
            .map(mention => resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap))
            .filter(target => target && isValidPenaltyTarget(target));
        if (mentionTargets.length > 0) {
            return [...new Set(mentionTargets)];
        }
    }
    const afterForPlain = afterAmount.match(/^\s*(?:for|to)\s+(.+?)(?=\s+(?:due|and|also|penalty)\b|$)/i);
    if (afterForPlain) {
        const candidateText = afterForPlain[1]
            .replace(/(?:₹|rs\.?|inr)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, ' ')
            .trim();
        const candidates = candidateText
            .split(/\s*(?:,|&|\band\b)\s*/i)
            .map(value => value.trim())
            .filter(Boolean);
        const targets = [];
        for (const candidate of candidates) {
            const candidateKey = candidate
                .replace(/^@/, '')
                .trim()
                .toLowerCase();
            const exactKnownName = allNames.find(name => name.trim().toLowerCase() === candidateKey);
            if (!exactKnownName)
                continue;
            const resolved = resolveKnownTarget(exactKnownName, allNames, mappings, resolver, exactNameMap);
            if (resolved && isValidPenaltyTarget(resolved)) {
                targets.push(resolved);
            }
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    /*
     * IMPORTANT:
     * Check plain "for name" BEFORE generic mention extraction.
     *
     * Example:
     * "@Sheesha Smart Note for Abinesh & Vasanth due Penalty ₹450"
     *
     * Sheesha Smart is only the notification mention.
     * Abinesh + Vasanth are the actual targets.
     */
    const plainForBefore = beforeAmount.match(/\bfor\s+(.+?)\s+due\s+penalty\s*$/i);
    if (plainForBefore) {
        const candidateText = plainForBefore[1]
            .trim();
        const candidates = candidateText
            .split(/\s*(?:,|&|\band\b)\s*/i)
            .map(value => value.replace(/^@/, '').trim())
            .filter(Boolean);
        const targets = [];
        for (const candidate of candidates) {
            const candidateKey = candidate.toLowerCase();
            const exactKnownName = allNames.find(name => name.trim().toLowerCase() === candidateKey);
            if (!exactKnownName)
                continue;
            const resolved = resolveKnownTarget(exactKnownName, allNames, mappings, resolver, exactNameMap);
            if (resolved && isValidPenaltyTarget(resolved)) {
                targets.push(resolved);
            }
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    const plainTargetBeforeAmount = beforeAmount.match(/(?:\band\s+|&\s*|,\s*)([A-Za-z][A-Za-z ._-]{0,39})\s*$/i);
    if (plainTargetBeforeAmount) {
        const candidate = plainTargetBeforeAmount[1].trim();
        const resolved = resolveKnownTarget(candidate, allNames, mappings, resolver, exactNameMap);
        if (resolved) {
            return [resolved];
        }
    }
    /*
     * "for @name" immediately before amount.
     */
    const beforeForMention = beforeAmount.match(/\bfor\s+@\s*(?:⁨([^⁩]+)⁩|([~A-Za-z][A-Za-z0-9._~-]*))\s*$/i);
    if (beforeForMention) {
        const resolved = resolveMentionToEmployee(beforeForMention[1] || beforeForMention[2] || '', allNames, mappings, resolver, exactNameMap);
        if (resolved &&
            isValidPenaltyTarget(resolved)) {
            return [resolved];
        }
    }
    /*
     * Mentions immediately after the amount.
     *
     * Example:
     * "Rs.100 penalty @Rajesh @Aadhi"
     *
     * Do NOT use a mention when it starts a new penalty segment.
     */
    const afterMentions = [
        ...afterAmount.matchAll(/@\s*(?:⁨([^⁩]+)⁩|([A-Za-z][A-Za-z0-9._~-]*))/g),
    ];
    if (afterMentions.length > 0) {
        const targets = [];
        for (const match of afterMentions) {
            const mention = match[1] || match[2] || '';
            const mentionStart = match.index ?? -1;
            if (mentionStart < 0)
                continue;
            const afterMention = afterAmount.slice(mentionStart + match[0].length);
            /*
             * If this mention is followed by "also penalty"
             * or another "penalty", it belongs to the next
             * penalty amount, not the current amount.
             *
             * Example:
             * ₹450 ... @AK also penalty ₹1300
             *
             * AK must NOT be assigned to ₹450.
             */
            if (/\b(?:also\s+)?penalty\b/i.test(afterMention.slice(0, 30))) {
                continue;
            }
            const resolved = resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap);
            if (resolved &&
                isValidPenaltyTarget(resolved)) {
                targets.push(resolved);
            }
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    /*
     * Multiple mentions before amount.
     */
    const mentionTargets = extractMentionTargetsBeforeAmount(text, previousAmountEnd, current.index, allNames, mappings, resolver, exactNameMap);
    if (mentionTargets.length > 1) {
        return mentionTargets;
    }
    /*
     * Single mention immediately before penalty/amount.
     */
    if (mentionTargets.length === 1) {
        return mentionTargets;
    }
    /*
     * Generic plain "for name" fallback.
     */
    const genericPlainForBefore = beforeAmount.match(/\bfor\s+(.+?)\s*$/i);
    if (genericPlainForBefore) {
        const candidateText = genericPlainForBefore[1]
            .replace(/\b(?:note|also)\b/gi, ' ')
            .replace(/\b(?:due|penalty)\b/gi, ' ')
            .trim();
        const candidates = candidateText
            .split(/\s*(?:,|&|\band\b)\s*/i)
            .map(value => value.replace(/^@/, '').trim())
            .filter(Boolean);
        const targets = [];
        for (const candidate of candidates) {
            const resolved = resolveKnownTarget(candidate, allNames, mappings, resolver, exactNameMap);
            if (resolved) {
                targets.push(resolved);
            }
        }
        if (targets.length > 0) {
            return [...new Set(targets)];
        }
    }
    return [];
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function getAmountSpecificPenaltyEntries(text, allNames, mappings = [], resolver, exactNameMap, positions) {
    const cleanText = cleanWhatsAppText(text);
    const amountPositions = positions || extractAmountPositions(cleanText);
    if (amountPositions.length === 0) {
        return [];
    }
    const entries = [];
    const each = hasEachIndicator(cleanText);
    for (let i = 0; i < amountPositions.length; i++) {
        const current = amountPositions[i];
        const previousEnd = i > 0
            ? amountPositions[i - 1].end
            : 0;
        const nextStart = i + 1 < amountPositions.length
            ? amountPositions[i + 1].index
            : cleanText.length;
        let targets = extractAmountSpecificTargets(cleanText, current, previousEnd, nextStart, allNames, mappings, resolver, exactNameMap);
        const previousAmountEnd = i > 0 ? amountPositions[i - 1].end : 0;
        const nextAmountIndex = i < amountPositions.length - 1
            ? amountPositions[i + 1].index
            : cleanText.length;
        /*
         * If this amount has no local target, do not blindly assign
         * every mention in the whole message. This is what prevents:
         *
         * ₹450 -> Abinesh + Vasanth
         * ₹1300 -> AK
         *
         * from becoming all people for both amounts.
         */
        if (targets.length === 0) {
            targets = [];
        }
        let reason = '';
        const afterAmount = cleanText.slice(current.end, nextStart).trim();
        if (afterAmount) {
            const dueIndex = afterAmount.search(/\bdue\s+to\b/i);
            if (dueIndex !== -1) {
                reason = afterAmount
                    .slice(dueIndex)
                    .trim();
            }
            else {
                const forIndex = afterAmount.search(/\bfor\b/i);
                if (forIndex !== -1) {
                    reason = afterAmount
                        .slice(forIndex)
                        .trim();
                }
                else {
                    const alsoPenaltyIndex = afterAmount.search(/\balso\s+penalty\b/i);
                    if (alsoPenaltyIndex !== -1) {
                        reason = afterAmount
                            .slice(alsoPenaltyIndex)
                            .trim();
                    }
                    else {
                        reason = afterAmount;
                    }
                }
            }
        }
        if (!reason) {
            const beforeAmount = cleanText.slice(previousEnd, current.index);
            const reasonMatch = beforeAmount.match(/\b(?:due\s+)?(?:penalty\s*)?(?:for\s+)?(.+)$/i);
            if (reasonMatch) {
                const candidateReason = reasonMatch[1]
                    .replace(/\b(?:note|also)\b/gi, ' ')
                    .trim();
                if (candidateReason &&
                    !/^sheesha\s+smart$/i.test(candidateReason)) {
                    reason = candidateReason;
                }
            }
        }
        reason = reason
            .replace(/@⁨[^⁩]+⁩/g, ' ')
            .replace(/@\s*[A-Za-z][A-Za-z0-9._-]*/g, ' ')
            .replace(/\b(?:also\s+)?penalty\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        entries.push({
            amount: current.amount,
            targets,
            reason,
            each,
        });
    }
    return entries;
}
function extractPenaltyEntries(text, directTargets, explicitTargets, allNames, mappings = [], resolver, exactNameMap, amounts, amountPositions) {
    const extractedAmounts = amounts || extractPenaltyAmounts(text);
    if (extractedAmounts.length === 0) {
        return [];
    }
    const amountSpecificEntries = getAmountSpecificPenaltyEntries(text, allNames, mappings, resolver, exactNameMap, amountPositions);
    /*
     * Use amount-specific parsing whenever every amount was
     * successfully associated with at least one target.
     */
    if (amountSpecificEntries.length === extractedAmounts.length &&
        amountSpecificEntries.every(entry => entry.targets.length > 0)) {
        return amountSpecificEntries;
    }
    const each = hasEachIndicator(text);
    const reason = extractPenaltyReason(text);
    const targets = [
        ...new Set([
            ...directTargets,
            ...explicitTargets,
        ]),
    ].filter(isValidPenaltyTarget);
    return extractedAmounts.map(amount => ({
        amount,
        targets,
        reason,
        each,
    }));
}
function extractCancellationTargets(text, allNames, mappings = [], resolver, exactNameMap) {
    const cleanText = cleanWhatsAppText(text);
    const mentions = extractWhatsAppMentions(cleanText);
    if (mentions.length > 0) {
        return mentions
            .map(mention => resolveMentionToEmployee(mention, allNames, mappings, resolver, exactNameMap))
            .filter(target => target && isValidPenaltyTarget(target));
    }
    const afterCancel = cleanText.match(/\bcancel(?:led|ed)\b\s+(?:penalty\s+)?(.+)$/i);
    if (afterCancel) {
        const candidates = afterCancel[1]
            .split(/\s*(?:,|&|\band\b)\s*/i)
            .map(value => value.trim())
            .filter(Boolean);
        return candidates
            .map(candidate => resolveKnownTarget(candidate, allNames, mappings, resolver, exactNameMap))
            .filter(Boolean);
    }
    return [];
}
function normalizePenaltyTargetName(targetName, allNames) {
    const clean = cleanWhatsAppText(targetName)
        .replace(/^@/, '')
        .trim();
    if (!clean) {
        return '';
    }
    const exactName = allNames.find(name => name.trim().toLowerCase() === clean.toLowerCase());
    if (exactName) {
        return exactName;
    }
    const normalized = clean
        .replace(/\s+(?:akka|anna|smart|office|shft|mbt|ayp)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return clean;
    }
    const normalizedName = allNames.find(name => name.trim().toLowerCase() === normalized.toLowerCase());
    return normalizedName || clean;
}
function parsePenalty(data, targetDate, employeeNames = attendanceUtils_1.CUSTOM_NAME_ORDER, mappings = []) {
    const filteredData = targetDate
        ? data.filter(row => row.date === targetDate)
        : data;
    const employeeNameMap = (0, attendanceUtils_1.getEmployeeNameMap)(mappings);
    const allNames = Array.from(new Set([
        ...employeeNames,
        ...attendanceUtils_1.CUSTOM_NAME_ORDER,
        ...data
            .map(row => row.sender)
            .filter(Boolean)
            .map(String),
        ...Object.keys(employeeNameMap),
    ]));
    const resolver = (0, attendanceUtils_1.createNameResolver)(allNames, mappings);
    const exactNameMap = new Map();
    for (const name of allNames) {
        const cleanName = name.trim();
        const key = cleanName.toLowerCase();
        if (!exactNameMap.has(key)) {
            exactNameMap.set(key, cleanName);
        }
    }
    const canonicalNameKeys = new Set(allNames.map(name => name.trim().toLowerCase()));
    const mappingEmployeeNameKeys = new Set(mappings.map(mapping => mapping.employeeName
        .trim()
        .toLowerCase()));
    void mappingEmployeeNameKeys;
    const records = {};
    const lastPenaltyTargets = {};
    const lastPenaltyReasons = {};
    const lastPenaltyRecordKeys = {};
    const directTargetCache = new WeakMap();
    const normalizedTargetCache = new Map();
    const resolvedTargetCache = new Map();
    const resolveFinalTarget = (targetName) => {
        const normalizedTarget = normalizePenaltyTargetName(targetName, allNames);
        if (!normalizedTarget) {
            return '';
        }
        const cachedResolved = resolvedTargetCache.get(targetName);
        if (cachedResolved !== undefined) {
            return cachedResolved;
        }
        let normalizedName = normalizedTargetCache.get(targetName);
        if (normalizedName === undefined) {
            normalizedName =
                resolver.resolve(targetName);
            normalizedTargetCache.set(targetName, normalizedName);
        }
        let name = resolvedTargetCache.get(normalizedName);
        if (name === undefined) {
            name =
                resolver.resolveOriginal(normalizedName);
            resolvedTargetCache.set(normalizedName, name);
        }
        resolvedTargetCache.set(targetName, name);
        return name;
    };
    const getCachedDirectTargets = (msg) => {
        const cached = directTargetCache.get(msg);
        if (cached) {
            return cached;
        }
        const targets = getDirectPenaltyTargets(msg, allNames, mappings, resolver, exactNameMap);
        directTargetCache.set(msg, targets);
        return targets;
    };
    filteredData.forEach((msg, index) => {
        if (!msg?.message) {
            return;
        }
        const text = cleanWhatsAppText(String(msg.message));
        if (!text) {
            return;
        }
        const lowerText = text.toLowerCase();
        const date = String(msg.date ||
            targetDate ||
            '');
        const isPenalty = lowerText.includes('penalty') ||
            lowerText.includes('pennalty');
        const amounts = extractPenaltyAmounts(text);
        const amount = amounts[0] ?? null;
        /*
         * Targeted cancellation:
         * "Cancelled penalty @vasanth"
         *
         * Generic cancellation:
         * "Penalty Cancelled"
         *
         * Existing latest-penalty cancellation behaviour is
         * preserved for generic cancellation.
         */
        if (isPenalty &&
            isCancelledPenalty(text)) {
            const cancellationTargets = extractCancellationTargets(text, allNames, mappings, resolver, exactNameMap);
            if (cancellationTargets.length > 0) {
                cancellationTargets.forEach(targetName => {
                    const name = resolveFinalTarget(targetName);
                    if (!name)
                        return;
                    const key = `${date}-${name}`;
                    delete records[key];
                });
                lastPenaltyRecordKeys[date] =
                    (lastPenaltyRecordKeys[date] || [])
                        .filter(key => {
                        return !cancellationTargets.some(targetName => {
                            const name = resolveFinalTarget(targetName);
                            return key ===
                                `${date}-${name}`;
                        });
                    });
                return;
            }
            const keys = lastPenaltyRecordKeys[date] || [];
            keys.forEach(key => {
                delete records[key];
            });
            delete lastPenaltyRecordKeys[date];
            delete lastPenaltyTargets[date];
            delete lastPenaltyReasons[date];
            return;
        }
        /*
         * Preserve existing behaviour:
         * ignore ordinary messages without a penalty or amount.
         */
        if (!isPenalty && amount === null) {
            return;
        }
        let appliesTo = [];
        let directTargets = [];
        let explicitTargets = [];
        let namedTargets = [];
        if (isPenalty) {
            /*
             * 1. Direct target extraction
             */
            directTargets =
                getCachedDirectTargets(msg);
            if (directTargets.length > 0) {
                appliesTo = directTargets;
            }
            else {
                /*
                 * 2. Numbered explicit targets
                 */
                explicitTargets =
                    getExplicitPenaltyTargets(text, allNames, mappings, resolver);
                if (explicitTargets.length > 0) {
                    appliesTo = explicitTargets;
                }
                else {
                    /*
                     * 3. Named targets after "for"
                     */
                    namedTargets =
                        getNamedPenaltyTargets(text, allNames, mappings, resolver, canonicalNameKeys);
                    if (namedTargets.length > 0) {
                        appliesTo = namedTargets;
                    }
                    else {
                        /*
                         * 4. Existing immediate previous/next
                         * context fallback.
                         */
                        appliesTo =
                            getContextPenaltyTargets(index, filteredData, date, allNames, mappings, resolver, exactNameMap, directTargetCache);
                    }
                }
            }
        }
        const reason = isPenalty
            ? extractPenaltyReason(text)
            : '';
        if (isPenalty &&
            appliesTo.length > 0) {
            lastPenaltyTargets[date] =
                appliesTo;
            if (reason) {
                lastPenaltyReasons[date] =
                    reason;
            }
        }
        /*
         * Amount-only continuation:
         *
         * Penalty message:
         * "@BLACKY & @vignesh penalty ..."
         *
         * Next message:
         * "Each Rs.500"
         *
         * Existing context behaviour is preserved.
         */
        const isAmountOnlyMessage = amount !== null &&
            !isPenalty &&
            !lowerText.includes('check in') &&
            !lowerText.includes('checkin') &&
            !lowerText.includes('check out') &&
            !lowerText.includes('checkout') &&
            !lowerText.includes('login') &&
            !lowerText.includes('logout') &&
            !lowerText.includes('permission') &&
            !lowerText.includes('half day');
        if (isAmountOnlyMessage &&
            lastPenaltyTargets[date]?.length) {
            appliesTo =
                lastPenaltyTargets[date];
        }
        if (isPenalty) {
            const amountPositions = amounts.length > 0
                ? extractAmountPositions(text)
                : [];
            const entries = extractPenaltyEntries(text, directTargets, explicitTargets.length > 0
                ? explicitTargets
                : namedTargets.length > 0
                    ? namedTargets
                    : appliesTo, allNames, mappings, resolver, exactNameMap, amounts, amountPositions);
            if (entries.length > 0) {
                const currentPenaltyKeys = new Set();
                entries.forEach(entry => {
                    if (entry.targets.length === 0) {
                        return;
                    }
                    entry.targets.forEach(targetName => {
                        const name = resolveFinalTarget(targetName);
                        if (!name ||
                            !isValidPenaltyTarget(name)) {
                            return;
                        }
                        const key = `${date}-${name}-${entry.reason.trim().toLowerCase()}`;
                        currentPenaltyKeys.add(key);
                        if (!records[key]) {
                            records[key] = {
                                name,
                                date,
                                displayName: resolver.resolveOriginal(name),
                                penalty: '0',
                                penaltyReason: '',
                            };
                        }
                        const current = parseFloat(records[key].penalty || '0');
                        /*
                         * Keep existing semantics:
                         * when one amount applies to multiple
                         * targets, the amount is added to each
                         * target.
                         *
                         * "each" remains part of the entry model
                         * for compatibility and continuation
                         * messages.
                         */
                        records[key].penalty =
                            (current +
                                entry.amount).toString();
                        if (entry.reason) {
                            records[key].penaltyReason =
                                entry.reason;
                        }
                    });
                });
                if (currentPenaltyKeys.size > 0) {
                    lastPenaltyRecordKeys[date] = [
                        ...currentPenaltyKeys,
                    ];
                }
                return;
            }
        }
        /*
         * Existing amount-only penalty continuation logic.
         */
        if (isAmountOnlyMessage &&
            appliesTo.length > 0) {
            const currentPenaltyKeys = new Set();
            appliesTo.forEach(targetName => {
                const name = resolveFinalTarget(targetName);
                if (!name ||
                    !isValidPenaltyTarget(name)) {
                    return;
                }
                const key = `${date}-${name}`;
                currentPenaltyKeys.add(key);
                if (!records[key]) {
                    records[key] = {
                        name,
                        date,
                        displayName: resolver.resolveOriginal(name),
                        penalty: '0',
                        penaltyReason: '',
                    };
                }
                const current = parseFloat(records[key].penalty || '0');
                records[key].penalty =
                    (current +
                        amount).toString();
                if (lastPenaltyReasons[date]) {
                    records[key].penaltyReason =
                        lastPenaltyReasons[date];
                }
            });
            if (currentPenaltyKeys.size > 0) {
                lastPenaltyRecordKeys[date] = [
                    ...currentPenaltyKeys,
                ];
            }
        }
    });
    return Object.values(records)
        .filter(record => parseFloat(record.penalty || '0') > 0)
        .sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return (0, attendanceUtils_1.sortByName)(a, b, employeeNames);
    });
}
