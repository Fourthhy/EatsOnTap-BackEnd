import Student from '../models/student.js';
import ClaimRecord from '../models/claimRecord.js';
import Credit from '../models/credit.js';

// 🟢 HELPER: Get PH Date Range
// Ensures we are always looking at the correct "Today" in Philippines Time
const getPHDateRange = () => {
    const now = new Date();
    // Force specific timezone handling
    const options = { timeZone: "Asia/Manila", year: 'numeric', month: 'numeric', day: 'numeric' };
    const phDateString = now.toLocaleDateString("en-US", options); 
    const [month, day, year] = phDateString.split('/').map(num => parseInt(num));
    
    const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
    const startOfDayVal = Date.UTC(year, month - 1, day) - PH_OFFSET_MS;
    
    return {
        start: new Date(startOfDayVal),
        end: new Date(startOfDayVal + (24 * 60 * 60 * 1000) - 1)
    };
};

// =========================================================
// 1. INITIALIZE RECORD (Runs at Start of Day / Submission)
// =========================================================
const initializeTodayRecord = async () => {
    try {
        console.log("🔄 STARTING: Initializing Daily Student Records...");
        const { start, end } = getPHDateRange();

        // Check if we already initialized to avoid duplicates
        // We check if any student already has a record for this exact date range
        const alreadyInitialized = await Student.findOne({
            "claimRecords.date": { $gte: start, $lte: end }
        });

        if (alreadyInitialized) {
            console.log("ℹ️ SKIPPED: Records for today are already initialized.");
            return;
        }

        // Push a default "WAIVED" entry to ALL students
        // Using the 'start' date ensures the timestamp is uniform (00:00 PH Time)
        await Student.updateMany({}, {
            $push: {
                claimRecords: {
                    date: start, 
                    creditClaimed: 0,
                    remarks: ["WAIVED"] 
                }
            }
        });

        console.log("✅ COMPLETED: All students initialized with WAIVED status for today.");
    } catch (error) {
        console.error("❌ ERROR initializing records:", error);
    }
};

// =========================================================
// 2. FINALIZE RECORD (Runs at End of Day / Remove Credits)
// =========================================================
const finalizeTodayRecord = async () => {
    try {
        console.log("🔄 STARTING: Finalizing Daily Student Records...");

        // A. Fetch Global Credit Value (The Benchmark)
        const creditSetting = await Credit.findOne();
        const maxCredit = creditSetting ? creditSetting.creditValue : 0;

        if (maxCredit === 0) {
            console.log("⚠️ WARNING: Global credit value is 0 or missing.");
        }

        // B. Fetch Today's Claim Record
        const { start, end } = getPHDateRange();
        const dailyRecord = await ClaimRecord.findOne({
            claimDate: { $gte: start, $lte: end }
        });

        if (!dailyRecord) {
            return console.log("⚠️ NO CLAIM RECORD FOUND FOR TODAY. Skipping finalization.");
        }

        // C. Prepare Bulk Operations
        const bulkOps = [];
        const flattenedRecords = [];

        // Flatten all eligible students from all sections into one array
        dailyRecord.claimRecords.forEach(section => {
            if (section.eligibleStudents) {
                flattenedRecords.push(...section.eligibleStudents);
            }
        });

        // D. Build the Logic
        for (const student of flattenedRecords) {
            const remainingBalance = student.creditBalance;
            let finalStatus = "UNCLAIMED";
            let creditUsed = 0;

            // Logic: Did they touch their credits?
            // Since maxCredit is constant for the day, this check is safe.
            if (remainingBalance < maxCredit) {
                // They spent something
                finalStatus = "CLAIMED";
                creditUsed = maxCredit - remainingBalance;
            } else {
                // Balance is full (or more), they bought nothing
                finalStatus = "UNCLAIMED";
                creditUsed = 0;
            }

            // Add to Bulk Operation Queue
            // Update the SPECIFIC history item for today
            bulkOps.push({
                updateOne: {
                    filter: { 
                        studentID: student.studentID,
                        "claimRecords.date": { $gte: start, $lte: end }
                    },
                    update: {
                        $set: {
                            "claimRecords.$.remarks": [finalStatus],
                            "claimRecords.$.creditClaimed": creditUsed
                        }
                    }
                }
            });
        }

        // E. Execute Bulk Write
        if (bulkOps.length > 0) {
            await Student.bulkWrite(bulkOps);
            console.log(`✅ COMPLETED: Updated records for ${bulkOps.length} eligible students.`);
        } else {
            console.log("ℹ️ No eligible students found to update.");
        }

    } catch (error) {
        console.error("❌ ERROR finalizing records:", error);
    }
};

export {
    initializeTodayRecord,
    finalizeTodayRecord
};