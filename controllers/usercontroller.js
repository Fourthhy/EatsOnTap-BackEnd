import User from '../models/user.js'
import bcrypt from 'bcrypt';

//for uploading using csv
import csv from 'csv-parser';
import stream from 'stream';

//fetch all users 
import { logAction } from "./systemLoggerController.js"

import Users from "../models/user.js";
import classAdviser from "../models/classAdviser.js";

const getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find({});
        res.json(users);
    } catch (error) {
        next(error);
    }
}

//Add a new user
const addUser = async (req, res, next) => {
    try {
        // 🟢 1. Destructure ALL relevant fields from the body, including isGoogleAuth
        const { 
            userID, 
            email, 
            password, 
            role, 
            first_name, 
            middle_name, 
            last_name,
            isGoogleAuth // 🟢 NEW: Capture the Google Auth flag
        } = req.body;

        // 🟢 2. Format Email (Critical for Google Auth matching)
        const finalEmail = email ? email.toLowerCase().trim() : '';

        // 🟢 3. Enhanced Duplicate Check (Check ID AND Email)
        const existingUser = await User.findOne({
            $or: [{ userID }, { email: finalEmail }]
        });

        if (existingUser) {
            const field = existingUser.userID === userID ? "User ID" : "Email";
            return res.status(409).json({ message: `${field} already exists.` });
        }

        // 🟢 4. Handle Password Logic
        let passwordToHash = password;
        if (isGoogleAuth) {
            // Give Google Auth users a random, unguessable dummy password
            passwordToHash = `GoogleAuth_${Math.random().toString(36).slice(-10)}!`;
        } else if (!password) {
            return res.status(400).json({ message: "Password is required for standard accounts." });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(passwordToHash, saltRounds);

        // 🟢 5. Initialize User with ALL model fields
        const newUser = new User({
            userID,
            first_name,
            middle_name,
            last_name,
            email: finalEmail,
            password: hashedPassword,
            role,
            isActive: false, // Default from model
            // 🟢 UPDATE: Fixed typo from original code and applied Google Auth logic
            isRequiredChangePassword: isGoogleAuth ? false : true 
        });

        await newUser.save();

        // 🟢 6. SYSTEM LOG: Record that an account was created
        const creatorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const creatorName = req.user ? req.user.email : 'System Admin';

        await logAction(
            { id: creatorID, type: 'User', name: creatorName, role: 'ADMIN' },
            'CREATE_USER', // Made action more specific
            'SUCCESS',
            { 
                description: `Created new ${role} account: ${userID}`,
                isGoogleAuth: isGoogleAuth || false 
            }
        );

        // 7. Response (Hide password)
        const { password: userPassword, ...userInfo } = newUser._doc;
        res.status(201).json(userInfo);

    } catch (error) {
        // Handle MongoDB Duplicate Key Error (Unique constraints)
        if (error.code === 11000) {
            return res.status(409).json({ message: "Duplicate entry found for unique field." });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
}

const createUsersFromCSV = async (req, res, next) => {
    // Check for file existence
    if (!req.file) {
        return res.status(400).json({ message: 'No CSV file uploaded.' });
    }

    let userData = [];
    const hashingPromises = [];
    const saltRounds = 10;

    // 1. Convert the file buffer to a stream
    const bufferStream = new stream.Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    bufferStream
        .pipe(csv())
        // FIX: Removed 'async' keyword from the 'data' handler
        .on('data', (data) => {
            // ----------------------------------------------------
            // CRITICAL FIX: Instead of destroying the stream, 
            // push a rejected Promise if data is bad.
            // ----------------------------------------------------
            if (!data.password || !data.userID || !data.email) {
                // Push a rejected promise, which will immediately fail the Promise.all later
                const requiredFields = ['password', 'userID', 'email'];
                const missing = requiredFields.filter(f => !data[f]);

                hashingPromises.push(Promise.reject(
                    new Error(`Missing required field(s): ${missing.join(', ')} in a CSV row.`)
                ));
                return; // Continue reading the stream
            }

            // Hashing the password and collecting the promise
            const hashPromise = bcrypt.hash(data.password, saltRounds)
                .then(hashedPassword => {
                    data.password = hashedPassword;
                    return data;
                })
                .catch(err => {
                    // Fail the promise if hashing itself fails
                    throw new Error("Failed to hash password for a user: " + err.message);
                });

            hashingPromises.push(hashPromise);
        })

        .on('end', async () => {
            // FIX: Removed the unnecessary check for 'parseError' since Promise.all handles it

            try {
                // If any promise in hashingPromises rejected, this whole block jumps to the catch
                userData = await Promise.all(hashingPromises);
            } catch (error) {
                // This catches errors from bad data (rejected promises) OR hashing failure
                console.error("CSV Processing error: " + error.message);
                return res.status(400).json({ message: error.message }); // 400 for data issues
            }

            if (userData.length === 0) {
                return res.status(400).json({ message: `CSV is empty or headers are incorrect.` });
            }

            // --- Database Insertion (Bulk Insertion Logic is correct) ---
            try {
                // ... (Your insertMany logic and response remains here)
                const addedUsers = await User.insertMany(userData, { ordered: false });

                const responseUsers = addedUsers.map(user => {
                    const { password: userPassword, ...userInfo } = user.toObject({ getters: true });
                    return userInfo;
                });

                res.status(201).json({
                    message: `Successfully created ${addedUsers.length} users.`,
                    users: responseUsers
                });

            } catch (error) {
                // ... (Your existing Mongoose error handling remains here)
                console.error("Mongoose Bulk Insert Error:", error.message);

                let detailMessage = "Bulk insertion failed due to data issues.";
                if (error.code === 11000) {
                    detailMessage = "One or more users failed due to duplicate keys (e.g., userID or email already exists).";
                }

                return res.status(400).json({
                    message: detailMessage,
                    details: error.message
                });
            }
        })

        .on('error', (error) => {
            // General stream error handling (less common)
            next({ status: 400, message: "Error processing CSV file stream." });
        });
};

/**
 * @desc Resets a user's password to their full name (lowercase, no spaces).
 * Searches the 'Users' collection first, falling back to 'classAdviser'.
 */
const resetUserPassword = async (req, res, next) => {
    try {
        const { userID } = req.body;

        if (!userID) {
            return res.status(400).json({ message: "Please provide a userID." });
        }

        // 1. Search in the Users model first
        let user = await Users.findOne({ userID });
        let userType = 'System User';

        // 2. If not found, fallback to the Class Adviser model
        if (!user) {
            user = await ClassAdviser.findOne({ userID });
            userType = 'Class Adviser';
        }

        // 3. If neither model has this user, return an error
        if (!user) {
            return res.status(404).json({ message: "User not found in any system." });
        }

        // 4. Construct the raw password
        // Fallback to empty strings just in case a field is missing in older records
        const firstName = user.first_name || '';
        const middleName = user.middle_name || '';
        const lastName = user.last_name || '';

        // Combine, lowercase, and remove all spaces
        const rawPassword = `${firstName}${middleName}${lastName}`.replace(/\s+/g, '').toLowerCase();

        // 5. Hash the new password (CRITICAL for security)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);

        // 6. Update the user document
        user.password = hashedPassword;
        user.isRequiredChangePassword = true; // Force them to change it upon next login

        await user.save();

        // 7. Send success response
        return res.status(200).json({
            message: `Password reset successfully for ${userType}.`,
            data: {
                userID: user.userID,
                name: `${firstName} ${lastName}`,
                // NOTE: For security, you might want to remove 'resetTo' in production, 
                // but it is very helpful to return it to the admin frontend for display right now.
                resetTo: rawPassword
            }
        });

    } catch (error) {
        console.error("❌ Password Reset Error:", error);
        next(error);
    }
};

/**
* @desc Edits ONLY the first, middle, and last names of a user.
* Searches the 'Users' collection first, falling back to 'classAdviser'.
*/
const editName = async (req, res, next) => {
    try {
        const { userID, first_name, middle_name, last_name } = req.body;

        if (!userID) {
            return res.status(400).json({ message: "Please provide a userID." });
        }

        // 1. Search in the Users model first
        let user = await Users.findOne({ userID });
        let userType = 'System User';

        // 2. Fallback to Class Adviser model
        if (!user) {
            user = await ClassAdviser.findOne({ userID });
            userType = 'Class Adviser';
        }

        // 3. If neither model has this user, return an error
        if (!user) {
            return res.status(404).json({ message: "User not found in any system." });
        }

        // 4. Update ONLY the name fields (if they are provided)
        // We use !== undefined to allow clearing a middle name (e.g., passing an empty string)
        if (first_name !== undefined) user.first_name = first_name.trim();
        if (middle_name !== undefined) user.middle_name = middle_name.trim();
        if (last_name !== undefined) user.last_name = last_name.trim();

        // 5. Save the updated user
        await user.save();

        return res.status(200).json({
            message: `${userType} name updated successfully.`,
            data: {
                userID: user.userID,
                first_name: user.first_name,
                middle_name: user.middle_name,
                last_name: user.last_name
            }
        });

    } catch (error) {
        console.error("❌ Edit Name Error:", error);
        next(error);
    }
};

export {
    getAllUsers,
    addUser,
    createUsersFromCSV,
    resetUserPassword,
    editName
}