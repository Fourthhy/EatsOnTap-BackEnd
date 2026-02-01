import User from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import classAdviser from "../models/classAdviser.js";

// 🟢 IMPORT LOGGER SERVICE
// Ensure this path matches where you saved the helper file
import { logAction } from "./systemLoggerController.js"

// Helper: Generate Token
const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '1d',
    });
}

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
                    name: user.email, // Using email as name if name field is unsure
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
                role: user.role,
                token: token,
                isActive: true
            });
        } else {
            // 🟢 LOG FAILURE (Optional but recommended)
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

export {
    loginUser,
    logoutUser,
    loginClassAdviser,
    logoutClassAdviser
}