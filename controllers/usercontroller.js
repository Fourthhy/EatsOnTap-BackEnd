import User from '../models/user.js'
import bcrypt from 'bcrypt';

//for uploading using csv
import csv from 'csv-parser';
import stream from 'stream';

//fetch all users 
import { logAction } from "./systemLoggerController.js"

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
        // 🟢 1. Destructure ALL relevant fields from the body
        const { userID, email, password, role, first_name, middle_name, last_name } = req.body;

        // 🟢 2. Enhanced Duplicate Check (Check ID AND Email)
        const existingUser = await User.findOne({
            $or: [{ userID }, { email }]
        });

        if (existingUser) {
            const field = existingUser.userID === userID ? "User ID" : "Email";
            return res.status(409).json({ message: `${field} already exists.` });
        }

        // 3. Hash Password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // 🟢 4. Initialize User with ALL model fields
        const newUser = new User({
            userID,
            first_name,
            middle_name,
            last_name,
            email,
            password: hashedPassword,
            role,
            isActive: false, // Default from model
            isRequiredChangePassowrd: true // Usually true for new accounts so they change it
        });

        await newUser.save();

        // 🟢 5. SYSTEM LOG: Record that an account was created
        // Assuming the person performing this action is an ADMIN (req.user)
        const creator = req.user ? { id: req.user._id, type: 'User', name: req.user.email, role: req.user.role }
            : { id: newUser._id, type: 'User', name: 'System', role: 'ADMIN' };

        await logAction(
            creator,
            'SUCCESS', // or create a custom action like 'CREATE_USER'
            'SUCCESS',
            { description: `Created new ${role} account: ${userID}` }
        );

        // 6. Response (Hide password)
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

export {
    getAllUsers,
    addUser,
    createUsersFromCSV
}