const mongoose = require('mongoose');

const AnalysisHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imagePath: {
    type: String,
    required: true
  },
  prediction: {
    type: String,
    required: true
  },
  confidence: {
    type: String,
    required: true
  },
  analysisType: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AnalysisHistory', AnalysisHistorySchema);
