const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors()); // Cho phép kết nối từ Frontend
app.use(express.json()); // Cho phép server đọc dữ liệu JSON gửi lên

// Route chạy thử
app.get('/', (req, res) => {
  res.send('Server Fashion Shop đang chạy thành công!');
});

// Lấy danh sách sản phẩm mẫu (Mock Data cho Khóa luận)
app.get('/api/products', (req, res) => {
  const products = [
    { id: 1, name: "Áo thun Monochrome", price: 250000, category: "Men" },
    { id: 2, name: "Váy trắng Minimalist", price: 450000, category: "Women" }
  ];
  res.json(products);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});