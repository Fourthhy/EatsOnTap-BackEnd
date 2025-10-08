import Users from '../models/user.js';

const getAdminAssistant = async (req, res, next) => {
    try {
        // 1. Use the .find() method (instead of .findOne()) to return all matching documents.
        // 2. The query object specifies the role we are looking for: { role: 'ADMIN-ASSISTANT' }
        const adminAssistant = await Users.find({ role: "ADMIN-ASSISTANT" }).select('-passowrd');

        // Optional: Check if any documents were found
        if (adminAssistant.length === 0) {
            return res.status(404).json({ message: 'No Admin Assistants found in the list.' });
        }

        // Return the array of Admin Assistant users
        res.json(adminAssistant);
    } catch (error) {
        next(error);
    }
}

export {
    getAdminAssistant
}