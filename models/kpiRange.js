const mongoose = require('mongoose');

const kpiRangeSchema = new mongoose.Schema({
    // 1. TADMC: Total Average Daily Meal Cost
    // Target: Keep meal cost within budget (e.g., 58-62 pesos)
    tadmc: {
        min: { type: Number, required: true, default: 58 },
        max: { type: Number, required: true, default: 62 }
    },

    // 2. CUR: Credit Utilization Rate
    // Target: Ensure students use most of their credits (e.g., 90-100%)
    cur: {
        min: { type: Number, required: true, default: 90 },
        max: { type: Number, required: true, default: 100 }
    },

    // 3. OCF / OR: Order Cancellation Frequency (or Order Rejection)
    // Target: Keep errors/cancellations low (e.g., 0-15%)
    ocf: {
        min: { type: Number, required: true, default: 0 },
        max: { type: Number, required: true, default: 15 }
    }
}, { timestamps: true });

module.exports = mongoose.model('KPIRange', kpiRangeSchema);