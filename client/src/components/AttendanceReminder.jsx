import { useEffect } from 'react';
import { useWorkforce } from '../context/workforceShared';
import { useToast } from '../context/ToastContext';

const AttendanceReminder = () => {
    const { attendance } = useWorkforce();
    const { showToast } = useToast();

    useEffect(() => {
        // Browser Notification Permission கேக்கணும்
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const checkAttendance = () => {
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            
            // 👇 change time here if need to change ( 10:00 Pm then use 22:00)
            const targetHour = 11; 
            const targetMinute = 30; 

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