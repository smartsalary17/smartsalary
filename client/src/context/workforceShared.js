import { createContext, useContext } from 'react';

export const WorkforceContext = createContext();

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAYSHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DEFAULT_PRODUCTION_API_BASE = 'https://smartsalary-ibct.onrender.com';
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const productionApiBase = import.meta.env.PROD ? DEFAULT_PRODUCTION_API_BASE : '';

export const API_BASE = (configuredApiBase || productionApiBase).replace(/\/+$/, '');
export const defaultRules = { grace: 10, lateN: 3, lateType: 'halfday', lateFixed: 500 };

export const useWorkforce = () => useContext(WorkforceContext);
