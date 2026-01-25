const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    setting: { type: String, required: true, unique: true }, 
    description: { type: String },
    
    // STATE TRACKER
    // true = Feature is currently ON, false = Feature is OFF
    isActive: { type: Boolean, default: false }, 

    // Auto-Open Configuration
    startHour: { type: Number, default: 0 },   
    startMinute: { type: Number, default: 0 }, 
    
    // Auto-Close Configuration
    endHour: { type: Number, default: 0 },     
    endMinute: { type: Number, default: 0 },   

    // Duplicate Prevention
    lastExecutedDate: { type: String, default: null } 
    
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);