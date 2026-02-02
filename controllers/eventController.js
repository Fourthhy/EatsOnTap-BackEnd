import Event from "../models/event.js";

const monthMap = {
    "January": 0, "February": 1, "March": 2, "April": 3,
    "May": 4, "June": 5, "July": 6, "August": 7,
    "September": 8, "October": 9, "November": 10, "December": 11
};

const addEvent = async (req, res, next) => {
    try {
        // 1. Destructure fields (Removed forTemporarilyWaived)
        const {
            eventName,
            eventScope,
            startDay,
            endDay,
            startMonth,
            endMonth,
            eventColor,
            forEligibleSection,
            forEligibleProgramsAndYear
        } = req.body;

        const now = new Date();
        const thisYear = now.getFullYear();

        // 2. Calculate Array Lengths safely (Default to 0 if undefined)
        const sectionLen = forEligibleSection ? forEligibleSection.length : 0;
        const programLen = forEligibleProgramsAndYear ? forEligibleProgramsAndYear.length : 0;

        // 3. Updated ID Logic (Removed the waived param)
        // Format: StartDay-EndDay-SectionCount-ProgramCount-Year
        const eventID = `${startDay}-${endDay}-${sectionLen}-${programLen}-${thisYear}`;

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
            forEligibleSection,
            forEligibleProgramsAndYear
            // Note: scheduleStatus defaults to 'ONGOING' per your schema
            // submissionStatus defaults to 'PENDING' per your schema
        });

        await newEvent.save();

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