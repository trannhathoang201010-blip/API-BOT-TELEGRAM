const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==================== API NGUỒN (11 GAME) ====================
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

// ==================== LỊCH SỬ & THỐNG KÊ RIÊNG TỪNG GAME ====================
const historyDB = {};
for (let key in ALL_APIS) {
  historyDB[key] = {
    data: [],
    stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%', tiLe10: '0%' },
    cache: new Map(),
    tanSuat: { Tai: 0, Xiu: 0, Bao: 0 }
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

// ==================== THUẬT TOÁN VIP TÀI XỈU (12 PHƯƠNG PHÁP) ====================
class TaiXiuVIP {
  constructor(gameKey) {
    this.gameKey = gameKey;
    this.trongSo = {
      streak: 1.5, martingale: 1.4, baccarat: 1.3, tongDiem: 1.2, tanSuat: 1.3,
      fibonacci: 1.1, markov: 1.4, entropy: 1.1, momentum: 1.2, gap: 1.1,
      zigzag: 1.2, ensemble: 1.3
    };
  }

  // 1. Streak Analysis - Phân tích chuỗi bệt
  phanTichStreak(lichSu) {
    if (lichSu.length < 3) return null;
    let streak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[0]) streak++;
      else break;
    }
    if (streak >= 5) return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 82, lyDo: `🔥 Bệt cực đại ${streak} → phá cầu` };
    if (streak === 4) return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 74, lyDo: `⚠️ Bệt ${streak} → chuẩn bị gãy` };
    if (streak === 3) return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 66, lyDo: `📊 Bệt ${streak} → nguy cơ gãy` };
    return null;
  }

  // 2. Martingale - Bẻ cầu khi quá nóng
  phanTichMartingale(lichSu) {
    if (lichSu.length < 10) return null;
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = 10 - tai10;
    if (tai10 >= 8) return { duDoan: 'Xỉu', doTinCay: 78, lyDo: `🎲 Tài quá nóng (${tai10}/10) → bẻ Xỉu` };
    if (xiu10 >= 8) return { duDoan: 'Tài', doTinCay: 78, lyDo: `🎲 Xỉu quá nóng (${xiu10}/10) → bẻ Tài` };
    if (tai10 >= 7) return { duDoan: 'Xỉu', doTinCay: 70, lyDo: `📈 Tài chiếm ưu thế (${tai10}/10) → bẻ Xỉu` };
    if (xiu10 >= 7) return { duDoan: 'Tài', doTinCay: 70, lyDo: `📉 Xỉu chiếm ưu thế (${xiu10}/10) → bẻ Tài` };
    return null;
  }

  // 3. Baccarat Pattern - Cầu 1-1, 2-1, 3-2
  phanTichBaccarat(lichSu) {
    if (lichSu.length < 8) return null;
    let zigzag = 0;
    for (let i = 1; i < 6; i++) if (lichSu[i] !== lichSu[i-1]) zigzag++;
    if (zigzag >= 4) return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 72, lyDo: `🔄 Cầu 1-1 (zigzag) → đánh ngược` };
    
    const p1 = lichSu.slice(0,3).join('');
    const p2 = lichSu.slice(3,6).join('');
    if (p1 === p2 && (p1 === 'TàiTàiXỉu' || p1 === 'XỉuXỉuTài')) {
      return { duDoan: p1[0] === 'Tài' ? 'Tài' : 'Xỉu', doTinCay: 76, lyDo: `📐 Cầu 2-1 → theo xu hướng` };
    }
    if (lichSu.length >= 10) {
      const pattern = lichSu.slice(0,5).join('');
      if (pattern === 'TàiTàiTàiXỉuXỉu' || pattern === 'XỉuXỉuXỉuTàiTài') {
        return { duDoan: pattern[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 74, lyDo: `📐 Cầu 3-2 → đánh ngược` };
      }
    }
    return null;
  }

  // 4. Tổng điểm phân tích (dice)
  phanTichTongDiem(lichSuTong) {
    if (!lichSuTong || lichSuTong.length < 8) return null;
    const recent = lichSuTong.slice(0, 10);
    const avg = recent.reduce((a,b) => a + b, 0) / recent.length;
    const max = Math.max(...recent);
    const min = Math.min(...recent);
    if (avg > 11.5) return { duDoan: 'Xỉu', doTinCay: 68, lyDo: `🎯 Tổng cao (TB ${avg.toFixed(1)}) → Xỉu` };
    if (avg < 9.5) return { duDoan: 'Tài', doTinCay: 68, lyDo: `🎯 Tổng thấp (TB ${avg.toFixed(1)}) → Tài` };
    if (max >= 17 && min <= 4) return { duDoan: 'Tài', doTinCay: 72, lyDo: `⚡ Biên độ lớn (${min}-${max}) → Tài` };
    return null;
  }

  // 5. Tần suất theo chu kỳ
  phanTichTanSuat(lichSu) {
    if (lichSu.length < 20) return null;
    const dem = { Tài: 0, Xỉu: 0 };
    lichSu.slice(0, 20).forEach(r => dem[r]++);
    const chenh = Math.abs(dem.Tài - dem.Xỉu);
    if (chenh >= 6) {
      const duDoan = dem.Tài > dem.Xỉu ? 'Xỉu' : 'Tài';
      return { duDoan, doTinCay: 72, lyDo: `⚖️ Mất cân bằng (${dem.Tài}-${dem.Xỉu}) → bẻ` };
    }
    return null;
  }

  // 6. Fibonacci Cycle
  phanTichFibonacci(lichSu) {
    if (lichSu.length < 12) return null;
    const fibs = [1, 1, 2, 3, 5, 8];
    for (let fib of fibs) {
      if (lichSu.length > fib * 2) {
        let giong = 0;
        for (let i = 0; i < fib; i++) {
          if (lichSu[i] === lichSu[i + fib]) giong++;
        }
        if (giong >= fib - 1) {
          return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 74, lyDo: `🌀 Chu kỳ Fibonacci ${fib}` };
        }
      }
    }
    return null;
  }

  // 7. Markov Chain bậc 2
  phanTichMarkov(lichSu) {
    if (lichSu.length < 10) return null;
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
      for (let v in dem) if (dem[v] > maxC) { maxC = dem[v]; maxV = v; }
      return { duDoan: maxV, doTinCay: 66 + Math.min(10, nextList.length), lyDo: `🧠 Markov (${nextList.length} mẫu)` };
    }
    return null;
  }

  // 8. Entropy - Độ hỗn loạn
  phanTichEntropy(lichSu) {
    if (lichSu.length < 20) return null;
    const last20 = lichSu.slice(0, 20);
    const taiCount = last20.filter(r => r === 'Tài').length;
    const p = taiCount / 20;
    if (p === 0) return { duDoan: 'Tài', doTinCay: 82, lyDo: '📉 Xỉu tuyệt đối 20 phiên → Tài' };
    if (p === 1) return { duDoan: 'Xỉu', doTinCay: 82, lyDo: '📈 Tài tuyệt đối 20 phiên → Xỉu' };
    const entropy = -p * Math.log2(p) - (1-p) * Math.log2(1-p);
    if (entropy < 0.7) return { duDoan: p > 0.5 ? 'Tài' : 'Xỉu', doTinCay: 72, lyDo: `📊 Độ hỗn loạn thấp (${entropy.toFixed(2)})` };
    if (entropy > 0.95) return { duDoan: p > 0.5 ? 'Xỉu' : 'Tài', doTinCay: 68, lyDo: `🌪️ Độ hỗn loạn cao (${entropy.toFixed(2)})` };
    return null;
  }

  // 9. Momentum - Đà tăng giảm
  phanTichMomentum(lichSu) {
    if (lichSu.length < 15) return null;
    const last5 = lichSu.slice(0, 5);
    const prev5 = lichSu.slice(5, 10);
    const tai5 = last5.filter(r => r === 'Tài').length;
    const taiPrev5 = prev5.filter(r => r === 'Tài').length;
    const diff = tai5 - taiPrev5;
    if (diff >= 3) return { duDoan: 'Tài', doTinCay: 70, lyDo: `⚡ Momentum tăng mạnh (+${diff})` };
    if (diff <= -3) return { duDoan: 'Xỉu', doTinCay: 70, lyDo: `⚡ Momentum giảm mạnh (${diff})` };
    return null;
  }

  // 10. Gap Analysis - Khoảng cách xuất hiện
  phanTichGap(lichSu) {
    if (lichSu.length < 15) return null;
    const gapsT = [], gapsX = [];
    let lastT = -1, lastX = -1;
    for (let i = 0; i < lichSu.length; i++) {
      if (lichSu[i] === 'Tài') { if (lastT !== -1) gapsT.push(i - lastT); lastT = i; }
      else { if (lastX !== -1) gapsX.push(i - lastX); lastX = i; }
    }
    const avgGapT = gapsT.length ? gapsT.reduce((a,b) => a+b,0) / gapsT.length : 0;
    const avgGapX = gapsX.length ? gapsX.reduce((a,b) => a+b,0) / gapsX.length : 0;
    if (avgGapT > avgGapX * 1.5 && gapsT.length > 2) {
      return { duDoan: 'Tài', doTinCay: 68, lyDo: `⏳ Tài hiếm (gap ${avgGapT.toFixed(1)})` };
    }
    if (avgGapX > avgGapT * 1.5 && gapsX.length > 2) {
      return { duDoan: 'Xỉu', doTinCay: 68, lyDo: `⏳ Xỉu hiếm (gap ${avgGapX.toFixed(1)})` };
    }
    return null;
  }

  // 11. Zigzag Reversal
  phanTichZigzag(lichSu) {
    if (lichSu.length < 12) return null;
    let reversals = 0;
    for (let i = 1; i < 10; i++) if (lichSu[i] !== lichSu[i-1]) reversals++;
    if (reversals >= 7) {
      const lastTwo = lichSu.slice(0, 2);
      if (lastTwo[0] !== lastTwo[1]) {
        return { duDoan: lastTwo[0], doTinCay: 66, lyDo: '🔀 Zigzag mạnh → theo chiều mới' };
      }
    }
    return null;
  }

  // 12. Ensemble - Tổng hợp có trọng số
  phanTichEnsemble(lichSu, lichSuTong) {
    const allPredictions = [
      this.phanTichStreak(lichSu), this.phanTichMartingale(lichSu), this.phanTichBaccarat(lichSu),
      this.phanTichTongDiem(lichSuTong), this.phanTichTanSuat(lichSu), this.phanTichFibonacci(lichSu),
      this.phanTichMarkov(lichSu), this.phanTichEntropy(lichSu), this.phanTichMomentum(lichSu),
      this.phanTichGap(lichSu), this.phanTichZigzag(lichSu)
    ].filter(p => p !== null);
    
    if (allPredictions.length === 0) return null;
    
    let diemTai = 0, diemXiu = 0;
    for (let p of allPredictions) {
      const w = this.trongSo[Object.keys(this.trongSo).find(k => p.lyDo?.includes(k))] || 1;
      if (p.duDoan === 'Tài') diemTai += p.doTinCay * w;
      else diemXiu += p.doTinCay * w;
    }
    const duDoan = diemTai > diemXiu ? 'Tài' : 'Xỉu';
    const doTinCay = Math.min(88, Math.round(Math.max(diemTai, diemXiu) / (diemTai + diemXiu + 0.1) * 90));
    return { duDoan, doTinCay, lyDo: `🏆 Ensemble (${allPredictions.length}/11 thuật toán)`, soThuatToan: allPredictions.length };
  }

  duDoan(lichSu, lichSuTong) {
    if (!lichSu || lichSu.length < 6) {
      return { duDoan: 'Tài', doTinCay: 55, lyDo: '📊 Chưa đủ dữ liệu (cần 6 phiên)', soThuatToan: 0 };
    }
    const result = this.phanTichEnsemble(lichSu, lichSuTong);
    if (result) return result;
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    return { duDoan: tai3 >= 2 ? 'Tài' : 'Xỉu', doTinCay: 60, lyDo: '📈 Xu hướng 3 phiên', soThuatToan: 1 };
  }
}

// ==================== THUẬT TOÁN VIP SICBO (6 PHƯƠNG PHÁP - CÓ BÃO) ====================
class SicboVIP {
  constructor(gameKey) {
    this.gameKey = gameKey;
    this.trongSo = { streak: 1.5, bao: 1.5, martingale: 1.4, baccarat: 1.3, tongDiem: 1.2, markov: 1.3 };
  }

  phanTichStreak(lichSu) {
    if (lichSu.length < 3) return null;
    let streak = 1;
    for (let i = 1; i < lichSu.length; i++) {
      if (lichSu[i] === lichSu[0]) streak++;
      else break;
    }
    if (streak >= 3 && lichSu[0] !== 'Bão') {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 72, lyDo: `🔥 Bệt ${streak} → phá cầu` };
    }
    if (streak >= 2 && lichSu[0] === 'Bão') {
      return { duDoan: 'Tài', doTinCay: 68, lyDo: `🎲 Bệt Bão ${streak} → ra Tài` };
    }
    return null;
  }

  phanTichTanSuatBao(lichSu) {
    if (lichSu.length < 20) return null;
    const baoCount = lichSu.slice(0, 50).filter(r => r === 'Bão').length;
    if (baoCount === 0) return { duDoan: 'Bão', doTinCay: 60, lyDo: '💎 Bão chưa xuất hiện 50 phiên → khả năng về' };
    if (baoCount >= 3) return { duDoan: 'Tài', doTinCay: 64, lyDo: `⚠️ Bão xuất hiện ${baoCount} lần → tránh Bão` };
    return null;
  }

  phanTichMartingale(lichSu) {
    if (lichSu.length < 10) return null;
    const last10 = lichSu.slice(0, 10);
    const tai10 = last10.filter(r => r === 'Tài').length;
    const xiu10 = last10.filter(r => r === 'Xỉu').length;
    if (tai10 >= 7) return { duDoan: 'Xỉu', doTinCay: 72, lyDo: `🎲 Tài nóng (${tai10}/10) → bẻ Xỉu` };
    if (xiu10 >= 7) return { duDoan: 'Tài', doTinCay: 72, lyDo: `🎲 Xỉu nóng (${xiu10}/10) → bẻ Tài` };
    return null;
  }

  phanTichBaccarat(lichSu) {
    if (lichSu.length < 8) return null;
    let zigzag = 0;
    for (let i = 1; i < 6; i++) {
      if (lichSu[i] !== lichSu[i-1] && lichSu[i] !== 'Bão' && lichSu[i-1] !== 'Bão') zigzag++;
    }
    if (zigzag >= 4) {
      return { duDoan: lichSu[0] === 'Tài' ? 'Xỉu' : 'Tài', doTinCay: 70, lyDo: '🔄 Cầu 1-1 Tài/Xỉu' };
    }
    return null;
  }

  phanTichTongDiem(lichSuTong, lichSu) {
    if (!lichSuTong || lichSuTong.length < 8) return null;
    const avg = lichSuTong.slice(0, 10).reduce((a,b) => a + b, 0) / Math.min(10, lichSuTong.length);
    const lastBao = lichSu.findIndex(r => r === 'Bão');
    if (lastBao === 0 && avg > 10) return { duDoan: 'Tài', doTinCay: 68, lyDo: '📈 Sau Bão → tổng cao → Tài' };
    if (lastBao === 0 && avg <= 10) return { duDoan: 'Xỉu', doTinCay: 68, lyDo: '📉 Sau Bão → tổng thấp → Xỉu' };
    if (avg > 11) return { duDoan: 'Xỉu', doTinCay: 64, lyDo: `🎯 Tổng cao (TB ${avg.toFixed(1)}) → Xỉu` };
    if (avg < 9) return { duDoan: 'Tài', doTinCay: 64, lyDo: `🎯 Tổng thấp (TB ${avg.toFixed(1)}) → Tài` };
    return null;
  }

  phanTichMarkov(lichSu) {
    if (lichSu.length < 10) return null;
    const map = new Map();
    for (let i = 0; i < lichSu.length - 2; i++) {
      if (lichSu[i] === 'Bão' || lichSu[i+1] === 'Bão') continue;
      const key = `${lichSu[i]}_${lichSu[i+1]}`;
      const next = lichSu[i+2];
      if (next === 'Bão') continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(next);
    }
    const lastKey = `${lichSu[0]}_${lichSu[1]}`;
    const nextList = map.get(lastKey);
    if (nextList && nextList.length >= 2) {
      const dem = {};
      nextList.forEach(v => dem[v] = (dem[v] || 0) + 1);
      let maxV = null, maxC = 0;
      for (let v in dem) if (dem[v] > maxC) { maxC = dem[v]; maxV = v; }
      return { duDoan: maxV, doTinCay: 64 + Math.min(10, nextList.length), lyDo: `🧠 Markov (${nextList.length} mẫu)` };
    }
    return null;
  }

  phanTichEnsemble(lichSu, lichSuTong) {
    const allPredictions = [
      this.phanTichStreak(lichSu), this.phanTichTanSuatBao(lichSu), this.phanTichMartingale(lichSu),
      this.phanTichBaccarat(lichSu), this.phanTichTongDiem(lichSuTong, lichSu), this.phanTichMarkov(lichSu)
    ].filter(p => p !== null);
    
    if (allPredictions.length === 0) return null;
    
    let diemTai = 0, diemXiu = 0, diemBao = 0;
    for (let p of allPredictions) {
      const w = this.trongSo[Object.keys(this.trongSo).find(k => p.lyDo?.includes(k))] || 1;
      if (p.duDoan === 'Tài') diemTai += p.doTinCay * w;
      else if (p.duDoan === 'Xỉu') diemXiu += p.doTinCay * w;
      else if (p.duDoan === 'Bão') diemBao += p.doTinCay * w;
    }
    let maxDiem = Math.max(diemTai, diemXiu, diemBao);
    let duDoan = 'Tài';
    if (maxDiem === diemXiu) duDoan = 'Xỉu';
    if (maxDiem === diemBao && diemBao > diemTai + 15 && diemBao > diemXiu + 15) duDoan = 'Bão';
    let doTinCay = Math.min(85, Math.round(maxDiem / (diemTai + diemXiu + diemBao + 0.1) * 85));
    return { duDoan, doTinCay, lyDo: `🏆 Sicbo Ensemble (${allPredictions.length}/6 thuật toán)`, soThuatToan: allPredictions.length };
  }

  duDoan(lichSu, lichSuTong) {
    if (!lichSu || lichSu.length < 6) {
      return { duDoan: 'Tài', doTinCay: 55, lyDo: '📊 Chưa đủ dữ liệu', soThuatToan: 0 };
    }
    const result = this.phanTichEnsemble(lichSu, lichSuTong);
    if (result) return result;
    const last3 = lichSu.slice(0, 3);
    const tai3 = last3.filter(r => r === 'Tài').length;
    const bao3 = last3.filter(r => r === 'Bão').length;
    if (bao3 >= 1) return { duDoan: 'Tài', doTinCay: 62, lyDo: '📌 Sau Bão → Tài', soThuatToan: 1 };
    return { duDoan: tai3 >= 2 ? 'Tài' : 'Xỉu', doTinCay: 60, lyDo: '📈 Xu hướng 3 phiên', soThuatToan: 1 };
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
      phienDuDoan: data.phien + 1, duDoan: cached.duDoan, doTinCay: cached.doTinCay, lyDo: cached.lyDo,
      soThuatToan: cached.soThuatToan, phienThucTe: data.phien, thucTe: null, diceThucTe: null, ketQua: null, time: new Date()
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
      if (item.diceThucTe) lichSuTong.push(item.diceThucTe.reduce((a,b) => a + b, 0));
    }
  }
  
  const pred = predictors[gameKey].duDoan(lichSuKetQua, lichSuTong);
  
  hist.cache.set(data.phien, { duDoan: pred.duDoan, doTinCay: pred.doTinCay, lyDo: pred.lyDo, soThuatToan: pred.soThuatToan });
  if (hist.cache.size > 20) { const first = hist.cache.keys().next().value; hist.cache.delete(first); }
  
  hist.data.unshift({
    phienDuDoan: data.phien + 1, duDoan: pred.duDoan, doTinCay: pred.doTinCay, lyDo: pred.lyDo,
    soThuatToan: pred.soThuatToan, phienThucTe: data.phien, thucTe: null, diceThucTe: null, ketQua: null, time: new Date()
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

// ==================== ROOT ====================
app.get('/', (req, res) => {
  res.json({
    name: '🚀 API VIP - 11 GAME TÀI XỈU + SICBO',
    author: '@tranhoang2286',
    version: '7.0 - 12 Thuật Toán/Game',
    endpoints: Object.keys(ALL_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    lich_su: '/lich-su hoặc /lich-su/:game',
    thuat_toan: [
      '1. Streak Analysis - Phân tích chuỗi bệt',
      '2. Martingale - Bẻ cầu khi quá nóng',
      '3. Baccarat Pattern - Cầu 1-1, 2-1, 3-2',
      '4. Tổng điểm phân tích (dice)',
      '5. Tần suất theo chu kỳ',
      '6. Fibonacci Cycle',
      '7. Markov Chain bậc 2',
      '8. Entropy - Độ hỗn loạn',
      '9. Momentum - Đà tăng giảm',
      '10. Gap Analysis - Khoảng cách xuất hiện',
      '11. Zigzag Reversal',
      '12. Ensemble - Tổng hợp có trọng số'
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 VIP SERVER - ${Object.keys(ALL_APIS).length} GAME`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🎲 Game list: ${Object.keys(ALL_APIS).join(', ')}`);
  console.log(`🧠 Mỗi game: 12 thuật toán VIP (Tài Xỉu) / 6 thuật toán (Sicbo)`);
  console.log(`✅ Không random, cache theo phiên, tỉ lệ thắng thực tế`);
  console.log(`👤 Author: @tranhoang2286`);
});
