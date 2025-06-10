const nodemailer = require('nodemailer')
require('dotenv').config()

function sendEmail(email, subject, message) {
    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: process.env.MAIL_PORT,
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASSWORD,
        },
    })

    const mailOptions = {
        from: process.env.MAIL_USER,
        to: email,
        subject,
        text: message,
    }

    transporter.sendMail(mailOptions)
}

module.exports = { sendEmail }