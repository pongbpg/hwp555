import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import Employee from './models/Employee.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hr_system';

async function run() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';

  const existing = await Employee.findOne({ email });
  if (existing) {
    console.log('Admin user already exists:', email);
  } else {
    const hashed = await bcrypt.hash(password, 10);
    const admin = new Employee({
      firstName: 'Admin',
      lastName: 'User',
      email,
      password: hashed,
      position: 'Owner',
      department: 'Management',
      salary: 0,
      hireDate: new Date(),
      role: 'owner',
    });
    await admin.save();
    console.log('Admin user created:', email);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
