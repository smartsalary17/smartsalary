import { createContext, useContext } from 'react';

export const WorkforceContext = createContext();

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYSHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// const DEFAULT_PRODUCTION_API_BASE = 'https://smartsalary-ibct.onrender.com';
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();

export const API_BASE = configuredApiBase.replace(/\/+$/, '');
export const defaultRules = { grace: 10, lateN: 3, lateType: 'halfday', lateFixed: 500 };

export const useWorkforce = () => useContext(WorkforceContext);

export const BONUS_TIME_RANGES = {
  earlyCheckin:   { from: '02:15', to: '02:45', amount: 200, inclusiveTo: true  },
  morningCheckin: { from: '05:00', to: '05:15', amount: 150, inclusiveTo: false },
  morningBatch:   { from: '05:15', to: '06:30', amount: 100, inclusiveTo: false },
};


