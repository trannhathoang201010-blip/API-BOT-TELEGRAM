const express = require('express');
const axios = require('axios');
const cors = require('cors');

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
// LƯU TRỮ
// ==========================================
const historyDB = {};
const cacheDB = {};
const statsDB = {};
const learningDB = {};

for (let key in GAME_APIS) {
  historyDB[key] = { data: [], tongData: [], diceData: [] };
  cacheDB[key] = new Map();
  statsDB[key] = { tong: 0, dung: 0, sai: 0, tiLe: '0%', tiLe10: '0%' };
  learningDB[key] = { 
    weights: {}, 
    correctStreak: 0, 
    wrongStreak: 0,
    lastUpdate: new Date()
  };
}

function updateStats(game, thucTe, duDoan) {
  const st = statsDB[game];
  if (!st || !thucTe || !duDoan) return;
  const dung = (thucTe === duDoan);
  if (dung) {
    st.dung++;
    learningDB[game].correctStreak++;
    learningDB[game].wrongStreak = 0;
  } else {
    st.sai++;
    learningDB[game].wrongStreak++;
    learningDB[game].correctStreak = 0;
  }
  st.tong++;
  st.tiLe = ((st.dung / st.tong) * 100).toFixed(1) + '%';
  
  const recent10 = historyDB[game].data.slice(0, 10);
  if (recent10.length >= 5) {
    let dung10 = 0;
    for (let i = 0; i < recent10.length; i++) {
      const pred = cacheDB[game].get(historyDB[game].phienRef?.[i]);
      if (pred && pred.prediction === recent10[i]) dung10++;
    }
    st.tiLe10 = ((dung10 / recent10.length) * 100).toFixed(1) + '%';
  }
  return dung;
}

// ==========================================
// FETCH DỮ LIỆU
// ==========================================
async function fetchGameData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data) return null;
    
    if (gameKey === 'lc79_xocdia') {
      if (data.ket_qua_truyen_thong) {
        return { phien: data.phien, ket_qua: data.ket_qua_truyen_thong, dice: [], tong: null };
      }
      return null;
    }
    
    if (data.ket_qua) {
      let ketQua = data.ket_qua;
      if (ketQua === 'tài' || ketQua === 'TAI' || ketQua === 'Tài' || ketQua === 'TÀI') ketQua = 'Tài';
      else if (ketQua === 'xiu' || ketQua === 'XIU' || ketQua === 'Xỉu' || ketQua === 'XỈU') ketQua = 'Xỉu';
      else if (ketQua === 'Bão') ketQua = 'Bão';
      else return null;
      
      let phien = data.phien;
      if (gameKey === 'sunwin_sicbo') phien = parseInt(String(data.phien).replace('#', ''));
      if (gameKey === 'b52' && phien) phien = parseInt(String(phien).replace('#', ''));
      
      return { 
        phien, 
        ket_qua: ketQua, 
        dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3], 
        tong: data.tong || (data.xuc_xac_1 + data.xuc_xac_2 + data.xuc_xac_3)
      };
    }
    return null;
  } catch (err) {
    console.error(`Lỗi fetch ${gameKey}:`, err.message);
    return null;
  }
}

// ==========================================
// ==================== 30 THUẬT TOÁN CON ====================
// ==========================================

// ---------- NHÓM 1: THUẬT TOÁN CẦU CƠ BẢN (1-10) ----------

function thuatToan_1_Streak(lichSu) {
  if (lichSu.length < 2) return null;
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 4) return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 80, weight: 2.0, reason: `Bệt ${streak} phiên - phá cầu` };
  if (streak === 3) return { pred: lichSu[0], confidence: 68, weight: 1.5, reason: `Bệt 3 phiên - theo cầu` };
  return null;
}

function thuatToan_2_Cau1_1(lichSu) {
  if (lichSu.length < 5) return null;
  let zigzag = 0;
  for (let i = 1; i < 5; i++) if (lichSu[i] !== lichSu[i-1]) zigzag++;
  if (zigzag >= 3) return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 74, weight: 1.7, reason: 'Cầu 1-1 (zigzag)' };
  return null;
}

function thuatToan_3_Cau2_1(lichSu) {
  if (lichSu.length < 6) return null;
  if (lichSu[0] === lichSu[1] && lichSu[3] === lichSu[4] && lichSu[0] !== lichSu[3]) {
    return { pred: lichSu[0], confidence: 76, weight: 1.7, reason: 'Cầu 2-1' };
  }
  return null;
}

function thuatToan_4_Cau1_2(lichSu) {
  if (lichSu.length < 6) return null;
  if (lichSu[0] !== lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] !== lichSu[4]) {
    return { pred: lichSu[1], confidence: 74, weight: 1.6, reason: 'Cầu 1-2' };
  }
  return null;
}

function thuatToan_5_Cau2_2(lichSu) {
  if (lichSu.length < 8) return null;
  if (lichSu[0] === lichSu[1] && lichSu[2] === lichSu[3] && lichSu[4] === lichSu[5] && lichSu[0] !== lichSu[2]) {
    return { pred: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 78, weight: 1.8, reason: 'Cầu 2-2' };
  }
  return null;
}

function thuatToan_6_Cau3_1(lichSu) {
  if (lichSu.length < 8) return null;
  if (lichSu[0] === lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] !== lichSu[2] && lichSu[4] === lichSu[5] && lichSu[5] === lichSu[6]) {
    return { pred: lichSu[3], confidence: 76, weight: 1.7, reason: 'Cầu 3-1' };
  }
  return null;
}

function thuatToan_7_Cau3_2(lichSu) {
  if (lichSu.length < 10) return null;
  const p = lichSu.slice(0,5).join('');
  if (p === 'TàiTàiTàiXỉuXỉu') return { pred: 'Xỉu', confidence: 80, weight: 1.9, reason: 'Cầu 3-2 (Tài trước)' };
  if (p === 'XỉuXỉuXỉuTàiTài') return { pred: 'Tài', confidence: 80, weight: 1.9, reason: 'Cầu 3-2 (Xỉu trước)' };
  return null;
}

function thuatToan_8_CauDoiXung(lichSu) {
  if (lichSu.length < 9) return null;
  let isMirror = true;
  for (let i = 0; i < 4; i++) if (lichSu[i] !== lichSu[8-i]) { isMirror = false; break; }
  if (isMirror) return { pred: lichSu[4] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 76, weight: 1.6, reason: 'Cầu đối xứng' };
  return null;
}

function thuatToan_9_PatternLap3(lichSu) {
  if (lichSu.length < 9) return null;
  const p3 = lichSu.slice(0,3);
  if (lichSu.slice(3,6).join('') === p3.join('') && lichSu.slice(6,9).join('') === p3.join('')) {
    return { pred: p3[2] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 82, weight: 2.0, reason: 'Pattern lặp 3 phiên x3' };
  }
  return null;
}

function thuatToan_10_PatternLap4(lichSu) {
  if (lichSu.length < 12) return null;
  const p4 = lichSu.slice(0,4);
  if (lichSu.slice(4,8).join('') === p4.join('') && lichSu.slice(8,12).join('') === p4.join('')) {
    return { pred: p4[3] === 'Tài' ? 'Xỉu' : 'Tài', confidence: 84, weight: 2.1, reason: 'Pattern lặp 4 phiên x3' };
  }
  return null;
}

// ---------- NHÓM 2: THUẬT TOÁN THỐNG KÊ (11-20) ----------

function thuatToan_11_Martingale5(lichSu) {
  if (lichSu.length < 5) return null;
  const tai5 = lichSu.slice(0,5).filter(r => r === 'Tài').length;
  if (tai5 >= 4) return { pred: 'Xỉu', confidence: 72, weight: 1.6, reason: `Tài ${tai5}/5 - bẻ Xỉu` };
  if (tai5 <= 1) return { pred: 'Tài', confidence: 72, weight: 1.6, reason: `Xỉu ${5-tai5}/5 - bẻ Tài` };
  return null;
}

function thuatToan_12_Martingale10(lichSu) {
  if (lichSu.length < 10) return null;
  const tai10 = lichSu.slice(0,10).filter(r => r === 'Tài').length;
  if (tai10 >= 7) return { pred: 'Xỉu', confidence: 78, weight: 1.8, reason: `Tài ${tai10}/10 - bẻ Xỉu` };
  if (tai10 <= 3) return { pred: 'Tài', confidence: 78, weight: 1.8, reason: `Xỉu ${10-tai10}/10 - bẻ Tài` };
  return null;
}

function thuatToan_13_Tile20(lichSu) {
  if (lichSu.length < 20) return null;
  const tai20 = lichSu.slice(0,20).filter(r => r === 'Tài').length;
  if (tai20 >= 13) return { pred: 'Xỉu', confidence: 70, weight: 1.5, reason: `Tài ${tai20}/20 - cân bằng` };
  if (tai20 <= 7) return { pred: 'Tài', confidence: 70, weight: 1.5, reason: `Xỉu ${20-tai20}/20 - cân bằng` };
  return null;
}

function thuatToan_14_Tile30(lichSu) {
  if (lichSu.length < 30) return null;
  const tai30 = lichSu.slice(0,30).filter(r => r === 'Tài').length;
  if (tai30 >= 18) return { pred: 'Xỉu', confidence: 68, weight: 1.4, reason: `Tài ${tai30}/30 - hồi quy` };
  if (tai30 <= 12) return { pred: 'Tài', confidence: 68, weight: 1.4, reason: `Xỉu ${30-tai30}/30 - hồi quy` };
  return null;
}

function thuatToan_15_XuHuong3(lichSu) {
  if (lichSu.length < 3) return null;
  const tai3 = lichSu.slice(0,3).filter(r => r === 'Tài').length;
  return { pred: tai3 >= 2 ? 'Tài' : 'Xỉu', confidence: 60, weight: 1.2, reason: `Xu hướng ${tai3}T-${3-tai3}X` };
}

function thuatToan_16_XuHuong5(lichSu) {
  if (lichSu.length < 5) return null;
  const tai5 = lichSu.slice(0,5).filter(r => r === 'Tài').length;
  return { pred: tai5 >= 3 ? 'Tài' : 'Xỉu', confidence: 64, weight: 1.3, reason: `Xu hướng ${tai5}T-${5-tai5}X` };
}

function thuatToan_17_ChuKy8(lichSu) {
  if (lichSu.length < 16) return null;
  const c1 = lichSu.slice(0,8).join('');
  const c2 = lichSu.slice(8,16).join('');
  if (c1 === c2) return { pred: c1[0] === 'T' ? 'Tài' : 'Xỉu', confidence: 76, weight: 1.7, reason: 'Chu kỳ 8 phiên' };
  return null;
}

function thuatToan_18_ChuKy13(lichSu) {
  if (lichSu.length < 26) return null;
  const c1 = lichSu.slice(0,13).join('');
  const c2 = lichSu.slice(13,26).join('');
  if (c1 === c2) return { pred: c1[0] === 'T' ? 'Tài' : 'Xỉu', confidence: 74, weight: 1.6, reason: 'Chu kỳ 13 phiên' };
  return null;
}

function thuatToan_19_HoiQuy(lichSu) {
  if (lichSu.length < 20) return null;
  const tai20 = lichSu.slice(0,20).filter(r => r === 'Tài').length;
  const doLech = tai20 - 10;
  if (Math.abs(doLech) >= 4) return { pred: doLech > 0 ? 'Xỉu' : 'Tài', confidence: 68, weight: 1.4, reason: `Hồi quy lệch ${doLech}` };
  return null;
}

function thuatToan_20_PhanPhoi(lichSu) {
  if (lichSu.length < 15) return null;
  const ganDay = lichSu.slice(0,5);
  const truoc = lichSu.slice(5,10);
  const taiGan = ganDay.filter(r => r === 'Tài').length;
  const taiTruoc = truoc.filter(r => r === 'Tài').length;
  if (taiGan > taiTruoc + 2) return { pred: 'Xỉu', confidence: 66, weight: 1.3, reason: `Phân phối thay đổi - bẻ` };
  if (taiTruoc > taiGan + 2) return { pred: 'Tài', confidence: 66, weight: 1.3, reason: `Phân phối thay đổi - bẻ` };
  return null;
}

// ---------- NHÓM 3: THUẬT TOÁN DỰA TRÊN ĐIỂM (21-25) ----------

function thuatToan_21_TongDiem(tongData) {
  if (!tongData || tongData.length < 10) return null;
  const avg = tongData.slice(0,10).reduce((a,b)=>a+b,0)/10;
  if (avg > 11.5) return { pred: 'Xỉu', confidence: 68, weight: 1.4, reason: `Tổng cao TB ${avg.toFixed(1)}` };
  if (avg < 9.5) return { pred: 'Tài', confidence: 68, weight: 1.4, reason: `Tổng thấp TB ${avg.toFixed(1)}` };
  return null;
}

function thuatToan_22_BienDoTong(tongData) {
  if (!tongData || tongData.length < 10) return null;
  const max = Math.max(...tongData.slice(0,10));
  const min = Math.min(...tongData.slice(0,10));
  if (max - min >= 8) return { pred: max > 14 ? 'Xỉu' : 'Tài', confidence: 65, weight: 1.3, reason: `Biên độ lớn ${max-min}` };
  return null;
}

function thuatToan_23_XuHuongTong(tongData) {
  if (!tongData || tongData.length < 20) return null;
  const gan = tongData.slice(0,10).reduce((a,b)=>a+b,0)/10;
  const truoc = tongData.slice(10,20).reduce((a,b)=>a+b,0)/10;
  if (gan > truoc + 1) return { pred: 'Xỉu', confidence: 64, weight: 1.2, reason: `Tổng tăng dần` };
  if (gan < truoc - 1) return { pred: 'Tài', confidence: 64, weight: 1.2, reason: `Tổng giảm dần` };
  return null;
}

function thuatToan_24_DiceFreq(diceData) {
  if (!diceData || diceData.length < 10) return null;
  const freq = {1:0,2:0,3:0,4:0,5:0,6:0};
  for (let d of diceData.slice(0,20)) {
    if (d && d.length === 3) { d.forEach(f => { if(f) freq[f]++; }); }
  }
  const maxFace = Object.keys(freq).reduce((a,b) => freq[a] > freq[b] ? a : b);
  if (maxFace >= 5) return { pred: 'Tài', confidence: 66, weight: 1.3, reason: `Mặt ${maxFace} xuất hiện nhiều` };
  if (maxFace <= 2) return { pred: 'Xỉu', confidence: 66, weight: 1.3, reason: `Mặt ${maxFace} xuất hiện nhiều` };
  return null;
}

function thuatToan_25_DiceChanLe(diceData) {
  if (!diceData || diceData.length < 10) return null;
  let leCount = 0;
  for (let d of diceData.slice(0,20)) {
    if (d && d.length === 3) { d.forEach(f => { if(f % 2 === 1) leCount++; }); }
  }
  const total = leCount + (diceData.slice(0,20).length * 3 - leCount);
  if (leCount > total * 0.6) return { pred: 'Xỉu', confidence: 64, weight: 1.2, reason: 'Xúc xắc lẻ nhiều' };
  if (leCount < total * 0.4) return { pred: 'Tài', confidence: 64, weight: 1.2, reason: 'Xúc xắc chẵn nhiều' };
  return null;
}

// ---------- NHÓM 4: THUẬT TOÁN HỌC MÁY & CHỈ BÁO (26-30) ----------

function thuatToan_26_Markov1(lichSu) {
  if (lichSu.length < 15) return null;
  const map = new Map();
  for (let i = 0; i < lichSu.length - 1; i++) {
    const key = lichSu[i];
    const next = lichSu[i+1];
    if (!map.has(key)) map.set(key, { Tai: 0, Xiu: 0 });
    if (next === 'Tài') map.get(key).Tai++;
    else map.get(key).Xiu++;
  }
  const last = lichSu[0];
  const stat = map.get(last);
  if (stat && stat.Tai + stat.Xiu >= 3) {
    const pred = stat.Tai > stat.Xiu ? 'Tài' : 'Xỉu';
    return { pred, confidence: 66, weight: 1.4, reason: `Markov bậc 1: ${last}→${pred}` };
  }
  return null;
}

function thuatToan_27_Markov2(lichSu) {
  if (lichSu.length < 20) return null;
  const map = new Map();
  for (let i = 0; i < lichSu.length - 2; i++) {
    const key = `${lichSu[i]}_${lichSu[i+1]}`;
    const next = lichSu[i+2];
    if (!map.has(key)) map.set(key, { Tai: 0, Xiu: 0 });
    if (next === 'Tài') map.get(key).Tai++;
    else map.get(key).Xiu++;
  }
  const lastKey = `${lichSu[0]}_${lichSu[1]}`;
  const stat = map.get(lastKey);
  if (stat && stat.Tai + stat.Xiu >= 2) {
    const pred = stat.Tai > stat.Xiu ? 'Tài' : 'Xỉu';
    return { pred, confidence: 70, weight: 1.5, reason: `Markov bậc 2: (${lichSu[0]},${lichSu[1]})→${pred}` };
  }
  return null;
}

function thuatToan_28_RSI(lichSu) {
  if (lichSu.length < 14) return null;
  const tai14 = lichSu.slice(0,14).filter(r => r === 'Tài').length;
  const rsi = (tai14 / 14) * 100;
  if (rsi >= 70) return { pred: 'Xỉu', confidence: 70, weight: 1.5, reason: `RSI quá mua (${rsi.toFixed(0)})` };
  if (rsi <= 30) return { pred: 'Tài', confidence: 70, weight: 1.5, reason: `RSI quá bán (${rsi.toFixed(0)})` };
  return null;
}

function thuatToan_29_MACD(lichSu) {
  if (lichSu.length < 26) return null;
  const ema12 = lichSu.slice(0,12).filter(r => r === 'Tài').length / 12;
  const ema26 = lichSu.slice(0,26).filter(r => r === 'Tài').length / 26;
  const macd = ema12 - ema26;
  if (macd > 0.12) return { pred: 'Xỉu', confidence: 66, weight: 1.3, reason: `MACD cắt xuống (${macd.toFixed(2)})` };
  if (macd < -0.12) return { pred: 'Tài', confidence: 66, weight: 1.3, reason: `MACD cắt lên (${macd.toFixed(2)})` };
  return null;
}

function thuatToan_30_Bollinger(lichSu) {
  if (lichSu.length < 20) return null;
  const last20 = lichSu.slice(0,20);
  const tai20 = last20.filter(r => r === 'Tài').length;
  const mean = tai20 / 20;
  const variance = last20.reduce((sum, r) => sum + Math.pow((r === 'Tài' ? 1 : 0) - mean, 2), 0) / 20;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const current = lichSu[0] === 'Tài' ? 1 : 0;
  if (current > upper) return { pred: 'Xỉu', confidence: 68, weight: 1.4, reason: 'Chạm dải trên Bollinger' };
  if (current < lower) return { pred: 'Tài', confidence: 68, weight: 1.4, reason: 'Chạm dải dưới Bollinger' };
  return null;
}

// ==========================================
// ==================== THUẬT TOÁN MẸ (TỔNG HỢP) ====================
// ==========================================

// Danh sách 30 thuật toán con
const ALL_ALGORITHMS = [
  thuatToan_1_Streak, thuatToan_2_Cau1_1, thuatToan_3_Cau2_1, thuatToan_4_Cau1_2,
  thuatToan_5_Cau2_2, thuatToan_6_Cau3_1, thuatToan_7_Cau3_2, thuatToan_8_CauDoiXung,
  thuatToan_9_PatternLap3, thuatToan_10_PatternLap4, thuatToan_11_Martingale5, thuatToan_12_Martingale10,
  thuatToan_13_Tile20, thuatToan_14_Tile30, thuatToan_15_XuHuong3, thuatToan_16_XuHuong5,
  thuatToan_17_ChuKy8, thuatToan_18_ChuKy13, thuatToan_19_HoiQuy, thuatToan_20_PhanPhoi,
  thuatToan_21_TongDiem, thuatToan_22_BienDoTong, thuatToan_23_XuHuongTong, thuatToan_24_DiceFreq,
  thuatToan_25_DiceChanLe, thuatToan_26_Markov1, thuatToan_27_Markov2, thuatToan_28_RSI,
  thuatToan_29_MACD, thuatToan_30_Bollinger
];

// THUẬT TOÁN MẸ 1: TỔNG HỢP CÓ TRỌNG SỐ
async function meAlgo_1_WeightedVoting(lichSu, tongData, diceData, weights) {
  const results = await Promise.all(ALL_ALGORITHMS.map(algo => algo(lichSu, tongData, diceData)));
  let diemTai = 0, diemXiu = 0;
  let soTT = 0;
  for (let r of results) {
    if (r && r.pred) {
      soTT++;
      const w = (weights[r.reason] || r.weight || 1.0);
      if (r.pred === 'Tài') diemTai += r.confidence * w;
      else diemXiu += r.confidence * w;
    }
  }
  if (soTT === 0) return null;
  const pred = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  let confidence = Math.abs(diemTai - diemXiu) / (diemTai + diemXiu) * 100;
  confidence = Math.min(92, Math.max(55, confidence));
  return { pred, confidence: Math.round(confidence), soThuatToan: soTT, loaiMe: 'Trọng số động' };
}

// THUẬT TOÁN MẸ 2: BỎ PHIẾU ĐA SỐ
async function meAlgo_2_MajorityVote(lichSu, tongData, diceData) {
  const results = await Promise.all(ALL_ALGORITHMS.map(algo => algo(lichSu, tongData, diceData)));
  let taiVotes = 0, xiuVotes = 0;
  for (let r of results) if (r && r.pred) r.pred === 'Tài' ? taiVotes++ : xiuVotes++;
  if (taiVotes + xiuVotes === 0) return null;
  const pred = taiVotes > xiuVotes ? 'Tài' : 'Xỉu';
  let confidence = 50 + (Math.max(taiVotes, xiuVotes) / (taiVotes + xiuVotes)) * 40;
  return { pred, confidence: Math.round(confidence), soThuatToan: taiVotes + xiuVotes, loaiMe: 'Đa số' };
}

// THUẬT TOÁN MẸ 3: BỎ PHIẾU THEO NHÓM (CẦU, THỐNG KÊ, KỸ THUẬT)
async function meAlgo_3_GroupedVote(lichSu, tongData, diceData) {
  const results = await Promise.all(ALL_ALGORITHMS.map(algo => algo(lichSu, tongData, diceData)));
  let groups = { cau: { Tai:0, Xiu:0 }, thongKe: { Tai:0, Xiu:0 }, kyThuat: { Tai:0, Xiu:0 } };
  let groupCount = { cau:0, thongKe:0, kyThuat:0 };
  
  for (let r of results) {
    if (!r || !r.pred) continue;
    let group = 'cau';
    if (r.reason.includes('RSI') || r.reason.includes('MACD') || r.reason.includes('Bollinger') || r.reason.includes('Markov')) group = 'kyThuat';
    else if (r.reason.includes('Tổng') || r.reason.includes('Dice') || r.reason.includes('Phân phối') || r.reason.includes('Hồi quy')) group = 'thongKe';
    
    groupCount[group]++;
    if (r.pred === 'Tài') groups[group].Tai++;
    else groups[group].Xiu++;
  }
  
  let diemTai = 0, diemXiu = 0;
  for (let g of ['cau', 'thongKe', 'kyThuat']) {
    if (groupCount[g] > 0) {
      const winner = groups[g].Tai > groups[g].Xiu ? 'Tài' : 'Xỉu';
      const weight = g === 'cau' ? 2.0 : (g === 'thongKe' ? 1.2 : 1.0);
      if (winner === 'Tài') diemTai += 100 * weight;
      else diemXiu += 100 * weight;
    }
  }
  const pred = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  return { pred, confidence: 75, soThuatToan: results.filter(r=>r && r.pred).length, loaiMe: 'Theo nhóm (cầu/stat/kỹ thuật)' };
}

// THUẬT TOÁN MẸ 4: TỐI ƯU HÓA HỌC SÂU (DỰA TRÊN LỊCH SỬ ĐÚNG SAI)
async function meAlgo_4_AdaptiveWeight(lichSu, tongData, diceData, weights) {
  const results = await Promise.all(ALL_ALGORITHMS.map(algo => algo(lichSu, tongData, diceData)));
  let diemTai = 0, diemXiu = 0;
  let soTT = 0;
  for (let r of results) {
    if (r && r.pred) {
      soTT++;
      const w = weights[r.reason] || 0.5;
      if (r.pred === 'Tài') diemTai += r.confidence * w;
      else diemXiu += r.confidence * w;
    }
  }
  if (soTT === 0) return null;
  const pred = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  let confidence = Math.abs(diemTai - diemXiu) / (diemTai + diemXiu) * 100;
  confidence = Math.min(92, Math.max(55, confidence));
  return { pred, confidence: Math.round(confidence), soThuatToan: soTT, loaiMe: 'Trọng số thích nghi' };
}

// THUẬT TOÁN MẸ 5: TỔNG HỢP TẤT CẢ THUẬT TOÁN MẸ
async function meAlgo_5_MegaEnsemble(lichSu, tongData, diceData, weights) {
  const me1 = await meAlgo_1_WeightedVoting(lichSu, tongData, diceData, weights);
  const me2 = await meAlgo_2_MajorityVote(lichSu, tongData, diceData);
  const me3 = await meAlgo_3_GroupedVote(lichSu, tongData, diceData);
  const me4 = await meAlgo_4_AdaptiveWeight(lichSu, tongData, diceData, weights);
  
  const meResults = [me1, me2, me3, me4].filter(m => m !== null);
  if (meResults.length === 0) return null;
  
  let diemTai = 0, diemXiu = 0;
  for (let m of meResults) {
    if (m.pred === 'Tài') diemTai += m.confidence;
    else diemXiu += m.confidence;
  }
  const finalPred = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  let confidence = Math.abs(diemTai - diemXiu) / (diemTai + diemXiu) * 100;
  confidence = Math.min(94, Math.max(58, confidence));
  
  return {
    pred: finalPred,
    confidence: Math.round(confidence),
    soThuatToan: meResults.length,
    loaiMe: 'SIÊU TỔNG HỢP (5 mẹ)',
    chiTietMe: meResults.map(m => `${m.loaiMe}: ${m.pred} (${m.confidence}%)`)
  };
}

// ==========================================
// XỬ LÝ REQUEST CHÍNH
// ==========================================
async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.ket_qua === "Bão") throw new Error(`Game ${gameKey} ra Bão, tạm bỏ qua`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  // Cập nhật kết quả dự đoán trước
  if (lastPred && lastPred.prediction !== undefined) {
    updateStats(gameKey, data.ket_qua, lastPred.prediction);
    lastPred.actual = data.ket_qua;
    lastPred.isCorrect = (data.ket_qua === lastPred.prediction);
    
    // Cập nhật trọng số adaptive dựa trên đúng/sai
    if (lastPred.chiTietThuatToan) {
      const isCorrect = (data.ket_qua === lastPred.prediction);
      for (let algo of lastPred.chiTietThuatToan) {
        if (!learningDB[gameKey].weights[algo]) learningDB[gameKey].weights[algo] = 1.0;
        if (isCorrect) learningDB[gameKey].weights[algo] = Math.min(2.0, learningDB[gameKey].weights[algo] * 1.05);
        else learningDB[gameKey].weights[algo] = Math.max(0.3, learningDB[gameKey].weights[algo] * 0.95);
      }
    }
  }
  
  // Cập nhật lịch sử
  hist.data.unshift(data.ket_qua);
  if (hist.data.length > 500) hist.data.pop();
  if (data.tong) {
    hist.tongData.unshift(data.tong);
    if (hist.tongData.length > 500) hist.tongData.pop();
  }
  if (data.dice && data.dice.length === 3) {
    hist.diceData.unshift(data.dice);
    if (hist.diceData.length > 500) hist.diceData.pop();
  }
  
  // Cache
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: {
        phien: data.phien + 1,
        du_doan: cached.prediction,
        do_tin_cay: cached.confidence + '%',
        so_thuat_toan: cached.soThuatToan,
        loai_thuat_toan_me: cached.meType,
        giai_thich: cached.reason
      },
      thongKe: statsDB[gameKey],
      learning: { trong_so: learningDB[gameKey].weights, dung_lien_tiep: learningDB[gameKey].correctStreak }
    };
  }
  
  // Chạy 5 thuật toán mẹ, chọn kết quả tốt nhất
  let bestPrediction = null;
  let bestConfidence = 0;
  
  const me5 = await meAlgo_5_MegaEnsemble(hist.data, hist.tongData, hist.diceData, learningDB[gameKey].weights);
  if (me5 && me5.confidence > bestConfidence) {
    bestPrediction = me5;
    bestConfidence = me5.confidence;
  }
  
  if (!bestPrediction) {
    // Fallback an toàn
    const last3 = hist.data.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    bestPrediction = { pred: tai3 >= 2 ? 'Tài' : 'Xỉu', confidence: 58, soThuatToan: 1, loaiMe: 'Fallback' };
  }
  
  cacheDB[gameKey].set(data.phien, {
    prediction: bestPrediction.pred,
    confidence: bestPrediction.confidence,
    soThuatToan: bestPrediction.soThuatToan,
    meType: bestPrediction.loaiMe,
    reason: bestPrediction.chiTietMe ? bestPrediction.chiTietMe.join(' | ') : bestPrediction.loaiMe,
    chiTietThuatToan: bestPrediction.chiTietMe || []
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
      du_doan: bestPrediction.pred,
      do_tin_cay: bestPrediction.confidence + '%',
      so_thuat_toan_con: 30,
      so_thuat_toan_me: bestPrediction.soThuatToan,
      loai_thuat_toan_me: bestPrediction.loaiMe,
      chi_tiet_me: bestPrediction.chiTietMe
    },
    thongKe: statsDB[gameKey],
    learning: { trong_so_adaptive: learningDB[gameKey].weights, dung_lien_tiep: learningDB[gameKey].correctStreak }
  };
}

// ==========================================
// TẠO ENDPOINTS
// ==========================================
for (let gameKey in GAME_APIS) {
  const endpoint = `/${gameKey.replace(/_/g, '/')}`;
  app.get(endpoint, async (req, res) => {
    try {
      const result = await xuLyGame(gameKey);
      res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286', date: '20/05/2026' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  const hist = historyDB[game];
  res.json({ game, lichSu: hist.data.slice(0, 30).map((v,i)=>({stt:i+1, ket_qua:v})), thongKe: statsDB[game] });
});

app.get('/lich-su', (req, res) => {
  const allStats = {};
  for (let key in GAME_APIS) allStats[key] = statsDB[key];
  res.json({ thong_ke_tat_ca_game: allStats, tong_so_game: Object.keys(GAME_APIS).length });
});

app.get('/', (req, res) => {
  res.json({
    name: '🔥 SIÊU THUẬT TOÁN TÀI XỈU - 30 CON + 5 MẸ 🔥',
    author: '@tranhoang2286',
    version: '9.0 - 20/05/2026',
    thong_ke: { tong_so_game: Object.keys(GAME_APIS).length, tong_so_thuat_toan: '30 con + 5 mẹ' },
    danh_sach_game: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    cac_thuat_toan_con: [
      '1. Streak (bệt) - 2. Cầu 1-1 - 3. Cầu 2-1 - 4. Cầu 1-2 - 5. Cầu 2-2',
      '6. Cầu 3-1 - 7. Cầu 3-2 - 8. Cầu đối xứng - 9. Pattern lặp 3 - 10. Pattern lặp 4',
      '11. Martingale 5 phiên - 12. Martingale 10 phiên - 13. Tỉ lệ 20 - 14. Tỉ lệ 30',
      '15. Xu hướng 3 - 16. Xu hướng 5 - 17. Chu kỳ 8 - 18. Chu kỳ 13 - 19. Hồi quy',
      '20. Phân phối - 21. Tổng điểm TB - 22. Biên độ tổng - 23. Xu hướng tổng',
      '24. Tần suất xúc xắc - 25. Chẵn lẻ xúc xắc - 26. Markov bậc 1 - 27. Markov bậc 2',
      '28. RSI - 29. MACD - 30. Bollinger Bands'
    ],
    cac_thuat_toan_me: [
      'Mẹ 1: Trọng số động - Bỏ phiếu có trọng số theo từng thuật toán',
      'Mẹ 2: Đa số - Bỏ phiếu đơn giản (1 phiếu = 1 thuật toán)',
      'Mẹ 3: Theo nhóm - Chia nhóm (cầu/thống kê/kỹ thuật) rồi bỏ phiếu',
      'Mẹ 4: Thích nghi - Tự động tăng/giảm trọng số dựa trên đúng/sai',
      'Mẹ 5: SIÊU TỔNG HỢP - Tổng hợp kết quả từ 4 mẹ trên'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔥 SIÊU THUẬT TOÁN TÀI XỈU - ${Object.keys(GAME_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🧠 30 THUẬT TOÁN CON + 5 THUẬT TOÁN MẸ`);
  console.log(`📊 Học trọng số thích nghi - cập nhật liên tục`);
  console.log(`✅ Xử lý bất đồng bộ - Promise.all - không chờ nhau`);
});
