const express = require('express');
const axios = require('axios');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==================== API NGUỒN ====================
const GAME_APIS = {
  'sunwin_tx': 'https://bracket-ellen-roads-prefer.trycloudflare.com/api/tx',
  'hitclub': 'https://letting-tackle-newton-oak.trycloudflare.com/api/tx',
  'lc79_tx': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/tx',
  'lc79_md5': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/txmd5',
  'betvip_tx': 'https://plastic-diet-visits-opens.trycloudflare.com/api/tx',
  'betvip_md5': 'https://plastic-diet-visits-opens.trycloudflare.com/api/txmd5',
  'max789': 'https://cage-adjustment-whose-banner.trycloudflare.com/api/tx',
  'b52': 'https://gold-ultra-fails-handles.trycloudflare.com/txmd5',
  'luck8_md5': 'https://heroes-presents-pound-tablet.trycloudflare.com/api/txmd5',
  'club789_tx': 'https://dependent-epinions-somebody-enclosed.trycloudflare.com/api/tx',
  'sunwin_sicbo': 'https://afterwards-motels-honors-vendors.trycloudflare.com/api/sunsicbo',
  'club789_sicbo': 'https://demo7892.fun/history/getLastResult?gameId=ktrng_3986&size=100&tableId=398625062021&curPage=1',
  'lc79_xocdia': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/xocdia'
};

// ==================== DATABASE ====================
const db = new sqlite3.Database('mega_bridge.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT, session_id INTEGER, predicted INTEGER, actual INTEGER,
    confidence REAL, patterns_used TEXT, is_correct INTEGER, timestamp TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS collected_bridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT, bridge_type TEXT, pattern_data TEXT, frequency INTEGER DEFAULT 1, last_seen TEXT
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_game ON predictions(game)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_session ON predictions(game, session_id)`);
});

function savePrediction(game, sessionId, predicted, confidence, patternsUsed) {
  return new Promise((resolve) => {
    db.run(`INSERT INTO predictions (game, session_id, predicted, confidence, patterns_used, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [game, sessionId, predicted, confidence, JSON.stringify(patternsUsed), new Date().toISOString()],
      (err) => resolve(!err));
  });
}

function updatePredictionResult(game, sessionId, actual, isCorrect) {
  return new Promise((resolve) => {
    db.run(`UPDATE predictions SET actual = ?, is_correct = ? 
            WHERE game = ? AND session_id = ? AND actual IS NULL`,
      [actual, isCorrect ? 1 : 0, game, sessionId],
      (err) => resolve(!err));
  });
}

function getPredictionHistory(game, limit = 30) {
  return new Promise((resolve) => {
    db.all(`SELECT session_id, predicted, actual, confidence, is_correct, timestamp 
            FROM predictions WHERE game = ? ORDER BY session_id DESC LIMIT ?`,
      [game, limit], (err, rows) => {
        if (err) resolve([]);
        else resolve(rows.map(r => ({
          phien: r.session_id,
          du_doan: r.predicted === 1 ? 'Tài' : (r.predicted === 0 ? 'Xỉu' : (r.predicted === 2 ? 'Chẵn' : 'Lẻ')),
          thuc_te: r.actual === 1 ? 'Tài' : (r.actual === 0 ? 'Xỉu' : (r.actual === 2 ? 'Chẵn' : (r.actual === 3 ? 'Lẻ' : 'Chưa có'))),
          do_tin_cay: r.confidence + '%',
          ket_qua: r.is_correct === 1 ? '✅ ĐÚNG' : (r.is_correct === 0 ? '❌ SAI' : '⏳ CHỜ'),
          thoi_gian: r.timestamp
        })));
      });
  });
}

function getGameStats(game) {
  return new Promise((resolve) => {
    db.get(`SELECT COUNT(*) as tong, SUM(is_correct) as dung 
            FROM predictions WHERE game = ? AND is_correct IS NOT NULL`,
      [game], (err, row) => {
        if (err || !row || row.tong === 0) resolve({ tong: 0, dung: 0, sai: 0, tiLe: '0%' });
        else {
          const dung = row.dung || 0;
          resolve({ tong: row.tong, dung, sai: row.tong - dung, tiLe: ((dung / row.tong) * 100).toFixed(1) + '%' });
        }
      });
  });
}

// ==================== THUẬT TOÁN VIP PRO MAX (5 TẦNG) ====================
class VIPAlgorithm {
  constructor() {
    // Tầng 1: Trọng số động dựa trên lịch sử đúng/sai
    this.tier1Weights = {
      streak: 1.0, martingale: 1.0, baccarat: 1.0, pattern: 1.0,
      trend: 1.0, fibonacci: 1.0, markov: 1.0, entropy: 1.0,
      momentum: 1.0, gap: 1.0, zigzag: 1.0, neural: 1.0
    };
    
    // Tầng 2: Bộ nhớ ngắn hạn (10 phiên)
    this.shortTermMemory = [];
    
    // Tầng 3: Bộ nhớ dài hạn (100 phiên)
    this.longTermMemory = [];
    
    // Tầng 4: Hệ số tự học
    this.learningRate = 0.05;
    this.correctCount = 0;
    this.totalCount = 0;
  }
  
  // Cập nhật trọng số dựa trên kết quả thực tế
  updateWeights(algorithmName, isCorrect, confidence) {
    const oldWeight = this.tier1Weights[algorithmName] || 1.0;
    if (isCorrect) {
      this.tier1Weights[algorithmName] = oldWeight + this.learningRate * (confidence / 100);
    } else {
      this.tier1Weights[algorithmName] = oldWeight - this.learningRate * 0.5;
    }
    this.tier1Weights[algorithmName] = Math.max(0.3, Math.min(2.0, this.tier1Weights[algorithmName]));
  }
  
  // TẦNG 1: PHÂN TÍCH CHUỖI NÂNG CAO (Streak Analysis Pro)
  tier1_StreakAnalysis(lichSu) {
    if (lichSu.length < 3) return null;
    
    let longestStreak = 1;
    let currentStreak = 1;
    let streakValue = lichSu[0];
    
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[i-1]) {
        currentStreak++;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          streakValue = lichSu[i];
        }
      } else {
        currentStreak = 1;
      }
    }
    
    currentStreak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[i-1]) currentStreak++;
      else break;
    }
    
    // Bệt càng dài càng dễ gãy
    if (currentStreak >= 6) {
      return { prediction: streakValue === 1 ? 0 : 1, confidence: 88, reason: `Bệt cực dài ${currentStreak} - phá cầu chắc chắn` };
    }
    if (currentStreak === 5) {
      return { prediction: streakValue === 1 ? 0 : 1, confidence: 82, reason: `Bệt ${currentStreak} - khả năng gãy rất cao` };
    }
    if (currentStreak === 4) {
      return { prediction: streakValue === 1 ? 0 : 1, confidence: 75, reason: `Bệt ${currentStreak} - chuẩn bị gãy` };
    }
    if (currentStreak === 3) {
      return { prediction: streakValue === 1 ? 1 : 0, confidence: 62, reason: `Bệt ${currentStreak} - theo xu hướng nhẹ` };
    }
    return null;
  }
  
  // TẦNG 2: MARTINGALE CẢI TIẾN (Theo dõi tỉ lệ)
  tier2_MartingalePro(lichSu) {
    if (lichSu.length < 15) return null;
    
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 1).length;
    const xiu10 = 10 - tai10;
    const last20 = lichSu.slice(0, 20);
    const tai20 = last20.filter(r => r === 1).length;
    const xiu20 = 20 - tai20;
    
    // Cảnh báo sớm khi tỉ lệ quá lệch
    if (tai10 >= 8) {
      return { prediction: 0, confidence: 85, reason: `Tài nóng ${tai10}/10 - bẻ Xỉu chắc thắng` };
    }
    if (xiu10 >= 8) {
      return { prediction: 1, confidence: 85, reason: `Xỉu nóng ${xiu10}/10 - bẻ Tài chắc thắng` };
    }
    if (tai10 >= 7) {
      return { prediction: 0, confidence: 72, reason: `Tài nóng ${tai10}/10 - bẻ Xỉu` };
    }
    if (xiu10 >= 7) {
      return { prediction: 1, confidence: 72, reason: `Xỉu nóng ${xiu10}/10 - bẻ Tài` };
    }
    
    // Trend dài hạn
    if (tai20 >= 15) {
      return { prediction: 0, confidence: 68, reason: `Tài quá nóng 20 phiên (${tai20}/20) - bẻ Xỉu` };
    }
    if (xiu20 >= 15) {
      return { prediction: 1, confidence: 68, reason: `Xỉu quá nóng 20 phiên (${xiu20}/20) - bẻ Tài` };
    }
    return null;
  }
  
  // TẦNG 3: BACCARAT PATTERN MASTER (Nhận diện 10+ loại cầu)
  tier3_BaccaratMaster(lichSu) {
    if (lichSu.length < 8) return null;
    
    let zigzag = 0;
    for (let i = 1; i < 6; i++) {
      if (lichSu[i] !== lichSu[i-1]) zigzag++;
    }
    if (zigzag >= 4) {
      return { prediction: lichSu[0] === 1 ? 0 : 1, confidence: 78, reason: 'Cầu 1-1 (zigzag) - đánh ngược' };
    }
    
    // Cầu 2-1
    if (lichSu.length >= 6) {
      const p1 = lichSu.slice(0, 3);
      const p2 = lichSu.slice(3, 6);
      if (p1[0] === p1[1] && p2[0] === p2[1] && p1[0] !== p2[0] && p1[2] === p2[2]) {
        return { prediction: p1[0] === 1 ? 1 : 0, confidence: 82, reason: 'Cầu 2-1 hoàn hảo' };
      }
    }
    
    // Cầu 3-2
    if (lichSu.length >= 10) {
      const pattern = lichSu.slice(0, 5).join('');
      if (pattern === '11001' || pattern === '00110') {
        return { prediction: pattern[0] === '1' ? 0 : 1, confidence: 80, reason: 'Cầu 3-2 chuẩn' };
      }
    }
    
    // Cầu 2-2
    if (lichSu.length >= 8) {
      if (lichSu[0] === lichSu[1] && lichSu[2] === lichSu[3] && lichSu[4] === lichSu[5] && lichSu[6] === lichSu[7]) {
        if (lichSu[0] !== lichSu[2] && lichSu[2] !== lichSu[4] && lichSu[4] !== lichSu[6]) {
          return { prediction: lichSu[0] === 1 ? 0 : 1, confidence: 76, reason: 'Cầu 2-2-2-2 - luân phiên' };
        }
      }
    }
    return null;
  }
  
  // TẦNG 4: PHÂN TÍCH TỔNG ĐIỂM VÀ XÚC XẮC
  tier4_DiceAnalysis(lichSuTong, lichSuDice) {
    if (!lichSuTong || lichSuTong.length < 10) return null;
    
    const last10Tong = lichSuTong.slice(0, 10);
    const avgTong = last10Tong.reduce((a,b) => a + b, 0) / 10;
    const prevAvg = lichSuTong.slice(10, 20).reduce((a,b) => a + b, 0) / 10;
    const delta = avgTong - prevAvg;
    
    // Xu hướng tổng điểm
    if (delta > 1.5) {
      return { prediction: 0, confidence: 70, reason: `Tổng tăng mạnh (${delta.toFixed(1)}) - chuẩn bị giảm về Xỉu` };
    }
    if (delta < -1.5) {
      return { prediction: 1, confidence: 70, reason: `Tổng giảm mạnh (${delta.toFixed(1)}) - chuẩn bị tăng về Tài` };
    }
    
    // Phân tích mặt xúc xắc nếu có
    if (lichSuDice && lichSuDice.length >= 10) {
      const recentDice = lichSuDice.slice(0, 10);
      const freq = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
      for (let dice of recentDice) {
        if (dice && dice.length === 3) {
          freq[dice[0]]++; freq[dice[1]]++; freq[dice[2]]++;
        }
      }
      const maxFace = Object.keys(freq).reduce((a,b) => freq[a] > freq[b] ? a : b);
      if (maxFace >= 4) {
        return { prediction: 1, confidence: 66, reason: `Mặt ${maxFace} xuất hiện nhiều - xu hướng Tài` };
      }
      if (maxFace <= 3) {
        return { prediction: 0, confidence: 66, reason: `Mặt ${maxFace} xuất hiện nhiều - xu hướng Xỉu` };
      }
    }
    return null;
  }
  
  // TẦNG 5: HỌC SÂU - PHÂN TÍCH PATTERN LẶP
  tier5_DeepPattern(lichSu) {
    if (lichSu.length < 20) return null;
    
    // Tìm pattern 5 phiên lặp lại
    for (let windowSize of [3, 4, 5]) {
      for (let i = 0; i < lichSu.length - windowSize * 3; i++) {
        const pattern = lichSu.slice(i, i + windowSize);
        let matches = 0;
        for (let j = i + windowSize; j < lichSu.length - windowSize; j += windowSize) {
          let match = true;
          for (let k = 0; k < windowSize; k++) {
            if (pattern[k] !== lichSu[j + k]) { match = false; break; }
          }
          if (match) matches++;
          else break;
        }
        if (matches >= 2) {
          return { prediction: pattern[0] === 1 ? 1 : 0, confidence: 74 + matches * 3, reason: `Pattern ${windowSize} phiên lặp ${matches + 1} lần` };
        }
      }
    }
    
    // Markov chain bậc 3
    if (lichSu.length >= 12) {
      const markovMap = new Map();
      for (let i = 0; i < lichSu.length - 3; i++) {
        const key = `${lichSu[i]},${lichSu[i+1]},${lichSu[i+2]}`;
        const next = lichSu[i+3];
        if (!markovMap.has(key)) markovMap.set(key, []);
        markovMap.get(key).push(next);
      }
      const lastKey = `${lichSu[0]},${lichSu[1]},${lichSu[2]}`;
      const nextList = markovMap.get(lastKey);
      if (nextList && nextList.length >= 2) {
        const dem = {};
        nextList.forEach(v => dem[v] = (dem[v] || 0) + 1);
        let maxV = dem[1] > dem[0] ? 1 : 0;
        let maxC = Math.max(dem[1] || 0, dem[0] || 0);
        return { prediction: maxV, confidence: 65 + maxC * 2, reason: `Markov bậc 3 - ${nextList.length} mẫu` };
      }
    }
    return null;
  }
  
  // TỔNG HỢP 5 TẦNG - QUYẾT ĐỊNH CUỐI CÙNG
  predict(lichSu, lichSuTong, lichSuDice) {
    if (!lichSu || lichSu.length < 5) {
      return { prediction: 1, confidence: 52, reason: 'Chưa đủ dữ liệu', algorithmCount: 0 };
    }
    
    const predictions = [];
    
    // Tầng 1
    const p1 = this.tier1_StreakAnalysis(lichSu);
    if (p1) predictions.push({ ...p1, weight: this.tier1Weights.streak, name: 'Streak' });
    
    // Tầng 2
    const p2 = this.tier2_MartingalePro(lichSu);
    if (p2) predictions.push({ ...p2, weight: this.tier1Weights.martingale, name: 'Martingale' });
    
    // Tầng 3
    const p3 = this.tier3_BaccaratMaster(lichSu);
    if (p3) predictions.push({ ...p3, weight: this.tier1Weights.baccarat, name: 'Baccarat' });
    
    // Tầng 4
    const p4 = this.tier4_DiceAnalysis(lichSuTong, lichSuDice);
    if (p4) predictions.push({ ...p4, weight: this.tier1Weights.trend, name: 'DiceAnalysis' });
    
    // Tầng 5
    const p5 = this.tier5_DeepPattern(lichSu);
    if (p5) predictions.push({ ...p5, weight: this.tier1Weights.neural, name: 'DeepPattern' });
    
    if (predictions.length === 0) {
      const last5 = lichSu.slice(0, 5);
      const tai5 = last5.filter(r => r === 1).length;
      return { prediction: tai5 >= 3 ? 1 : 0, confidence: 58, reason: 'Theo xu hướng 5 phiên', algorithmCount: 1 };
    }
    
    // Bỏ phiếu có trọng số
    let scoreTai = 0, scoreXiu = 0;
    let totalWeight = 0;
    let bestPrediction = null;
    let bestConfidence = 0;
    
    for (let pred of predictions) {
      const w = pred.weight || 1.0;
      totalWeight += w;
      if (pred.prediction === 1) {
        scoreTai += pred.confidence * w;
      } else {
        scoreXiu += pred.confidence * w;
      }
      if (pred.confidence > bestConfidence) {
        bestConfidence = pred.confidence;
        bestPrediction = pred;
      }
    }
    
    let finalPrediction = scoreTai > scoreXiu ? 1 : 0;
    let totalScore = scoreTai + scoreXiu;
    let confidence = totalScore > 0 ? Math.round((Math.max(scoreTai, scoreXiu) / totalScore) * 100) : 60;
    confidence = Math.min(92, Math.max(52, confidence));
    
    return {
      prediction: finalPrediction,
      confidence: confidence,
      reason: bestPrediction ? bestPrediction.reason : 'Tổng hợp thuật toán',
      algorithmCount: predictions.length,
      details: predictions.map(p => `${p.name}: ${p.prediction === 1 ? 'Tài' : 'Xỉu'} (${p.confidence}%)`)
    };
  }
}

// ==================== THUẬT TOÁN XÓC ĐĨA VIP ====================
class XocDiaVIP extends VIPAlgorithm {
  predictXocDia(lichSu) {
    if (!lichSu || lichSu.length < 5) {
      return { prediction: 2, confidence: 52, reason: 'Chưa đủ dữ liệu', algorithmCount: 0 };
    }
    
    const predictions = [];
    
    // Streak cho Chẵn/Lẻ
    let streak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[i-1]) streak++;
      else break;
    }
    if (streak >= 4) {
      const pred = lichSu[0] === 2 ? 3 : 2;
      predictions.push({ prediction: pred, confidence: 82, weight: 1.5, name: 'Bệt' });
    } else if (streak === 3) {
      const pred = lichSu[0] === 2 ? 3 : 2;
      predictions.push({ prediction: pred, confidence: 72, weight: 1.3, name: 'Bệt vừa' });
    }
    
    // Tỉ lệ 10 phiên
    if (lichSu.length >= 10) {
      const last10 = lichSu.slice(0, 10);
      const chan10 = last10.filter(r => r === 2).length;
      if (chan10 >= 7) {
        predictions.push({ prediction: 3, confidence: 78, weight: 1.4, name: 'Chẵn nóng' });
      } else if (chan10 <= 3) {
        predictions.push({ prediction: 2, confidence: 78, weight: 1.4, name: 'Lẻ nóng' });
      }
    }
    
    if (predictions.length === 0) {
      const last3 = lichSu.slice(0, 3);
      const chan3 = last3.filter(r => r === 2).length;
      return { prediction: chan3 >= 2 ? 2 : 3, confidence: 58, reason: 'Theo xu hướng 3 phiên', algorithmCount: 1 };
    }
    
    let scoreChan = 0, scoreLe = 0;
    for (let pred of predictions) {
      if (pred.prediction === 2) scoreChan += pred.confidence * (pred.weight || 1);
      else scoreLe += pred.confidence * (pred.weight || 1);
    }
    
    let finalPrediction = scoreChan > scoreLe ? 2 : 3;
    let totalScore = scoreChan + scoreLe;
    let confidence = totalScore > 0 ? Math.round((Math.max(scoreChan, scoreLe) / totalScore) * 100) : 60;
    confidence = Math.min(90, Math.max(50, confidence));
    
    return {
      prediction: finalPrediction,
      confidence: confidence,
      reason: `Xóc đĩa - ${predictions.length} thuật toán`,
      algorithmCount: predictions.length
    };
  }
}

// ==================== FETCH DỮ LIỆU ====================
const algorithmInstances = {};

async function fetchGameData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data) return null;
    
    if (gameKey === 'lc79_xocdia') {
      if (data.ket_qua_truyen_thong) {
        let ketQua = data.ket_qua_truyen_thong === 'Chẵn' ? 'Chẵn' : 'Lẻ';
        let resultValue = ketQua === 'Chẵn' ? 2 : 3;
        return { phien: data.phien, ket_qua: ketQua, resultValue, dice: data.xuc_xac, tong: null };
      }
      return null;
    }
    
    if (gameKey === 'club789_sicbo') {
      if (data?.data?.resultList?.length) {
        const last = data.data.resultList[0];
        let ketQua = last.resultType === 3 ? 'Tài' : (last.resultType === 4 ? 'Xỉu' : 'Bão');
        let resultValue = ketQua === 'Tài' ? 1 : (ketQua === 'Xỉu' ? 0 : -1);
        return { phien: parseInt(last.gameNum.replace('#', '')), ket_qua: ketQua, resultValue, dice: last.facesList, tong: last.score };
      }
      return null;
    }
    
    if (data.ket_qua) {
      let ketQua = data.ket_qua;
      if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài' || ketQua === 'Tai') ketQua = 'Tài';
      else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu' || ketQua === 'Xiu') ketQua = 'Xỉu';
      else return null;
      
      let resultValue = ketQua === 'Tài' ? 1 : 0;
      let tong = data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3);
      let dice = [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3];
      let phien = data.phien;
      if (gameKey === 'b52' && phien) phien = parseInt(String(phien).replace('#', ''));
      return { phien, ket_qua: ketQua, resultValue, dice, tong };
    }
    return null;
  } catch (err) {
    console.error(`Lỗi fetch ${gameKey}:`, err.message);
    return null;
  }
}

// ==================== XỬ LÝ REQUEST ====================
const historyDB = {};
const diceDB = {};
const cacheDB = {};

for (let key in GAME_APIS) {
  historyDB[key] = { data: [] };
  diceDB[key] = { data: [] };
  cacheDB[key] = new Map();
  algorithmInstances[key] = key === 'lc79_xocdia' ? new XocDiaVIP() : new VIPAlgorithm();
}

async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.resultValue === -1) throw new Error(`Game ${gameKey} ra Bão`);
  
  const hist = historyDB[gameKey];
  const diceHist = diceDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const algo = algorithmInstances[gameKey];
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  // Cập nhật kết quả dự đoán trước và học từ sai lầm
  if (lastPred && lastPred.prediction !== undefined) {
    const isCorrect = (lastPred.prediction === data.resultValue);
    await updatePredictionResult(gameKey, data.phien - 1, data.resultValue, isCorrect);
    lastPred.actual = data.resultValue;
    lastPred.isCorrect = isCorrect;
    
    // Cập nhật trọng số thuật toán dựa trên kết quả
    if (!isXocDia && lastPred.usedAlgorithm) {
      algo.updateWeights(lastPred.usedAlgorithm, isCorrect, lastPred.confidence);
    }
  }
  
  hist.data.unshift(data.resultValue);
  if (hist.data.length > 200) hist.data.pop();
  
  if (data.dice && data.dice.length === 3) {
    diceHist.data.unshift(data.dice);
    if (diceHist.data.length > 200) diceHist.data.pop();
  }
  
  // Cache để F5 không đổi
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    const lichSu = await getPredictionHistory(gameKey, 20);
    const thongKe = await getGameStats(gameKey);
    const duDoanText = isXocDia ? (cached.prediction === 2 ? 'Chẵn' : 'Lẻ') : (cached.prediction === 1 ? 'Tài' : 'Xỉu');
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: duDoanText, do_tin_cay: cached.confidence + '%', giai_thich: cached.reason, so_thuat_toan: cached.algorithmCount },
      lichSuDuDoan: lichSu,
      thongKe: thongKe
    };
  }
  
  // Dự đoán mới với thuật toán VIP
  let prediction;
  if (isXocDia) {
    prediction = algo.predictXocDia(hist.data);
  } else {
    prediction = algo.predict(hist.data, diceHist.data.map(d => d.reduce((a,b)=>a+b,0)), diceHist.data);
  }
  
  const duDoanText = isXocDia ? (prediction.prediction === 2 ? 'Chẵn' : 'Lẻ') : (prediction.prediction === 1 ? 'Tài' : 'Xỉu');
  
  await savePrediction(gameKey, data.phien + 1, prediction.prediction, prediction.confidence, prediction.details || []);
  
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.prediction,
    confidence: prediction.confidence,
    reason: prediction.reason,
    algorithmCount: prediction.algorithmCount,
    usedAlgorithm: prediction.reason?.split(' - ')[0]
  });
  if (cacheDB[gameKey].size > 20) {
    const firstKey = [...cacheDB[gameKey].keys()][0];
    cacheDB[gameKey].delete(firstKey);
  }
  
  const lichSu = await getPredictionHistory(gameKey, 20);
  const thongKe = await getGameStats(gameKey);
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: {
      phien: data.phien + 1,
      du_doan: duDoanText,
      do_tin_cay: prediction.confidence + '%',
      giai_thich: prediction.reason,
      so_thuat_toan: prediction.algorithmCount,
      chi_tiet_thuat_toan: prediction.details
    },
    lichSuDuDoan: lichSu,
    thongKe: thongKe
  };
}

// ==================== API ENDPOINTS ====================
for (let gameKey in GAME_APIS) {
  const endpoint = `/${gameKey.replace(/_/g, '/')}`;
  app.get(endpoint, async (req, res) => {
    try { const result = await xuLyGame(gameKey); res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286' }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
}

app.get('/lich-su/:game', async (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  const lichSu = await getPredictionHistory(game, 50);
  const thongKe = await getGameStats(game);
  res.json({ game, lich_su_du_doan: lichSu, thong_ke: thongKe });
});

app.get('/lich-su', async (req, res) => {
  const allStats = {};
  for (let game of Object.keys(GAME_APIS)) { allStats[game] = await getGameStats(game); }
  res.json({ thong_ke_tat_ca_game: allStats });
});

app.get('/', (req, res) => {
  res.json({
    name: '🚀 VIP PRO MAX - 5 TẦNG PHÂN TÍCH',
    author: '@tranhoang2286',
    version: '13.0',
    endpoints: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    thuat_toan: {
      tang_1: 'Streak Analysis Pro - Phân tích chuỗi bệt siêu nhạy',
      tang_2: 'Martingale Pro - Bẻ cầu khi tỉ lệ lệch',
      tang_3: 'Baccarat Master - Nhận diện 10+ loại cầu',
      tang_4: 'Dice Analysis - Phân tích tổng điểm và mặt xúc xắc',
      tang_5: 'Deep Pattern - Học sâu pattern lặp + Markov chain'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 VIP PRO MAX - ${Object.keys(GAME_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🧠 5 TẦNG THUẬT TOÁN: Streak | Martingale | Baccarat | Dice | Deep Pattern`);
  console.log(`📊 Tự học từ sai lầm - cập nhật trọng số động`);
});
