const express = require('express');
const router = express.Router();
const statisController = require('../controllers/statisController');
const { authMiddleware, adminOnly } = require('../middlewares/authMiddleware');

router.use(authMiddleware, adminOnly);

router.get('/overview', statisController.getAdminStats);
router.get('/sales', statisController.getSalesByPeriod);
router.get('/top-products', statisController.getTopProducts);
router.get('/slow-products', statisController.getSlowProducts);
router.get('/top-customers', statisController.getTopCustomers);
router.get('/forecast', statisController.getForecast);
router.get('/business-insight', statisController.getBusinessInsight);
router.get('/export-excel', statisController.exportStatsToExcel);

module.exports = router;