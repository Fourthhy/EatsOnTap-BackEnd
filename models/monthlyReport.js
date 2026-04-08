const mongoose = require('mongoose');

const statisticSchema = new mongoose.Schema({
    totalEligible: { type: Number, required: true, default: 0 },
    totalSnacksClaimed: { type: Number, required: true, default: 0 }, //shows how many students used their meal value for snacks
    totalMealsClaimed: { type: Number, required: true, default: 0 },
    totalClaimed: { type: Number, required: true, default: 0 }, // the sum of totalSnacksClaimed and totalMealsClaimed
    totalUnclaimed: { type: Number, required: true, default: 0 }, // the difference between totalEligible and totalClaimed
    totalWaived: { type: Number, required: true, default: 0 },
    totalAbsences: { type: Number, required: true, default: 0 },
});

const financialSchema = new mongoose.Schema({
    totalAllottedCredits: { type: Number, required: true, default: 0 },
    totalUsedCredits: { type: Number, required: true, default: 0 },
    totalUnusedCredits: { type: Number, required: true, default: 0 },
    totalOnHandCash: { type: Number, required: true, default: 0 },
})

const metricSchema = new mongoose.Schema({
    tadmc: { type: Number, required: true, default: 0 }, // True Average Daily Meal Cost, for snacks
    cur: { type: Number, required: true, default: 0 }, // Credit Utilization Rate, if the meal value is being used fully
    ocf: { type: Number, required: true, default: 0 }, // Overclaim Frequency, if students are claim costs more than their meal value
})

const dailyReportSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    dayOfWeek: { type: String, required: true }, // e.g., "MONDAY", "TUESDAY", etc.
    menu: { type: [String], required: true },
    metrics: { type: metricSchema, required: true },
    statistics: { type: statisticSchema, required: true },
    financials: { type: financialSchema, required: true },
})

const monthlyReportSchema = new mongoose.Schema({
    bucketMonth: { type: String, required: true }, // Format: "YYYY-MM"
    academicYear: { type: String, required: true }, // Format: "YYYY-YYYY"
    statistics: { type: statisticSchema, required: true },
    financials: { type: financialSchema, required: true },
    dailyReports: { type: [dailyReportSchema], required: true },
    isArchived: {
        type: Boolean,
        default: false
    },
    isPendingPurge: {
        type: Boolean,
        default: false
    },
    scheduledPurgeDate: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model("MonthlyReport", monthlyReportSchema);