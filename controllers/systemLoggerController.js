import SystemLogger from "../models/systemLogger.js"

const logAction = async (actor, action, status = 'SUCCESS', metadata = {}) => {
    try {
        await SystemLogger.create({
            actor: {
                id: actor._id || actor.id,
                type: actor.type, // 'User', 'ClassAdviser', or 'Student'
                name: actor.name || `${actor.firstname} ${actor.lastname}`,
                role: actor.role || 'N/A'
            },
            action,
            status,
            metadata
        });
        // console.log(`📝 LOG [${action}]: ${status}`); // Optional: Print to console
    } catch (error) {
        console.error("❌ Logger Failed:", error);
        // We don't throw error here to prevent logging failure from stopping the main app flow
    }
};

const getAllSystemLogs = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            action,      // e.g., 'LOGIN', 'CLAIM_MEAL'
            actorType,   // e.g., 'Student', 'User', 'ClassAdviser'
            role,        // e.g., 'ADMIN', 'ADVISER'
            startDate,   // YYYY-MM-DD
            endDate      // YYYY-MM-DD
        } = req.query;

        // 1. Build Query Object
        const query = {};

        // Filter by specific Action
        if (action) {
            query.action = action;
        }

        // Filter by Actor Type (e.g., only show Student logs)
        if (actorType) {
            query['actor.type'] = actorType;
        }

        // Filter by Role
        if (role) {
            query['actor.role'] = role;
        }

        // Filter by Date Range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate); // Start of day
            }
            if (endDate) {
                // Set end date to end of that day (23:59:59)
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // 2. Execute Query with Pagination
        const logs = await SystemLogger.find(query)
            .sort({ createdAt: -1 }) // Newest first
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // 3. Get Total Count (for frontend pagination UI)
        const totalLogs = await SystemLogger.countDocuments(query);

        res.status(200).json({
            success: true,
            count: logs.length,
            total: totalLogs,
            totalPages: Math.ceil(totalLogs / limit),
            currentPage: parseInt(page),
            data: logs
        });

    } catch (error) {
        next(error);
    }
};



export { 
    logAction,
    getAllSystemLogs
};