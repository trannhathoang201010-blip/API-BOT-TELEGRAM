const express = require('express');
const axios = require('axios');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==================== API NGUỒN (CẬP NHẬT MỚI NHẤT) ====================
const GAME_APIS = {
  // Tài Xỉu
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
  // Sicbo
  'sunwin_sicbo': 'https://afterwards-motels-honors-vendors.trycloudflare.com/api/sunsicbo',
  'club789_sicbo': 'https://demo7892.fun/history/getLastResult?gameId=ktrng_3986&size=100&tableId=398625062021&curPage=1',
  // Xóc Đĩa
  'lc79_xocdia': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/xocdia'
};

// ==================== KHỞI TẠO DATABASE ====================
const db = new sqlite3.Database('mega_bridge.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT,
    session_id INTEGER,
    predicted INTEGER,
    actual INTEGER,
    confidence REAL,
    patterns_used TEXT,
    is_correct INTEGER,
    timestamp TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS collected_bridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT,
    bridge_type TEXT,
    pattern_data TEXT,
    frequency INTEGER DEFAULT 1,
    last_seen TEXT
  )`);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_game ON predictions(game)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_session ON predictions(game, session_id)`);
});

// ==================== HÀM DATABASE ====================
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
          du_doan: r.predicted === 1 ? 'Tài' : (r.predicted === 0 ? 'Xỉu' : 'Chẵn'),
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

// ==================== PHÁT HIỆN CẦU (TÀI XỈU - SICBO) ====================
class BridgeDetector {
  constructor(game) { this.game = game; }
  
  detectCauBet(data) {
    const bridges = [];
    let i = 0;
    while (i < data.length) {
      let count = 1;
      while (i + count < data.length && data[i] === data[i + count]) count++;
      if (count >= 2) {
        bridges.push({ type: 'CAU_BET', prediction: data[i], strength: Math.min(count / 10, 1.0) });
        this.saveCollectedBridge('CAU_BET', [data[i], count]);
      }
      i += count;
    }
    return bridges;
  }
  
  detectCau1_1(data) {
    const bridges = [];
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] !== data[i+1] && data[i+1] !== data[i+2] && data[i] === data[i+2]) {
        let length = 3;
        while (i + length < data.length && data[i+length] !== data[i+length-1]) {
          if (length % 2 === 0) { if (data[i+length] !== data[i]) break; }
          else { if (data[i+length] !== data[i+1]) break; }
          length++;
        }
        if (length >= 3) {
          const nextPred = length % 2 === 0 ? data[i] : data[i+1];
          bridges.push({ type: 'CAU_1_1', prediction: nextPred, strength: Math.min(length / 8, 0.9) });
          this.saveCollectedBridge('CAU_1_1', [data[i], data[i+1], length]);
        }
      }
    }
    return bridges;
  }
  
  detectPatternSequence(data, a, b, typeName) {
    const bridges = [];
    const patternLen = a + b;
    if (data.length < patternLen * 2) return bridges;
    for (let start = 0; start < data.length - patternLen * 2; start++) {
      let cycles = 0, pos = start;
      const firstVal = data[start], secondVal = data[start + a];
      while (pos + patternLen <= data.length && cycles < 20) {
        let match = true;
        for (let j = 0; j < a; j++) if (data[pos + j] !== firstVal) match = false;
        for (let j = 0; j < b; j++) if (data[pos + a + j] !== secondVal) match = false;
        if (!match) break;
        cycles++;
        pos += patternLen;
      }
      if (cycles >= 2) {
        bridges.push({ type: typeName, prediction: cycles % 2 === 0 ? firstVal : secondVal, strength: Math.min(cycles / 10, 0.85) });
        this.saveCollectedBridge(typeName, [a, b, cycles]);
      }
    }
    return bridges;
  }
  
  detectCauDoiXung(data) {
    const bridges = [];
    for (let center = 2; center < data.length - 2; center++) {
      let radius = 1;
      while (center - radius >= 0 && center + radius < data.length && radius <= 10) {
        if (data[center - radius] !== data[center + radius]) break;
        radius++;
      }
      if (radius >= 2) {
        bridges.push({ type: 'CAU_DOI_XUNG', prediction: data[center - radius + 1], strength: Math.min(radius / 5, 0.8) });
        this.saveCollectedBridge('CAU_DOI_XUNG', [center, radius - 1]);
      }
    }
    return bridges;
  }
  
  detectCauLuanPhien(data) {
    const bridges = [];
    for (let cycleLen of [3, 4, 5]) {
      if (data.length < cycleLen * 3) continue;
      for (let start = 0; start < data.length - cycleLen * 3; start++) {
        const cycle = data.slice(start, start + cycleLen);
        let matches = 0;
        for (let k = 1; k <= 3; k++) {
          const nextStart = start + cycleLen * k;
          if (nextStart + cycleLen <= data.length) {
            if (JSON.stringify(cycle) === JSON.stringify(data.slice(nextStart, nextStart + cycleLen))) matches++;
          }
        }
        if (matches >= 2) {
          bridges.push({ type: 'CAU_LUAN_PHIEN', prediction: cycle[0], strength: 0.75 });
          this.saveCollectedBridge('CAU_LUAN_PHIEN', cycle);
        }
      }
    }
    return bridges;
  }
  
  saveCollectedBridge(bridgeType, patternData) {
    db.run(`INSERT INTO collected_bridges (game, bridge_type, pattern_data, frequency, last_seen)
            VALUES (?, ?, ?, 1, ?) ON CONFLICT DO UPDATE SET frequency = frequency + 1, last_seen = ?`,
      [this.game, bridgeType, JSON.stringify(patternData), new Date().toISOString(), new Date().toISOString()]);
  }
  
  detectAllBridges(data) {
    let bridges = [];
    bridges.push(...this.detectCauBet(data));
    bridges.push(...this.detectCau1_1(data));
    bridges.push(...this.detectPatternSequence(data, 2, 1, 'CAU_2_1'));
    bridges.push(...this.detectPatternSequence(data, 1, 2, 'CAU_1_2'));
    bridges.push(...this.detectPatternSequence(data, 2, 2, 'CAU_2_2'));
    bridges.push(...this.detectPatternSequence(data, 3, 1, 'CAU_3_1'));
    bridges.push(...this.detectPatternSequence(data, 1, 3, 'CAU_1_3'));
    bridges.push(...this.detectPatternSequence(data, 3, 2, 'CAU_3_2'));
    bridges.push(...this.detectPatternSequence(data, 2, 3, 'CAU_2_3'));
    bridges.push(...this.detectPatternSequence(data, 3, 3, 'CAU_3_3'));
    bridges.push(...this.detectCauDoiXung(data));
    bridges.push(...this.detectCauLuanPhien(data));
    return bridges;
  }
}

// ==================== THUẬT TOÁN XÓC ĐĨA (CHẴN/LẺ) ====================
class XocDiaDetector {
  constructor(game) { this.game = game; }
  
  detectCauBet(data) {
    const bridges = [];
    let i = 0;
    while (i < data.length) {
      let count = 1;
      while (i + count < data.length && data[i] === data[i + count]) count++;
      if (count >= 2) {
        bridges.push({ type: 'CAU_BET_XD', prediction: data[i], strength: Math.min(count / 10, 0.9) });
      }
      i += count;
    }
    return bridges;
  }
  
  detectCau1_1(data) {
    const bridges = [];
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] !== data[i+1] && data[i] === data[i+2]) {
        bridges.push({ type: 'CAU_1_1_XD', prediction: data[i], strength: 0.75 });
      }
    }
    return bridges;
  }
  
  detectAllBridges(data) {
    let bridges = [];
    bridges.push(...this.detectCauBet(data));
    bridges.push(...this.detectCau1_1(data));
    return bridges;
  }
}

// ==================== TRỌNG SỐ ====================
const WEIGHTS = {
  'CAU_BET': 1.5, 'CAU_1_1': 1.3, 'CAU_2_1': 1.1, 'CAU_1_2': 1.1,
  'CAU_2_2': 1.2, 'CAU_3_1': 0.9, 'CAU_1_3': 0.9, 'CAU_3_2': 1.0,
  'CAU_2_3': 1.0, 'CAU_3_3': 1.1, 'CAU_DOI_XUNG': 0.8, 'CAU_LUAN_PHIEN': 0.85,
  'CAU_BET_XD': 1.4, 'CAU_1_1_XD': 1.2
};

// ==================== DỰ ĐOÁN ====================
async function makePrediction(gameKey, lichSu, isXocDia = false) {
  if (!lichSu || lichSu.length < 5) {
    return { prediction: 1, confidence: 52, patternsCount: 0, scores: { Tai: 0, Xiu: 0 } };
  }
  
  let bridges;
  if (isXocDia) {
    const detector = new XocDiaDetector(gameKey);
    bridges = detector.detectAllBridges(lichSu);
  } else {
    const detector = new BridgeDetector(gameKey);
    bridges = detector.detectAllBridges(lichSu);
  }
  
  if (bridges.length === 0) {
    const last3 = lichSu.slice(0, 3);
    const val3 = last3.filter(r => r === 1).length;
    return { prediction: val3 >= 2 ? 1 : 0, confidence: 55, patternsCount: 0, scores: { Tai: 0, Xiu: 0 } };
  }
  
  let scores = { 0: 0, 1: 0 };
  for (let bridge of bridges) {
    const weight = WEIGHTS[bridge.type] || 0.5;
    const score = bridge.strength * weight * 10;
    scores[bridge.prediction] += score;
  }
  
  let finalPrediction = scores[1] > scores[0] ? 1 : 0;
  let totalScore = scores[0] + scores[1];
  let confidence = totalScore > 0 ? Math.round((scores[finalPrediction] / totalScore) * 100) : 55;
  confidence = Math.min(88, Math.max(48, confidence));
  
  return {
    prediction: finalPrediction,
    confidence: confidence,
    patternsCount: bridges.length,
    scores: { Tai_Xiu: Math.round(scores[1]), Xiu_Tai: Math.round(scores[0]) }
  };
}

async function makeXocDiaPrediction(gameKey, lichSu) {
  if (!lichSu || lichSu.length < 5) {
    return { prediction: 2, confidence: 52, patternsCount: 0, scores: { Chan: 0, Le: 0 } };
  }
  
  const detector = new XocDiaDetector(gameKey);
  const bridges = detector.detectAllBridges(lichSu);
  
  if (bridges.length === 0) {
    const last3 = lichSu.slice(0, 3);
    const chan3 = last3.filter(r => r === 2).length;
    return { prediction: chan3 >= 2 ? 2 : 3, confidence: 55, patternsCount: 0, scores: { Chan: 0, Le: 0 } };
  }
  
  let scores = { 2: 0, 3: 0 };
  for (let bridge of bridges) {
    const weight = WEIGHTS[bridge.type] || 0.5;
    const score = bridge.strength * weight * 10;
    scores[bridge.prediction] += score;
  }
  
  let finalPrediction = scores[2] > scores[3] ? 2 : 3;
  let totalScore = scores[2] + scores[3];
  let confidence = totalScore > 0 ? Math.round((scores[finalPrediction] / totalScore) * 100) : 55;
  confidence = Math.min(88, Math.max(48, confidence));
  
  return {
    prediction: finalPrediction,
    confidence: confidence,
    patternsCount: bridges.length,
    scores: { Chan: Math.round(scores[2]), Le: Math.round(scores[3]) }
  };
}

// ==================== FETCH DỮ LIỆU ====================
async function fetchGameData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data) return null;
    
    // Xóc Đĩa
    if (gameKey === 'lc79_xocdia') {
      if (data.ket_qua_truyen_thong) {
        let ketQua = data.ket_qua_truyen_thong === 'Chẵn' ? 'Chẵn' : 'Lẻ';
        let resultValue = ketQua === 'Chẵn' ? 2 : 3;
        return { phien: data.phien, ket_qua: ketQua, resultValue, dice: data.xuc_xac, tong: null };
      }
      return null;
    }
    
    // Sicbo 789Club
    if (gameKey === 'club789_sicbo') {
      if (data?.data?.resultList?.length) {
        const last = data.data.resultList[0];
        let ketQua = last.resultType === 3 ? 'Tài' : (last.resultType === 4 ? 'Xỉu' : 'Bão');
        let resultValue = ketQua === 'Tài' ? 1 : (ketQua === 'Xỉu' ? 0 : -1);
        return { phien: parseInt(last.gameNum.replace('#', '')), ket_qua: ketQua, resultValue, dice: last.facesList, tong: last.score };
      }
      return null;
    }
    
    // Các game còn lại
    if (data.ket_qua) {
      let ketQua = data.ket_qua;
      if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài' || ketQua === 'Tai') ketQua = 'Tài';
      else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu' || ketQua === 'xiu') ketQua = 'Xỉu';
      else return null;
      
      let resultValue = ketQua === 'Tài' ? 1 : 0;
      let tong = data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3);
      let dice = [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3];
      let phien = data.phien;
      if (gameKey === 'b52' && phien) phien = parseInt(String(phien).replace('#', ''));
      if (gameKey === 'max789' && phien) phien = data.phien;
      
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
const cacheDB = {};

for (let key in GAME_APIS) {
  historyDB[key] = { data: [] };
  cacheDB[key] = new Map();
}

async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.resultValue === -1) throw new Error(`Game ${gameKey} ra Bão, bỏ qua dự đoán`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  if (lastPred && lastPred.prediction !== undefined) {
    const isCorrect = (lastPred.prediction === data.resultValue);
    await updatePredictionResult(gameKey, data.phien - 1, data.resultValue, isCorrect);
    lastPred.actual = data.resultValue;
    lastPred.isCorrect = isCorrect;
  }
  
  hist.data.unshift(data.resultValue);
  if (hist.data.length > 200) hist.data.pop();
  
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    const lichSu = await getPredictionHistory(gameKey, 20);
    const thongKe = await getGameStats(gameKey);
    const duDoanText = isXocDia ? (cached.prediction === 2 ? 'Chẵn' : 'Lẻ') : (cached.prediction === 1 ? 'Tài' : 'Xỉu');
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: duDoanText, do_tin_cay: cached.confidence + '%', so_cau_phat_hien: cached.patternsCount },
      lichSuDuDoan: lichSu,
      thongKe: thongKe
    };
  }
  
  let prediction;
  if (isXocDia) {
    prediction = await makeXocDiaPrediction(gameKey, hist.data);
  } else {
    prediction = await makePrediction(gameKey, hist.data);
  }
  
  const duDoanText = isXocDia ? (prediction.prediction === 2 ? 'Chẵn' : 'Lẻ') : (prediction.prediction === 1 ? 'Tài' : 'Xỉu');
  
  await savePrediction(gameKey, data.phien + 1, prediction.prediction, prediction.confidence, []);
  
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.prediction, confidence: prediction.confidence,
    patternsCount: prediction.patternsCount, scores: prediction.scores
  });
  if (cacheDB[gameKey].size > 20) cacheDB[gameKey].delete([...cacheDB[gameKey].keys()][0]);
  
  const lichSu = await getPredictionHistory(gameKey, 20);
  const thongKe = await getGameStats(gameKey);
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: { phien: data.phien + 1, du_doan: duDoanText, do_tin_cay: prediction.confidence + '%', so_cau_phat_hien: prediction.patternsCount, chi_tiet_diem: prediction.scores },
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

app.get('/cau-da-thu-thap/:game', async (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại' });
  db.all(`SELECT bridge_type, pattern_data, frequency, last_seen FROM collected_bridges WHERE game = ? ORDER BY frequency DESC`,
    [game], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ game, so_loai_cau: rows.length, danh_sach_cau: rows.map(r => ({ loai: r.bridge_type, pattern: JSON.parse(r.pattern_data), tan_suat: r.frequency, lan_cuoi: r.last_seen })) });
    });
});

app.get('/lich-su', async (req, res) => {
  const allStats = {};
  for (let game of Object.keys(GAME_APIS)) { allStats[game] = await getGameStats(game); }
  res.json({ thong_ke_tat_ca_game: allStats });
});

app.get('/', (req, res) => {
  res.json({
    name: '🚀 MEGA BRIDGE AI - 12 GAME TÀI XỈU + SICBO + XÓC ĐĨA',
    author: '@tranhoang2286',
    version: '12.0',
    endpoints: {
      'Dự đoán theo game': Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
      'Lịch sử dự đoán': '/lich-su/:game',
      'Cầu đã thu thập': '/cau-da-thu-thap/:game',
      'Thống kê tất cả': '/lich-su'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MEGA BRIDGE AI - ${Object.keys(GAME_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🎲 Game list: ${Object.keys(GAME_APIS).join(', ')}`);
  console.log(`📊 Xóc Đĩa: thuật toán CHẴN/LẺ riêng`);
});
