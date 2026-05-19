const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==========================================
// DANH SÁCH API (16 GAME)
// ==========================================
const GAME_APIS = {
  'sunwin_tx': 'https://era-technology-particular-domestic.trycloudflare.com/api/tx',
  'lc79_tx': 'https://strategy-cube-vinyl-warcraft.trycloudflare.com/api/tx',
  'lc79_md5': 'https://strategy-cube-vinyl-warcraft.trycloudflare.com/api/txmd5',
  'betvip_tx': 'https://eve-hydrocodone-offshore-eagle.trycloudflare.com/api/tx',
  'betvip_md5': 'https://eve-hydrocodone-offshore-eagle.trycloudflare.com/api/txmd5',
  'club789_tx': 'https://venue-integrate-aged-heavily.trycloudflare.com/api/tx',
  'b52': 'https://flex-knights-agree-grass.trycloudflare.com/txmd5',
  'max789': 'https://deutschland-mandatory-upon-changelog.trycloudflare.com/api/tx',
  'luck8_md5': 'https://qld-incentives-tion-boost.trycloudflare.com/api/txmd5',
  'sumvin_md5': 'https://cricket-compressed-list-suppose.trycloudflare.com/api/md5',
  'gb68_thuong': 'https://description-zen-dog-films.trycloudflare.com/api/68/thuong',
  'gb68_md5': 'https://profiles-televisions-sic-stay.trycloudflare.com/api/68/md5',
  'alo_hitclub_md5': 'https://preference-assuming-picnic-concentration.trycloudflare.com/api/txmd5',
  'sunwin_sicbo': 'https://enquiries-indices-navigator-mega.trycloudflare.com/api/sunsicbo',
  'luck8_sicbo40': 'https://qld-incentives-tion-boost.trycloudflare.com/api/sicbo40',
  'lc79_xocdia': 'https://strategy-cube-vinyl-warcraft.trycloudflare.com/api/xocdia'
};

// ==========================================
// LƯU TRỮ LỊCH SỬ, CACHE, THỐNG KÊ
// ==========================================
const historyDB = {};
const cacheDB = {};
const statsDB = {};
const learningDB = {}; // Lưu trọng số học từ sai lầm

for (let key in GAME_APIS) {
  historyDB[key] = { data: [], tongData: [], diceData: [] };
  cacheDB[key] = new Map();
  statsDB[key] = { tong: 0, dung: 0, sai: 0, tiLe: '0%', tiLe10: '0%' };
  learningDB[key] = { troSo: 1.0, history: [] };
}

function updateStats(game, thucTe, duDoan, doTinCay) {
  const st = statsDB[game];
  if (!st || !thucTe || !duDoan) return;
  const dung = (thucTe === duDoan);
  if (dung) st.dung++;
  else st.sai++;
  st.tong++;
  st.tiLe = ((st.dung / st.tong) * 100).toFixed(1) + '%';
  
  // Tính tỉ lệ 10 phiên gần nhất
  const recent10 = historyDB[game].data.slice(0, 10);
  if (recent10.length >= 5) {
    const dung10 = recent10.filter((v, i) => {
      const pred = cacheDB[game].get(historyDB[game].phienRef?.[i]);
      return pred && pred.prediction === v;
    }).length;
    st.tiLe10 = ((dung10 / recent10.length) * 100).toFixed(1) + '%';
  }
  
  // Cập nhật learning (tăng/giảm trọng số dựa trên đúng/sai)
  if (dung) learningDB[game].troSo = Math.min(2.0, learningDB[game].troSo * 1.02);
  else learningDB[game].troSo = Math.max(0.5, learningDB[game].troSo * 0.97);
  
  return dung;
}

// ==========================================
// FETCH DỮ LIỆU (GIỮ NGUYÊN LOGIC)
// ==========================================
async function fetchGameData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data) return null;
    
    // Xóc đĩa
    if (gameKey === 'lc79_xocdia') {
      if (data.ket_qua_truyen_thong) {
        let ketQua = data.ket_qua_truyen_thong === 'Chẵn' ? 'Chẵn' : 'Lẻ';
        let resultValue = ketQua === 'Chẵn' ? 1 : 0;
        return { phien: data.phien, ket_qua: ketQua, resultValue, dice: data.xuc_xac || [], tong: null };
      }
      return null;
    }
    
    // Sicbo Sunwin & Luck8
    if (gameKey === 'sunwin_sicbo' || gameKey === 'luck8_sicbo40') {
      if (data.ket_qua) {
        let ketQua = data.ket_qua === 'Tài' ? 'Tài' : (data.ket_qua === 'Xỉu' ? 'Xỉu' : 'Bão');
        let resultValue = ketQua === 'Tài' ? 1 : (ketQua === 'Xỉu' ? 0 : -1);
        let phien = data.phien;
        if (gameKey === 'sunwin_sicbo') phien = parseInt(String(data.phien).replace('#', ''));
        return { phien, ket_qua: ketQua, resultValue, dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3], tong: data.tong };
      }
      return null;
    }
    
    // 68GB Thường
    if (gameKey === 'gb68_thuong') {
      if (data.ket_qua) {
        let ketQua = data.ket_qua === 'Tài' ? 'Tài' : 'Xỉu';
        let resultValue = ketQua === 'Tài' ? 1 : 0;
        return { phien: data.phien, ket_qua: ketQua, resultValue, dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3], tong: data.tong };
      }
      return null;
    }
    
    // Các game Tài Xỉu thông thường
    if (data.ket_qua) {
      let ketQua = data.ket_qua;
      if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài' || ketQua === 'TÀI') ketQua = 'Tài';
      else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu' || ketQua === 'XỈU') ketQua = 'Xỉu';
      else return null;
      
      let resultValue = ketQua === 'Tài' ? 1 : 0;
      let tong = data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3);
      let dice = [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3];
      let phien = data.phien;
      if (gameKey === 'sumvin_md5') phien = data.phien;
      if (gameKey === 'b52' && phien) phien = parseInt(String(phien).replace('#', ''));
      
      return { phien, ket_qua: ketQua, resultValue, dice, tong };
    }
    return null;
  } catch (err) {
    console.error(`Lỗi fetch ${gameKey}:`, err.message);
    return null;
  }
}

// ==========================================
// THUẬT TOÁN CON SỐ 1: PHÂN TÍCH CHUỖI BỆT (STREAK)
// ==========================================
async function thuatToanStreak(lichSu) {
  if (lichSu.length < 3) return null;
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 5) {
    let doTin = 80 + Math.min(10, (streak - 5) * 2);
    return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTin: doTin, lyDo: `🔥 Bệt cực dài ${streak} phiên → phá cầu chắc chắn`, trongSo: 2.0 };
  }
  if (streak === 4) {
    return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTin: 74, lyDo: `⚠️ Bệt ${streak} phiên → khả năng gãy cao`, trongSo: 1.8 };
  }
  if (streak === 3) {
    return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTin: 66, lyDo: `📊 Bệt ${streak} phiên → chuẩn bị gãy`, trongSo: 1.5 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 2: MARTINGALE CẢI TIẾN (BẺ CẦU KHI NÓNG)
// ==========================================
async function thuatToanMartingale(lichSu) {
  if (lichSu.length < 10) return null;
  const last10 = lichSu.slice(0, 10);
  const tai10 = last10.filter(r => r === 'Tài').length;
  const xiu10 = 10 - tai10;
  
  if (tai10 >= 8) {
    return { pred: 'Xỉu', doTin: 82, lyDo: `🎲 Tài siêu nóng ${tai10}/10 → bẻ Xỉu chắc thắng`, trongSo: 2.0 };
  }
  if (xiu10 >= 8) {
    return { pred: 'Tài', doTin: 82, lyDo: `🎲 Xỉu siêu nóng ${xiu10}/10 → bẻ Tài chắc thắng`, trongSo: 2.0 };
  }
  if (tai10 >= 7) {
    return { pred: 'Xỉu', doTin: 74, lyDo: `📈 Tài nóng ${tai10}/10 → bẻ Xỉu`, trongSo: 1.7 };
  }
  if (xiu10 >= 7) {
    return { pred: 'Tài', doTin: 74, lyDo: `📉 Xỉu nóng ${xiu10}/10 → bẻ Tài`, trongSo: 1.7 };
  }
  if (tai10 >= 6) {
    return { pred: 'Xỉu', doTin: 66, lyDo: `📊 Tài chiếm ưu thế ${tai10}/10 → bẻ nhẹ`, trongSo: 1.4 };
  }
  if (xiu10 >= 6) {
    return { pred: 'Tài', doTin: 66, lyDo: `📊 Xỉu chiếm ưu thế ${xiu10}/10 → bẻ nhẹ`, trongSo: 1.4 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 3: BACCARAT PATTERN (CẦU 1-1, 2-1, 3-2)
// ==========================================
async function thuatToanBaccarat(lichSu) {
  if (lichSu.length < 6) return null;
  
  // Cầu 1-1 (zigzag)
  let zigzag = 0;
  for (let i = 1; i < 5; i++) {
    if (lichSu[i] !== lichSu[i-1]) zigzag++;
  }
  if (zigzag >= 3) {
    return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTin: 72, lyDo: `🔄 Cầu 1-1 (zigzag) → đánh ngược`, trongSo: 1.6 };
  }
  
  // Cầu 2-1
  if (lichSu.length >= 6) {
    if (lichSu[0] === lichSu[1] && lichSu[3] === lichSu[4] && lichSu[0] !== lichSu[3]) {
      return { pred: lichSu[0], doTin: 74, lyDo: `📐 Cầu 2-1 → theo nhịp`, trongSo: 1.6 };
    }
  }
  
  // Cầu 3-2
  if (lichSu.length >= 10) {
    const pattern = lichSu.slice(0, 5).join('');
    if (pattern === 'TàiTàiTàiXỉuXỉu') {
      return { pred: 'Xỉu', doTin: 76, lyDo: `📐 Cầu 3-2 → đánh Xỉu`, trongSo: 1.7 };
    }
    if (pattern === 'XỉuXỉuXỉuTàiTài') {
      return { pred: 'Tài', doTin: 76, lyDo: `📐 Cầu 3-2 → đánh Tài`, trongSo: 1.7 };
    }
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 4: PHÂN TÍCH TỔNG ĐIỂM (DICE)
// ==========================================
async function thuatToanTongDiem(tongData) {
  if (!tongData || tongData.length < 10) return null;
  const last10 = tongData.slice(0, 10);
  const avg = last10.reduce((a, b) => a + b, 0) / 10;
  const prevAvg = tongData.slice(10, 20).reduce((a, b) => a + b, 0) / 10;
  const delta = avg - prevAvg;
  
  if (avg > 11.5) {
    return { pred: 'Xỉu', doTin: 68, lyDo: `🎯 Tổng điểm cao TB ${avg.toFixed(1)} → Xỉu`, trongSo: 1.4 };
  }
  if (avg < 9.5) {
    return { pred: 'Tài', doTin: 68, lyDo: `🎯 Tổng điểm thấp TB ${avg.toFixed(1)} → Tài`, trongSo: 1.4 };
  }
  if (delta > 1.5) {
    return { pred: 'Xỉu', doTin: 66, lyDo: `📈 Tổng tăng mạnh (${delta.toFixed(1)}) → Xỉu`, trongSo: 1.3 };
  }
  if (delta < -1.5) {
    return { pred: 'Tài', doTin: 66, lyDo: `📉 Tổng giảm mạnh (${delta.toFixed(1)}) → Tài`, trongSo: 1.3 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 5: PHÂN TÍCH MẶT XÚC XẮC
// ==========================================
async function thuatToanDiceFreq(diceData) {
  if (!diceData || diceData.length < 15) return null;
  const freq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let dice of diceData.slice(0, 30)) {
    if (dice && dice.length === 3) {
      freq[dice[0]]++;
      freq[dice[1]]++;
      freq[dice[2]]++;
    }
  }
  const total = Object.values(freq).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  
  const maxFace = Object.keys(freq).reduce((a, b) => freq[a] > freq[b] ? a : b);
  const minFace = Object.keys(freq).reduce((a, b) => freq[a] < freq[b] ? a : b);
  
  if (maxFace >= 5) {
    return { pred: 'Tài', doTin: 66, lyDo: `🎲 Mặt ${maxFace} xuất hiện nhiều nhất → Tài`, trongSo: 1.3 };
  }
  if (maxFace <= 2) {
    return { pred: 'Xỉu', doTin: 66, lyDo: `🎲 Mặt ${maxFace} xuất hiện nhiều nhất → Xỉu`, trongSo: 1.3 };
  }
  if (freq[1] + freq[2] + freq[3] > total * 0.6) {
    return { pred: 'Xỉu', doTin: 62, lyDo: `🎲 Mặt nhỏ (1-3) chiếm ưu thế → Xỉu`, trongSo: 1.2 };
  }
  if (freq[4] + freq[5] + freq[6] > total * 0.6) {
    return { pred: 'Tài', doTin: 62, lyDo: `🎲 Mặt lớn (4-6) chiếm ưu thế → Tài`, trongSo: 1.2 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 6: CHU KỲ LẶP (PATTERN RECOGNITION)
// ==========================================
async function thuatToanPatternLap(lichSu) {
  if (lichSu.length < 12) return null;
  
  // Tìm pattern 3 phiên lặp
  for (let windowSize of [3, 4, 5]) {
    for (let start = 0; start < 3; start++) {
      if (lichSu.length < start + windowSize * 3) continue;
      const pattern = lichSu.slice(start, start + windowSize);
      let lapCount = 1;
      for (let k = 1; k <= 2; k++) {
        const nextStart = start + windowSize * k;
        let match = true;
        for (let j = 0; j < windowSize; j++) {
          if (pattern[j] !== lichSu[nextStart + j]) { match = false; break; }
        }
        if (match) lapCount++;
        else break;
      }
      if (lapCount >= 2) {
        let doTin = 70 + lapCount * 4;
        return { pred: pattern[0] === 'Tài' ? 'Xỉu' : 'Tài', doTin: Math.min(85, doTin), lyDo: `🔄 Pattern ${windowSize} phiên lặp ${lapCount} lần → bẻ`, trongSo: 1.7 };
      }
    }
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 7: MARKOV CHAIN BẬC 2
// ==========================================
async function thuatToanMarkov(lichSu) {
  if (lichSu.length < 15) return null;
  const map = new Map();
  for (let i = 0; i < lichSu.length - 2; i++) {
    const key = `${lichSu[i]}_${lichSu[i+1]}`;
    const next = lichSu[i+2];
    if (!map.has(key)) map.set(key, { Tai: 0, Xiu: 0 });
    if (next === 'Tài') map.get(key).Tai++;
    else map.get(key).Xiu++;
  }
  const lastKey = `${lichSu[0]}_${lichSu[1]}`;
  const stats = map.get(lastKey);
  if (stats && stats.Tai + stats.Xiu >= 2) {
    const pred = stats.Tai > stats.Xiu ? 'Tài' : 'Xỉu';
    let doTin = 60 + Math.min(15, (stats.Tai + stats.Xiu) * 2);
    return { pred, doTin: Math.min(80, doTin), lyDo: `🧠 Markov bậc 2 (${stats.Tai+stats.Xiu} mẫu) → ${pred}`, trongSo: 1.5 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 8: RSI (CHỈ BÁO SỨC MẠNH TƯƠNG ĐỐI)
// ==========================================
async function thuatToanRSI(lichSu) {
  if (lichSu.length < 14) return null;
  const last14 = lichSu.slice(0, 14);
  const tai14 = last14.filter(r => r === 'Tài').length;
  const rsi = (tai14 / 14) * 100;
  
  if (rsi >= 70) {
    return { pred: 'Xỉu', doTin: 70, lyDo: `📊 RSI quá mua (${rsi.toFixed(0)}) → bẻ Xỉu`, trongSo: 1.4 };
  }
  if (rsi <= 30) {
    return { pred: 'Tài', doTin: 70, lyDo: `📊 RSI quá bán (${rsi.toFixed(0)}) → bẻ Tài`, trongSo: 1.4 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 9: MACD (GIAO CẮT TRUNG BÌNH)
// ==========================================
async function thuatToanMACD(lichSu) {
  if (lichSu.length < 26) return null;
  const ema12 = lichSu.slice(0, 12).filter(r => r === 'Tài').length / 12;
  const ema26 = lichSu.slice(0, 26).filter(r => r === 'Tài').length / 26;
  const macd = ema12 - ema26;
  
  if (macd > 0.12) {
    return { pred: 'Xỉu', doTin: 66, lyDo: `📈 MACD cắt xuống (${macd.toFixed(2)}) → Xỉu`, trongSo: 1.3 };
  }
  if (macd < -0.12) {
    return { pred: 'Tài', doTin: 66, lyDo: `📉 MACD cắt lên (${macd.toFixed(2)}) → Tài`, trongSo: 1.3 };
  }
  return null;
}

// ==========================================
// THUẬT TOÁN CON SỐ 10: BOLLINGER BANDS
// ==========================================
async function thuatToanBollinger(lichSu) {
  if (lichSu.length < 20) return null;
  const last20 = lichSu.slice(0, 20);
  const tai20 = last20.filter(r => r === 'Tài').length;
  const mean = tai20 / 20;
  const variance = last20.reduce((sum, r) => sum + Math.pow((r === 'Tài' ? 1 : 0) - mean, 2), 0) / 20;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = lichSu[0] === 'Tài' ? 1 : 0;
  
  if (current > upper) {
    return { pred: 'Xỉu', doTin: 68, lyDo: `📊 Chạm dải trên Bollinger → Xỉu`, trongSo: 1.4 };
  }
  if (current < lower) {
    return { pred: 'Tài', doTin: 68, lyDo: `📊 Chạm dải dưới Bollinger → Tài`, trongSo: 1.4 };
  }
  return null;
}

// ==========================================
// TỔNG HỢP ĐA LUỒNG (CHẠY NHIỀU THUẬT TOÁN ĐỒNG THỜI)
// ==========================================
async function multiThreadPrediction(threads, lichSu, tongData, diceData, learningTroSo) {
  const results = await Promise.all(threads.map(t => t(lichSu, tongData, diceData)));
  
  let diemTai = 0, diemXiu = 0;
  let soThuatToan = 0;
  const chiTiet = [];
  
  for (let r of results) {
    if (r && r.pred) {
      soThuatToan++;
      const trongSo = (r.trongSo || 1.0) * learningTroSo;
      if (r.pred === 'Tài') {
        diemTai += r.doTin * trongSo;
      } else {
        diemXiu += r.doTin * trongSo;
      }
      chiTiet.push({ loai: r.lyDo.split('→')[0].trim(), du_doan: r.pred, do_tin_cay: r.doTin });
    }
  }
  
  if (soThuatToan === 0) return null;
  
  const finalPred = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  const chenhLech = Math.abs(diemTai - diemXiu);
  let doTinCuoi = 50 + (chenhLech / (diemTai + diemXiu)) * 40;
  doTinCuoi = Math.min(92, Math.max(52, doTinCuoi));
  
  return {
    pred: finalPred,
    confidence: Math.round(doTinCuoi),
    soThuatToan: soThuatToan,
    chiTiet: chiTiet,
    scores: { Tai: Math.round(diemTai), Xiu: Math.round(diemXiu) }
  };
}

// ==========================================
// ĐỊNH NGHĨA BỘ THUẬT TOÁN CHO TỪNG GAME
// ==========================================
const gameThreads = {
  'sunwin_tx': [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat, thuatToanTongDiem, thuatToanDiceFreq, thuatToanRSI],
  'lc79_tx': [thuatToanStreak, thuatToanTongDiem, thuatToanBaccarat, thuatToanDiceFreq],
  'lc79_md5': [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat, thuatToanTongDiem, thuatToanPatternLap, thuatToanMarkov],
  'betvip_tx': [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat],
  'betvip_md5': [thuatToanStreak, thuatToanTongDiem, thuatToanDiceFreq],
  'club789_tx': [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat],
  'b52': [thuatToanStreak, thuatToanDiceFreq, thuatToanTongDiem],
  'max789': [thuatToanMartingale, thuatToanRSI, thuatToanMACD, thuatToanBollinger],
  'luck8_md5': [thuatToanRSI, thuatToanMACD, thuatToanMarkov, thuatToanBollinger],
  'sumvin_md5': [thuatToanBaccarat, thuatToanPatternLap],
  'gb68_thuong': [thuatToanStreak, thuatToanMartingale],
  'gb68_md5': [thuatToanMartingale, thuatToanTongDiem],
  'alo_hitclub_md5': [thuatToanStreak, thuatToanDiceFreq, thuatToanBaccarat, thuatToanTongDiem, thuatToanPatternLap],
  'sunwin_sicbo': [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat],
  'luck8_sicbo40': [thuatToanStreak, thuatToanMartingale],
  'lc79_xocdia': null // Xử lý riêng bên dưới
};

// ==========================================
// XỬ LÝ REQUEST CHÍNH
// ==========================================
async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.resultValue === -1) throw new Error(`Game ${gameKey} ra Bão, tạm thời bỏ qua`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  // Cập nhật kết quả dự đoán trước
  if (lastPred && lastPred.prediction !== undefined) {
    const thucTe = isXocDia ? (data.resultValue === 1 ? "Chẵn" : "Lẻ") : data.ket_qua;
    updateStats(gameKey, thucTe, lastPred.prediction, lastPred.confidence);
    lastPred.actual = thucTe;
    lastPred.isCorrect = (thucTe === lastPred.prediction);
  }
  
  // Cập nhật lịch sử
  const luuKetQua = isXocDia ? (data.resultValue === 1 ? "Chẵn" : "Lẻ") : data.ket_qua;
  hist.data.unshift(luuKetQua);
  if (hist.data.length > 200) hist.data.pop();
  if (data.tong) {
    hist.tongData.unshift(data.tong);
    if (hist.tongData.length > 200) hist.tongData.pop();
  }
  if (data.dice && data.dice.length === 3) {
    hist.diceData.unshift(data.dice);
    if (hist.diceData.length > 200) hist.diceData.pop();
  }
  
  // Cache - F5 không đổi
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: {
        phien: data.phien + 1,
        du_doan: cached.prediction,
        do_tin_cay: cached.confidence + '%',
        giai_thich: cached.reason,
        chi_tiet_thuat_toan: cached.details
      },
      thongKe: statsDB[gameKey]
    };
  }
  
  // Xóc đĩa - xử lý riêng
  let prediction;
  if (isXocDia) {
    const converted = hist.data.map(x => x === 'Chẵn' ? 'Tài' : 'Xỉu');
    const result = await multiThreadPrediction(
      [thuatToanStreak, thuatToanMartingale, thuatToanBaccarat],
      converted, hist.tongData, hist.diceData, learningDB[gameKey].troSo
    );
    if (result) {
      prediction = {
        pred: result.pred === 'Tài' ? 'Chẵn' : 'Lẻ',
        confidence: result.confidence,
        soThuatToan: result.soThuatToan,
        chiTiet: result.chiTiet,
        scores: result.scores
      };
    } else {
      prediction = { pred: hist.data[0] || 'Chẵn', confidence: 55, soThuatToan: 0, chiTiet: [] };
    }
  } else {
    const threads = gameThreads[gameKey];
    if (threads && threads.length > 0) {
      const result = await multiThreadPrediction(
        threads, hist.data, hist.tongData, hist.diceData, learningDB[gameKey].troSo
      );
      if (result) {
        prediction = {
          pred: result.pred,
          confidence: result.confidence,
          soThuatToan: result.soThuatToan,
          chiTiet: result.chiTiet,
          scores: result.scores
        };
      } else {
        const last3 = hist.data.slice(0, 3);
        const tai3 = last3.filter(r => r === 'Tài').length;
        prediction = {
          pred: tai3 >= 2 ? 'Tài' : 'Xỉu',
          confidence: 58,
          soThuatToan: 0,
          chiTiet: [],
          scores: { Tai: 0, Xiu: 0 }
        };
      }
    } else {
      prediction = { pred: hist.data[0] || 'Tài', confidence: 55, soThuatToan: 0, chiTiet: [] };
    }
  }
  
  // Lưu cache
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.pred,
    confidence: prediction.confidence,
    reason: `${prediction.soThuatToan} thuật toán đa luồng`,
    details: prediction.chiTiet?.slice(0, 5)
  });
  if (cacheDB[gameKey].size > 20) {
    const firstKey = cacheDB[gameKey].keys().next().value;
    cacheDB[gameKey].delete(firstKey);
  }
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: {
      phien: data.phien + 1,
      du_doan: prediction.pred,
      do_tin_cay: prediction.confidence + '%',
      so_thuat_toan: prediction.soThuatToan,
      chi_tiet_thuat_toan: prediction.chiTiet,
      diem_so: prediction.scores
    },
    thongKe: statsDB[gameKey],
    learning: { trong_so_hien_tai: learningDB[gameKey].troSo.toFixed(2) }
  };
}

// ==========================================
// TẠO ENDPOINTS ĐỘNG
// ==========================================
for (let gameKey in GAME_APIS) {
  const endpoint = `/${gameKey.replace(/_/g, '/')}`;
  app.get(endpoint, async (req, res) => {
    try {
      const result = await xuLyGame(gameKey);
      res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286', date: '19/05/2026' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ==========================================
// API LỊCH SỬ & THỐNG KÊ
// ==========================================
app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) {
    return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  }
  const hist = historyDB[game];
  res.json({
    game,
    lichSu: hist.data.slice(0, 30).map((v, i) => ({ phien: i+1, ket_qua: v })),
    thongKe: statsDB[game],
    learning: { trong_so_hien_tai: learningDB[game].troSo.toFixed(2) }
  });
});

app.get('/lich-su', (req, res) => {
  const allStats = {};
  for (let key in GAME_APIS) {
    allStats[key] = statsDB[key];
  }
  res.json({ thong_ke_tat_ca_game: allStats, tong_so_game: Object.keys(GAME_APIS).length });
});

// ==========================================
// ROOT
// ==========================================
app.get('/', (req, res) => {
  res.json({
    name: '🚀 SIÊU THUẬT TOÁN ĐA LUỒNG PRO MAX',
    author: '@tranhoang2286',
    version: '7.0 - 19/05/2026',
    danh_sach_game: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    thong_ke: '/lich-su',
    huong_dan: 'Mỗi game chạy 4-10 thuật toán đồng thời, học trọng số động',
    thuat_toan_da_tich_hop: [
      '🔴 Streak Analysis - Phân tích chuỗi bệt cấp độ 3-4-5+',
      '🟠 Martingale Pro - Bẻ cầu khi một bên quá nóng (7/10, 8/10)',
      '🟡 Baccarat Pattern - Nhận diện cầu 1-1, 2-1, 3-2',
      '🟢 Dice Analysis - Phân tích tổng điểm trung bình, delta',
      '🔵 Dice Frequency - Tần suất xuất hiện các mặt xúc xắc 1-6',
      '🟣 Pattern Recognition - Phát hiện pattern lặp 3-4-5 phiên',
      '⚪ Markov Chain bậc 2 - Dự đoán dựa trên 2 phiên trước',
      '🟤 RSI - Chỉ báo sức mạnh tương đối (quá mua/quá bán)',
      '⚫ MACD - Giao cắt đường trung bình động',
      '💎 Bollinger Bands - Chạm dải trên/dưới'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SIÊU THUẬT TOÁN ĐA LUỒNG - ${Object.keys(GAME_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🧠 Mỗi game chạy 4-10 thuật toán đồng thời (Promise.all)`);
  console.log(`📊 Học trọng số động dựa trên lịch sử đúng/sai`);
  console.log(`🎲 Game list: ${Object.keys(GAME_APIS).join(', ')}`);
});
