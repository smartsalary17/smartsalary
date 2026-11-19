const axios = require('axios');
const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '../.env' });

const MONGO_URI = process.env.MONGO_URI;

const getBiometricConfigs = () => {
    return [
        {
            corpId: process.env.ETIMEO_CORPORATE_ID || 'MICROBOTWARE',
            username: process.env.ETIMEO_USERNAME || 'DHAMODHARAN',
            password: process.env.ETIMEO_PASSWORD || 'sana@6789'
        },
        {
            corpId: process.env.ETIMEO_CORPORATE_ID_2,
            username: process.env.ETIMEO_USERNAME_2 ,
            password: process.env.ETIMEO_PASSWORD_2 
        }
    ].filter(config => config.corpId && config.username && config.password);
};

const getBiometricCredentials = (config) => {
    const rawString = `${config.corpId}:${config.username}:${config.password}:true`;
    return `Basic ${Buffer.from(rawString).toString('base64')}`;
};

const run = async () => {
    let output = '# Employee Comparison Report\n\n';

    try {
        await mongoose.connect(MONGO_URI);
        const mongoEmployees = await Employee.find().sort({ id: 1 }).lean();
        
        output += '## MongoDB Database Employees\n\n';
        output += '| Employee ID | Name | Department |\n';
        output += '|---|---|---|\n';
        mongoEmployees.forEach(emp => {
            output += `| ${emp.id} | ${emp.name} | ${emp.dept || 'N/A'} |\n`;
        });
        output += '\n\n';

        const date = new Date();
        const apiDateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        
        output += `## Biometric System Employees (Active on ${apiDateStr})\n\n`;
        
        const configs = getBiometricConfigs();
        for (const config of configs) {
            const credentials = getBiometricCredentials(config);
            const url = `https://api.etimeoffice.com/api/DownloadInOutPunchData?Empcode=ALL&FromDate=${apiDateStr}&ToDate=${apiDateStr}`;
            
            try {
                const response = await axios.get(url, { headers: { 'Authorization': credentials } });
                const data = response.data.InOutPunchData || [];
                
                output += `### CorpID: ${config.corpId}\n\n`;
                output += '| Employee ID | Name |\n';
                output += '|---|---|\n';
                
                data.forEach(record => {
                    output += `| ${record.Empcode} | ${record.Name} |\n`;
                });
                output += '\n\n';
            } catch(e) {
                output += `*Error fetching from ${config.corpId}: ${e.message}*\n\n`;
            }
        }

        fs.writeFileSync('../employee_comparison.md', output);
        console.log('Report generated at ../employee_comparison.md');

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
