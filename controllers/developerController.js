import MonthlyReport from "../models/monthlyReport.js";
import MealValue from "../models/mealValue.js"; // Assuming you converted this to ES6 export default
import moment from "moment-timezone";
import Student from "../models/student.js";

const removeClaimDetails = async (req, res, next) => {
    try {
        await Student.updateMany({}, { $unset: { creditValue: "" } });
        console.log("Successfully removed 'yearServed' from all users.")
    } catch (error) {
        next(error)
    }
}

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateMenuForDay = (dayOfWeek) => {
    const menus = {
        MONDAY: ["Pork Sinigang", "Fried Fish", "Banana", "Iced Tea"],
        TUESDAY: ["Chicken Adobo", "Chopsuey", "Melon Slice", "Calamansi Juice"],
        WEDNESDAY: ["Beef Caldereta", "Pinakbet", "Leche Flan", "Water"],
        THURSDAY: ["Fried Chicken", "Macaroni Salad", "Brownies", "Pineapple Juice"],
        FRIDAY: ["Ginataang Tilapia", "Monggo Guisado", "Turon", "Water"], // Meatless Friday vibe
        SATURDAY: ["Spaghetti", "Garlic Bread", "Cupcake", "Iced Tea"] // Lighter Saturday menu
    };
    return menus[dayOfWeek] || ["Chef's Special", "Rice", "Fruit", "Water"];
};

const seedLast30DaysReport = async (req, res, next) => {
    try {
        const MEAL_VALUE = 60;
        const manilaNow = moment().tz("Asia/Manila");
        
        console.log(`🌱 Seeding Fake Data for the last 30 days (including today)...`);

        // We use an object to group the days because 30 days will likely span two different months!
        const monthBuckets = {};

        // 🟢 FIX: Changed `i >= 1` to `i >= 0` to include today (0 days ago)
        for (let i = 30; i >= 0; i--) {
            const dateObj = manilaNow.clone().subtract(i, 'days');
            const bucketMonth = dateObj.format("YYYY-MM"); // e.g., "2026-03" or "2026-04"
            const dayOfWeek = dateObj.format("dddd").toUpperCase();

            // Skip Sundays
            if (dayOfWeek === "SUNDAY") continue;

            // Initialize the bucket for this month if it doesn't exist yet
            if (!monthBuckets[bucketMonth]) {
                monthBuckets[bucketMonth] = {
                    bucketMonth: bucketMonth,
                    academicYear: "2025-2026", // Update as needed
                    statistics: { totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0, totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0 },
                    financials: { totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0 },
                    dailyReports: []
                };
            }

            // =========================================================================
            // 🟢 LOGIC FIX: Top-Down Dependent Math for Realistic Statistics
            // =========================================================================
            const eligible = getRandomInt(500, 1900);
            
            // Step 1: Subtract Absences first
            const absences = getRandomInt(0, Math.floor(eligible * 0.05));
            const nonAbsentStudents = eligible - absences;

            // Step 2: Calculate Claims based on a realistic turnout rate (85% to 95%)
            const percentageWhoClaim = getRandomInt(85, 95) / 100; 
            const claimed = Math.round(nonAbsentStudents * percentageWhoClaim);

            // Step 3: Find the remainder (students present but didn't claim)
            const remainingStudents = nonAbsentStudents - claimed;

            // Step 4: Split the remainder into "Waived" and "Unclaimed" safely
            const maxWaived = Math.min(remainingStudents, Math.floor(eligible * 0.02));
            const waived = getRandomInt(0, maxWaived);
            const unclaimed = remainingStudents - waived;

            // Step 5: Split the Claims into Snacks and Meals
            const snacksPercentage = getRandomInt(20, 40) / 100;
            const snacksClaimed = Math.round(claimed * snacksPercentage);
            const mealsClaimed = claimed - snacksClaimed;

            // --- FINANCIAL CALCULATIONS ---
            const allottedCredits = eligible * MEAL_VALUE;
            const usedOnMeals = mealsClaimed * MEAL_VALUE;
            const usedOnSnacks = snacksClaimed * getRandomInt(30, 60);
            const usedCredits = usedOnMeals + usedOnSnacks;
            const unusedCredits = allottedCredits - usedCredits;

            const outOfPocketBuyers = getRandomInt(Math.floor(claimed * 0.1), Math.floor(claimed * 0.25));
            const onHandCash = outOfPocketBuyers * getRandomInt(10, 50);

            const tadmc = snacksClaimed > 0 ? Number(((usedOnSnacks + onHandCash) / snacksClaimed).toFixed(2)) : 0;
            const cur = allottedCredits > 0 ? Number(((usedCredits / allottedCredits) * 100).toFixed(2)) : 0;
            const ocf = allottedCredits > 0 ? Number(((onHandCash / allottedCredits) * 100).toFixed(2)) : 0;
            // =========================================================================

            // Push to this specific month's dailyReports array
            monthBuckets[bucketMonth].dailyReports.push({
                date: dateObj.toDate(),
                dayOfWeek: dayOfWeek,
                menu: generateMenuForDay(dayOfWeek),
                metrics: { tadmc, cur, ocf },
                statistics: { totalEligible: eligible, totalSnacksClaimed: snacksClaimed, totalMealsClaimed: mealsClaimed, totalClaimed: claimed, totalUnclaimed: unclaimed, totalWaived: waived, totalAbsences: absences },
                financials: { totalAllottedCredits: allottedCredits, totalUsedCredits: usedCredits, totalUnusedCredits: unusedCredits, totalOnHandCash: onHandCash }
            });

            // Aggregate Monthly Totals for this specific month
            monthBuckets[bucketMonth].statistics.totalEligible += eligible;
            monthBuckets[bucketMonth].statistics.totalSnacksClaimed += snacksClaimed;
            monthBuckets[bucketMonth].statistics.totalMealsClaimed += mealsClaimed;
            monthBuckets[bucketMonth].statistics.totalClaimed += claimed;
            monthBuckets[bucketMonth].statistics.totalUnclaimed += unclaimed;
            monthBuckets[bucketMonth].statistics.totalWaived += waived;
            monthBuckets[bucketMonth].statistics.totalAbsences += absences;

            monthBuckets[bucketMonth].financials.totalAllottedCredits += allottedCredits;
            monthBuckets[bucketMonth].financials.totalUsedCredits += usedCredits;
            monthBuckets[bucketMonth].financials.totalUnusedCredits += unusedCredits;
            monthBuckets[bucketMonth].financials.totalOnHandCash += onHandCash;
        }

        // --- SAVE TO DATABASE ---
        const savedReports = [];
        
        // Convert our monthBuckets object into an array and save each one
        for (const monthKey of Object.keys(monthBuckets)) {
            const data = monthBuckets[monthKey];

            // Delete any existing fake data for this month to prevent duplicates
            await MonthlyReport.deleteOne({ bucketMonth: data.bucketMonth });

            const newReport = new MonthlyReport({
                ...data,
                isArchived: false,
                // 🛑 DISABLED PURGE: The sweep will ignore this data.
                isPendingPurge: false, 
                scheduledPurgeDate: null
            });

            await newReport.save();
            savedReports.push(newReport);
        }

        console.log(`✅ Seeded ${savedReports.length} months of data covering the last 30 days including today!`);

        return res.status(200).json({
            message: "Rolling 30-Day Fake Data (including today) generated successfully!",
            monthsAffected: Object.keys(monthBuckets),
            data: savedReports
        });

    } catch (error) {
        console.error("❌ Error seeding 30-day report:", error);
        next(error);
    }
};

export {
    removeClaimDetails,
    seedLast30DaysReport
}