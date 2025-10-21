import event from "../models/event.js";

const addEvent = async (req, res, next) => {
    try {
        const { eventName, eventScope, startDay, endDay, startMonth, endMonth, forEligibleSection, forEligibleProgramsAndYear, forTemporarilyWaived } = req.body
        const now = new Date();
        const thisYear = now.getFullYear()
        const eventID = `${startDay}-${endDay}-${forEligibleSection.length}-${forEligibleProgramsAndYear.length}-${forTemporarilyWaived.length}-${thisYear}`;
        const newEvent = new event({ eventID, eventName, eventScope, startDay, endDay, startMonth, endMonth, forEligibleSection, forEligibleProgramsAndYear, forTemporarilyWaived });
        await newEvent.save();
        res.status(200).json({ message: `${eventName} event created successfully!` });
    } catch (error) {
        next(error)
    }
}

const fetchEvents = async (req, res, next) => {
    try {
        const allEvents = await event.find({})
        if (!allEvents) {
            res.status(200).json({ message: "No events exist" });
        }
        res.status(200).json({ message: allEvents });
    } catch (error) {
        next(error)
    }
}

export {
    addEvent,
    fetchEvents
}