import classAdviser from "../models/classAdviser.js";
import bcrypt from "bcryptjs";

import csv from 'csv-parser';
import stream from 'stream';

import { logAction } from "./systemLoggerController.js";

const createClassAdvisersFromCSV = async (req, res, next) => {
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
            if (!data.password || !data.userID || !data.email || !data.section) {

                // Push a rejected promise, which will immediately fail the Promise.all later
                const requiredFields = ['password', 'userID', 'email', 'section'];
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
                const addedUsers = await classAdviser.insertMany(userData, { ordered: false });

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

const getClassAdviserByID = async (req, res, next) => {
    try {
        const classAdvisers = await classAdviser.findOne({ userID: req.params.userID });
        if (!classAdvisers) {
            return res.status(404).json({ message: 'Class Adviser is not in the list' });
        }
        res.json(classAdvisers);
    } catch (error) {
        next(error);
    }
}

// Fetch all Class Adviser data
const getAllClassAdvisers = async (req, res, next) => {
    try {
        const classAdvisers = await classAdviser.find({});
        res.json(classAdvisers);
    } catch (error) {
        next(error);
    }
};

const addClassAdviser = async (req, res, next) => {
    try {
        const { 
            userID, 
            honorific, 
            first_name, 
            middle_name, 
            last_name, 
            section, 
            role,
            email,           // 🟢 NEW: Capture the email from the frontend
            isGoogleAuth     // 🟢 NEW: Capture the Google Auth flag
        } = req.body;

        // 1. Validation
        if (!userID || !first_name || !last_name || !honorific) {
            return res.status(400).json({ message: "Missing required fields (ID, Name, or Honorific)." });
        }

        // 🟢 2. DETERMINE EMAIL (CRITICAL FOR GOOGLE AUTH)
        // If the admin typed an exact email, use it. Otherwise, auto-generate.
        let finalEmail;
        if (email) {
            finalEmail = email.toLowerCase().trim();
        } else {
            const cleanFirst = first_name.replace(/\s+/g, '').toLowerCase();
            const cleanLast = last_name.replace(/\s+/g, '').toLowerCase();
            finalEmail = `${cleanFirst}${cleanLast}@laverdad.edu.ph`;
        }

        // 3. GENERATE PASSWORD
        // Logic: 'EatsOnTapClassAdviser' + (Current Count + 1)
        const adviserCount = await ClassAdviser.countDocuments({});
        const nextIndex = adviserCount + 1;
        const generatedPassword = `EatsOnTapClassAdviser${nextIndex}`;

        // 4. Check for Duplicates (UserID or Email)
        const existingAdviser = await ClassAdviser.findOne({ 
            $or: [{ userID: userID }, { email: finalEmail }] 
        });

        if (existingAdviser) {
            return res.status(409).json({ 
                message: `Duplicate detected. User ID '${userID}' or Email '${finalEmail}' already exists.` 
            });
        }

        // 5. Hash the Generated Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(generatedPassword, salt);

        // 6. Create the Record
        const newAdviser = new ClassAdviser({
            userID,
            honorific,
            first_name,
            middle_name,
            last_name,
            section: section || undefined,
            email: finalEmail,
            password: hashedPassword,
            role: role || 'CLASS-ADVISER',
            isActive: false, 
            // 🟢 UPDATE: If using Google, they don't need to change their local password!
            isRequiredChangePassword: isGoogleAuth ? false : true 
        });

        await newAdviser.save();

        // 7. SYSTEM LOG: Create Adviser
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'System Admin';

        await logAction(
            { 
                id: actorID, 
                type: 'User', 
                name: actorName, 
                role: 'ADMIN' 
            },
            'CREATE_ADVISER', // 🟢 Made the action more specific
            'SUCCESS',
            { 
                description: `Created Class Adviser account: ${userID} (${section || 'No Section'})`,
                generatedEmail: finalEmail,
                isGoogleAuth: isGoogleAuth || false // 🟢 Log if they are a Google user
            }
        );

        res.status(201).json({ 
            message: "Class Adviser account created successfully.", 
            data: {
                userID: newAdviser.userID,
                name: `${newAdviser.first_name} ${newAdviser.last_name}`,
                email: newAdviser.email,
                section: newAdviser.section,
                // 🟢 UPDATE: Don't show a dummy password to the Admin if it's a Google Account
                initialPassword: isGoogleAuth ? 'N/A (Google Authentication)' : generatedPassword 
            }
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        next(error);
    }
};

export {
    createClassAdvisersFromCSV,
    getClassAdviserByID,
    getAllClassAdvisers,
    addClassAdviser
}