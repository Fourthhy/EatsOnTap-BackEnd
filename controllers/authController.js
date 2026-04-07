import admin from '../config/firebaseAdmin.js'; 
import User from "../models/user.js";
import classAdviser from "../models/classAdviser.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../utils/email.js";
import { logAction } from "./systemLoggerController.js";

// 🟢 NEW: Import your Firebase Admin configuration


const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1d',
    });
}

// 🟢 RESET PASSWORD FLOW
const resetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        let user = await User.findOne({ email });
        let userType = 'User';

        if (!user) {
            user = await classAdviser.findOne({ email });
            userType = 'ClassAdviser';
        }

        if (!user) return res.status(404).json({ message: "No account found with that email address." });

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
        user.isRequiredChangePassword = true;

        await user.save({ validateBeforeSave: false });

        const localhost = 'http://localhost:5173';
        const resetURL = `${localhost}/loginRegistration/${resetToken}/${user.email}`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Password Reset Request',
                template: 'passwordReset',
                data: { firstName: user.first_name || "User", url: resetURL }
            });

            await logAction(
                { id: user._id, type: userType, name: user.email, role: user.role || 'UNKNOWN' },
                'RESET_PASSWORD_REQUEST',
                'SUCCESS',
                { description: `Password reset requested. Account flagged to require change.` }
            );

            res.status(200).json({ message: "An email has been sent. You will be required to set a new password upon login." });
        } catch (err) {
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            user.isRequiredChangePassword = false;
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({ message: "Error sending email. Try again later." });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 ADMIN / STAFF LOGIN
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            
            // 🛡️ SECURITY FIX: Force-resetting stale session
            if (user.isActive) {
                console.log(`⚠️ Force-resetting stale session for User: ${user.email}`);
                user.isActive = false;
                await user.save();
            }

            // Now proceed with fresh activation
            user.isActive = true;
            await user.save();

            await logAction(
                { id: user._id, type: 'User', name: user.email, role: user.role },
                'LOGIN', 'SUCCESS',
                { ipAddress: req.ip, description: `User ${user.userID} logged in (Fresh Session)` }
            );

            const io = req.app.get('socketio');
            if (io) io.emit("update-user-activity", { userID: user.userID, isActive: true, role: user.role });

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
            await logAction(
                { id: null, type: 'User', name: email, role: 'UNKNOWN' },
                'LOGIN', 'FAILED',
                { ipAddress: req.ip, description: "Invalid password attempt" }
            );
            res.status(401).json({ message: "Invalid email or password" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 🟢 CLASS ADVISER LOGIN
const loginClassAdviser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const adviser = await classAdviser.findOne({ email });

        if (adviser && (await bcrypt.compare(password, adviser.password))) {

            // 🛡️ SECURITY FIX: Force-reset stale session for Adviser
            if (adviser.isActive) {
                console.log(`⚠️ Force-resetting stale session for Adviser: ${adviser.email}`);
                adviser.isActive = false;
                await adviser.save();
            }

            adviser.isActive = true;
            await adviser.save();

            await logAction(
                { id: adviser._id, type: 'ClassAdviser', name: adviser.email, role: adviser.role },
                'LOGIN', 'SUCCESS',
                { ipAddress: req.ip, description: `Adviser for ${adviser.section} logged in (Fresh Session)` }
            );

            const io = req.app.get('socketio');
            if (io) io.emit("update-user-activity", { userID: adviser.userID, isActive: true, role: adviser.role });

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

// 🟢 NEW: GOOGLE FIREBASE LOGIN
const googleFirebaseLogin = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ message: "No token provided" });
        }

        // 1. Verify the token with Firebase Admin
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // 2. Extract user info
        const { email, name, picture, uid } = decodedToken;
        const [firstName, ...lastNameArr] = name ? name.split(' ') : ['Unknown', ''];
        const lastName = lastNameArr.join(' ');

        // 3. Find the user (Check User collection first, then ClassAdviser)
        let user = await User.findOne({ email });
        let userModelType = 'User';

        if (!user) {
            user = await classAdviser.findOne({ email });
            if (user) userModelType = 'ClassAdviser';
        }

        // 4. Create new user if they don't exist at all
        if (!user) {
            user = new User({
                email: email,
                first_name: firstName,
                last_name: lastName || '',
                profilePicture: picture,
                firebaseUid: uid,
                role: 'STUDENT', // Default assigned role
                isActive: false
            });
            await user.save();
            userModelType = 'User';
        }

        // 5. 🛡️ SECURITY FIX: Force-reset stale session
        if (user.isActive) {
            console.log(`⚠️ Force-resetting stale session for Google Auth User: ${user.email}`);
            user.isActive = false;
            await user.save();
        }

        user.isActive = true;
        await user.save();

        // 6. Log the Action
        await logAction(
            { id: user._id, type: userModelType, name: user.email, role: user.role },
            'LOGIN_GOOGLE', 'SUCCESS',
            { ipAddress: req.ip, description: `${userModelType} ${user.email} logged in via Google` }
        );

        // 7. Emit Socket update
        const io = req.app.get('socketio');
        if (io) io.emit("update-user-activity", { userID: user.userID || user._id, isActive: true, role: user.role });

        // 8. Generate standard JWT & Set Cookie
        const appToken = generateToken(user);
        res.cookie('token', appToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        // 9. Send response back to React
        return res.status(200).json({
            userID: user.userID || user._id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            token: appToken,
            isActive: true,
            profilePicture: picture
        });

    } catch (error) {
        console.error("Firebase Verification Error:", error);
        await logAction(
            { id: null, type: 'Unknown', name: 'Unknown', role: 'UNKNOWN' },
            'LOGIN_GOOGLE', 'FAILED',
            { ipAddress: req.ip, description: "Invalid or expired Google token attempt" }
        );
        return res.status(401).json({ message: "Unauthorized: Invalid Google Token" });
    }
};

const logoutUser = async (req, res) => {
    try {
        const token = req.cookies.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                let userRecord;
                if (decoded.role === 'CLASS-ADVISER') {
                    userRecord = await classAdviser.findByIdAndUpdate(decoded.id || decoded._id, { isActive: false });
                } else {
                    userRecord = await User.findByIdAndUpdate(decoded.id || decoded._id, { isActive: false });
                }

                if (userRecord) {
                    await logAction(
                        { id: userRecord._id, type: 'User', name: userRecord.email || userRecord.userID, role: decoded.role },
                        'LOGOUT', 'SUCCESS',
                        { description: `${decoded.role} logged out and local session cleared.` }
                    );
                    const io = req.app.get('socketio');
                    if (io) io.emit("update-user-activity", { userID: userRecord.userID, isActive: false, role: decoded.role });
                }
            } catch (err) {
                console.log("⚠️ Token invalid or expired during logout. Clearing cookies anyway.");
            }
        }

        res.cookie('token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: new Date(0),
            path: '/'
        });

        return res.status(200).json({ success: true, message: 'Session wiped successfully' });
    } catch (error) {
        res.status(500).json({ message: "Logout failed", error: error.message });
    }
};

const logoutClassAdviser = async (req, res) => {
    // Standardizing logout: redirecting to general logoutUser logic is safer
    return logoutUser(req, res);
};

const resetToDefaultPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required." });

        let user = await User.findOne({ email });
        if (!user) user = await classAdviser.findOne({ email });

        if (!user) return res.status(404).json({ message: "No account found with that email address." });

        const defaultPassword = email.split('@')[0];
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(defaultPassword, salt);
        user.isRequiredChangePassword = true;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        const actorID = req.user ? (req.user.userID || req.user.id) : 'SYSTEM';
        await logAction(
            { id: actorID, type: 'Admin', name: 'Admin', role: 'ADMIN' },
            'RESET_PASSWORD_DEFAULT', 'SUCCESS',
            { description: `Reset password for ${email} to default.`, targetUser: email }
        );

        res.status(200).json({ success: true, message: `Password reset successfully for ${email}.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export {
    loginUser,
    logoutUser,
    loginClassAdviser,
    logoutClassAdviser,
    googleFirebaseLogin, // 🟢 Added to exports!
    resetPassword,
    resetToDefaultPassword
}