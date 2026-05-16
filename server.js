const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==========================================
// DANH SÁCH API MỚI (17 GAME)
// ==========================================
const GAME_APIS = {
  // Tài Xỉu
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
  // Sicbo
  'sunwin_sicbo': 'https://enquiries-indices-navigator-mega.trycloudflare.com/api/sunsicbo',
  'luck8_sicbo40': 'https://qld-incentives-tion-boost.trycloudflare.com/api/sicbo40',
  // Xóc Đĩa
  'lc79_xocdia': 'https://strategy-cube-vinyl-warcraft.trycloudflare.com/api/xocdia'
};

// ==========================================
// LƯU TRỮ LỊCH SỬ & CACHE
// ==========================================
const historyDB = {};
const cacheDB = {};
const statsDB = {};

for (let key in GAME_APIS) {
  historyDB[key] = { data: [], tongData: [], diceData: [] };
  cacheDB[key] = new Map();
  statsDB[key] = { tong: 0, dung: 0, sai: 0, tiLe: '0%' };
}

function updateStats(game, thucTe, duDoan) {
  const st = statsDB[game];
  if (!st || !thucTe || !duDoan) return;
  const dung = (thucTe === duDoan);
  if (dung) st.dung++;
  else st.sai++;
  st.tong++;
  st.tiLe = ((st.dung / st.tong) * 100).toFixed(1) + '%';
  return dung;
}

// ==========================================
// THUẬT TOÁN RIÊNG CHO TỪNG GAME
// ==========================================

// Thuật toán 1: Sunwin TX - Siêu bệt & Martingale
function thuatToanSunwinTX(lichSu) {
  if (lichSu.length < 5) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 4) {
    if (lichSu[0] === "Tài") diemXiu += 85;
    else diemTai += 85;
  } else if (streak === 3) {
    if (lichSu[0] === "Tài") diemXiu += 72;
    else diemTai += 72;
  }
  
  const last5 = lichSu.slice(0, 5);
  const tai5 = last5.filter(r => r === "Tài").length;
  if (tai5 >= 4) diemXiu += 30;
  else if (tai5 <= 1) diemTai += 30;
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 3;
  confidence = Math.min(88, Math.max(55, confidence));
  return { pred, confidence: Math.round(confidence), reason: `Streak=${streak} | T${tai5}/5` };
}

// Thuật toán 2: LC79 TX - Phân tích tổng điểm
function thuatToanLC79TX(lichSu, tongData) {
  if (lichSu.length < 5) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  
  // Phân tích tổng điểm
  if (tongData && tongData.length >= 5) {
    const avgTong = tongData.slice(0, 5).reduce((a,b) => a+b, 0) / 5;
    if (avgTong > 11.5) diemXiu += 25;
    else if (avgTong < 9.5) diemTai += 25;
  }
  
  // Phân tích cầu
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 3) {
    if (lichSu[0] === "Tài") diemXiu += 65;
    else diemTai += 65;
  }
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 2;
  confidence = Math.min(85, Math.max(55, confidence));
  return { pred, confidence: Math.round(confidence), reason: `Tổng điểm TB + Streak` };
}

// Thuật toán 3: LC79 MD5 - 7 thuật toán con kết hợp
function thuatToanLC79MD5(lichSu, tongData) {
  if (lichSu.length < 8) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  let soThuatToan = 0;
  
  // 1. Streak
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 4) {
    if (lichSu[0] === "Tài") diemXiu += 80;
    else diemTai += 80;
    soThuatToan++;
  }
  
  // 2. 10 phiên gần nhất
  const last10 = lichSu.slice(0, 10);
  const tai10 = last10.filter(r => r === "Tài").length;
  if (tai10 >= 7) { diemXiu += 35; soThuatToan++; }
  else if (tai10 <= 3) { diemTai += 35; soThuatToan++; }
  
  // 3. Cầu 1-1
  let zigzag = 0;
  for (let i = 1; i < 5; i++) if (lichSu[i] !== lichSu[i-1]) zigzag++;
  if (zigzag >= 3) {
    if (lichSu[0] === "Tài") diemXiu += 28;
    else diemTai += 28;
    soThuatToan++;
  }
  
  // 4. Tổng điểm
  if (tongData && tongData.length >= 8) {
    const avgTong = tongData.slice(0, 8).reduce((a,b) => a+b, 0) / 8;
    if (avgTong > 11) { diemXiu += 22; soThuatToan++; }
    else if (avgTong < 10) { diemTai += 22; soThuatToan++; }
  }
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = soThuatToan > 0 ? 55 + Math.min(30, soThuatToan * 4) : 55;
  confidence = Math.min(88, confidence);
  return { pred, confidence: Math.round(confidence), reason: `${soThuatToan} thuật toán kết hợp` };
}

// Thuật toán 4: Betvip TX - Cầu bệt & đảo chiều
function thuatToanBetvipTX(lichSu) {
  if (lichSu.length < 4) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  
  if (streak >= 3) {
    const pred = lichSu[0] === "Tài" ? "Xỉu" : "Tài";
    let confidence = 65 + (streak - 3) * 5;
    confidence = Math.min(85, confidence);
    return { pred, confidence, reason: `Bệt ${streak} → bẻ cầu` };
  }
  
  const last3 = lichSu.slice(0, 3);
  const tai3 = last3.filter(r => r === "Tài").length;
  const pred = tai3 >= 2 ? "Tài" : "Xỉu";
  return { pred, confidence: 62, reason: `Theo xu hướng ${tai3}T-${3-tai3}X` };
}

// Thuật toán 5: Betvip MD5 - Phân tích chẵn lẻ tổng điểm
function thuatToanBetvipMD5(lichSu, tongData) {
  if (lichSu.length < 5) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  
  // Dựa vào tổng điểm chẵn lẻ
  if (tongData && tongData.length >= 5) {
    const last5Tong = tongData.slice(0, 5);
    const chanCount = last5Tong.filter(t => t % 2 === 0).length;
    if (chanCount >= 4) {
      if (last5Tong[0] % 2 === 0) diemXiu += 35;
      else diemTai += 35;
    }
  }
  
  // Streak
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 3) {
    if (lichSu[0] === "Tài") diemXiu += 60;
    else diemTai += 60;
  }
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 3;
  confidence = Math.min(85, confidence);
  return { pred, confidence: Math.round(confidence), reason: `Tổng điểm + Streak` };
}

// Thuật toán 6: 789Club - Fibonacci & cầu
function thuatToan789Club(lichSu) {
  if (lichSu.length < 6) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  
  // Fibonacci check
  const fibs = [2, 3, 5];
  for (let fib of fibs) {
    if (lichSu.length > fib && lichSu[0] === lichSu[fib]) {
      if (lichSu[0] === "Tài") diemXiu += 35;
      else diemTai += 35;
    }
  }
  
  // 5 phiên gần nhất
  const last5 = lichSu.slice(0, 5);
  const tai5 = last5.filter(r => r === "Tài").length;
  if (tai5 >= 3) diemTai += 25;
  else diemXiu += 25;
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 2;
  confidence = Math.min(82, confidence);
  return { pred, confidence: Math.round(confidence), reason: `Fibonacci + xu hướng` };
}

// Thuật toán 7: B52 - Phân tích xúc xắc
function thuatToanB52(lichSu, diceData) {
  if (lichSu.length < 5) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  
  // Phân tích mặt xúc xắc
  if (diceData && diceData.length >= 5) {
    const faces = [];
    for (let dice of diceData.slice(0, 5)) {
      if (dice && dice.length === 3) faces.push(...dice);
    }
    if (faces.length >= 10) {
      const avgFace = faces.reduce((a,b) => a+b, 0) / faces.length;
      if (avgFace > 3.8) diemTai += 30;
      else if (avgFace < 3.2) diemXiu += 30;
    }
  }
  
  // Streak
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 3) {
    if (lichSu[0] === "Tài") diemXiu += 55;
    else diemTai += 55;
  }
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 2.5;
  confidence = Math.min(84, confidence);
  return { pred, confidence: Math.round(confidence), reason: `Xúc xắc + Streak` };
}

// Thuật toán 8: Max789 - Martingale pro
function thuatToanMax789(lichSu) {
  if (lichSu.length < 10) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu (cần 10)" };
  
  const last10 = lichSu.slice(0, 10);
  const tai10 = last10.filter(r => r === "Tài").length;
  const xiu10 = 10 - tai10;
  
  if (tai10 >= 7) return { pred: "Xỉu", confidence: 78, reason: `Tài nóng ${tai10}/10 → bẻ Xỉu` };
  if (xiu10 >= 7) return { pred: "Tài", confidence: 78, reason: `Xỉu nóng ${xiu10}/10 → bẻ Tài` };
  if (tai10 >= 6) return { pred: "Xỉu", confidence: 68, reason: `Tài ${tai10}/10 → bẻ nhẹ` };
  if (xiu10 >= 6) return { pred: "Tài", confidence: 68, reason: `Xỉu ${xiu10}/10 → bẻ nhẹ` };
  
  return { pred: lichSu[0] === "Tài" ? "Tài" : "Xỉu", confidence: 60, reason: "Theo xu hướng" };
}

// Thuật toán 9: Luck8 MD5 - Tổng hợp nhiều chỉ báo
function thuatToanLuck8MD5(lichSu, tongData) {
  if (lichSu.length < 8) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let diemTai = 0, diemXiu = 0;
  
  // RSI giả lập
  const last14 = lichSu.slice(0, 14);
  const tai14 = last14.filter(r => r === "Tài").length;
  const rsi = (tai14 / 14) * 100;
  if (rsi >= 70) diemXiu += 28;
  if (rsi <= 30) diemTai += 28;
  
  // MA5/MA10
  const ma5 = lichSu.slice(0, 5).filter(r => r === "Tài").length / 5;
  const ma10 = lichSu.slice(0, 10).filter(r => r === "Tài").length / 10;
  if (ma5 > ma10 + 0.2) diemXiu += 22;
  if (ma5 < ma10 - 0.2) diemTai += 22;
  
  const pred = diemTai > diemXiu ? "Tài" : "Xỉu";
  let confidence = 55 + Math.abs(diemTai - diemXiu) / 2;
  confidence = Math.min(86, confidence);
  return { pred, confidence: Math.round(confidence), reason: `RSI + MA` };
}

// Thuật toán 10: Sumvin MD5 - Cầu 1-1 + entropy
function thuatToanSumvinMD5(lichSu) {
  if (lichSu.length < 8) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  let zigzag = 0;
  for (let i = 1; i < 6; i++) {
    if (lichSu[i] !== lichSu[i-1]) zigzag++;
  }
  if (zigzag >= 4) {
    const pred = lichSu[0] === "Tài" ? "Xỉu" : "Tài";
    return { pred, confidence: 74, reason: "Cầu 1-1 (zigzag)" };
  }
  
  // Cầu 2-1
  if (lichSu[0] === lichSu[1] && lichSu[3] === lichSu[4] && lichSu[0] !== lichSu[3]) {
    return { pred: lichSu[0], confidence: 72, reason: "Cầu 2-1" };
  }
  
  const last5 = lichSu.slice(0, 5);
  const tai5 = last5.filter(r => r === "Tài").length;
  const pred = tai5 >= 3 ? "Tài" : "Xỉu";
  return { pred, confidence: 62, reason: "Theo xu hướng 5 phiên" };
}

// Thuật toán 11: 68GB Thường - Cầu ngắn hạn
function thuatToanGB68Thuong(lichSu) {
  if (lichSu.length < 4) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  const last3 = lichSu.slice(0, 3);
  const tai3 = last3.filter(r => r === "Tài").length;
  
  if (tai3 === 3) return { pred: "Xỉu", confidence: 72, reason: "Bệt Tài 3 → bẻ Xỉu" };
  if (tai3 === 0) return { pred: "Tài", confidence: 72, reason: "Bệt Xỉu 3 → bẻ Tài" };
  if (tai3 === 2) return { pred: "Tài", confidence: 64, reason: "2T/3 → theo Tài" };
  return { pred: "Xỉu", confidence: 64, reason: "2X/3 → theo Xỉu" };
}

// Thuật toán 12: 68GB MD5 - Phân tích tổng số lần Tài/Xỉu
function thuatToanGB68MD5(lichSu) {
  if (lichSu.length < 10) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  const last10 = lichSu.slice(0, 10);
  const tai10 = last10.filter(r => r === "Tài").length;
  const chenhLech = Math.abs(tai10 - 5);
  
  if (chenhLech >= 3) {
    const pred = tai10 > 5 ? "Xỉu" : "Tài";
    let confidence = 65 + chenhLech * 3;
    confidence = Math.min(82, confidence);
    return { pred, confidence, reason: `Lệch ${tai10}/10 → bẻ` };
  }
  
  const pred = lichSu[0] === "Tài" ? "Tài" : "Xỉu";
  return { pred, confidence: 60, reason: "Theo phiên gần nhất" };
}

// Thuật toán 13: Sunwin Sicbo - Phân tích Bão
function thuatToanSunwinSicbo(lichSu, diceData) {
  if (lichSu.length < 5) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  // Kiểm tra Bão
  if (diceData && diceData.length >= 1) {
    const lastDice = diceData[0];
    if (lastDice && lastDice[0] === lastDice[1] && lastDice[1] === lastDice[2]) {
      return { pred: "Tài", confidence: 68, reason: "Sau Bão → Tài" };
    }
  }
  
  const last5 = lichSu.slice(0, 5);
  const tai5 = last5.filter(r => r === "Tài").length;
  if (tai5 >= 4) return { pred: "Xỉu", confidence: 72, reason: `Tài ${tai5}/5 → bẻ` };
  if (tai5 <= 1) return { pred: "Tài", confidence: 72, reason: `Xỉu ${5-tai5}/5 → bẻ` };
  
  return { pred: tai5 >= 3 ? "Tài" : "Xỉu", confidence: 62, reason: "Theo xu hướng" };
}

// Thuật toán 14: Luck8 Sicbo 40s - Phân tích nhanh
function thuatToanLuck8Sicbo(lichSu) {
  if (lichSu.length < 4) return { pred: "Tài", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  const last3 = lichSu.slice(0, 3);
  const tai3 = last3.filter(r => r === "Tài").length;
  const xiu3 = 3 - tai3;
  
  if (tai3 === 3) return { pred: "Xỉu", confidence: 70, reason: "Bệt Tài 3 → Xỉu" };
  if (xiu3 === 3) return { pred: "Tài", confidence: 70, reason: "Bệt Xỉu 3 → Tài" };
  if (tai3 === 2) return { pred: "Xỉu", confidence: 64, reason: "2T/3 → bẻ Xỉu" };
  if (xiu3 === 2) return { pred: "Tài", confidence: 64, reason: "2X/3 → bẻ Tài" };
  
  return { pred: "Tài", confidence: 58, reason: "Mặc định Tài" };
}

// Thuật toán 15: LC79 Xóc Đĩa - Chẵn/Lẻ
function thuatToanXocDia(lichSu) {
  if (lichSu.length < 5) return { pred: "Chẵn", confidence: 55, reason: "Chưa đủ dữ liệu" };
  
  const last5 = lichSu.slice(0, 5);
  const chan5 = last5.filter(r => r === "Chẵn").length;
  const le5 = 5 - chan5;
  
  if (chan5 >= 4) return { pred: "Lẻ", confidence: 72, reason: `Chẵn nóng ${chan5}/5 → bẻ Lẻ` };
  if (le5 >= 4) return { pred: "Chẵn", confidence: 72, reason: `Lẻ nóng ${le5}/5 → bẻ Chẵn` };
  
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 3) {
    const pred = lichSu[0] === "Chẵn" ? "Lẻ" : "Chẵn";
    return { pred, confidence: 68, reason: `Bệt ${streak} → bẻ cầu` };
  }
  
  const pred = chan5 >= 3 ? "Chẵn" : "Lẻ";
  return { pred, confidence: 60, reason: `Theo xu hướng ${chan5}C-${le5}L` };
}

// ==========================================
// HÀM FETCH DỮ LIỆU
// ==========================================
async function fetchGameData(url, gameKey) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;
    if (!data) return null;
    
    // Xóc Đĩa
    if (gameKey === 'lc79_xocdia') {
      if (data.ket_qua_truyen_thong) {
        let ketQua = data.ket_qua_truyen_thong === 'Chẵn' ? 'Chẵn' : 'Lẻ';
        let resultValue = ketQua === 'Chẵn' ? 1 : 0;
        return { phien: data.phien, ket_qua: ketQua, resultValue, dice: data.xuc_xac, tong: null };
      }
      return null;
    }
    
    // Sicbo
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
    
    // Các game còn lại
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
// LỰA CHỌN THUẬT TOÁN THEO GAME
// ==========================================
function getAlgorithm(gameKey) {
  const algorithms = {
    'sunwin_tx': thuatToanSunwinTX,
    'lc79_tx': thuatToanLC79TX,
    'lc79_md5': thuatToanLC79MD5,
    'betvip_tx': thuatToanBetvipTX,
    'betvip_md5': thuatToanBetvipMD5,
    'club789_tx': thuatToan789Club,
    'b52': thuatToanB52,
    'max789': thuatToanMax789,
    'luck8_md5': thuatToanLuck8MD5,
    'sumvin_md5': thuatToanSumvinMD5,
    'gb68_thuong': thuatToanGB68Thuong,
    'gb68_md5': thuatToanGB68MD5,
    'sunwin_sicbo': thuatToanSunwinSicbo,
    'luck8_sicbo40': thuatToanLuck8Sicbo,
    'lc79_xocdia': thuatToanXocDia
  };
  return algorithms[gameKey] || thuatToanSunwinTX;
}

// ==========================================
// XỬ LÝ REQUEST
// ==========================================
async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.resultValue === -1) throw new Error(`Game ${gameKey} ra Bão`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  // Cập nhật kết quả dự đoán trước
  if (lastPred && lastPred.prediction !== undefined) {
    const thucTe = isXocDia ? (data.resultValue === 1 ? "Chẵn" : "Lẻ") : data.ket_qua;
    const duDoanCu = lastPred.prediction;
    const isCorrect = (thucTe === duDoanCu);
    updateStats(gameKey, thucTe, duDoanCu);
    lastPred.actual = thucTe;
    lastPred.isCorrect = isCorrect;
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
  
  // Cache để F5 không đổi
  if (cacheDB[gameKey].has(data.phien)) {
    const cached = cacheDB[gameKey].get(data.phien);
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: cached.prediction, do_tin_cay: cached.confidence + '%', giai_thich: cached.reason },
      thongKe: statsDB[gameKey]
    };
  }
  
  // Chạy thuật toán riêng cho game
  const algorithm = getAlgorithm(gameKey);
  let prediction;
  if (gameKey === 'lc79_xocdia') {
    prediction = algorithm(hist.data);
  } else {
    prediction = algorithm(hist.data, hist.tongData, hist.diceData);
  }
  
  // Lưu cache
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.pred,
    confidence: prediction.confidence,
    reason: prediction.reason
  });
  if (cacheDB[gameKey].size > 20) {
    const firstKey = cacheDB[gameKey].keys().next().value;
    cacheDB[gameKey].delete(firstKey);
  }
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: { phien: data.phien + 1, du_doan: prediction.pred, do_tin_cay: prediction.confidence + '%', giai_thich: prediction.reason },
    thongKe: statsDB[gameKey]
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
      res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286', date: '17/05/2026' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ==========================================
// API LỊCH SỬ
// ==========================================
app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) {
    return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  }
  const hist = historyDB[game];
  res.json({
    game,
    lichSu: hist.data.slice(0, 30).map((v, i) => ({ stt: i+1, ket_qua: v })),
    thongKe: statsDB[game]
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
    name: '🚀 17 GAME TÀI XỈU - MỖI GAME THUẬT TOÁN RIÊNG',
    author: '@tranhoang2286',
    version: '4.0 - 17/05/2026',
    danh_sach_game: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    thong_ke: '/lich-su',
    huong_dan: 'Gọi /tên-game để nhận dự đoán. Mỗi game có thuật toán phân tích riêng biệt.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 17 GAME TÀI XỈU - ${PORT}`);
  console.log(`📡 Mỗi game có thuật toán riêng biệt`);
  console.log(`🎲 Game list: ${Object.keys(GAME_APIS).join(', ')}`);
  console.log(`📅 Cập nhật: 17/05/2026`);
});
