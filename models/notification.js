const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    data: [
        {
            notificationType: {
                type: [String],
                required: true,
                enum: ["Meal Request", "Update Student Registry", "Event Credit Bestowment", "Setting Change", "Event Creation", "Export Report", "Upcoming Event"]
            },
            description: {
                type: String,
                required: true
            },
            targetRoles: {
                type: [String],
                required: true,
            },
            readBy: [
                { 
                    type: mongoose.Schema.Types.ObjectId, ref: 'User' }
            ],
            time: {
                type: Date, require: true
            }
        }
    ],

});

module.exports = mongoose.model("Notification", notificationSchema);