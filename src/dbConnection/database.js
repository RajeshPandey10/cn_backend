const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Connect to MongoDB
const connectDB = () => {
    const mongoURL = process.env.MONGODB_URL;
    console.log('MongoDB URL:', mongoURL); // Debugging line
    if (!mongoURL) {
        console.error('MONGODB_URL is not defined in the environment variables.');
        return;
    }
    mongoose.connect(mongoURL)
    .then(() => console.log('Successfully connected to MongoDB.'))
    .catch(err => console.error('Could not connect to MongoDB:', err));
};

module.exports = connectDB;
