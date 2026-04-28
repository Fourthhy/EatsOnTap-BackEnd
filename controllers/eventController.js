import Event from "../models/event.js";
import { addNotification } from "../controllers/notificationController.js"

const monthMap = {
    "January": 0, "February": 1, "March": 2, "April": 3,
    "May": 4, "June": 5, "July": 6, "August": 7,
    "September": 8, "October": 9, "November": 10, "December": 11
};


//this is what the ADMIN role uses
const addEvent = async (req, res, next) => {
    try {
        const {
            eventName,
            eventScope,
            startDay,
            endDay,
            startMonth,
            endMonth,
            eventColor,
            forEligibleSection, // Expecting Array of objects: [{ section: "A", year: "1" }]
            forEligibleProgramsAndYear // Expecting Array of objects
        } = req.body;

        const now = new Date();
        const thisYear = now.getFullYear();

        // 1. Calculate Array Lengths for ID
        const sectionLen = forEligibleSection ? forEligibleSection.length : 0;
        const programLen = forEligibleProgramsAndYear ? forEligibleProgramsAndYear.length : 0;

        // 2. Generate ID
        const eventID = `${startDay}-${endDay}-${sectionLen}-${programLen}-${thisYear}`;

        // 3. Prepare Data with Default Counts (0)
        // We map through the incoming arrays to ensure the counts are set to 0 initially
        const sectionsWithCounts = forEligibleSection?.map(item => ({
            ...item,
            totalEligibleCount: 0,
            totalClaimedCount: 0
        })) || [];

        const programsWithCounts = forEligibleProgramsAndYear?.map(item => ({
            ...item,
            totalEligibleCount: 0,
            totalClaimedCount: 0
        })) || [];

        // 4. Create New Event
        const newEvent = new Event({
            eventID,
            eventName,
            eventScope,
            startDay,
            endDay,
            startMonth,
            endMonth,
            eventColor,
            forEligibleSection: sectionsWithCounts,
            forEligibleProgramsAndYear: programsWithCounts,
            submissionStatus: 'APPROVED'
        });

        await newEvent.save();

        //Add the "addNotificaation" controller function here
        await addNotification("Event Creation", `A new event '${eventName}' has been scheduled`);
        
        const io = req.app.get('socketio');
        if (io) {
            io.emit('add-event', { type: 'Admin', message: 'Update Triggered' });
            }

        res.status(200).json({
            message: `${eventName} event created successfully!`,
            data: newEvent
        });

    } catch (error) {
        next(error);
    }
}

const fetchEvents = async (req, res, next) => {
    try {
        const allEvents = await Event.find({})
        if (!allEvents) {
            res.status(200).json({ message: "No events exist" });
        }
        res.status(200).json(allEvents);
    } catch (error) {
        next(error)
    }
}

const updateEventStatusesLogic = async () => {
    try {
        console.log("🔄 Checking and updating event statuses...");

        // 1. Get Current Date (Start of Day)
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const currentYear = now.getFullYear();

        // 2. Fetch All Events
        const events = await Event.find({});
        const bulkOps = [];

        events.forEach(event => {
            // 3. Parse Dates
            const startMonthIndex = monthMap[event.startMonth];
            const endMonthIndex = monthMap[event.endMonth];

            if (startMonthIndex === undefined || endMonthIndex === undefined) return;

            const startDate = new Date(currentYear, startMonthIndex, event.startDay);
            const endDate = new Date(currentYear, endMonthIndex, event.endDay);
            endDate.setHours(23, 59, 59, 999);

            // 4. Determine Status
            let newStatus = event.scheduleStatus;

            if (now < startDate) {
                newStatus = "UPCOMING";
            } else if (now >= startDate && now <= endDate) {
                newStatus = "ONGOING";
            } else {
                newStatus = "RECENT";
            }

            // 5. Queue Update if Status Changed
            if (event.scheduleStatus !== newStatus) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: event._id },
                        update: { $set: { scheduleStatus: newStatus } }
                    }
                });
            }
        });

        // 6. Execute Bulk Update
        if (bulkOps.length > 0) {
            await Event.bulkWrite(bulkOps);
            console.log(`✅ Updated status for ${bulkOps.length} events.`);
            return { updatedCount: bulkOps.length, message: `Updated ${bulkOps.length} events.` };
        } else {
            console.log("ℹ️ No event status updates needed.");
            return { updatedCount: 0, message: "No updates needed." };
        }

    } catch (error) {
        console.error("❌ Error in updateEventStatusesLogic:", error);
        throw error; // Re-throw so Pulse knows it failed
    }
};

const updateEventStatuses = async (req, res, next) => {
    try {
        const result = await updateEventStatusesLogic();
        res.status(200).json(result);
    } catch (error) {
        next(error); // Safe here because Express provides 'next'
    }
};

export {
    addEvent,
    fetchEvents,
    updateEventStatuses,
    updateEventStatusesLogic
}