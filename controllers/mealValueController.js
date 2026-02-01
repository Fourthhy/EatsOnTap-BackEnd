import MealValue from "../models/mealValue.js"

import { logAction } from "./systemLoggerController.js"

// 🟢 FETCH: Get the current meal value
const getMealValue = async (req, res, next) => {
    try {
        // We only expect one document. If none exists, we return a default (e.g., 0 or 60).
        let record = await MealValue.findOne();

        if (!record) {
            // Optional: Create a default record if the DB is empty
            record = new MealValue({ mealValue: 0 });
            await record.save();
        }

        res.status(200).json({
            mealValue: record.mealValue
        });

    } catch (error) {
        next(error);
    }
};

// 🟢 EDIT: Update the meal value
const updateMealValue = async (req, res, next) => {
    try {
        const { newValue } = req.body;

        // 1. Validation
        if (newValue === undefined || typeof newValue !== 'number' || newValue < 0) {
            return res.status(400).json({ message: "Please provide a valid positive number for meal value." });
        }

        // 2. Find and Update (Upsert ensures it works even if DB is empty)
        // We fetch the OLD value first for logging purposes
        const oldRecord = await MealValue.findOne();
        const oldValue = oldRecord ? oldRecord.mealValue : 0;

        const updatedRecord = await MealValue.findOneAndUpdate(
            {}, // Match any (first) document
            { mealValue: newValue },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // 3. SYSTEM LOG: Record the price change
        // Assumes req.user is populated by your Auth Middleware
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        const actorName = req.user ? req.user.email : 'Admin';

        await logAction(
            {
                id: actorID,
                type: 'User',
                name: actorName,
                role: 'ADMIN'
            },
            'UPDATE_SETTING', // You might need to add this to your SystemLogger enum
            'SUCCESS',
            {
                setting: 'MEAL_VALUE',
                description: `Updated Meal Value from ${oldValue} to ${newValue}`
            }
        );

        res.status(200).json({
            success: true,
            message: "Meal value updated successfully.",
            data: updatedRecord
        });

    } catch (error) {
        next(error);
    }
};

export {
    getMealValue,
    updateMealValue
}