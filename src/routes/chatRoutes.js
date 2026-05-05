const express = require('express');
const router = express.Router();

const { chatSearch } = require('../controllers/chatController');
const { authOptional } = require('../middlewares/authMiddleware');

router.post('/search', authOptional, chatSearch);

module.exports = router;