import cron from 'node-cron';

// 1. Define the task function to be executed
const printHello = () => {
    const now = new Date();
    // Use toLocaleTimeString and toLocaleDateString for clean output
    console.log("-----------------------------------------");
    console.log(`Hello World! 🌎`);
    console.log(item)
    console.log(`Execution Time: ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}`);
    console.log("-----------------------------------------");
};

let item = true;

const enableItem = () => {
    item = true;
    console.log("-----------------------------------------");
    console.log(item);
    console.log("-----------------------------------------");
}

const disableItem = () => {
    item = false
    console.log("-----------------------------------------");
    console.log(item);
    console.log("-----------------------------------------");
}

const testScheduler = () => {
    const CRON_EXPRESSION_DISABLE = "56 23 * * *";
    const CRON_EXPRESSION_ENABLE = "57 23 * * *";
    const TARGET_TIMEZONE = 'Asia/Manila';
    cron.schedule(CRON_EXPRESSION_DISABLE, disableItem, {
        timezone: TARGET_TIMEZONE
    })
    cron.schedule(CRON_EXPRESSION_ENABLE, enableItem, {
        timezone: TARGET_TIMEZONE
    })

}


// 2. Define the scheduler function
const startScheduler = () => {
    const CRON_EXPRESSION = '52 23 * * *';
    const TARGET_TIMEZONE = 'Asia/Manila';

    cron.schedule(CRON_EXPRESSION, printHello, {
        timezone: TARGET_TIMEZONE // IMPORTANT: Ensures the time is evaluated correctly for the Philippines
    });

    console.log(`Scheduler initialized. Task set to run daily at 3:35 PM in ${TARGET_TIMEZONE}.`);
};

// Call the function to start listening for the scheduled time
// startScheduler();
testScheduler();

export {
    startScheduler,
    printHello
};