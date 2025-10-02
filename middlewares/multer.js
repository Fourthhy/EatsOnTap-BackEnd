import multer from 'multer';

//storing the file in memory using multer
const storage = multer.memoryStorage();

//define the file type, allowing only CSV files to accpet
const csvFilter = (req, file, cb) =>  {
   //actual checker for the file type 
    if (file.mimetype.includes('csv')) {
        //accept the file
        cb(null, true);
    } else {
        cb("Please upload CSV Files only", false);
    }
}

//create middleware instance
const upload = multer({
    storage: storage,
    fileFilter: csvFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 
    }
})

export default upload;