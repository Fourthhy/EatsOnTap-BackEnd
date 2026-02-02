const mongoose = require('mongoose');

const dailyReportSchema = new mongoose.Schema({
    day: { type: Number, required: true },   // e.g., 28
    month: { type: Number, required: true }, // e.g., 1 (January)
    year: { type: Number, required: true },  // e.g., 2026

    // Optional: Useful for sorting/display without calculating it every time
    dayOfWeek: { type: String }, // e.g., "Wednesday"

    // 2. MENU OF THE DAY
    menu: {
        dishes: { type: [String], default: [] }
    },

    // 3. CLAIM STATISTICS
    stats: {
        totalClaimed: { type: Number, default: 0 },
        totalUnclaimed: { type: Number, default: 0 },

        // Breakdown
        prePackedCount: { type: Number, default: 0 },
        customizedCount: { type: Number, default: 0 },
        unusedVoucherCount: { type: Number, default: 0 }
    },

    // 4. PERFORMANCE METRICS
    metrics: {
        tadmc: { type: Number, default: 0 }, // Total Average Daily Meal Cost
        cur: { type: Number, default: 0 },   // Credit Utilization Rate
        ocf: { type: Number, default: 0 }    // Order Cancellation Frequency
    },

    // 5. FINANCIALS
    financials: {
        totalConsumedCredits: { type: Number, default: 0 },
        totalUnusedCredits: { type: Number, default: 0 },
        totalAlottedCtredits: { type: Number, default: 0 }
    }

}, { timestamps: true });

// 🟢 COMPOUND INDEX (Critical)
// 1. Enforces Uniqueness: No duplicate reports for the same day.
// 2. High Performance: Queries like find({ month: 1, year: 2026 }) will be instant.
dailyReportSchema.index({ year: 1, month: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('Report', dailyReportSchema);