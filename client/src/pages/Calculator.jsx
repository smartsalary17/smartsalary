import React, { useState, useMemo, useEffect } from 'react';
import { useWorkforce, MONTHS, BONUS_TIME_RANGES } from '../context/workforceShared';
import { API_BASE } from '../context/workforceShared'; 
import { Download, Calculator as CalcIcon, RefreshCcw } from 'lucide-react';
import html2canvas from 'html2canvas';

const COCO_PENALTY_TTL = 5 * 60 * 1000;   // 5 minutes
let cocoPenaltyCache = { data: null, timestamp: 0 };

// ── Only these three employees get the Reviews field ──
const REVIEW_EMPLOYEES = ['gunasri', 'sireesha', 'vishnukumar'];

// Normalize any stored time ("2:30 AM", "2.30", "0230", "02:30:00", "14:30") to "HH:mm".
const normalizeTimeToHHmm = (timeStr) => {
    if (!timeStr) return '';

    let normalized = String(timeStr).toLowerCase().replace(/\s+/g, '');

    let pm = false;
    let am = false;
    if (normalized.includes('pm')) { pm = true; normalized = normalized.replace('pm', ''); }
    else if (normalized.includes('am')) { am = true; normalized = normalized.replace('am', ''); }

    normalized = normalized.replace(/\./g, ':');

    let h = 0;
    let m = 0;

    if (normalized.includes(':')) {
        const parts = normalized.split(':');
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
    } else {
        const num = parseInt(normalized, 10) || 0;
        if (num >= 100) { h = Math.floor(num / 100); m = num % 100; }
        else { h = num; m = 0; }
    }

    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;

    if (h < 0 || h > 23 || m < 0 || m > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Check whether a time falls inside one of the BONUS_TIME_RANGES entries.
const isTimeInRange = (timeStr, range) => {
    if (!range?.from || !range?.to) return false;
    const time = normalizeTimeToHHmm(timeStr);
    if (!time) return false;
    if (range.inclusiveTo) return time >= range.from && time <= range.to;
    return time >= range.from && time < range.to;
};

const Calculator = () => {
    const { employees, attendance, rules } = useWorkforce();

    const [selEmpId, setSelEmpId] = useState('');
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [basic, setBasic] = useState('');
    const [workedDays, setWorkedDays] = useState('');
    const [otHours, setOtHours] = useState('');
    const [earlyCount, setEarlyCount] = useState('');
    const [morningCount, setMorningCount] = useState('');
    const [batchCount, setBatchCount] = useState('');
    const [allowance, setAllowance] = useState('');
    const [extraDays, setExtraDays] = useState('');
    const [penalty, setPenalty] = useState('');
    const [expense, setExpense] = useState('');
    const [lateDays, setLateDays] = useState('');
    const [reviewCount, setReviewCount] = useState(''); // ← NEW
    const [showResult, setShowResult] = useState(false);

    const [cocoPenaltyData, setCocoPenaltyData] = useState(null);
    const [lastAutoFilledPenalty, setLastAutoFilledPenalty] = useState('');
    // ── Determine if the selected employee gets the Reviews field ──
    const showReviews = useMemo(() => {
        const emp = employees.find(e => e.id === selEmpId);
        if (!emp) return false;
        return REVIEW_EMPLOYEES.some(name =>
            emp.name.toLowerCase().includes(name)
        );
    }, [selEmpId, employees]);

    useEffect(() => {
    if (!selEmpId) return;

    let cancelled = false;

    const fetchPenalty = async () => {
        // Use cache if fresh
        if (
            cocoPenaltyCache.data &&
            Date.now() - cocoPenaltyCache.timestamp < COCO_PENALTY_TTL
        ) {
            if (!cancelled) setCocoPenaltyData(cocoPenaltyCache.data);
            return;
        }

        try {
            const token = localStorage.getItem('wf_auth_token');
            const res = await fetch(`${API_BASE}/api/penalty-report?month=${month + 1}&year=${year}`, {
                method: 'GET',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
const records = Array.isArray(data?.records) ? data.records.map(r => ({
    name: r.name,
    empId: r.employeeId || '',
    date: r.date,           // already YYYY-MM-DD
    penalty: r.penalty,
    penaltyReason: r.penaltyReason
})) : [];
cocoPenaltyCache = { data: records, timestamp: Date.now() };

            if (!cancelled) setCocoPenaltyData(records);
        } catch (err) {
            console.error('COCO penalty fetch failed:', err);
            if (!cancelled) setCocoPenaltyData([]);
        }
    };

    fetchPenalty();
    return () => { cancelled = true; };
}, [selEmpId]);

    // ── Auto-populate when employee / date changes ──
useEffect(() => {
    if (!selEmpId) return;
    const emp = employees.find(e => e.id === selEmpId);
    if (emp) setBasic(parseFloat(emp.salary) || 0);

    let worked = 0, late = 0, takenWeekOffs = 0;
    let early = 0, morning = 0, batch = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const att = attendance[dateStr]?.[selEmpId];
        
        const isWorkedStatus = att?.status === 'present' || att?.status === 'late' || att?.status === 'holiday' || att?.status === 'weekoff';
        const isEarly = isTimeInRange(att?.time, BONUS_TIME_RANGES.earlyCheckin);
        
        let dayWorked = 0;
        if (isWorkedStatus || isEarly) {
            dayWorked = 1;
        } else if (att?.status === 'half-day') {
            dayWorked = 0.5;
        }
        worked += dayWorked;
        
        if (att?.status === 'late') late++;
        if (att?.status === 'weekoff') takenWeekOffs++;
        if (isEarly) early++;
        if (isTimeInRange(att?.time, BONUS_TIME_RANGES.morningCheckin)) morning++;
        if (isTimeInRange(att?.time, BONUS_TIME_RANGES.morningBatch)) batch++;
    }
    setWorkedDays(worked);
    setLateDays(late);
    setEarlyCount(early);
    setMorningCount(morning);   // ← auto
    setBatchCount(batch);       // ← auto

    // Extra working days logic: 4 week-offs allowed. Unused week-offs = extra working days.
    setExtraDays(Math.max(0, 4 - takenWeekOffs));
}, [selEmpId, month, year, employees, attendance]);

// Auto-fill penalty from COCO for selected employee + month
useEffect(() => {
    if (!selEmpId || !cocoPenaltyData) return;

    const emp = employees.find(e => e.id === selEmpId);
    if (!emp) return;

    const monthStr = String(month + 1).padStart(2, '0');
    const monthPrefix = `${year}-${monthStr}`;

const normalizePenaltyDate = (d) => String(d || '').trim();

    const empIdStr = String(selEmpId).trim().toLowerCase();
    const empNameStr = String(emp.name || '').trim().toLowerCase();

    const total = cocoPenaltyData
        .filter(p => {
            const recEmpId = String(p.empId || '').trim().toLowerCase();
            const recName = String(p.name || '').trim().toLowerCase();

            const matchesEmp =
                (recEmpId && recEmpId === empIdStr) ||
                (empNameStr && recName === empNameStr);

            if (!matchesEmp) return false;

            const iso = normalizePenaltyDate(p.date);
            return iso && iso.startsWith(monthPrefix);
        })
        .reduce((sum, p) => {
            const amt = parseFloat(p.penalty || 0);
            return sum + (Number.isFinite(amt) ? amt : 0);
        }, 0);

    const nextValue = total > 0 ? String(total) : '';

    // Only auto-fill if user hasn't manually overridden
    if (penalty === '' || penalty === lastAutoFilledPenalty) {
        setPenalty(nextValue);
        setLastAutoFilledPenalty(nextValue);
    }
}, [selEmpId, month, year, employees, cocoPenaltyData, penalty, lastAutoFilledPenalty]);

    // ── Strictly reset manual fields ONLY when the employee selection changes ──
useEffect(() => {
    setOtHours('');
    setAllowance('');
    setPenalty('');
    setExpense('');
    setReviewCount('');
    setLastAutoFilledPenalty(''); 
}, [selEmpId]);

// ── Reset penalty when month/year changes so COCO value can re-fill ──
useEffect(() => {
    setPenalty('');
    setLastAutoFilledPenalty('');
}, [month, year]);


    const results = useMemo(() => {
        const safeBasic = Number(basic) || 0;
        const safeWorked = Number(workedDays) || 0;
        const safeOt = Number(otHours) || 0;
        const safeEarly = Number(earlyCount) || 0;
        const safeMorning = Number(morningCount) || 0;
        const safeBatch = Number(batchCount) || 0;
        const safeAllowance = Number(allowance) || 0;
        const safeExtra = Number(extraDays) || 0;
        const safePenalty = Number(penalty) || 0;
        const safeExpense = Number(expense) || 0;
        const safeLateDays = Number(lateDays) || 0;
        const safeReviews = showReviews ? (Number(reviewCount) || 0) : 0; // ← NEW

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const perDay = safeBasic / daysInMonth;

        const basicAmt = perDay * safeWorked;
        const otAmt = safeOt * 100;
        const earlyAmt = safeEarly * 200;
        const morningAmt = safeMorning * 150;
        const batchAmt = safeBatch * 100;
        const extraAmt = safeExtra * perDay;
        const reviewAmt = safeReviews * 20; // ← NEW  ₹20 per review

        let latePenaltyAmt = 0;
        if (rules?.lateType === 'halfday') {
            latePenaltyAmt = Math.floor(safeLateDays / (rules?.lateN || 3)) * (perDay / 2);
        } else {
            latePenaltyAmt = Math.floor(safeLateDays / (rules?.lateN || 3)) * (rules?.lateFixed || 500);
        }

        const totalAdd = basicAmt + otAmt + earlyAmt + morningAmt + batchAmt + safeAllowance + extraAmt + reviewAmt;
        const totalDed = safePenalty + safeExpense + latePenaltyAmt;
        const net = totalAdd - totalDed;

        return {
            perDay, basicAmt, otAmt, earlyAmt, morningAmt, batchAmt,
            extraAmt, latePenaltyAmt, reviewAmt,       // ← reviewAmt added
            penalty: safePenalty, expense: safeExpense,
            allowance: safeAllowance,
            daysInMonth,
            monthlyBasic: safeBasic,
            net: Number(net.toFixed(2)) || 0
        };
    }, [basic, workedDays, otHours, earlyCount, morningCount, batchCount,
        allowance, extraDays, penalty, expense, lateDays, reviewCount,
        showReviews, rules, month, year]);

    const empName = employees.find(e => e.id === selEmpId)?.name || '';

    // ── Download ──
    const handleDownload = async () => {
        const wrap = document.createElement('div');
        wrap.style.cssText = `
            position:fixed; top:-9999px; left:-9999px; width:900px;
            background:#ffffff; font-family:'Inter','Outfit',sans-serif;
            padding:40px 48px; box-sizing:border-box;
        `;

        const row = (label, value, valueColor = '#111827') => `
            <tr>
                <td style="padding:10px 0;font-size:15px;color:#1e293b;font-weight:500;width:50%;border-bottom:1px solid #f1f5f9;">${label}</td>
                <td style="padding:10px 0;font-size:15px;color:${valueColor};font-weight:700;text-align:right;width:50%;border-bottom:1px solid #f1f5f9;">${value}</td>
            </tr>`;

        // ── Conditionally include the Reviews row in the download ──
        const reviewRow = showReviews
            ? row(`Reviews (${reviewCount || 0}) (+)`, `₹${results.reviewAmt.toFixed(2)}`, '#16a34a')
            : '';

        wrap.innerHTML = `
            <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1e293b;">
                <p style="font-size:25px;font-weight:800;color:#1e293b;margin:0;">
                    Salary Statement for <span style="color:#ef4444;text-decoration:underline;">${empName}</span>
                </p>
                <p style="font-size:15px;color:#64748b;margin:4px 0 0 0;">${MONTHS[month]} ${year}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
                <tbody>
                    <tr><td colspan="2" style="padding:0;">
                        <table style="width:100%;border-collapse:collapse;"><tbody>
                            <tr>
                                <td style="width:50%;vertical-align:top;padding-right:32px;">
                                    <table style="width:100%;border-collapse:collapse;"><tbody>
                                        ${row(`Monthly Basic( ${results.daysInMonth} Days = ₹${results.perDay.toFixed(2)}/day )`, `₹${results.monthlyBasic.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                                        ${row(`Basic Salary (${workedDays || 0} Days)`, `₹${results.basicAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                                        ${row(`Early Check-in (${earlyCount || 0})`, `₹${results.earlyAmt.toFixed(2)}`)}
                                        ${row(`Morning Batch (${batchCount || 0})`, `₹${results.batchAmt.toFixed(2)}`)}
                                        ${row(`Extra Days (${extraDays || 0} Days) (+)`, `₹${results.extraAmt.toFixed(2)}`, '#16a34a')}
                                        ${reviewRow}
                                        ${row('Expense (-)', `₹${results.expense.toFixed(2)}`, '#dc2626')}
                                    </tbody></table>
                                </td>
                                <td style="width:50%;vertical-align:top;padding-left:32px;border-left:1px solid #e2e8f0;">
                                    <table style="width:100%;border-collapse:collapse;"><tbody>
                                        ${row(`OT Amount (${otHours || 0} Hrs)`, `₹${results.otAmt.toFixed(2)}`)}
                                        ${row(`Morning Check-in (${morningCount || 0})`, `₹${results.morningAmt.toFixed(2)}`)}
                                        ${row('Allowance (+)', `₹${results.allowance.toFixed(2)}`, '#16a34a')}
                                        ${row('Penalty (-)', `₹${results.penalty.toFixed(2)}`, '#dc2626')}
                                        ${row(`Late Penalty (${lateDays || 0} Days) (-)`, `₹${results.latePenaltyAmt.toFixed(2)}`, '#dc2626')}
                                    </tbody></table>
                                </td>
                            </tr>
                        </tbody></table>
                    </td></tr>
                </tbody>
            </table>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-top:2px solid #1e293b;margin-top:8px;">
                <span style="font-size:18px;font-weight:800;color:#1e293b;">Net Payable Salary</span>
                <span style="font-size:28px;font-weight:900;color:#16a34a;">₹${results.net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>`;

        document.body.appendChild(wrap);
        try {
            const canvas = await html2canvas(wrap, {
                scale: 3, backgroundColor: '#ffffff',
                useCORS: true, logging: false, width: 900, windowWidth: 900,
            });
            const link = document.createElement('a');
            link.download = `Salary_Statement_${empName}_${MONTHS[month]}_${year}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 1.0);
            link.click();
        } finally {
            document.body.removeChild(wrap);
        }
    };

    return (
        <div className="pg active">
            <section className="calculator-card" style={{ marginTop: 0 }}>
                <div className="input-grid">
                    <div className="input-group full-width">
                        <label>Employee Name</label>
                        <select value={selEmpId} onChange={(e) => setSelEmpId(e.target.value)}>
                            <option value="" disabled>Select Employee</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Select Month</label>
                        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
                            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                    </div>
                    <div className="input-group">
                        <label>Year</label>
                        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} />
                    </div>
                    <div className="input-group">
                        <label>Monthly Basic Salary (₹)</label>
                        <div className="currency-input">
                            <span>₹</span>
                            <input type="number" value={basic} onChange={(e) => setBasic(e.target.value)} />
                        </div>
                    </div>
                    <div className="input-group">
                        <label>Total Worked Days</label>
                        <input type="number" value={workedDays} onChange={(e) => setWorkedDays(e.target.value)} step="0.5" />
                    </div>
                    <div className="input-group">
                        <label>Early Check-in (₹200)</label>
                        <input type="number" value={earlyCount} onChange={(e) => setEarlyCount(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>Morning Check-in (₹150)</label>
                        <input type="number" value={morningCount} onChange={(e) => setMorningCount(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>Morning Batch (₹100)</label>
                        <input type="number" value={batchCount} onChange={(e) => setBatchCount(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>Allowance (Addition ₹)</label>
                        <input type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} className="input-added" />
                    </div>
                    <div className="input-group">
                        <label>Penalty (Deduction ₹)</label>
                        <input
    type="number"
    value={penalty}
    onChange={(e) => {
        setPenalty(e.target.value);
        setLastAutoFilledPenalty('');   // ← user typed → stop auto-filling
    }}
    className="input-deducted"
/>
                    </div>
                    <div className="input-group">
                        <label>Expense (Deduction ₹)</label>
                        <input type="number" value={expense} onChange={(e) => setExpense(e.target.value)} className="input-deducted" />
                    </div>
                    <div className="input-group">
                        <label>Late Check-in (Days)</label>
                        <input type="number" value={lateDays} onChange={(e) => setLateDays(e.target.value)} />
                    </div>
                    <div className="input-group">
                        <label>Extra working Days</label>
                        <input type="number" value={extraDays} onChange={(e) => setExtraDays(e.target.value)} />
                    </div>
                    <div className="input-group full-width">
                        <label>Overtime Hours (₹100/hr)</label>
                        <input type="number" value={otHours} onChange={(e) => setOtHours(e.target.value)} />
                    </div>

                    {/* ── Reviews field — visible only for Gunasri, Shreesha, Vishnu ── */}
                    {showReviews && (
                        <div className="input-group full-width">
                            <label>Reviews (₹20 per review)</label>
                            <input
                                type="number"
                                value={reviewCount}
                                onChange={(e) => setReviewCount(parseInt(e.target.value) || 0)}
                                className="input-added"
                                min="0"
                            />
                        </div>
                    )}
                </div>

                <div className="stats-grid calc-stats">
                    <div className="stat-item">
                        <span className="stat-label">Per Day Rate</span>
                        <span className="stat-value">₹{(results.perDay || 0).toFixed(2)}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Half Day Rate</span>
                        <span className="stat-value">₹{((results.perDay || 0) / 2).toFixed(2)}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Payable Days</span>
                        <span className="stat-value">{(Number(workedDays) || 0) + (Number(extraDays) || 0)}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Total Deductions</span>
                        <span className="stat-value" style={{ color: 'var(--danger)' }}>
                            ₹{((Number(penalty) || 0) + (Number(expense) || 0) + (Number(results.latePenaltyAmt) || 0)).toFixed(0)}
                        </span>
                    </div>
                </div>

                <div className="action-row" style={{ display: 'flex', gap: '10px' }}>
                    <button className="primary-btn" onClick={() => setShowResult(true)}>
                        <CalcIcon size={18} style={{ marginRight: '8px' }} />
                        Calculate Salary
                    </button>
                    <button className="secondary-btn" onClick={() => setShowResult(false)}>
                        <RefreshCcw size={18} style={{ marginRight: '8px' }} />
                        Reset
                    </button>
                </div>

                <div className="divider"></div>

                {showResult && (
                    <div id="result-section" className="result-container" style={{ animation: 'slideUpFade 0.4s forwards' }}>
                        <div className="result-header">
                            <h3>
                                Salary Statement for{' '}
                                <span className="name-highlight">{empName}</span>
                            </h3>
                            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {MONTHS[month]} {year}
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px', marginBottom: '20px' }}>
                            {/* Left column */}
                            <div>
                                {[
                                    { label: `Monthly Basic(${results.daysInMonth} Days = ₹${results.perDay.toFixed(2)}/day )`, value: `₹${results.monthlyBasic.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#000000ff' },
                                    { label: `Basic Salary (${workedDays || 0} Days)`, value: `₹${results.basicAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: '#111827' },
                                    { label: `Early Check-in (${earlyCount || 0})`, value: `₹${results.earlyAmt.toFixed(2)}`, color: '#111827' },
                                    { label: `Morning Batch (${batchCount || 0})`, value: `₹${results.batchAmt.toFixed(2)}`, color: '#111827' },
                                    { label: `Extra Days (${extraDays || 0} Days) (+)`, value: `₹${results.extraAmt.toFixed(2)}`, color: '#16a34a' },
                                    // ── Reviews row (left column, only when applicable) ──
                                    ...(showReviews ? [{ label: `Reviews (${reviewCount || 0}) (+)`, value: `₹${results.reviewAmt.toFixed(2)}`, color: '#16a34a' }] : []),
                                    { label: 'Expense (-)', value: `₹${results.expense.toFixed(2)}`, color: '#dc2626' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>{label}</span>
                                        <span style={{ fontSize: '14px', color, fontWeight: '700' }}>{value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Right column */}
                            <div>
                                {[
                                    { label: `OT Amount (${otHours || 0} Hrs)`, value: `₹${results.otAmt.toFixed(2)}`, color: '#111827' },
                                    { label: `Morning Check-in (${morningCount || 0})`, value: `₹${results.morningAmt.toFixed(2)}`, color: '#111827' },
                                    { label: 'Allowance (+)', value: `₹${results.allowance.toFixed(2)}`, color: '#16a34a' },
                                    { label: 'Penalty (-)', value: `₹${results.penalty.toFixed(2)}`, color: '#dc2626' },
                                    { label: `Late Penalty (${lateDays || 0} Days) (-)`, value: `₹${results.latePenaltyAmt.toFixed(2)}`, color: '#dc2626' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>{label}</span>
                                        <span style={{ fontSize: '14px', color, fontWeight: '700' }}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="net-salary">
                            <span className="net-label">Net Payable Salary</span>
                            <span className="net-value">₹{results.net.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>

                        <div className="download-row">
                            <button className="secondary-btn download-btn" onClick={handleDownload}>
                                <Download size={18} style={{ marginRight: '8px' }} />
                                Download Statement (JPEG)
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Calculator;
