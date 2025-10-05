import classAdviser from "../models/classAdviser.js";
import bcrypt from "bcryptjs";  

import csv from 'csv-parser';
import stream from 'stream';

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

export {
    createClassAdvisersFromCSV,
    getClassAdviserByID,
    getAllClassAdvisers
}