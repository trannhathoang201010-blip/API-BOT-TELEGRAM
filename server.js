const express = require('express');
const axios = require('axios');
const cors = require('cors');

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

// ==================== LỊCH SỬ & THỐNG KÊ ====================
const historyDB = {};
for (let key in ALL_APIS) {
  historyDB[key] = {
    data: [],
    stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' },
    cache: new Map()
  };
}

function updateStats(game, thucTe, duDoan, doTinCay) {
  const st = historyDB[game]?.stats;
  if (!st || !thucTe || !duDoan) return;
  const dung = (thucTe === duDoan);
  if (dung) st.dung++;
  else st.sai++;
  st.tong++;
  st.tiLe = ((st.dung / st.tong) * 100).toFixed(1) + '%';
  
  // Ghi log để kiểm tra tỉ lệ thực tế
  console.log(`[${game}] Dự đoán: ${duDoan} (${doTinCay}%) | Thực tế: ${thucTe} | KQ: ${dung ? 'ĐÚNG' : 'SAI'} | TL: ${st.tiLe}`);
  return dung;
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
    return { phien, ket_qua: ketQua, tong, dice };
  } catch (err) { return null; }
}

async function fetchSicboData(url, gameKey) {
  try {
    const headers = gameKey === 'club789_sicbo' ? {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://demo7892.fun/',
      'Origin': 'https://demo7892.fun'
    } : { 'User-Agent': 'Mozilla/5.0' };
    const res = await axios.get(url, { timeout: 10000, headers });
    const data = res.data;
    if (gameKey === 'sunwin_sicbo' && data?.ket_qua) {
      let ketQua = data.ket_qua === 'Bão' ? 'Bão' : (data.ket_qua === 'Tài' ? 'Tài' : 'Xỉu');
      return {
        phien: parseInt(data.phien?.replace('#', '') || data.phien),
        ket_qua: ketQua,
        tong: data.tong,
        dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3],
        isBao: ketQua === 'Bão'
      };
    }
    if (gameKey === 'club789_sicbo' && data?.data?.resultList?.length) {
      const last = data.data.resultList[0];
      const tong = last.score;
      let ketQua = last.resultType === 3 ? 'Tài' : (last.resultType === 4 ? 'Xỉu' : 'Bão');
      return {
        phien: parseInt(last.gameNum.replace('#', '')),
        ket_qua: ketQua,
        tong: tong,
        dice: last.facesList,
        isBao: ketQua === 'Bão'
      };
    }
    return null;
  } catch (err) { return null; }
}

// ==================== TÍNH TỈ LỆ THỰC TẾ (48% - 88%) ====================
function tinhTiLeThucTe(diemTai, diemXiu, soThuatToan, lichSuGanDay) {
  // 1. Dựa trên chênh lệch điểm số (40% trọng số)
  let chenhLech = Math.abs(diemTai - diemXiu);
  let tileTuChenh = 50 + (chenhLech / 2);
  tileTuChenh = Math.min(85, Math.max(48, tileTuChenh));
  
  // 2. Dựa trên số thuật toán đồng thuận (30% trọng số)
  let tileTuThuatToan = 50 + (soThuatToan * 3);
  tileTuThuatToan = Math.min(80, Math.max(48, tileTuThuatToan));
  
  // 3. Dựa trên độ chính xác gần đây (20% trọng số)
  let tileTuLichSu = 55;
  if (lichSuGanDay && lichSuGanDay.length >= 5) {
    const dungGanDay = lichSuGanDay.filter(kq => kq === true).length;
    tileTuLichSu = 45 + (dungGanDay / lichSuGanDay.length) * 40;
    tileTuLichSu = Math.min(85, Math.max(48, tileTuLichSu));
  }
  
  // 4. Điều chỉnh theo độ khó (10%)
  let doKho = 0;
  if (Math.abs(diemTai - diemXiu) < 15) doKho = 5;
  if (Math.abs(diemTai - diemXiu) < 10) doKho = 10;
  if (Math.abs(diemTai - diemXiu) < 5) doKho = 15;
  
  // Tổng hợp có trọng số
  let tileCuoi = (tileTuChenh * 0.4) + (tileTuThuatToan * 0.3) + (tileTuLichSu * 0.2) - (doKho * 0.1);
  tileCuoi = Math.round(tileCuoi);
  tileCuoi = Math.min(88, Math.max(48, tileCuoi));
  
  return tileCuoi;
}

// ==================== THUẬT TOÁN DỰ ĐOÁN (CÓ TỈ LỆ THỰC TẾ) ====================
function duDoanTaiXiu(lichSu, lichSuTong, lichSuDungGanDay) {
  if (!lichSu || lichSu.length < 6) {
    return { duDoan: 'Tài', doTinCay: 52, soThuatToan: 1, lyDo: '📊 Chưa đủ dữ liệu' };
  }
  
  let diemTai = 0, diemXiu = 0;
  let soThuatToanApDung = 0;
  let cacDuDoan = [];
  
  // 1. Streak Analysis (bệt)
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) streak++;
    else break;
  }
  if (streak >= 5) {
    const pred = lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài';
    const diem = 80;
    cacDuDoan.push({ duDoan: pred, diem, trongSo: 2.0 });
    if (pred === 'Tài') diemTai += diem * 2.0;
    else diemXiu += diem * 2.0;
    soThuatToanApDung++;
  } else if (streak === 4) {
    const pred = lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài';
    const diem = 72;
    cacDuDoan.push({ duDoan: pred, diem, trongSo: 1.8 });
    if (pred === 'Tài') diemTai += diem * 1.8;
    else diemXiu += diem * 1.8;
    soThuatToanApDung++;
  }
  
  // 2. Martingale (quá nóng)
  if (lichSu.length >= 10) {
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = 10 - tai10;
    if (tai10 >= 8) {
      cacDuDoan.push({ duDoan: 'Xỉu', diem: 76, trongSo: 1.8 });
      diemXiu += 76 * 1.8;
      soThuatToanApDung++;
    } else if (xiu10 >= 8) {
      cacDuDoan.push({ duDoan: 'Tài', diem: 76, trongSo: 1.8 });
      diemTai += 76 * 1.8;
      soThuatToanApDung++;
    } else if (tai10 === 7) {
      cacDuDoan.push({ duDoan: 'Xỉu', diem: 68, trongSo: 1.5 });
      diemXiu += 68 * 1.5;
      soThuatToanApDung++;
    } else if (xiu10 === 7) {
      cacDuDoan.push({ duDoan: 'Tài', diem: 68, trongSo: 1.5 });
      diemTai += 68 * 1.5;
      soThuatToanApDung++;
    }
  }
  
  // 3. Baccarat Pattern (cầu 1-1)
  if (lichSu.length >= 8) {
    let zigzag = 0;
    for (let i = 1; i < 6; i++) {
      if (lichSu[i] !== lichSu[i-1]) zigzag++;
    }
    if (zigzag >= 4) {
      const pred = lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài';
      cacDuDoan.push({ duDoan: pred, diem: 70, trongSo: 1.6 });
      if (pred === 'Tài') diemTai += 70 * 1.6;
      else diemXiu += 70 * 1.6;
      soThuatToanApDung++;
    }
  }
  
  // 4. Tổng điểm phân tích
  if (lichSuTong && lichSuTong.length >= 10) {
    const last10 = lichSuTong.slice(0, 10);
    const avg = last10.reduce((a,b) => a + b, 0) / 10;
    if (avg > 11.5) {
      cacDuDoan.push({ duDoan: 'Xỉu', diem: 66, trongSo: 1.4 });
      diemXiu += 66 * 1.4;
      soThuatToanApDung++;
    } else if (avg < 9.5) {
      cacDuDoan.push({ duDoan: 'Tài', diem: 66, trongSo: 1.4 });
      diemTai += 66 * 1.4;
      soThuatToanApDung++;
    }
  }
  
  // 5. Tần suất 20 phiên
  if (lichSu.length >= 20) {
    const dem = { Tài: 0, Xỉu: 0 };
    lichSu.slice(0, 20).forEach(r => dem[r]++);
    const chenh = Math.abs(dem.Tài - dem.Xỉu);
    if (chenh >= 6) {
      const pred = dem.Tài > dem.Xỉu ? 'Xỉu' : 'Tài';
      cacDuDoan.push({ duDoan: pred, diem: 70, trongSo: 1.5 });
      if (pred === 'Tài') diemTai += 70 * 1.5;
      else diemXiu += 70 * 1.5;
      soThuatToanApDung++;
    }
  }
  
  // Nếu không có thuật toán nào chạy, dùng fallback
  if (soThuatToanApDung === 0) {
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    if (tai3 === 3) {
      diemXiu += 65;
      soThuatToanApDung = 1;
    } else if (tai3 === 0) {
      diemTai += 65;
      soThuatToanApDung = 1;
    } else {
      if (tai3 >= 2) diemTai += 60;
      else diemXiu += 60;
      soThuatToanApDung = 1;
    }
  }
  
  // Quyết định cuối cùng
  const duDoan = diemTai > diemXiu ? 'Tài' : 'Xỉu';
  const doTinCay = tinhTiLeThucTe(diemTai, diemXiu, soThuatToanApDung, lichSuDungGanDay);
  
  return { duDoan, doTinCay, soThuatToan: soThuatToanApDung, lyDo: `${soThuatToanApDung} thuật toán | Tài:${Math.round(diemTai)} Xỉu:${Math.round(diemXiu)}` };
}

// Sicbo
function duDoanSicbo(lichSu, lichSuTong, lichSuDungGanDay) {
  if (!lichSu || lichSu.length < 6) {
    return { duDoan: 'Tài', doTinCay: 52, soThuatToan: 1, lyDo: '📊 Chưa đủ dữ liệu' };
  }
  
  let diemTai = 0, diemXiu = 0, diemBao = 0;
  let soThuatToanApDung = 0;
  
  // Streak
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) streak++;
    else break;
  }
  if (streak >= 4 && lichSu[0] !== 'Bão') {
    const pred = lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài';
    if (pred === 'Tài') diemTai += 74 * 1.8;
    else diemXiu += 74 * 1.8;
    soThuatToanApDung++;
  }
  
  // Martingale
  if (lichSu.length >= 10) {
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = last10.filter(r => r === 'Xỉu').length;
    if (tai10 >= 7) {
      diemXiu += 70 * 1.6;
      soThuatToanApDung++;
    } else if (xiu10 >= 7) {
      diemTai += 70 * 1.6;
      soThuatToanApDung++;
    }
  }
  
  // Bão check
  if (lichSu.length >= 30) {
    const baoCount = lichSu.slice(0, 50).filter(r => r === 'Bão').length;
    if (baoCount === 0) {
      diemBao += 58 * 1.3;
      soThuatToanApDung++;
    }
  }
  
  // Fallback
  if (soThuatToanApDung === 0) {
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    if (tai3 >= 2) diemTai += 60;
    else diemXiu += 60;
    soThuatToanApDung = 1;
  }
  
  let maxDiem = Math.max(diemTai, diemXiu, diemBao);
  let duDoan = 'Tài';
  if (maxDiem === diemXiu && diemXiu > diemTai + 5) duDoan = 'Xỉu';
  if (maxDiem === diemBao && diemBao > diemTai + 10 && diemBao > diemXiu + 10) duDoan = 'Bão';
  
  const doTinCay = tinhTiLeThucTe(diemTai, diemXiu, soThuatToanApDung, lichSuDungGanDay);
  
  return { duDoan, doTinCay, soThuatToan: soThuatToanApDung, lyDo: `${soThuatToanApDung} thuật toán | T:${Math.round(diemTai)} X:${Math.round(diemXiu)} B:${Math.round(diemBao)}` };
}

// ==================== XỬ LÝ REQUEST ====================
async function xuLyGame(gameKey) {
  const url = ALL_APIS[gameKey];
  let data = gameKey.includes('sicbo') ? await fetchSicboData(url, gameKey) : await fetchTaiXiuData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  
  const hist = historyDB[gameKey];
  const lastPred = hist.data[0];
  
  // Lấy lịch sử đúng/sai gần đây để tính tỉ lệ
  const lichSuDungGanDay = hist.data.slice(0, 10).map(p => p.ketQua === 'ĐÚNG');
  
  // Cập nhật dự đoán trước (khi có kết quả thực tế)
  if (lastPred && lastPred.phienThucTe === data.phien - 1) {
    const dung = updateStats(gameKey, data.ket_qua, lastPred.duDoan, lastPred.do_tin_cay);
    lastPred.thucTe = data.ket_qua;
    lastPred.diceThucTe = data.dice;
    lastPred.ketQua = dung ? 'ĐÚNG' : 'SAI';
    lastPred.thoiGianKetQua = new Date();
  }
  
  // Cache: nếu đã dự đoán phiên này rồi thì trả lại kết quả cũ (không đổi khi F5)
  if (hist.cache.has(data.phien)) {
    const cached = hist.cache.get(data.phien);
    hist.data.unshift({
      phienDuDoan: data.phien + 1,
      duDoan: cached.duDoan,
      do_tin_cay: cached.doTinCay,
      lyDo: cached.lyDo,
      soThuatToan: cached.soThuatToan,
      phienThucTe: data.phien,
      thucTe: null,
      diceThucTe: null,
      ketQua: null,
      thoiGianDuDoan: new Date()
    });
    if (hist.data.length > 100) hist.data.pop();
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: cached.duDoan, do_tin_cay: cached.doTinCay + '%', ly_do: cached.lyDo, so_thuat_toan: cached.soThuatToan },
      thongKe: hist.stats
    };
  }
  
  // Xây lịch sử kết quả để dự đoán
  let lichSuKetQua = [data.ket_qua];
  let lichSuTong = [data.tong];
  for (let item of hist.data) {
    if (item.thucTe) {
      lichSuKetQua.push(item.thucTe);
      if (item.diceThucTe) {
        lichSuTong.push(item.diceThucTe.reduce((a,b) => a + b, 0));
      }
    }
  }
  
  // Dự đoán
  let pred;
  if (gameKey.includes('sicbo')) {
    pred = duDoanSicbo(lichSuKetQua, lichSuTong, lichSuDungGanDay);
  } else {
    pred = duDoanTaiXiu(lichSuKetQua, lichSuTong, lichSuDungGanDay);
  }
  
  // Lưu cache
  hist.cache.set(data.phien, {
    duDoan: pred.duDoan,
    doTinCay: pred.doTinCay,
    lyDo: pred.lyDo,
    soThuatToan: pred.soThuatToan
  });
  if (hist.cache.size > 20) {
    const first = hist.cache.keys().next().value;
    hist.cache.delete(first);
  }
  
  // Lưu dự đoán vào lịch sử
  hist.data.unshift({
    phienDuDoan: data.phien + 1,
    duDoan: pred.duDoan,
    do_tin_cay: pred.doTinCay,
    lyDo: pred.lyDo,
    soThuatToan: pred.soThuatToan,
    phienThucTe: data.phien,
    thucTe: null,
    diceThucTe: null,
    ketQua: null,
    thoiGianDuDoan: new Date()
  });
  if (hist.data.length > 100) hist.data.pop();
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: { 
      phien: data.phien + 1, 
      du_doan: pred.duDoan, 
      do_tin_cay: pred.doTinCay + '%', 
      ly_do: pred.lyDo, 
      so_thuat_toan: pred.soThuatToan 
    },
    thongKe: hist.stats
  };
}

// ==================== TẠO ENDPOINTS ====================
for (let gameKey in ALL_APIS) {
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

// ==================== LỊCH SỬ ====================
app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!historyDB[game]) {
    return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(ALL_APIS) });
  }
  const hist = historyDB[game];
  res.json({
    game,
    lichSu: hist.data.slice(0, 30).map(p => ({
      phien_du_doan: p.phienDuDoan,
      du_doan: p.duDoan,
      do_tin_cay: p.do_tin_cay + '%',
      ly_do: p.lyDo,
      so_thuat_toan: p.soThuatToan,
      thuc_te: p.thucTe,
      ket_qua: p.ketQua
    })),
    thongKe: hist.stats
  });
});

app.get('/lich-su', (req, res) => {
  const all = {};
  for (let key in historyDB) {
    all[key] = { thongKe: historyDB[key].stats, soLuongDuDoan: historyDB[key].data.length };
  }
  res.json({ tong_quan_thong_ke: all });
});

app.get('/', (req, res) => {
  res.json({
    name: '🚀 API VIP - Tỉ Lệ Thực Tế 48%-88%',
    author: '@tranhoang2286',
    version: '9.0',
    endpoints: Object.keys(ALL_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    lich_su: '/lich-su hoặc /lich-su/:game',
    tinh_nang: {
      ti_le_thuc_te: '48% - 88% (không còn 55% ảo)',
      tu_dong_cap_nhat: 'Khi có kết quả thực tế, tự động cập nhật và dự đoán phiên tiếp theo',
      cache: 'F5 không đổi kết quả'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 VIP SERVER - ${Object.keys(ALL_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`📊 Tỉ lệ thực tế: 48% - 88% (tùy độ khó của dự đoán)`);
  console.log(`🔄 Tự động cập nhật khi có kết quả mới`);
});
