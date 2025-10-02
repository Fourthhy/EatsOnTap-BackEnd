import User from '../models/user.js'
import bcrypt from 'bcrypt';

//fetch all users 

const getUsers = async (req, res, next) => {
      try {
        const users = await User.find({});
        res.json(users);
      } catch (error) {
        next(error);
      }
}

//Add a new user
const createUser = async (req, res, next) => {
    try {
        //Destructure parameter fields:
        const { userID, email, password, role } = req.body;

        //check if the user already exist
        const existingUser = await User.findOne({userID})
        if (existingUser) {
            return res.status(409).json({ message: "User Already Exist" });
        }

        //if user doesn't exist yet, proceed to user creation
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            userID: userID,
            email: email,
            password: hashedPassword,
            role: role
        })

        await newUser.save();

        //in response, this prevents the hashedPassword from being displayed
        const { password: userPassword, ...userInfo } = newUser._doc;
        res.status(201).json(userInfo);

    } catch (error) {
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        next(error)
    }
}

export {
    getUsers,
    createUser
}