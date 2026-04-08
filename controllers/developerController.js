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

const seedMarch2026Report = async (req, res, next) => {
    try {
        const bucketMonth = "2026-03";
        const academicYear = "2025-2026";
        const MEAL_VALUE = 60;

        console.log(`🌱 Seeding Fake Data for ${bucketMonth}...`);

        await MonthlyReport.deleteOne({ bucketMonth });

        const monthlyStats = {
            totalEligible: 0, totalSnacksClaimed: 0, totalMealsClaimed: 0,
            totalClaimed: 0, totalUnclaimed: 0, totalWaived: 0, totalAbsences: 0
        };
        const monthlyFinances = {
            totalAllottedCredits: 0, totalUsedCredits: 0, totalUnusedCredits: 0, totalOnHandCash: 0
        };

        // This is the array that will hold all 26 operational days
        const dailyReports = [];

        for (let day = 1; day <= 31; day++) {
            const dateStr = `2026-03-${String(day).padStart(2, '0')}`;
            const dateObj = moment.tz(dateStr, "YYYY-MM-DD", "Asia/Manila");
            const dayOfWeek = dateObj.format("dddd").toUpperCase();

            // Skip Sundays completely
            if (dayOfWeek === "SUNDAY") continue;

            const eligible = getRandomInt(500, 1900);
            const absences = getRandomInt(0, Math.floor(eligible * 0.05));
            const waived = getRandomInt(0, Math.floor(eligible * 0.02));
            const unclaimed = getRandomInt(0, Math.floor(eligible * 0.08));

            const claimed = eligible - absences - waived - unclaimed;
            const snacksClaimed = getRandomInt(Math.floor(claimed * 0.2), Math.floor(claimed * 0.4));
            const mealsClaimed = claimed - snacksClaimed;

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

            // 🟢 UPGRADED: Pushing the highly detailed Daily Report object
            dailyReports.push({
                date: dateObj.toDate(),
                dayOfWeek: dayOfWeek,
                menu: generateMenuForDay(dayOfWeek), // Dynamic menu applied!
                metrics: {
                    tadmc: tadmc,
                    cur: cur,
                    ocf: ocf
                },
                statistics: {
                    totalEligible: eligible,
                    totalSnacksClaimed: snacksClaimed,
                    totalMealsClaimed: mealsClaimed,
                    totalClaimed: claimed,
                    totalUnclaimed: unclaimed,
                    totalWaived: waived,
                    totalAbsences: absences
                },
                financials: {
                    totalAllottedCredits: allottedCredits,
                    totalUsedCredits: usedCredits,
                    totalUnusedCredits: unusedCredits,
                    totalOnHandCash: onHandCash
                }
            });

            // Add to Monthly Aggregates
            monthlyStats.totalEligible += eligible;
            monthlyStats.totalSnacksClaimed += snacksClaimed;
            monthlyStats.totalMealsClaimed += mealsClaimed;
            monthlyStats.totalClaimed += claimed;
            monthlyStats.totalUnclaimed += unclaimed;
            monthlyStats.totalWaived += waived;
            monthlyStats.totalAbsences += absences;

            monthlyFinances.totalAllottedCredits += allottedCredits;
            monthlyFinances.totalUsedCredits += usedCredits;
            monthlyFinances.totalUnusedCredits += unusedCredits;
            monthlyFinances.totalOnHandCash += onHandCash;
        }

        const fakeReport = new MonthlyReport({
            bucketMonth,
            academicYear,
            statistics: monthlyStats,
            financials: monthlyFinances,
            dailyReports: dailyReports,
            isArchived: false,
            isPendingPurge: false,
            scheduledPurgeDate: null
        });

        await fakeReport.save();

        console.log(`✅ March 2026 Fake Report generated with ${dailyReports.length} detailed daily records!`);

        // 🟢 THE TWEAK: Returning the full 'fakeReport' document so you can see all the details!
        return res.status(200).json({
            message: "March 2026 Fake Report generated successfully!",
            totalDaysOperated: dailyReports.length,
            reportDetails: fakeReport // This includes the stats, financials, and the full dailyReports array
        });

    } catch (error) {
        console.error("❌ Error seeding fake report:", error);
        next(error);
    }
};

export {
    removeClaimDetails,
    seedMarch2026Report
}