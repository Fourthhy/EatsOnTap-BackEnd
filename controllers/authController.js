import User from "../models/user.js";
import classAdviser from "../models/classAdviser.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto"; // 🟢 REQUIRED for generating tokens
import sendEmail from "../utils/email.js"; // 🟢 REQUIRED for sending emails

// 🟢 IMPORT LOGGER SERVICE
import { logAction } from "./systemLoggerController.js"

// Helper: Generate Token
const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1d',
    });
}

// ------------------------------------------------------------------
// 🟢 RESET PASSWORD (FORGOT PASSWORD FLOW)
// ------------------------------------------------------------------
const resetPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // 1. Check if user exists (No domain check here, just DB lookup)
        let user = await User.findOne({ email });
        let userType = 'User';

        if (!user) {
            user = await classAdviser.findOne({ email });
            userType = 'ClassAdviser';
        }

        if (!user) {
            return res.status(404).json({ message: "No account found with that email address." });
        }

        // 2. Generate Random Reset Token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // 3. Update User Fields
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        // 🟢 NEW: Force them to change password next time they login
        user.isRequiredChangePassword = true;

        await user.save({ validateBeforeSave: false });

        // 4. Construct URL and Send Email
        const frontendURL = "https://eats-on-tap-front-end.vercel.app";
        // Ensure you point to your actual frontend address
        const localhost = 'http://localhost:5173';

        const resetURL = `${localhost}/loginRegistration/${resetToken}/${user.email}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Password Reset Request',
                template: 'passwordReset',
                data: {
                    firstName: user.first_name || "User",
                    url: resetURL
                }
            });

            await logAction(
                { id: user._id, type: userType, name: user.email, role: user.role || 'UNKNOWN' },
                'RESET_PASSWORD_REQUEST',
                'SUCCESS',
                { description: `Password reset requested. Account flagged to require change.` }
            );

            res.status(200).json({
                message: "An email has been sent. You will be required to set a new password upon login."
            });

        } catch (err) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            user.isRequiredChangePassword = false; // Revert flag if email fails
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({ message: "Error sending email. Try again later." });
        }

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ------------------------------------------------------------------
// ADMIN / STAFF LOGIN
// ------------------------------------------------------------------
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {

            user.isActive = true;
            await user.save();

            // 🟢 1. SYSTEM LOG: User Login
            await logAction(
                {
                    id: user._id,
                    type: 'User',
                    name: user.email,
                    role: user.role
                },
                'LOGIN',
                'SUCCESS',
                { ipAddress: req.ip, description: `User ${user.userID} logged in` }
            );

            // 🟢 SOCKET EMIT
            const io = req.app.get('socketio');
            if (io) io.emit("update-user-activity", { userID: user.userID, isActive: true, role: user.role });

            // 🟢 SET COOKIE
            const token = generateToken(user);
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            res.json({
                userID: user.userID,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role,
                token: token,
                isActive: true
            });
        } else {
            // 🟢 LOG FAILURE
            await logAction(
                { id: null, type: 'User', name: email, role: 'UNKNOWN' },
                'LOGIN',
                'FAILED',
                { ipAddress: req.ip, description: "Invalid password attempt" }
            );
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                const user = await User.findByIdAndUpdate(decoded.id || decoded._id, {
                    isActive: false
                });

                if (user) {
                    // 🟢 2. SYSTEM LOG: User Logout
                    await logAction(
                        {
                            id: user._id,
                            type: 'User',
                            name: user.email,
                            role: user.role
                        },
                        'LOGOUT',
                        'SUCCESS',
                        { description: `User ${user.userID} logged out` }
                    );

                    // 🟢 SOCKET EMIT
                    const io = req.app.get('socketio');
                    if (io) io.emit("update-user-activity", { userID: user.userID, isActive: false, role: user.role });
                }

            } catch (err) {
                console.log("Token invalid during logout.");
            }
        }

        res.cookie('token', '', {
            httpOnly: true,
            expires: new Date(0)
        });

        res.status(200).json({ success: true, message: 'User logged out and status updated' });

    } catch (error) {
        res.status(500).json({ message: "Logout failed", error: error.message });
    }
};

// ------------------------------------------------------------------
// CLASS ADVISER LOGIN
// ------------------------------------------------------------------
const loginClassAdviser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const adviser = await classAdviser.findOne({ email });

        if (adviser && (await bcrypt.compare(password, adviser.password))) {

            adviser.isActive = true;
            await adviser.save();

            // 🟢 3. SYSTEM LOG: Adviser Login
            await logAction(
                {
                    id: adviser._id,
                    type: 'ClassAdviser',
                    name: adviser.email,
                    role: adviser.role
                },
                'LOGIN',
                'SUCCESS',
                { ipAddress: req.ip, description: `Adviser for ${adviser.section} logged in` }
            );

            // 🟢 SOCKET EMIT
            const io = req.app.get('socketio');
            if (io) io.emit("update-user-activity", { userID: adviser.userID, isActive: true, role: adviser.role });

            // 🟢 SET COOKIE
            const token = generateToken(adviser);
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });

            res.json({
                userID: adviser.userID,
                email: adviser.email,
                section: adviser.section,
                role: adviser.role,
                token: token,
                isActive: true
            });
        } else {
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logoutClassAdviser = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                const adviser = await classAdviser.findByIdAndUpdate(decoded.id, {
                    isActive: false
                });

                if (adviser) {
                    // 🟢 4. SYSTEM LOG: Adviser Logout
                    await logAction(
                        {
                            id: adviser._id,
                            type: 'ClassAdviser',
                            name: adviser.email,
                            role: adviser.role
                        },
                        'LOGOUT',
                        'SUCCESS',
                        { description: `Adviser ${adviser.userID} logged out` }
                    );

                    // 🟢 SOCKET EMIT
                    const io = req.app.get('socketio');
                    if (io) io.emit("update-user-activity", { userID: adviser.userID, isActive: false, role: adviser.role });
                }

            } catch (err) {
                console.log("Token invalid/expired during logout.");
            }
        }

        res.cookie('token', '', {
            httpOnly: true,
            expires: new Date(0)
        });

        res.status(200).json({ success: true, message: 'Class Adviser logged out successfully' });

    } catch (error) {
        res.status(500).json({ message: "Logout failed", error: error.message });
    }
};

const resetToDefaultPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        // 1. Check if user exists in 'User' (Admin/Staff) OR 'classAdviser'
        let user = await User.findOne({ email });
        let collectionName = 'User';

        if (!user) {
            user = await classAdviser.findOne({ email });
            collectionName = 'ClassAdviser';
        }

        if (!user) {
            return res.status(404).json({ message: "No account found with that email address." });
        }

        // 2. Extract Default Password (everything before the @)
        // Works for ANY email: "john.doe@gmail.com" -> password: "john.doe"
        const defaultPassword = email.split('@')[0];

        // 3. Hash the new default password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(defaultPassword, salt);

        // 4. Set Flag: Force them to change it on next login
        user.isRequiredChangePassword = true;

        // 5. Clean up any lingering reset tokens (optional but good hygiene)
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        // 6. Log the Action
        // We log who performed the action (The Admin calling this API)
        const actorID = req.user ? (req.user.userID || req.user.id) : 'SYSTEM';

        await logAction(
            { id: actorID, type: 'Admin', name: 'Admin', role: 'ADMIN' },
            'RESET_PASSWORD_DEFAULT',
            'SUCCESS',
            {
                description: `Reset password for ${email} to default ('${defaultPassword}').`,
                targetUser: email
            }
        );

        // 7. Return Success
        res.status(200).json({
            success: true,
            message: `Password reset successfully for ${email}.`,
            defaultPassword: defaultPassword, // Returning it so Admin can see/copy it if needed
            note: "User will be required to change this password upon login."
        });

    } catch (error) {
        console.error("Reset Error:", error);
        res.status(500).json({ message: error.message });
    }
};

export {
    loginUser,
    logoutUser,
    loginClassAdviser,
    logoutClassAdviser,
    resetPassword,
    resetToDefaultPassword
}