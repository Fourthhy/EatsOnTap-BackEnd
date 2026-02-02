const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    notificationType: { type: String, required: true }, // Fixed typo 'notifcationType'
    date: { type: Date, default: Date.now },
    description: { type: String, required: true },
    isRead: { type: Boolean, default: false }
});

module.exports = new mongoose.model("Notifications", notificationSchema);