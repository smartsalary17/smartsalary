import { createContext, useContext } from 'react';

export const WorkforceContext = createContext();

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYSHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// const DEFAULT_PRODUCTION_API_BASE = 'https://smartsalary-ibct.onrender.com';
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const productionApiBase = import.meta.env.PROD ? DEFAULT_PRODUCTION_API_BASE : '';

export const API_BASE = (configuredApiBase || productionApiBase).replace(/\/+$/, '');
export const defaultRules = { grace: 10, lateN: 3, lateType: 'halfday', lateFixed: 500 };

export const useWorkforce = () => useContext(WorkforceContext);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BONUS TIME RANGES  (single place to change)
//
// Time format: 24-hour "HH:mm"
//   from            â†’ inclusive start
//   to              â†’ if `inclusiveTo: true`, `to` is also counted
//                     if `inclusiveTo: false`, stops one minute before `to`
//   amount          â†’ â‚¹ per occurrence
//
// Example:
//   earlyCheckin : 02:15 â†’ 02:45  (both inclusive)   â†’ â‚¹200
//   morningCheckin: 04:00 â†’ 05:00 (05:00 NOT counted) â†’ â‚¹150
//   morningBatch : 05:00 â†’ 06:00 (06:00 NOT counted) â†’ â‚¹100
//
// So 04:59:59 â†’ Morning,  05:00:00 â†’ Batch.
// Change these values anytime â€” Calculator picks them up automatically.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const BONUS_TIME_RANGES = {
  earlyCheckin:   { from: '02:15', to: '02:45', amount: 200, inclusiveTo: true  },
  morningCheckin: { from: '05:00', to: '05:15', amount: 150, inclusiveTo: false },
  morningBatch:   { from: '05:15', to: '06:30', amount: 100, inclusiveTo: false },
};

