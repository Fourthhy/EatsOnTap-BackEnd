const ClassAdviser = require('../models/classAdviser'); // Adjust path as needed
const bcrypt = require('bcryptjs');

/**
 * @desc    Create a new Class Adviser
 * @route   POST /api/class-advisers
 */
const createClassAdviser = async (req, res) => {
    try {
        const { honorific, first_name, middle_name, last_name, section, email, password, ...otherData } = req.body;

        if (!first_name || !middle_name || !last_name || !email || !password) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        // 1. Generate the unique userID (Format: xx-xxxxxABC)
        const currentYearStr = new Date().getFullYear().toString().slice(-2); 
        
        // Find the latest adviser created this year to increment the sequence
        const lastAdviser = await ClassAdviser.findOne({ userID: new RegExp(`^${currentYearStr}-`) })
                                              .sort({ userID: -1 })
                                              .select('userID');
        
        let nextSequence = 1;
        if (lastAdviser) {
            const lastSequenceStr = lastAdviser.userID.substring(3, 8);
            nextSequence = parseInt(lastSequenceStr, 10) + 1;
        }
        
        const paddedSequence = nextSequence.toString().padStart(5, '0');

        const fInitial = first_name.charAt(0).toUpperCase();
        const lInitial = last_name.charAt(0).toUpperCase();
        const mInitial = middle_name.charAt(0).toUpperCase();

        const generatedUserID = `${currentYearStr}-${paddedSequence}${fInitial}${mInitial}${lInitial}`;

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create and save the adviser
        const newAdviser = new ClassAdviser({
            userID: generatedUserID,
            honorific,
            first_name,
            middle_name,
            last_name,
            section,
            email,
            password: hashedPassword,
            ...otherData
        });

        const savedAdviser = await newAdviser.save();

        // 4. Strip the password from the response
        savedAdviser.password = undefined;

        return res.status(201).json({
            success: true,
            data: savedAdviser
        });

    } catch (error) {
        // Handle Mongoose Validation Errors (like the regex for @laverdad.edu.ph)
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        // Handle Unique Constraint Violations (Duplicate Email or UserID)
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email or UserID already exists." });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get all Class Advisers
 * @route   GET /api/class-advisers
 */
const getAllClassAdvisers = async (req, res) => {
    try {
        const advisers = await ClassAdviser.find({}).select('-password');

        return res.status(200).json({
            success: true,
            count: advisers.length,
            data: advisers
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Update a Class Adviser
 * @route   PUT /api/class-advisers/:id
 */
const updateClassAdviser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = { ...req.body };

        // Prevent modifying the system-generated userID
        if (updates.userID) {
            delete updates.userID;
        }

        // If updating the password, hash it first
        if (updates.password) {
            const salt = await bcrypt.genSalt(10);
            updates.password = await bcrypt.hash(updates.password, salt);
        }

        const updatedAdviser = await ClassAdviser.findByIdAndUpdate(
            id,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedAdviser) {
            return res.status(404).json({ success: false, message: "Class Adviser not found." });
        }

        return res.status(200).json({
            success: true,
            data: updatedAdviser
        });

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "Email already in use." });
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Delete a Class Adviser
 * @route   DELETE /api/class-advisers/:id
 */
const deleteClassAdviser = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedAdviser = await ClassAdviser.findByIdAndDelete(id);

        if (!deletedAdviser) {
            return res.status(404).json({ success: false, message: "Class Adviser not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Class Adviser successfully deleted."
        });

    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createClassAdviser,
    getAllClassAdvisers,
    updateClassAdviser,
    deleteClassAdviser
};