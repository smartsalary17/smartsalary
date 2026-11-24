const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const dotenv = require('dotenv');
dotenv.config({ path: '../.env' });

const MONGO_URI = process.env.MONGO_URI ;

const smartList = ['vasanth','gokul','sivasankari','rajasekaran','meena','jayamala','girija','prathap','rajesh','prabakaran','mohandass','gopinath','sarala','avinesh','sanjay'];
const mbtList = ['arunkumar','devesh','naresh','shruthi','ragavi','vishnukumar','vishnupriya','gunasri','sanmugapriya','priyadharshini'];

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        let smartUpdated = 0;
        for (const name of smartList) {
            const res = await Employee.updateMany({ name: new RegExp(name, 'i') }, { $set: { dept: 'Smart' } });
            smartUpdated += res.modifiedCount;
            if(res.modifiedCount > 0) console.log(`Smart updated: ${name}`);
        }
        console.log(`Total Smart updated: ${smartUpdated}`);

        let mbtUpdated = 0;
        for (const name of mbtList) {
            const res = await Employee.updateMany({ name: new RegExp(name, 'i') }, { $set: { dept: 'MBT' } });
            mbtUpdated += res.modifiedCount;
            if(res.modifiedCount > 0) console.log(`MBT updated: ${name}`);
        }
        console.log(`Total MBT updated: ${mbtUpdated}`);

    } catch(e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

run();
