import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
    setting: { type: String, required: true, unique: true }, 
    description: { type: String },
    
    // STATE TRACKER
    isActive: { type: Boolean, default: false }, 

    // Auto-Open Configuration
    startHour: { type: Number, default: 0 },   
    startMinute: { type: Number, default: 0 }, 
    
    // Auto-Close Configuration
    endHour: { type: Number, default: 0 },     
    endMinute: { type: Number, default: 0 },   

    // Duplicate Prevention
    lastExecutedDate: { type: String, default: null },

    suspendedDates: {
        type: [{
            date: { type: String, required: true }, // Required ONLY if adding a suspension
            reason: { type: String, required: true } // Required ONLY if adding a suspension
        }],
        default: [] // 🟢 Defaults to empty, meaning no suspensions by default!
    }
    
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);