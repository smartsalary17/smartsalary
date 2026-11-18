import { useEffect } from 'react';
import { useWorkforce } from '../context/workforceShared';
import { useToast } from '../context/ToastContext';
import { ATTENDANCE_REMINDER_TIME } from '../context/workforceShared';

const AttendanceReminder = () => {
    const { attendance } = useWorkforce();
    const { showToast } = useToast();

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const checkAttendance = () => {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            
            const { hour: targetHour, minute: targetMinute } = ATTENDANCE_REMINDER_TIME;

            const isPastTime = now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMinute);

            if (isPastTime) {
                const todayAttendance = attendance[todayStr] || {};
                const hasAnyAttendance = Object.keys(todayAttendance).length > 0;
                

                const lastNotified = localStorage.getItem('last_attendance_notified');

                if (!hasAnyAttendance && lastNotified !== todayStr) {
                    // 1. In-app Toast
                    showToast('Reminder: Today\'s attendance has not been registered yet!', 'error');
                    
                    // 2. Browser Native Notification
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification("Smart Salary Reminder", {
                            body: "Today's attendance has not been registered yet. Please update it.",
                            icon: "/logo.png" 
                        });
                    }

                    localStorage.setItem('last_attendance_notified', todayStr);
                }
            }
        };

        const interval = setInterval(checkAttendance, 60000);
        

        checkAttendance(); 

        return () => clearInterval(interval);
    }, [attendance, showToast]);

    return null;
};

export default AttendanceReminder;