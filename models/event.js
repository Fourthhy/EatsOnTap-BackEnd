const mongoose = require('mongoose');

const eventSchema = mongoose.model({
    eventName: { type: String, required: true },
    eventScope: { type: String, required: true, enum: ['BASIC-EDUCATION', 'HIGHER-EDUCATION', 'ALL'] },
    startMinute: { type: String, required: true },
    endMinute: { type: String, required: true },
    startHour: { type: String, required: true },
    endHour: { type: String, required: true },
    startDay: { type: String, required: true },
    endDay: { type: String, required: true },
    startMonth: { type: String, required: true },
    endMonth: { type: String, required: true },
    startDayOfWeek: { type: String, required: true },
    endDayOfWeek: { type: String, required: true },
})

//time properties is the same as the setting model

module.exports = mongoose.model('Event', eventSchema);