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
// LƯU TRỮ LỊCH SỬ
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
// THUẬT TOÁN THỰC CHIẾN - CHỈ DỰA VÀO CẦU THỰC TẾ
// ==========================================

// 1. Phát hiện cầu đang chạy
function phatHienCau(lichSu) {
  if (lichSu.length < 6) return { type: "chua_du", value: null, length: 0 };
  
  const last5 = lichSu.slice(0, 5);
  const last3 = lichSu.slice(0, 3);
  
  // Kiểm tra cầu bệt 3-4-5
  let betCount = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) betCount++;
    else break;
  }
  if (betCount >= 3) {
    return { type: "BET", value: lichSu[0], length: betCount, prediction: lichSu[0] };
  }
  
  // Cầu 1-1 (xen kẽ)
  if (last5[0] !== last5[1] && last5[1] !== last5[2] && last5[2] !== last5[3] && last5[3] !== last5[4]) {
    return { type: "XEN_KE", value: last5[0], length: 5, prediction: last5[4] === "Tài" ? "Xỉu" : "Tài" };
  }
  
  // Cầu 2-1 (bệt 2 rồi đảo)
  if (lichSu[0] === lichSu[1] && lichSu[2] !== lichSu[1] && lichSu[3] === lichSu[4]) {
    return { type: "2-1", value: lichSu[0], length: 4, prediction: lichSu[0] };
  }
  
  // Cầu 3-2
  if (lichSu[0] === lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] === lichSu[4]) {
    return { type: "3-2", value: lichSu[0], length: 5, prediction: lichSu[3] === "Tài" ? "Xỉu" : "Tài" };
  }
  
  // Không có cầu rõ ràng
  return { type: "rong", value: null, length: 0, prediction: null };
}

// 2. Phân tích xu hướng ngắn hạn
function phanTichXuHuong(lichSu) {
  if (lichSu.length < 10) return { prediction: null, confidence: 0 };
  
  const last10 = lichSu.slice(0, 10);
  const tai10 = last10.filter(r => r === "Tài").length;
  const xiu10 = 10 - tai10;
  
  if (tai10 >= 7) return { prediction: "Xỉu", confidence: 70, reason: `Tài nóng ${tai10}/10` };
  if (xiu10 >= 7) return { prediction: "Tài", confidence: 70, reason: `Xỉu nóng ${xiu10}/10` };
  if (tai10 >= 6) return { prediction: "Xỉu", confidence: 62, reason: `Tài hơi nóng ${tai10}/10` };
  if (xiu10 >= 6) return { prediction: "Tài", confidence: 62, reason: `Xỉu hơi nóng ${xiu10}/10` };
  
  return { prediction: null, confidence: 0 };
}

// 3. Phân tích tổng điểm (nếu có dice)
function phanTichTongDiem(tongData) {
  if (!tongData || tongData.length < 8) return null;
  const last8 = tongData.slice(0, 8);
  const avg = last8.reduce((a,b) => a+b, 0) / 8;
  const prevAvg = tongData.slice(8, 16).reduce((a,b) => a+b, 0) / 8;
  
  if (avg > 11.5 && avg > prevAvg + 0.5) return { prediction: "Xỉu", confidence: 65, reason: `Tổng cao TB ${avg.toFixed(1)}` };
  if (avg < 9.5 && avg < prevAvg - 0.5) return { prediction: "Tài", confidence: 65, reason: `Tổng thấp TB ${avg.toFixed(1)}` };
  return null;
}

// 4. Thuật toán chính - tổng hợp
function duDoanChinh(lichSu, tongData) {
  if (lichSu.length < 5) {
    return { du_doan: "Tài", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu (cần 5 phiên)" };
  }
  
  // Phát hiện cầu
  const cau = phatHienCau(lichSu);
  
  // Nếu có cầu rõ ràng
  if (cau.type !== "rong" && cau.type !== "chua_du" && cau.prediction) {
    let confidence = 65;
    if (cau.type === "BET" && cau.length >= 4) confidence = 72;
    if (cau.type === "BET" && cau.length >= 5) confidence = 78;
    if (cau.type === "XEN_KE") confidence = 70;
    if (cau.type === "2-1") confidence = 68;
    if (cau.type === "3-2") confidence = 72;
    
    return {
      du_doan: cau.prediction,
      do_tin_cay: confidence,
      giai_thich: `${cau.type} (độ dài ${cau.length})`
    };
  }
  
  // Không có cầu, dùng xu hướng
  const xuHuong = phanTichXuHuong(lichSu);
  if (xuHuong.prediction) {
    return {
      du_doan: xuHuong.prediction,
      do_tin_cay: xuHuong.confidence,
      giai_thich: xuHuong.reason
    };
  }
  
  // Phân tích tổng điểm
  const tong = phanTichTongDiem(tongData);
  if (tong) {
    return {
      du_doan: tong.prediction,
      do_tin_cay: tong.confidence,
      giai_thich: tong.reason
    };
  }
  
  // Fallback: theo xu hướng 3 phiên
  const last3 = lichSu.slice(0, 3);
  const tai3 = last3.filter(r => r === "Tài").length;
  const duDoanCuoi = tai3 >= 2 ? "Tài" : "Xỉu";
  
  return {
    du_doan: duDoanCuoi,
    do_tin_cay: 58,
    giai_thich: `Xu hướng 3 phiên (${tai3}T-${3-tai3}X)`
  };
}

// Xóc đĩa riêng
function duDoanXocDia(lichSu) {
  if (lichSu.length < 5) return { du_doan: "Chẵn", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu" };
  
  // Cầu bệt xóc đĩa
  let betCount = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) betCount++;
    else break;
  }
  if (betCount >= 3) {
    return {
      du_doan: lichSu[0] === "Chẵn" ? "Lẻ" : "Chẵn",
      do_tin_cay: 70,
      giai_thich: `Bệt ${betCount} phiên ${lichSu[0]} → bẻ cầu`
    };
  }
  
  // Xu hướng 5 phiên
  const last5 = lichSu.slice(0, 5);
  const chan5 = last5.filter(r => r === "Chẵn").length;
  if (chan5 >= 4) return { du_doan: "Lẻ", do_tin_cay: 68, giai_thich: `Chẵn nóng ${chan5}/5 → bẻ Lẻ` };
  if (chan5 <= 1) return { du_doan: "Chẵn", do_tin_cay: 68, giai_thich: `Lẻ nóng ${5-chan5}/5 → bẻ Chẵn` };
  
  return { du_doan: chan5 >= 3 ? "Chẵn" : "Lẻ", do_tin_cay: 60, giai_thich: `Theo xu hướng ${chan5}C-${5-chan5}L` };
}

// ==========================================
// XỬ LÝ REQUEST CHÍNH
// ==========================================
async function xuLyGame(gameKey) {
  const url = GAME_APIS[gameKey];
  const data = await fetchGameData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  if (data.ket_qua === "Bão") throw new Error(`Game ${gameKey} ra Bão`);
  
  const hist = historyDB[gameKey];
  const lastPred = cacheDB[gameKey].get(data.phien - 1);
  const isXocDia = (gameKey === 'lc79_xocdia');
  
  // Cập nhật kết quả dự đoán trước
  if (lastPred && lastPred.prediction !== undefined) {
    const thucTe = data.ket_qua;
    updateStats(gameKey, thucTe, lastPred.prediction);
    lastPred.actual = thucTe;
    lastPred.isCorrect = (thucTe === lastPred.prediction);
  }
  
  // Cập nhật lịch sử
  hist.data.unshift(data.ket_qua);
  if (hist.data.length > 200) hist.data.pop();
  if (data.tong && typeof data.tong === 'number') {
    hist.tongData.unshift(data.tong);
    if (hist.tongData.length > 200) hist.tongData.pop();
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
        giai_thich: cached.reason
      },
      thongKe: statsDB[gameKey]
    };
  }
  
  // Dự đoán
  let prediction;
  if (isXocDia) {
    prediction = duDoanXocDia(hist.data);
  } else {
    prediction = duDoanChinh(hist.data, hist.tongData);
  }
  
  // Lưu cache
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.du_doan,
    confidence: prediction.do_tin_cay,
    reason: prediction.giai_thich
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
      du_doan: prediction.du_doan,
      do_tin_cay: prediction.do_tin_cay + '%',
      giai_thich: prediction.giai_thich
    },
    thongKe: statsDB[gameKey]
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
      res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) {
    return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  }
  res.json({ game, lichSu: historyDB[game].data.slice(0, 30).map((v,i)=>({stt:i+1, ket_qua:v})), thongKe: statsDB[game] });
});

app.get('/lich-su', (req, res) => {
  const allStats = {};
  for (let key in GAME_APIS) allStats[key] = statsDB[key];
  res.json({ thong_ke_tat_ca_game: allStats, tong_so_game: Object.keys(GAME_APIS).length });
});

app.get('/', (req, res) => {
  res.json({
    name: '🎲 THUẬT TOÁN THỰC CHIẾN - NHẬN DIỆN CẦU',
    author: '@tranhoang2286',
    version: '11.0',
    danh_sach_game: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    cach_hoat_dong: 'Phát hiện cầu bệt, cầu 1-1, cầu 2-1, cầu 3-2, phân tích xu hướng 10 phiên, tổng điểm'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎲 THUẬT TOÁN THỰC CHIẾN - ${Object.keys(GAME_APIS).length} GAME - PORT ${PORT}`);
  console.log(`📊 Phát hiện cầu: Bệt | 1-1 | 2-1 | 3-2`);
  console.log(`📈 Phân tích: Xu hướng 10 phiên | Tổng điểm`);
});
