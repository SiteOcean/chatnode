const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIO = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
require('dotenv').config();

// Use 'server' instead of 'httpServer'
const io = socketIO(server, {
  cors: {
    origin: 'https://chat-app-steel-theta.vercel.app',
    // origin:'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true, // Allow credentials (cookies) to be included
  },
});

app.use(cors({ origin: 'https://chat-app-steel-theta.vercel.app' }));
// app.use(cors({ origin: 'http://localhost:3000' }));
const User = require('./models/users');
const Message = require('./models/message');

const PORT = process.env.PORT || 5000;
// const MONGODB_URI = 'mongodb://127.0.0.1:27017/admin';
const MONGODB_URI = process.env.MONGO_DB_URL

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

app.use(express.json());

const activeSockets = {};

app.get('/test', (req, res) => {
  res.json({ message: 'Test API is working!' });
});

// API to retrieve chat history between two users
app.get('/api/chat/:userId1/:userId2', async (req, res) => {
  const { userId1, userId2 } = req.params;

  try {
    const messages = await Message.find({
      $or: [
        { from: userId1, to: userId2 },
        { from: userId2, to: userId1 },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      message: 'Chat history retrieved successfully',
      messages,
    });
  } catch (error) {
    console.error('Failed to retrieve chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history',
      error: error.message,
    });
  }
});

app.get('/api/usersdata', async (req, res) => {
  try {
    const loginUserId = req.query.loginUserId;

    if (!loginUserId) {
      return res.status(400).json({
        success: false,
        message: 'Missing loginUserId parameter',
      });
    }

    const loggedInUser = await User.findById(loginUserId);

    if (!loggedInUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const users = await User.find({ _id: { $ne: loggedInUser._id } });
    
    // Fetch unread message count for each user in relation to the logged-in user
    const usersWithUnreadMessages = await Promise.all(
      users.map(async (user) => {
        const unreadMessageCount = await Message.countDocuments({
          to: loggedInUser._id,
          from: user._id,
          read: false,
        });

        return {
          _id: user._id,
          username: user.username,
          email: user.email,
          // Add more user fields as needed
          unreadMessageCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: 'Users data retrieved successfully',
      users: usersWithUnreadMessages,
    });
  } catch (error) {
    console.error('Failed to retrieve users data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users data',
      error: error.message,
    });
  }
});

io.on('connection', (socket) => {
  console.log('A user connected');

  // Private Message Event
  socket.on('private-message', async (data) => {
    const { from, to, message, username } = data;

    const emitPrivateMessage = (socketId, data) => {
      io.to(socketId).emit('private-message', data);
    };

    // Emit the private message to the sender and recipient
    emitPrivateMessage(activeSockets[from], { from, to, message, username, timestamp: new Date().toISOString(), read: true }); // Set read status to true for the sender
    emitPrivateMessage(activeSockets[to], { from, to, message, username, timestamp: new Date().toISOString(), read: false }); // Set read status to false for the recipient

    // Save the message to the database with the read status
    const newMessage = new Message({ from, to, message, username, timestamp: new Date(), read: false }); // Set read status to false
    try {
      const savedMessage = await newMessage.save();
      console.log('Private message saved to the database:', savedMessage);
    } catch (error) {
      console.error('Failed to save private message:', error);
    }

    // Mark existing unread messages as read in the database
    try {
      await Message.updateMany(
        { from: to, to: from, read: false },
        { $set: { read: true } }
      );
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }

    // Emit read acknowledgment to the sender
    emitPrivateMessage(activeSockets[from], { from, to, message, username, timestamp: new Date().toISOString(), read: true });
  });

  // Set Active User Event
  socket.on('set-active-user', (userId) => {
    activeSockets[userId] = socket.id;
  });

  // Disconnect Event
  socket.on('disconnect', () => {
    console.log('User disconnected');

    // Remove the user from activeSockets when disconnected
    const userId = Object.keys(activeSockets).find((key) => activeSockets[key] === socket.id);
    delete activeSockets[userId];
  });
});


async function clearAllMessages() {
  try {
    const result = await Message.deleteMany({});
    console.log('Deleted messages:', result.deletedCount);
  } catch (error) {
    console.error('Failed to clear messages:', error);
  }
}

// Call the function to clear all messages
// clearAllMessages();

// API to retrieve a list of all users
// app.get('/api/usersdata', async (req, res) => {
//   try {
//     const users = await User.find();
//     const totalUsers = await User.countDocuments();

//     res.status(200).json({
//       success: true,
//       message: 'Users retrieved successfully',
//       totalUsers,
//       users,
//     });
//   } catch (error) {
//     console.error('Failed to retrieve users:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to retrieve users',
//       error: error.message,
//     });
//   }
// });

// API to create a new user account
app.post('/api/users', async (req, res) => {
  const { username, password } = req.body;

  try {
    const newUser = new User({ username, password });
    await newUser.save();
    res.status(200).json({ message: 'User account created successfully' });
  } catch (error) {
    console.error('Failed to create user account:', error);
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

// API for user login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (user) {
      res.status(200).json({ message: 'Login successful', userId: user._id , username: user.username});
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/makeChatAsRead/:fromUserId/:toUserId', async (req, res) => {
  try {
    const fromUserId = req.params.fromUserId;
    const toUserId = req.params.toUserId;

    // Update messages as read
    await Message.updateMany(
      {
        from: toUserId,
        to: fromUserId,
        read: false,
      },
      { $set: { read: true } }
    );

    res.status(200).json({
      success: true,
      message: 'Messages marked as read successfully',
    });
  } catch (error) {
    console.error('Failed to mark messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
