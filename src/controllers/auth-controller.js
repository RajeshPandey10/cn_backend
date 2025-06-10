const User = require('../model/userModel'); // Fix this import path
const generateOTP = require('../utils/otp-generator');
const { sendEmail } = require('../utils/nodemailer');

const Register = async (req, res) => {
    try {
        const { name, email, password, phone, address, username } = req.body;
        const otp = generateOTP();
        
        // Validate required fields
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { username: username || name.replace(/\s+/g, '').toLowerCase() },
                { phone: phone }
            ]
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ message: "Email already registered" });
            }
            if (existingUser.username === (username || name.replace(/\s+/g, '').toLowerCase())) {
                return res.status(400).json({ message: "Username already taken" });
            }
            if (existingUser.phone === phone) {
                return res.status(400).json({ message: "Phone number already registered" });
            }
        }

        // Create the user with OTP
        const user = new User({
            name,
            email: email.toLowerCase(),
            password, // Will be hashed by pre-save hook
            username: username || name.replace(/\s+/g, '').toLowerCase(),
            phone,
            address: address || "",
            otp_code: otp,
            otp_expiration: new Date(Date.now() + 10 * 60 * 1000) // OTP expires after 10 minutes
        });

        await user.save();

        // Send OTP via email
        sendEmail(
            email, 
            'Email Verification - CN Mart', 
            `Hi ${name},\n\nYour OTP for email verification is: ${otp}\nThis code will expire in 10 minutes.\n\nThank you,\nCN Mart Team`
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully. Please verify your email with the OTP sent."
        });
    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Registration failed"
        });
    }
};

const ResendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: "Email is required" 
            });
        }
        
        const otp_code = generateOTP();
        const otp_expiration = new Date(Date.now() + 10 * 60 * 1000);

        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { otp_code: otp_code, otp_expiration: otp_expiration },
            { new: true }
        );

        if (!user) { 
            return res.status(404).json({ 
                success: false,
                message: 'User not found' 
            });
        }

        // Send the OTP to the user's email
        sendEmail(
            email, 
            'OTP Resent - CN Mart', 
            `Hi ${user.name},\n\nYour new OTP for email verification is: ${otp_code}\nThis code will expire in 10 minutes.\n\nThank you,\nCN Mart Team`
        );

        return res.status(200).json({ 
            success: true,
            message: 'OTP resent successfully to your email' 
        });
    } catch (error) {
        console.error("Error resending OTP:", error);
        return res.status(500).json({ 
            success: false,
            message: error.message || "Failed to resend OTP" 
        });
    }
};

const VerifyEmail = async (req, res) => {
    try {
        const { email, otp_code } = req.body;
        
        if (!email || !otp_code) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }
        
        const user = await User.findOne({ 
            email: email.toLowerCase(), 
            otp_code: otp_code 
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP or email"
            });
        }

        // Check if OTP is expired
        if (new Date() > new Date(user.otp_expiration)) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        // Check if already verified
        if (user.is_verified) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified"
            });
        }

        // Mark user as verified
        user.is_verified = true;
        user.otp_code = undefined; // Clear OTP
        user.otp_expiration = undefined; // Clear expiration
        
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Email verified successfully"
        });
    } catch (error) {
        console.error("Error verifying email:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to verify email"
        });
    }
};

// Forgot Password - Send OTP
const ForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const otp = generateOTP();
        user.otp_code = otp;
        user.otp_expiration = new Date(Date.now() + 10 * 60 * 1000); // OTP expires in 10 minutes
        await user.save();

        sendEmail(
            email,
            'Password Reset OTP - CN Mart',
            `Hi ${user.name},\n\nYour OTP for password reset is: ${otp}\nThis code will expire in 10 minutes.\n\nThank you,\nCN Mart Team`
        );

        res.status(200).json({ success: true, message: "OTP sent to your email" });
    } catch (error) {
        console.error("Error in ForgotPassword:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
};

// Verify OTP for Password Reset
const VerifyPasswordResetOTP = async (req, res) => {
    try {
        const { email, otp_code } = req.body;

        if (!email || !otp_code) {
            return res.status(400).json({ success: false, message: "Email and OTP are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase(), otp_code });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid OTP or email" });
        }

        if (new Date() > new Date(user.otp_expiration)) {
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }

        res.status(200).json({ success: true, message: "OTP verified successfully" });
    } catch (error) {
        console.error("Error in VerifyPasswordResetOTP:", error);
        res.status(500).json({ success: false, message: "Failed to verify OTP" });
    }
};

// Reset Password
const ResetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.status(400).json({ success: false, message: "Email and new password are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        user.password = newPassword; // Will be hashed by pre-save hook
        user.otp_code = undefined; // Clear OTP
        user.otp_expiration = undefined; // Clear OTP expiration
        await user.save();

        res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        console.error("Error in ResetPassword:", error);
        res.status(500).json({ success: false, message: "Failed to reset password" });
    }
};

module.exports = { Register, ResendOTP, VerifyEmail, ForgotPassword, VerifyPasswordResetOTP, ResetPassword };