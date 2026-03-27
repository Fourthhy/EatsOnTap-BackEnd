import Users from "../../models/user.js"
const bcrypt = require('bcryptjs');

/**
 * @desc    Create a new Users with system-generated userID
 * @route   POST /api/users
 */
const createUser = async (req, res) => {
    try {
        const { first_name, middle_name, last_name, role, email, password, ...otherData } = req.body;       

        // 1. Basic validation
        if (!first_name || !last_name || !email || !password || !role) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // 2. Generate the unique userID (Format: xx-xxxxxABC)
        const currentYearStr = new Date().getFullYear().toString().slice(-2); // gets "26" for 2026
        
        // Find the latest user created this year to get the highest sequence number
        // We use a regex to match IDs starting with the current year (e.g., "26-")
        const lastUser = await Users.findOne({ userID: new RegExp(`^${currentYearStr}-`) })
                                   .sort({ userID: -1 }) // Sort descending to get the highest
                                   .select('userID');
        
        let nextSequence = 1;
        if (lastUser) {
            // Extract the 'xxxxx' part (index 3 to 8) and increment
            const lastSequenceStr = lastUser.userID.substring(3, 8);
            nextSequence = parseInt(lastSequenceStr, 10) + 1;
        }
        
        // Pad with leading zeros to ensure 5 digits (e.g., "00001")
        const paddedSequence = nextSequence.toString().padStart(5, '0');

        // Extract initials
        const fInitial = first_name.charAt(0).toUpperCase();
        const lInitial = last_name.charAt(0).toUpperCase();
        // If middle_name exists, use its first letter, otherwise double the last name's first letter
        const mInitial = middle_name && middle_name.trim() !== "" 
            ? middle_name.charAt(0).toUpperCase() 
            : lInitial;

        const generatedUserID = `${currentYearStr}-${paddedSequence}${fInitial}${mInitial}${lInitial}`;

        // 3. Hash the password for security
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Create and save the user
        const newUser = new Users({
            userID: generatedUserID,
            first_name,
            middle_name,
            last_name,
            role,
            email,
            password: hashedPassword,
            ...otherData
        });

        const savedUser = await newUser.save();

        // 5. Remove password from the response object for security
        savedUser.password = undefined;

        return res.status(201).json({
            success: true,
            data: savedUser
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email or UserID already exists." });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get all Users
 * @route   GET /api/users
 */
const getAllUsers = async (req, res) => {
    try {
        // .select('-password') ensures we never send password hashes to the frontend
        const users = await Users.find({}).select('-password');

        return res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Update a Users
 * @route   PUT /api/users/:id
 */
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Security check: Prevent manual updates to the system-generated userID
        if (updates.userID) {
            delete updates.userID;
        }

        // If the update includes a new password, we MUST hash it before saving
        if (updates.password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(updates.password, salt);
        }

        const updatedUser = await Users.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        ).select('-password'); // Exclude password from the returned document

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "Users not found." });
        }

        return res.status(200).json({
            success: true,
            data: updatedUser
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email already in use by another account." });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Delete a Users
 * @route   DELETE /api/users/:id
 */
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedUser = await Users.findByIdAndDelete(id);

        if (!deletedUser) {
            return res.status(404).json({ success: false, message: "Users not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Users successfully deleted."
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createUser,
    getAllUsers,
    updateUser,
    deleteUser
};