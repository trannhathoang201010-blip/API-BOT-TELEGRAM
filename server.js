const express = require('express');
const axios = require('axios');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==================== API NGUỒN ====================
const TAIXIU_APIS = {
  'sunwin_tx': 'https://bracket-ellen-roads-prefer.trycloudflare.com/api/tx',
  'hitclub': 'https://letting-tackle-newton-oak.trycloudflare.com/api/tx',
  'lc79_tx': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/tx',
  'lc79_md5': 'https://chance-compete-chambers-feelings.trycloudflare.com/api/txmd5',
  'betvip_tx': 'https://plastic-diet-visits-opens.trycloudflare.com/api/tx',
  'betvip_md5': 'https://plastic-diet-visits-opens.trycloudflare.com/api/txmd5',
  'max789': 'https://cage-adjustment-whose-banner.trycloudflare.com/api/tx',
  'b52': 'https://gold-ultra-fails-handles.trycloudflare.com/txmd5',
  'luck8_md5': 'https://heroes-presents-pound-tablet.trycloudflare.com/api/txmd5'
};

const SICBO_APIS = {
  'sunwin_sicbo': 'https://afterwards-motels-honors-vendors.trycloudflare.com/api/sunsicbo',
  'club789_sicbo': 'https://demo7892.fun/history/getLastResult?gameId=ktrng_3986&size=100&tableId=398625062021&curPage=1'
};

const ALL_APIS = { ...TAIXIU_APIS, ...SICBO_APIS };

// ==================== KHỞI TẠO DATABASE ====================
const db = new sqlite3.Database('mega_bridge.db');

db.serialize(() => {
  // Bảng kết quả thô theo từng game
  db.run(`CREATE TABLE IF NOT EXISTS raw_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT,
    session_id INTEGER,
    result INTEGER,
    tong INTEGER,
    dice TEXT,
    timestamp TEXT
  )`);
  
  // Bảng lịch sử dự đoán theo từng game (QUAN TRỌNG)
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
  
  // Bảng cầu đã thu thập
  db.run(`CREATE TABLE IF NOT EXISTS collected_bridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT,
    bridge_type TEXT,
    pattern_data TEXT,
    length INTEGER,
    frequency INTEGER DEFAULT 1,
    success_rate REAL DEFAULT 0,
    last_seen TEXT
  )`);
  
  // Bảng cầu đang active
  db.run(`CREATE TABLE IF NOT EXISTS active_bridges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT,
    bridge_type TEXT,
    length INTEGER,
    strength REAL,
    predicted_next INTEGER,
    confidence REAL,
    last_update TEXT
  )`);
  
  // Indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_game ON predictions(game)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_session ON predictions(game, session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_collected_bridges ON collected_bridges(game, bridge_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_raw_results_game ON raw_results(game)`);
});

// ==================== HÀM DATABASE ====================
function saveResult(game, sessionId, result, tong, dice) {
  return new Promise((resolve) => {
    db.run(`INSERT INTO raw_results (game, session_id, result, tong, dice, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      [game, sessionId, result, tong, JSON.stringify(dice), new Date().toISOString()],
      (err) => resolve(!err));
  });
}

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

function saveCollectedBridge(game, bridgeType, patternData, length, successRate) {
  return new Promise((resolve) => {
    db.get(`SELECT id, frequency FROM collected_bridges 
            WHERE game = ? AND bridge_type = ? AND pattern_data = ?`,
      [game, bridgeType, JSON.stringify(patternData)], (err, row) => {
        if (row) {
          db.run(`UPDATE collected_bridges SET frequency = ?, last_seen = ?, success_rate = ? 
                  WHERE id = ?`, [row.frequency + 1, new Date().toISOString(), successRate, row.id], () => resolve(true));
        } else {
          db.run(`INSERT INTO collected_bridges (game, bridge_type, pattern_data, length, frequency, success_rate, last_seen)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [game, bridgeType, JSON.stringify(patternData), length, 1, successRate, new Date().toISOString()], () => resolve(true));
        }
      });
  });
}

function getPredictionHistory(game, limit = 50) {
  return new Promise((resolve) => {
    db.all(`SELECT session_id, predicted, actual, confidence, is_correct, timestamp 
            FROM predictions WHERE game = ? ORDER BY session_id DESC LIMIT ?`,
      [game, limit], (err, rows) => {
        if (err) resolve([]);
        else resolve(rows.map(r => ({
          phien: r.session_id,
          du_doan: r.predicted === 1 ? 'Tài' : 'Xỉu',
          thuc_te: r.actual === 1 ? 'Tài' : (r.actual === 0 ? 'Xỉu' : 'Chưa có'),
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

function getCollectedBridges(game) {
  return new Promise((resolve) => {
    db.all(`SELECT bridge_type, pattern_data, length, frequency, success_rate, last_seen 
            FROM collected_bridges WHERE game = ? ORDER BY frequency DESC`,
      [game], (err, rows) => {
        if (err) resolve([]);
        else resolve(rows.map(r => ({
          loai_cau: r.bridge_type,
          pattern: JSON.parse(r.pattern_data),
          do_dai: r.length,
          tan_suat: r.frequency,
          ty_le_thanh_cong: r.success_rate + '%',
          lan_cuoi: r.last_seen
        })));
      });
  });
}

function getAllCollectedBridgesSummary() {
  return new Promise((resolve) => {
    db.all(`SELECT game, bridge_type, COUNT(*) as count, SUM(frequency) as total_appearances
            FROM collected_bridges GROUP BY game, bridge_type ORDER BY game, total_appearances DESC`,
      [], (err, rows) => {
        if (err) resolve({});
        else {
          const summary = {};
          for (let row of rows) {
            if (!summary[row.game]) summary[row.game] = {};
            summary[row.game][row.bridge_type] = { so_luong_mau: row.count, so_lan_xuat_hien: row.total_appearances };
          }
          resolve(summary);
        }
      });
  });
}

// ==================== PHÁT HIỆN CẦU (20+ LOẠI) ====================
class BridgeDetector {
  constructor(game) {
    this.game = game;
    this.savedBridges = [];
  }

  detectCauBet(data) {
    const bridges = [];
    let i = 0;
    while (i < data.length) {
      let count = 1;
      while (i + count < data.length && data[i] === data[i + count]) count++;
      if (count >= 2) {
        const bridge = { type: 'CAU_BET', value: data[i], length: count, strength: Math.min(count / 10, 1.0), prediction: data[i] };
        bridges.push(bridge);
        saveCollectedBridge(this.game, 'CAU_BET', [data[i], count], count, bridge.strength * 100);
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
          bridges.push({ type: 'CAU_1_1', length, strength: Math.min(length / 8, 0.9), prediction: nextPred });
          saveCollectedBridge(this.game, 'CAU_1_1', [data[i], data[i+1], length], length, 85);
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
      let cycles = 0;
      let pos = start;
      const firstVal = data[start];
      const secondVal = data[start + a];
      
      while (pos + patternLen <= data.length && cycles < 20) {
        let match = true;
        for (let j = 0; j < a; j++) if (data[pos + j] !== firstVal) match = false;
        for (let j = 0; j < b; j++) if (data[pos + a + j] !== secondVal) match = false;
        if (!match) break;
        cycles++;
        pos += patternLen;
      }
      
      if (cycles >= 2) {
        bridges.push({ type: typeName, length: cycles * patternLen, strength: Math.min(cycles / 10, 0.85), prediction: cycles % 2 === 0 ? firstVal : secondVal });
        saveCollectedBridge(this.game, typeName, [a, b, cycles], cycles * patternLen, 75 + cycles * 2);
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
        bridges.push({ type: 'CAU_DOI_XUNG', radius: radius - 1, strength: Math.min(radius / 5, 0.8), prediction: data[center - radius + 1] });
        saveCollectedBridge(this.game, 'CAU_DOI_XUNG', [center, radius - 1], radius - 1, 70 + radius * 3);
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
            const nextCycle = data.slice(nextStart, nextStart + cycleLen);
            if (JSON.stringify(cycle) === JSON.stringify(nextCycle)) matches++;
          }
        }
        if (matches >= 2) {
          bridges.push({ type: 'CAU_LUAN_PHIEN', cycleLength: cycleLen, repetitions: matches, strength: 0.75, prediction: cycle[0] });
          saveCollectedBridge(this.game, 'CAU_LUAN_PHIEN', cycle, cycleLen, 72 + matches * 4);
        }
      }
    }
    return bridges;
  }

  detectCauNhayCoc(data) {
    const bridges = [];
    for (let step of [2, 3]) {
      for (let i = 0; i < data.length - step * 3; i++) {
        const seq = [data[i], data[i+step], data[i+step*2], data[i+step*3]];
        if (seq[0] === seq[2] && seq[1] === seq[3] && seq[0] !== seq[1]) {
          bridges.push({ type: 'CAU_NHAY_COC', step, strength: 0.68, prediction: seq[0] });
          saveCollectedBridge(this.game, 'CAU_NHAY_COC', seq, step * 3, 68);
        }
      }
    }
    return bridges;
  }

  detectCauSong(data) {
    const bridges = [];
    for (let i = 0; i < data.length - 4; i++) {
      if (data[i] < data[i+1] && data[i+1] > data[i+2] && data[i+2] < data[i+3]) {
        bridges.push({ type: 'CAU_SONG_NGAN', strength: 0.6, prediction: 1 });
        saveCollectedBridge(this.game, 'CAU_SONG_NGAN', data.slice(i, i+4), 4, 60);
      }
    }
    return bridges;
  }

  detectCauGapKhuc(data) {
    const bridges = [];
    for (let i = 0; i < data.length - 6; i++) {
      const segment = data.slice(i, i + 4);
      const allSame = segment.every(v => v === segment[0]);
      if (allSame && data[i+4] !== segment[0] && data[i+5] === data[i+4] && data[i+6] === data[i+4]) {
        bridges.push({ type: 'CAU_GAP_KHUC', changePoint: i + 4, strength: 0.72, prediction: data[i+4] });
        saveCollectedBridge(this.game, 'CAU_GAP_KHUC', [segment[0], data[i+4]], 7, 72);
      }
    }
    return bridges;
  }

  detectAllBridges(data, tongData) {
    let allBridges = [];
    allBridges.push(...this.detectCauBet(data));
    allBridges.push(...this.detectCau1_1(data));
    allBridges.push(...this.detectPatternSequence(data, 2, 1, 'CAU_2_1'));
    allBridges.push(...this.detectPatternSequence(data, 1, 2, 'CAU_1_2'));
    allBridges.push(...this.detectPatternSequence(data, 2, 2, 'CAU_2_2'));
    allBridges.push(...this.detectPatternSequence(data, 3, 1, 'CAU_3_1'));
    allBridges.push(...this.detectPatternSequence(data, 1, 3, 'CAU_1_3'));
    allBridges.push(...this.detectPatternSequence(data, 3, 2, 'CAU_3_2'));
    allBridges.push(...this.detectPatternSequence(data, 2, 3, 'CAU_2_3'));
    allBridges.push(...this.detectPatternSequence(data, 3, 3, 'CAU_3_3'));
    allBridges.push(...this.detectCauDoiXung(data));
    allBridges.push(...this.detectCauLuanPhien(data));
    allBridges.push(...this.detectCauNhayCoc(data));
    allBridges.push(...this.detectCauSong(tongData || data));
    allBridges.push(...this.detectCauGapKhuc(data));
    return allBridges;
  }
}

// ==================== TRỌNG SỐ ====================
const WEIGHTS = {
  'CAU_BET': 1.5, 'CAU_1_1': 1.3, 'CAU_2_1': 1.1, 'CAU_1_2': 1.1,
  'CAU_2_2': 1.2, 'CAU_3_1': 0.9, 'CAU_1_3': 0.9, 'CAU_3_2': 1.0,
  'CAU_2_3': 1.0, 'CAU_3_3': 1.1, 'CAU_DOI_XUNG': 0.8, 'CAU_LUAN_PHIEN': 0.85,
  'CAU_NHAY_COC': 0.78, 'CAU_SONG_NGAN': 0.7, 'CAU_GAP_KHUC': 0.82
};

// ==================== DỰ ĐOÁN ====================
async function makePrediction(gameKey, lichSu, lichSuTong) {
  if (!lichSu || lichSu.length < 10) {
    return { prediction: 1, confidence: 52, patternsCount: 0, scores: { Tai: 0, Xiu: 0 } };
  }
  
  const detector = new BridgeDetector(gameKey);
  const bridges = detector.detectAllBridges(lichSu, lichSuTong);
  
  if (bridges.length === 0) {
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 1).length;
    return { prediction: tai3 >= 2 ? 1 : 0, confidence: 55, patternsCount: 0, scores: { Tai: 0, Xiu: 0 } };
  }
  
  let scores = { 0: 0, 1: 0 };
  let topPatterns = [];
  
  for (let bridge of bridges) {
    if (bridge.prediction !== undefined) {
      const weight = WEIGHTS[bridge.type] || 0.5;
      const score = bridge.strength * weight * 10;
      scores[bridge.prediction] += score;
      topPatterns.push({ type: bridge.type, strength: bridge.strength, score: Math.round(score) });
    }
  }
  
  topPatterns.sort((a, b) => b.score - a.score);
  
  let finalPrediction = scores[1] > scores[0] ? 1 : 0;
  let totalScore = scores[0] + scores[1];
  let confidence = totalScore > 0 ? Math.round((scores[finalPrediction] / totalScore) * 100) : 55;
  confidence = Math.min(88, Math.max(48, confidence));
  
  await saveActiveBridges(gameKey, topPatterns.slice(0, 10), finalPrediction, confidence);
  
  return {
    prediction: finalPrediction,
    confidence: confidence,
    patternsCount: bridges.length,
    topPatterns: topPatterns.slice(0, 5),
    scores: { Tai: Math.round(scores[1]), Xiu: Math.round(scores[0]) }
  };
}

function saveActiveBridges(game, patterns, prediction, confidence) {
  return new Promise((resolve) => {
    db.run(`DELETE FROM active_bridges WHERE game = ?`, [game]);
    for (let p of patterns) {
      db.run(`INSERT INTO active_bridges (game, bridge_type, strength, predicted_next, confidence, last_update)
              VALUES (?, ?, ?, ?, ?, ?)`,
        [game, p.type, p.strength, prediction, confidence, new Date().toISOString()]);
    }
    resolve(true);
  });
}

// ==================== FETCH DỮ LIỆU ====================
async function fetchTaiXiuData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data || !data.ket_qua) return null;
    let ketQua = data.ket_qua;
    if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài') ketQua = 'Tài';
    else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu') ketQua = 'Xỉu';
    else return null;
    let tong = data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3);
    let dice = [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3];
    let phien = data.phien;
    if (gameKey === 'b52' && phien) phien = parseInt(String(phien).replace('#', ''));
    return { phien, ket_qua, tong, dice, resultValue: ketQua === 'Tài' ? 1 : 0 };
  } catch (err) { return null; }
}

async function fetchSicboData(url, gameKey) {
  try {
    const headers = gameKey === 'club789_sicbo' ? {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://demo7892.fun/',
      'Origin': 'https://demo7892.fun'
    } : { 'User-Agent': 'Mozilla/5.0' };
    const res = await axios.get(url, { timeout: 10000, headers });
    const data = res.data;
    if (gameKey === 'sunwin_sicbo' && data?.ket_qua) {
      let ketQua = data.ket_qua === 'Bão' ? 'Bão' : (data.ket_qua === 'Tài' ? 'Tài' : 'Xỉu');
      let resultValue = ketQua === 'Tài' ? 1 : (ketQua === 'Xỉu' ? 0 : -1);
      return {
        phien: parseInt(data.phien?.replace('#', '') || data.phien),
        ket_qua, tong: data.tong, dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3], resultValue
      };
    }
    if (gameKey === 'club789_sicbo' && data?.data?.resultList?.length) {
      const last = data.data.resultList[0];
      let ketQua = last.resultType === 3 ? 'Tài' : (last.resultType === 4 ? 'Xỉu' : 'Bão');
      let resultValue = ketQua === 'Tài' ? 1 : (ketQua === 'Xỉu' ? 0 : -1);
      return {
        phien: parseInt(last.gameNum.replace('#', '')),
        ket_qua, tong: last.score, dice: last.facesList, resultValue
      };
    }
    return null;
  } catch (err) { return null; }
}

// ==================== XỬ LÝ REQUEST ====================
const historyDB = {};
const cacheDB = {};

for (let key in ALL_APIS) {
  historyDB[key] = { data: [], tongData: [] };
  cacheDB[key] = new Map();
}

async function xuLyGame(gameKey) {
  const url = ALL_APIS[gameKey];
  let data = gameKey.includes('sicbo') ? await fetchSicboData(url, gameKey) : await fetchTaiXiuData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  
  if (lastPred && lastPred.prediction !== undefined && data.resultValue !== -1) {
    const isCorrect = (lastPred.prediction === data.resultValue);
    await updatePredictionResult(gameKey, data.phien - 1, data.resultValue, isCorrect);
    lastPred.actual = data.resultValue;
    lastPred.isCorrect = isCorrect;
  }
  
  await saveResult(gameKey, data.phien, data.resultValue, data.tong, data.dice);
  
  hist.data.unshift(data.resultValue);
  hist.tongData.unshift(data.tong);
  if (hist.data.length > 200) hist.data.pop();
  if (hist.tongData.length > 200) hist.tongData.pop();
  
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    const lichSu = await getPredictionHistory(gameKey, 20);
    const thongKe = await getGameStats(gameKey);
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: cached.prediction === 1 ? 'Tài' : 'Xỉu', do_tin_cay: cached.confidence + '%', so_cau_phat_hien: cached.patternsCount, chi_tiet_diem: cached.scores },
      lichSuDuDoan: lichSu,
      thongKe: thongKe
    };
  }
  
  const prediction = await makePrediction(gameKey, hist.data, hist.tongData);
  const duDoanText = prediction.prediction === 1 ? 'Tài' : 'Xỉu';
  
  await savePrediction(gameKey, data.phien + 1, prediction.prediction, prediction.confidence, prediction.topPatterns);
  
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.prediction, confidence: prediction.confidence,
    patternsCount: prediction.patternsCount, scores: prediction.scores
  });
  if (cacheDB[gameKey].size > 20) {
    const firstKey = cacheDB[gameKey].keys().next().value;
    cacheDB[gameKey].delete(firstKey);
  }
  
  const lichSu = await getPredictionHistory(gameKey, 20);
  const thongKe = await getGameStats(gameKey);
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: {
      phien: data.phien + 1, du_doan: duDoanText, do_tin_cay: prediction.confidence + '%',
      so_cau_phat_hien: prediction.patternsCount, chi_tiet_diem: prediction.scores,
      top_5_cau: prediction.topPatterns
    },
    lichSuDuDoan: lichSu,
    thongKe: thongKe
  };
}

// ==================== API ENDPOINTS ====================
for (let gameKey in ALL_APIS) {
  const endpoint = `/${gameKey.replace(/_/g, '/')}`;
  app.get(endpoint, async (req, res) => {
    try { const result = await xuLyGame(gameKey); res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286' }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
}

// API lịch sử dự đoán RIÊNG cho từng game (có đúng/sai từng phiên)
app.get('/lich-su/:game', async (req, res) => {
  const game = req.params.game;
  if (!ALL_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(ALL_APIS) });
  const lichSu = await getPredictionHistory(game, 50);
  const thongKe = await getGameStats(game);
  res.json({ game, lich_su_du_doan: lichSu, thong_ke: thongKe });
});

// API xem cầu đã thu thập của từng game
app.get('/cau-da-thu-thap/:game', async (req, res) => {
  const game = req.params.game;
  if (!ALL_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại' });
  const bridges = await getCollectedBridges(game);
  res.json({ game, so_loai_cau: bridges.length, danh_sach_cau: bridges });
});

// API tổng hợp cầu của tất cả game
app.get('/cau-da-thu-thap', async (req, res) => {
  const summary = await getAllCollectedBridgesSummary();
  res.json({ tong_quan_cau: summary });
});

// API cầu đang active
app.get('/cau-active/:game', async (req, res) => {
  const game = req.params.game;
  db.all(`SELECT bridge_type, strength, predicted_next, confidence, last_update 
          FROM active_bridges WHERE game = ? ORDER BY strength DESC`,
    [game], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ game, active_bridges: rows });
    });
});

app.get('/lich-su', async (req, res) => {
  const allStats = {};
  for (let game of Object.keys(ALL_APIS)) {
    allStats[game] = await getGameStats(game);
  }
  res.json({ thong_ke_tat_ca_game: allStats });
});

app.get('/', (req, res) => {
  res.json({
    name: '🚀 MEGA BRIDGE AI - 15+ LOẠI CẦU',
    author: '@tranhoang2286',
    version: '11.0',
    endpoints: {
      'Dự đoán theo game': Object.keys(ALL_APIS).map(k => `/${k.replace(/_/g, '/')}`),
      'Lịch sử dự đoán (có đúng/sai)': '/lich-su/:game',
      'Cầu đã thu thập của game': '/cau-da-thu-thap/:game',
      'Cầu đã thu thập tất cả': '/cau-da-thu-thap',
      'Cầu đang active': '/cau-active/:game',
      'Thống kê tất cả': '/lich-su'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MEGA BRIDGE AI - ${Object.keys(ALL_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`📊 Mỗi game có LỊCH SỬ DỰ ĐOÁN RIÊNG (hiển thị đúng/sai từng phiên)`);
  console.log(`🗂️ Đã thu thập: ${Object.keys(ALL_APIS).length * 15}+ loại cầu`);
  console.log(`🔍 API xem cầu: /cau-da-thu-thap/:game`);
});
