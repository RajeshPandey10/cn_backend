const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../src/model/userModel');

async function hashPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);

    const users = await User.find();
    for (const user of users) {
      if (!user.password.startsWith('$2b$')) { // Check if password is not hashed
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(user.password, salt);
        user.password = hashedPassword;
        await user.save();
        console.log(`Password for user ${user.email} has been hashed.`);
      }
    }

    console.log('Password hashing completed.');
    mongoose.disconnect();
  } catch (error) {
    console.error('Error hashing passwords:', error);
  }
}

hashPasswords();
