import { KPIRange } from "../models/kpiRange.js"
import { logAction } from "./systemLoggerController.js"

// 🟢 FETCH: Get current KPI Ranges
const getKPIRanges = async (req, res, next) => {
    try {
        let ranges = await KPIRange.findOne();

        if (!ranges) {
            // Seed default if not exists
            ranges = new KPIRange();
            await ranges.save();
        }

        res.status(200).json(ranges);
    } catch (error) {
        next(error);
    }
};

// 🟢 UPDATE: Modify Acceptable Ranges
const updateKPIRanges = async (req, res, next) => {
    try {
        const { tadmc, cur, ocf } = req.body;

        // Upsert (Update if exists, Create if not)
        const updatedRanges = await KPIRange.findOneAndUpdate(
            {}, 
            { 
                $set: { 
                    tadmc: tadmc, // Expects { min: X, max: Y }
                    cur: cur,
                    ocf: ocf 
                } 
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // SYSTEM LOG
        const actorID = req.user ? (req.user._id || req.user.userID) : 'SYSTEM';
        await logAction(
            { id: actorID, type: 'User', name: req.user?.email || 'Admin', role: 'ADMIN' },
            'UPDATE_SETTING',
            'SUCCESS',
            { description: "Updated KPI Acceptable Ranges" }
        );

        res.status(200).json({
            message: "KPI Ranges updated successfully.",
            data: updatedRanges
        });

    } catch (error) {
        next(error);
    }
};

export { 
    getKPIRanges, 
    updateKPIRanges 
}
