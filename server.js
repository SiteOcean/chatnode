const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIO = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
require('dotenv').config();
const io = socketIO(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.use(cors());
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

io.on('connection', (socket) => {
  console.log('A user connected');

  // Private Message Event
  socket.on('private-message', async (data) => {
    const { from, to, message, username } = data; // Extract username from data

    const emitPrivateMessage = (socketId, data) => {
      io.to(socketId).emit('private-message', data);
    };

    // Emit the private message to the sender and recipient
    emitPrivateMessage(activeSockets[from], { from, to, message, username });
    emitPrivateMessage(activeSockets[to], { from, to, message, username });

    // Save the message to the database
    const newMessage = new Message({ from, to, message, username }); // Include username
    try {
      const savedMessage = await newMessage.save();
      console.log('Private message saved to the database:', savedMessage);
    } catch (error) {
      console.error('Failed to save private message:', error);
    }
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
app.get('/api/usersdata', async (req, res) => {
  try {
    const users = await User.find();
    const totalUsers = await User.countDocuments();

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      totalUsers,
      users,
    });
  } catch (error) {
    console.error('Failed to retrieve users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: error.message,
    });
  }
});

// API to create a new user account
app.post('/api/users', async (req, res) => {
  const { username, password } = req.body;

  try {
    const newUser = new User({ username, password });
    await newUser.save();
    res.status(201).json({ message: 'User account created successfully' });
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

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
