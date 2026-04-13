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
        const { mealValue } = req.body;

        // 1. Input Validation
        // Ensure it exists, is actually a number, and makes logical sense (e.g., > 0)
        if (mealValue === undefined || typeof mealValue !== 'number' || mealValue <= 0) {
            return res.status(400).json({
                message: "Invalid input. Please provide a valid positive number for mealValue."
            });
        }

        // 2. Update or Create (The Singleton Pattern)
        // By passing an empty filter {}, it targets the very first document it finds.
        const updatedSetting = await MealValue.findOneAndUpdate(
            {},
            { $set: { mealValue: mealValue } },
            {
                new: true,           // Returns the updated document instead of the old one
                upsert: true,        // Creates the document if the collection is completely empty
                setDefaultsOnInsert: true
            }
        );

        // 3. Return Success Payload
        return res.status(200).json({
            message: "Meal value updated successfully.",
            currentMealValue: updatedSetting.mealValue
        });

    } catch (error) {
        console.error("❌ Update Meal Value Error:", error);

        // Pass to standard Express error handler if you have one, or return 500
        if (next) {
            next(error);
        } else {
            return res.status(500).json({ message: "Internal server error." });
        }
    }
};

//import assign meal vaue controllers here

export {
    getMealValue,
    updateMealValue
}