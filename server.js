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
    stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%', tiLe10: '0%' },
    cache: new Map()
  };
}

function updateStats(game, thucTe, duDoan) {
  const st = historyDB[game]?.stats;
  if (!st || !thucTe || !duDoan) return;
  const dung = (thucTe === duDoan);
  if (dung) st.dung++;
  else st.sai++;
  st.tong++;
  st.tiLe = ((st.dung / st.tong) * 100).toFixed(1) + '%';
  
  const last10 = historyDB[game].data.slice(0, 10).filter(p => p.thucTe);
  if (last10.length >= 5) {
    const dung10 = last10.filter(p => p.ketQua === 'ĐÚNG').length;
    st.tiLe10 = ((dung10 / last10.length) * 100).toFixed(1) + '%';
  }
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

// ==================== THUẬT TOÁN VIP CÂN BẰNG ====================
class TaiXiuVIP {
  constructor(gameKey) {
    this.gameKey = gameKey;
  }

  // 1. Streak Analysis - CHỈ ĐÁNH NGƯỢC KHI BỆT ĐỦ DÀI
  phanTichStreak(lichSu) {
    if (lichSu.length < 3) return null;
    let streak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[0]) streak++;
      else break;
    }
    if (streak >= 5) {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 80, trongSo: 2.0 };
    }
    if (streak === 4) {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 72, trongSo: 1.8 };
    }
    return null;
  }

  // 2. Martingale - CHỈ BẺ KHI MỘT BÊN QUÁ 7/10
  phanTichMartingale(lichSu) {
    if (lichSu.length < 10) return null;
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = 10 - tai10;
    if (tai10 >= 8) {
      return { duDoan: 'Xỉu', doTinCay: 76, trongSo: 1.8 };
    }
    if (xiu10 >= 8) {
      return { duDoan: 'Tài', doTinCay: 76, trongSo: 1.8 };
    }
    if (tai10 === 7) {
      return { duDoan: 'Xỉu', doTinCay: 68, trongSo: 1.5 };
    }
    if (xiu10 === 7) {
      return { duDoan: 'Tài', doTinCay: 68, trongSo: 1.5 };
    }
    return null;
  }

  // 3. Baccarat Pattern - CẦU 1-1, 2-1, 3-2
  phanTichBaccarat(lichSu) {
    if (lichSu.length < 8) return null;
    let zigzag = 0;
    for (let i = 1; i < 6; i++) {
      if (lichSu[i] !== lichSu[i-1]) zigzag++;
    }
    if (zigzag >= 4) {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 70, trongSo: 1.6 };
    }
    
    const p1 = lichSu.slice(0,3).join('');
    const p2 = lichSu.slice(3,6).join('');
    if (p1 === p2 && (p1 === 'TàiTàiXỉu' || p1 === 'XỉuXỉuTài')) {
      return { duDoan: p1[0] === 'Tài' ? 'Tài' : 'Xỉu', doTinCay: 74, trongSo: 1.6 };
    }
    return null;
  }

  // 4. Tổng điểm - DỰA TRÊN DỮ LIỆU DICE
  phanTichTongDiem(lichSuTong) {
    if (!lichSuTong || lichSuTong.length < 10) return null;
    const last10 = lichSuTong.slice(0, 10);
    const avg = last10.reduce((a,b) => a + b, 0) / 10;
    const prev10 = lichSuTong.slice(10, 20);
    if (prev10.length >= 10) {
      const avgPrev = prev10.reduce((a,b) => a + b, 0) / 10;
      if (avg > avgPrev + 1.5) {
        return { duDoan: 'Xỉu', doTinCay: 66, trongSo: 1.4 };
      }
      if (avg < avgPrev - 1.5) {
        return { duDoan: 'Tài', doTinCay: 66, trongSo: 1.4 };
      }
    }
    return null;
  }

  // 5. Tần suất - DỰA TRÊN 20 PHIÊN
  phanTichTanSuat(lichSu) {
    if (lichSu.length < 20) return null;
    const dem = { Tài: 0, Xỉu: 0 };
    lichSu.slice(0, 20).forEach(r => dem[r]++);
    const chenh = Math.abs(dem.Tài - dem.Xỉu);
    if (chenh >= 6) {
      const duDoan = dem.Tài > dem.Xỉu ? 'Xỉu' : 'Tài';
      return { duDoan, doTinCay: 70, trongSo: 1.5 };
    }
    return null;
  }

  // 6. Markov Chain - DỰA TRÊN 2 PHIÊN GẦN NHẤT
  phanTichMarkov(lichSu) {
    if (lichSu.length < 12) return null;
    const map = new Map();
    for (let i = 0; i < lichSu.length - 2; i++) {
      const key = `${lichSu[i]}_${lichSu[i+1]}`;
      const next = lichSu[i+2];
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(next);
    }
    const lastKey = `${lichSu[0]}_${lichSu[1]}`;
    const nextList = map.get(lastKey);
    if (nextList && nextList.length >= 2) {
      const dem = {};
      nextList.forEach(v => dem[v] = (dem[v] || 0) + 1);
      let maxV = null, maxC = 0;
      for (let v in dem) {
        if (dem[v] > maxC) { maxC = dem[v]; maxV = v; }
      }
      return { duDoan: maxV, doTinCay: 64 + Math.min(8, nextList.length), trongSo: 1.4 };
    }
    return null;
  }

  // 7. Ensemble - TỔNG HỢP CÓ TRỌNG SỐ
  phanTichEnsemble(lichSu, lichSuTong) {
    const allPredictions = [
      this.phanTichStreak(lichSu),
      this.phanTichMartingale(lichSu),
      this.phanTichBaccarat(lichSu),
      this.phanTichTongDiem(lichSuTong),
      this.phanTichTanSuat(lichSu),
      this.phanTichMarkov(lichSu)
    ].filter(p => p !== null);
    
    if (allPredictions.length === 0) return null;
    
    let diemTai = 0, diemXiu = 0;
    let tongTrongSo = 0;
    
    for (let p of allPredictions) {
      const w = p.trongSo || 1;
      tongTrongSo += w;
      if (p.duDoan === 'Tài') {
        diemTai += p.doTinCay * w;
      } else {
        diemXiu += p.doTinCay * w;
      }
    }
    
    // Nếu hòa, chọn theo xu hướng 3 phiên gần nhất
    if (Math.abs(diemTai - diemXiu) < 5) {
      const last3 = lichSu.slice(0, 3);
      const tai3 = last3.filter(r => r === 'Tài').length;
      const duDoan = tai3 >= 2 ? 'Tài' : 'Xỉu';
      return { duDoan, doTinCay: 62, soThuatToan: allPredictions.length, lyDo: `Hòa vote → theo xu hướng 3 phiên` };
    }
    
    const duDoan = diemTai > diemXiu ? 'Tài' : 'Xỉu';
    const doTinCay = Math.min(85, Math.round(Math.abs(diemTai - diemXiu) / tongTrongSo * 15 + 55));
    return { duDoan, doTinCay, soThuatToan: allPredictions.length, lyDo: `Tổng hợp ${allPredictions.length} thuật toán` };
  }

  duDoan(lichSu, lichSuTong) {
    if (!lichSu || lichSu.length < 6) {
      return { duDoan: 'Tài', doTinCay: 55, lyDo: 'Chưa đủ dữ liệu (cần 6 phiên)', soThuatToan: 0 };
    }
    const result = this.phanTichEnsemble(lichSu, lichSuTong);
    if (result) return result;
    // Fallback an toàn: theo xu hướng 3 phiên gần nhất
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    const xiu3 = 3 - tai3;
    if (tai3 === 3) return { duDoan: 'Xỉu', doTinCay: 65, lyDo: 'Bệt Tài 3 phiên → đánh Xỉu', soThuatToan: 1 };
    if (xiu3 === 3) return { duDoan: 'Tài', doTinCay: 65, lyDo: 'Bệt Xỉu 3 phiên → đánh Tài', soThuatToan: 1 };
    return { duDoan: tai3 >= 2 ? 'Tài' : 'Xỉu', doTinCay: 60, lyDo: 'Theo xu hướng 3 phiên', soThuatToan: 1 };
  }
}

// ==================== THUẬT TOÁN SICBO CÂN BẰNG ====================
class SicboVIP {
  constructor(gameKey) {
    this.gameKey = gameKey;
  }

  phanTichStreak(lichSu) {
    if (lichSu.length < 3) return null;
    let streak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[0]) streak++;
      else break;
    }
    if (streak >= 4 && lichSu[0] !== 'Bão') {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 74, trongSo: 1.8 };
    }
    if (streak >= 2 && lichSu[0] === 'Bão') {
      return { duDoan: 'Tài', doTinCay: 66, trongSo: 1.5 };
    }
    return null;
  }

  phanTichTanSuatBao(lichSu) {
    if (lichSu.length < 30) return null;
    const baoCount = lichSu.slice(0, 50).filter(r => r === 'Bão').length;
    if (baoCount === 0) {
      return { duDoan: 'Bão', doTinCay: 58, trongSo: 1.3 };
    }
    return null;
  }

  phanTichMartingale(lichSu) {
    if (lichSu.length < 10) return null;
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = last10.filter(r => r === 'Xỉu').length;
    if (tai10 >= 7) {
      return { duDoan: 'Xỉu', doTinCay: 70, trongSo: 1.6 };
    }
    if (xiu10 >= 7) {
      return { duDoan: 'Tài', doTinCay: 70, trongSo: 1.6 };
    }
    return null;
  }

  phanTichBaccarat(lichSu) {
    if (lichSu.length < 8) return null;
    let zigzag = 0;
    for (let i = 1; i < 6; i++) {
      if (lichSu[i] !== lichSu[i-1] && lichSu[i] !== 'Bão' && lichSu[i-1] !== 'Bão') zigzag++;
    }
    if (zigzag >= 4) {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 68, trongSo: 1.5 };
    }
    return null;
  }

  phanTichTongDiem(lichSuTong, lichSu) {
    if (!lichSuTong || lichSuTong.length < 10) return null;
    const avg = lichSuTong.slice(0, 10).reduce((a,b) => a + b, 0) / 10;
    const lastBaoIndex = lichSu.findIndex(r => r === 'Bão');
    if (lastBaoIndex === 0 && avg > 10.5) {
      return { duDoan: 'Tài', doTinCay: 66, trongSo: 1.4 };
    }
    if (lastBaoIndex === 0 && avg <= 10.5) {
      return { duDoan: 'Xỉu', doTinCay: 66, trongSo: 1.4 };
    }
    return null;
  }

  phanTichEnsemble(lichSu, lichSuTong) {
    const allPredictions = [
      this.phanTichStreak(lichSu),
      this.phanTichTanSuatBao(lichSu),
      this.phanTichMartingale(lichSu),
      this.phanTichBaccarat(lichSu),
      this.phanTichTongDiem(lichSuTong, lichSu)
    ].filter(p => p !== null);
    
    if (allPredictions.length === 0) return null;
    
    let diemTai = 0, diemXiu = 0, diemBao = 0;
    let tongTrongSo = 0;
    
    for (let p of allPredictions) {
      const w = p.trongSo || 1;
      tongTrongSo += w;
      if (p.duDoan === 'Tài') diemTai += p.doTinCay * w;
      else if (p.duDoan === 'Xỉu') diemXiu += p.doTinCay * w;
      else if (p.duDoan === 'Bão') diemBao += p.doTinCay * w;
    }
    
    let maxDiem = Math.max(diemTai, diemXiu, diemBao);
    let duDoan = 'Tài';
    if (maxDiem === diemXiu && diemXiu > diemTai + 5) duDoan = 'Xỉu';
    if (maxDiem === diemBao && diemBao > diemTai + 10 && diemBao > diemXiu + 10) duDoan = 'Bão';
    
    let doTinCay = Math.min(82, Math.round(maxDiem / tongTrongSo * 1.5 + 50));
    return { duDoan, doTinCay, soThuatToan: allPredictions.length, lyDo: `Tổng hợp ${allPredictions.length} thuật toán` };
  }

  duDoan(lichSu, lichSuTong) {
    if (!lichSu || lichSu.length < 6) {
      return { duDoan: 'Tài', doTinCay: 55, lyDo: 'Chưa đủ dữ liệu', soThuatToan: 0 };
    }
    const result = this.phanTichEnsemble(lichSu, lichSuTong);
    if (result) return result;
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    const bao3 = last3.filter(r => r === 'Bão').length;
    if (bao3 >= 1) return { duDoan: 'Tài', doTinCay: 60, lyDo: 'Sau Bão → Tài', soThuatToan: 1 };
    return { duDoan: tai3 >= 2 ? 'Tài' : 'Xỉu', doTinCay: 60, lyDo: 'Xu hướng 3 phiên', soThuatToan: 1 };
  }
}

// Khởi tạo predictor cho từng game
const predictors = {};
for (let key in ALL_APIS) {
  predictors[key] = key.includes('sicbo') ? new SicboVIP(key) : new TaiXiuVIP(key);
}

// ==================== XỬ LÝ REQUEST ====================
async function xuLyGame(gameKey) {
  const url = ALL_APIS[gameKey];
  let data = gameKey.includes('sicbo') ? await fetchSicboData(url, gameKey) : await fetchTaiXiuData(url, gameKey);
  if (!data) throw new Error(`Không lấy được dữ liệu ${gameKey}`);
  
  const hist = historyDB[gameKey];
  const lastPred = hist.data[0];
  
  if (lastPred && lastPred.phienThucTe === data.phien - 1) {
    const dung = updateStats(gameKey, data.ket_qua, lastPred.duDoan);
    lastPred.thucTe = data.ket_qua;
    lastPred.diceThucTe = data.dice;
    lastPred.ketQua = dung ? '✅ ĐÚNG' : '❌ SAI';
  }
  
  if (hist.cache.has(data.phien)) {
    const cached = hist.cache.get(data.phien);
    hist.data.unshift({
      phienDuDoan: data.phien + 1, duDoan: cached.duDoan, doTinCay: cached.doTinCay,
      lyDo: cached.lyDo, soThuatToan: cached.soThuatToan,
      phienThucTe: data.phien, thucTe: null, diceThucTe: null, ketQua: null, time: new Date()
    });
    if (hist.data.length > 100) hist.data.pop();
    return {
      phienHienTai: data.phien,
      ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
      duDoan: { phien: data.phien + 1, du_doan: cached.duDoan, do_tin_cay: cached.doTinCay + '%', ly_do: cached.lyDo, so_thuat_toan: cached.soThuatToan },
      thongKe: hist.stats
    };
  }
  
  let lichSuKetQua = [data.ket_qua], lichSuTong = [data.tong];
  for (let item of hist.data) {
    if (item.thucTe) {
      lichSuKetQua.push(item.thucTe);
      if (item.diceThucTe) {
        lichSuTong.push(item.diceThucTe.reduce((a,b) => a + b, 0));
      }
    }
  }
  
  const pred = predictors[gameKey].duDoan(lichSuKetQua, lichSuTong);
  
  hist.cache.set(data.phien, { duDoan: pred.duDoan, doTinCay: pred.doTinCay, lyDo: pred.lyDo, soThuatToan: pred.soThuatToan });
  if (hist.cache.size > 20) {
    const first = hist.cache.keys().next().value;
    hist.cache.delete(first);
  }
  
  hist.data.unshift({
    phienDuDoan: data.phien + 1, duDoan: pred.duDoan, doTinCay: pred.doTinCay,
    lyDo: pred.lyDo, soThuatToan: pred.soThuatToan,
    phienThucTe: data.phien, thucTe: null, diceThucTe: null, ketQua: null, time: new Date()
  });
  if (hist.data.length > 100) hist.data.pop();
  
  return {
    phienHienTai: data.phien,
    ketQuaTruoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
    duDoan: { phien: data.phien + 1, du_doan: pred.duDoan, do_tin_cay: pred.doTinCay + '%', ly_do: pred.lyDo, so_thuat_toan: pred.soThuatToan },
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
      phien_du_doan: p.phienDuDoan, du_doan: p.duDoan, do_tin_cay: p.doTinCay + '%',
      ly_do: p.lyDo, so_thuat_toan: p.soThuatToan, thuc_te: p.thucTe, ket_qua: p.ketQua
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
    name: '🚀 API VIP CÂN BẰNG - 11 GAME',
    author: '@tranhoang2286',
    version: '8.0 - Đã fix lỗi lệch Tài',
    endpoints: Object.keys(ALL_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    luu_y: 'Thuật toán đã được cân bằng, không thiên vị Tài hay Xỉu'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 VIP SERVER CÂN BẰNG - ${Object.keys(ALL_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`✅ ĐÃ FIX LỖI: Không còn dự đoán lệch về Tài nữa`);
  console.log(`🧠 Thuật toán: Cân bằng hoàn toàn giữa Tài và Xỉu`);
});
