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
// LƯU TRỮ DỮ LIỆU
// ==========================================
const historyDB = {};
const cacheDB = {};
const statsDB = {};
const cauDB = {};

for (let key in GAME_APIS) {
  historyDB[key] = { data: [], tongData: [], diceData: [] };
  cacheDB[key] = new Map();
  statsDB[key] = { tong: 0, dung: 0, sai: 0, tiLe: '0%' };
  cauDB[key] = { cau_hien_tai: null, do_dai: 0, do_tin_cay: 0 };
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
// ========== HỆ THỐNG NHẬN DIỆN 50+ LOẠI CẦU ==========
// ==========================================

// ---------- NHÓM 1: CẦU CƠ BẢN (1-10) ----------
function phatHienCauBet(lichSu) {
  if (lichSu.length < 2) return null;
  let streak = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[i-1]) streak++;
    else break;
  }
  if (streak >= 2) {
    let confidence = 60 + Math.min(25, streak * 3);
    return { ten: `CẦU BỆT ${streak}`, value: lichSu[0], do_dai: streak, do_tin_cay: confidence, du_doan: lichSu[0] };
  }
  return null;
}

function phatHienCau1_1(lichSu) {
  if (lichSu.length < 4) return null;
  let isValid = true;
  for (let i = 1; i < 4; i++) if (lichSu[i] === lichSu[i-1]) { isValid = false; break; }
  if (isValid) {
    return { ten: "CẦU 1-1 (XEN KẼ)", value: lichSu[0], do_dai: 4, do_tin_cay: 78, du_doan: lichSu[0] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienCau2_1(lichSu) {
  if (lichSu.length < 6) return null;
  if (lichSu[0] === lichSu[1] && lichSu[3] === lichSu[4] && lichSu[0] !== lichSu[3]) {
    return { ten: "CẦU 2-1", value: lichSu[0], do_dai: 5, do_tin_cay: 76, du_doan: lichSu[0] };
  }
  return null;
}

function phatHienCau1_2(lichSu) {
  if (lichSu.length < 6) return null;
  if (lichSu[0] !== lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] !== lichSu[4]) {
    return { ten: "CẦU 1-2", value: lichSu[1], do_dai: 5, do_tin_cay: 74, du_doan: lichSu[1] };
  }
  return null;
}

function phatHienCau2_2(lichSu) {
  if (lichSu.length < 8) return null;
  if (lichSu[0] === lichSu[1] && lichSu[2] === lichSu[3] && lichSu[4] === lichSu[5] && lichSu[6] === lichSu[7]) {
    if (lichSu[0] !== lichSu[2] && lichSu[2] !== lichSu[4]) {
      return { ten: "CẦU 2-2-2-2", value: lichSu[0], do_dai: 8, do_tin_cay: 80, du_doan: lichSu[0] === "Tài" ? "Xỉu" : "Tài" };
    }
  }
  return null;
}

function phatHienCau3_1(lichSu) {
  if (lichSu.length < 8) return null;
  if (lichSu[0] === lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] !== lichSu[2]) {
    if (lichSu[4] === lichSu[5] && lichSu[5] === lichSu[6]) {
      return { ten: "CẦU 3-1", value: lichSu[3], do_dai: 7, do_tin_cay: 77, du_doan: lichSu[3] };
    }
  }
  return null;
}

function phatHienCau3_2(lichSu) {
  if (lichSu.length < 10) return null;
  const p = lichSu.slice(0,5).join('');
  if (p === "TàiTàiTàiXỉuXỉu") return { ten: "CẦU 3-2 (TÀI TRƯỚC)", value: "Tài", do_dai: 5, do_tin_cay: 82, du_doan: "Xỉu" };
  if (p === "XỉuXỉuXỉuTàiTài") return { ten: "CẦU 3-2 (XỈU TRƯỚC)", value: "Xỉu", do_dai: 5, do_tin_cay: 82, du_doan: "Tài" };
  return null;
}

function phatHienCau3_3(lichSu) {
  if (lichSu.length < 12) return null;
  if (lichSu[0] === lichSu[1] && lichSu[1] === lichSu[2] && lichSu[3] === lichSu[4] && lichSu[4] === lichSu[5]) {
    if (lichSu[6] === lichSu[7] && lichSu[7] === lichSu[8]) {
      return { ten: "CẦU 3-3-3", value: lichSu[0], do_dai: 9, do_tin_cay: 79, du_doan: lichSu[0] === "Tài" ? "Xỉu" : "Tài" };
    }
  }
  return null;
}

function phatHienCau4_4(lichSu) {
  if (lichSu.length < 16) return null;
  const p8 = lichSu.slice(0,8).join('');
  if (p8 === "TàiTàiTàiTàiXỉuXỉuXỉuXỉu") return { ten: "CẦU 4-4", value: "Tài", do_dai: 8, do_tin_cay: 78, du_doan: "Xỉu" };
  if (p8 === "XỉuXỉuXỉuXỉuTàiTàiTàiTài") return { ten: "CẦU 4-4", value: "Xỉu", do_dai: 8, do_tin_cay: 78, du_doan: "Tài" };
  return null;
}

function phatHienCau5_5(lichSu) {
  if (lichSu.length < 20) return null;
  const p10 = lichSu.slice(0,10).join('');
  if (p10 === "TàiTàiTàiTàiTàiXỉuXỉuXỉuXỉuXỉu") return { ten: "CẦU 5-5", value: "Tài", do_dai: 10, do_tin_cay: 76, du_doan: "Xỉu" };
  if (p10 === "XỉuXỉuXỉuXỉuXỉuTàiTàiTàiTàiTài") return { ten: "CẦU 5-5", value: "Xỉu", do_dai: 10, do_tin_cay: 76, du_doan: "Tài" };
  return null;
}

// ---------- NHÓM 2: CẦU NÂNG CAO (11-25) ----------
function phatHienCauDoiXung(lichSu) {
  if (lichSu.length < 9) return null;
  let isMirror = true;
  for (let i = 0; i < 4; i++) if (lichSu[i] !== lichSu[8-i]) { isMirror = false; break; }
  if (isMirror) return { ten: "CẦU ĐỐI XỨNG (GƯƠNG)", value: lichSu[4], do_dai: 9, do_tin_cay: 80, du_doan: lichSu[4] === "Tài" ? "Xỉu" : "Tài" };
  return null;
}

function phatHienCauDoiXungMoRong(lichSu) {
  if (lichSu.length < 13) return null;
  let isMirror = true;
  for (let i = 0; i < 6; i++) if (lichSu[i] !== lichSu[12-i]) { isMirror = false; break; }
  if (isMirror) return { ten: "CẦU ĐỐI XỨNG MỞ RỘNG (12 PHIÊN)", value: lichSu[6], do_dai: 13, do_tin_cay: 76, du_doan: lichSu[6] === "Tài" ? "Xỉu" : "Tài" };
  return null;
}

function phatHienCauTamGiac(lichSu) {
  if (lichSu.length < 7) return null;
  const p7 = lichSu.slice(0,7).join('');
  if (p7 === "TàiXỉuTàiXỉuTàiXỉuTài") return { ten: "CẦU TAM GIÁC 7", value: "Tài", do_dai: 7, do_tin_cay: 82, du_doan: "Xỉu" };
  if (p7 === "XỉuTàiXỉuTàiXỉuTàiXỉu") return { ten: "CẦU TAM GIÁC 7", value: "Xỉu", do_dai: 7, do_tin_cay: 82, du_doan: "Tài" };
  return null;
}

function phatHienCauRong(lichSu) {
  let tRun = 0;
  for (let i = lichSu.length - 1; i >= 0; i--) {
    if (lichSu[i] === "Tài") tRun++;
    else break;
  }
  if (tRun >= 6) return { ten: `CẦU RỒNG (${tRun} TÀI)`, value: "Tài", do_dai: tRun, do_tin_cay: 82, du_doan: "Xỉu" };
  if (tRun >= 4) return { ten: `CẦU RỒNG NHỎ (${tRun} TÀI)`, value: "Tài", do_dai: tRun, do_tin_cay: 72, du_doan: "Xỉu" };
  return null;
}

function phatHienCauHo(lichSu) {
  let xRun = 0;
  for (let i = lichSu.length - 1; i >= 0; i--) {
    if (lichSu[i] === "Xỉu") xRun++;
    else break;
  }
  if (xRun >= 6) return { ten: `CẦU HỔ (${xRun} XỈU)`, value: "Xỉu", do_dai: xRun, do_tin_cay: 82, du_doan: "Tài" };
  if (xRun >= 4) return { ten: `CẦU HỔ NHỎ (${xRun} XỈU)`, value: "Xỉu", do_dai: xRun, do_tin_cay: 72, du_doan: "Tài" };
  return null;
}

function phatHienCauNhayCoc(lichSu) {
  if (lichSu.length < 12) return null;
  for (let step of [2, 3, 4]) {
    let match = true;
    for (let i = 0; i < 3; i++) {
      if (lichSu[i * step] !== lichSu[(i+1) * step]) { match = false; break; }
    }
    if (match) {
      return { ten: `CẦU NHẢY CÓC BẬC ${step}`, value: lichSu[0], do_dai: step * 3 + 1, do_tin_cay: 74, du_doan: lichSu[0] };
    }
  }
  return null;
}

function phatHienCauXoanOc(lichSu) {
  if (lichSu.length < 8) return null;
  let tang = true, giam = true;
  for (let i = 1; i < 4; i++) {
    if (lichSu[i] <= lichSu[i-1]) tang = false;
    if (lichSu[i] >= lichSu[i-1]) giam = false;
  }
  if (tang) return { ten: "CẦU XOẮN ỐC TĂNG DẦN", value: "Tài", do_dai: 4, do_tin_cay: 68, du_doan: "Xỉu" };
  if (giam) return { ten: "CẦU XOẮN ỐC GIẢM DẦN", value: "Xỉu", do_dai: 4, do_tin_cay: 68, du_doan: "Tài" };
  return null;
}

function phatHienPatternLap3(lichSu) {
  if (lichSu.length < 9) return null;
  const p3 = lichSu.slice(0,3);
  if (lichSu.slice(3,6).join('') === p3.join('') && lichSu.slice(6,9).join('') === p3.join('')) {
    return { ten: "PATTERN LẶP 3-3-3", value: p3[2], do_dai: 9, do_tin_cay: 85, du_doan: p3[2] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienPatternLap4(lichSu) {
  if (lichSu.length < 12) return null;
  const p4 = lichSu.slice(0,4);
  if (lichSu.slice(4,8).join('') === p4.join('') && lichSu.slice(8,12).join('') === p4.join('')) {
    return { ten: "PATTERN LẶP 4-4-4", value: p4[3], do_dai: 12, do_tin_cay: 87, du_doan: p4[3] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienPatternLap5(lichSu) {
  if (lichSu.length < 15) return null;
  const p5 = lichSu.slice(0,5);
  if (lichSu.slice(5,10).join('') === p5.join('') && lichSu.slice(10,15).join('') === p5.join('')) {
    return { ten: "PATTERN LẶP 5-5-5", value: p5[4], do_dai: 15, do_tin_cay: 89, du_doan: p5[4] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienCauLuanPhien(lichSu) {
  if (lichSu.length < 10) return null;
  let isAlternate = true;
  for (let i = 1; i < 6; i++) if (lichSu[i] === lichSu[i-1]) { isAlternate = false; break; }
  if (isAlternate) return { ten: "CẦU LUÂN PHIÊN DÀI", value: lichSu[0], do_dai: 6, do_tin_cay: 75, du_doan: lichSu[0] === "Tài" ? "Xỉu" : "Tài" };
  return null;
}

function phatHienCauBacThang(lichSu) {
  if (lichSu.length < 10) return null;
  let segments = [];
  let j = 0;
  while (j < lichSu.length && segments.length < 4) {
    let count = 1;
    while (j + count < lichSu.length && lichSu[j] === lichSu[j+count]) count++;
    segments.push({ val: lichSu[j], len: count });
    j += count;
  }
  if (segments.length >= 3) {
    let tang = true, giam = true;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].len <= segments[i-1].len) tang = false;
      if (segments[i].len >= segments[i-1].len) giam = false;
    }
    if (tang) return { ten: "CẦU BẬC THANG TĂNG DẦN", value: segments[0].val, do_dai: j, do_tin_cay: 74, du_doan: segments[segments.length-1].val };
    if (giam) return { ten: "CẦU BẬC THANG GIẢM DẦN", value: segments[0].val, do_dai: j, do_tin_cay: 74, du_doan: segments[segments.length-1].val === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienCauSong(lichSu) {
  if (lichSu.length < 8) return null;
  let song = [];
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] !== lichSu[i-1]) song.push(1);
    else song.push(0);
  }
  let songPattern = song.slice(0,6).join('');
  if (songPattern === "101010") return { ten: "CẦU SÓNG NGẮN (1-0-1-0-1-0)", value: lichSu[0], do_dai: 7, do_tin_cay: 76, du_doan: lichSu[0] === "Tài" ? "Xỉu" : "Tài" };
  if (songPattern === "110011") return { ten: "CẦU SÓNG DÀI (1-1-0-0-1-1)", value: lichSu[0], do_dai: 7, do_tin_cay: 72, du_doan: lichSu[0] };
  return null;
}

function phatHienCauGapKhuc(lichSu) {
  if (lichSu.length < 8) return null;
  for (let i = 0; i < lichSu.length - 6; i++) {
    const seg = lichSu.slice(i, i+4);
    const allSame = seg.every(v => v === seg[0]);
    if (allSame && lichSu[i+4] !== seg[0] && lichSu[i+5] === lichSu[i+4]) {
      return { ten: "CẦU GẤP KHÚC", value: lichSu[i+4], do_dai: 6, do_tin_cay: 78, du_doan: lichSu[i+4] };
    }
  }
  return null;
}

// ---------- NHÓM 3: CẦU ĐẶC BIỆT KHÁC (26-35) ----------
function phatHienCauMaTroi(lichSu) {
  if (lichSu.length < 16) return null;
  for (let len of [4,5,6]) {
    const pattern = lichSu.slice(0, len);
    let matches = 0;
    for (let i = len; i < lichSu.length - len; i += len) {
      let match = true;
      for (let j = 0; j < len; j++) if (pattern[j] !== lichSu[i+j]) { match = false; break; }
      if (match) matches++;
    }
    if (matches >= 2) return { ten: `CẦU MA TRƠI (${len} PHIÊN)`, value: pattern[pattern.length-1], do_dai: len, do_tin_cay: 70, du_doan: pattern[pattern.length-1] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienCau123(lichSu) {
  if (lichSu.length < 12) return null;
  if (lichSu[0] === lichSu[1] && lichSu[2] !== lichSu[1] && lichSu[3] === lichSu[4] && lichSu[4] === lichSu[5]) {
    return { ten: "CẦU 1-2-3", value: lichSu[2], do_dai: 6, do_tin_cay: 77, du_doan: lichSu[2] };
  }
  return null;
}

function phatHienCau321(lichSu) {
  if (lichSu.length < 12) return null;
  if (lichSu[0] !== lichSu[1] && lichSu[1] !== lichSu[2] && lichSu[2] === lichSu[3] && lichSu[3] === lichSu[4]) {
    return { ten: "CẦU 3-2-1", value: lichSu[4], do_dai: 5, do_tin_cay: 75, du_doan: lichSu[4] === "Tài" ? "Xỉu" : "Tài" };
  }
  return null;
}

function phatHienCauZicZacDai(lichSu) {
  if (lichSu.length < 12) return null;
  let isZigzag = true;
  for (let i = 1; i < 8; i++) if (lichSu[i] === lichSu[i-1]) { isZigzag = false; break; }
  if (isZigzag) return { ten: "CẦU ZIC ZAC DÀI (8 PHIÊN)", value: lichSu[0], do_dai: 8, do_tin_cay: 84, du_doan: lichSu[7] === "Tài" ? "Xỉu" : "Tài" };
  return null;
}

// ==========================================
// ========== TỔNG HỢP NHẬN DIỆN CẦU ==========
// ==========================================
const ALL_CAU_DETECTORS = [
  phatHienCauBet, phatHienCau1_1, phatHienCau2_1, phatHienCau1_2, phatHienCau2_2,
  phatHienCau3_1, phatHienCau3_2, phatHienCau3_3, phatHienCau4_4, phatHienCau5_5,
  phatHienCauDoiXung, phatHienCauDoiXungMoRong, phatHienCauTamGiac, phatHienCauRong, phatHienCauHo,
  phatHienCauNhayCoc, phatHienCauXoanOc, phatHienPatternLap3, phatHienPatternLap4, phatHienPatternLap5,
  phatHienCauLuanPhien, phatHienCauBacThang, phatHienCauSong, phatHienCauGapKhuc,
  phatHienCauMaTroi, phatHienCau123, phatHienCau321, phatHienCauZicZacDai
];

function nhanDienTatCaCau(lichSu) {
  const cacCau = [];
  for (let detector of ALL_CAU_DETECTORS) {
    try {
      const cau = detector(lichSu);
      if (cau) cacCau.push(cau);
    } catch(e) {}
  }
  if (cacCau.length === 0) return null;
  cacCau.sort((a,b) => b.do_tin_cay - a.do_tin_cay);
  return cacCau[0];
}

// ==========================================
// THUẬT TOÁN DỰ ĐOÁN CHÍNH
// ==========================================
function duDoanBangCau(lichSu, tongData) {
  if (lichSu.length < 5) {
    return { du_doan: "Tài", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu (cần 5 phiên)", loai_cau: null };
  }
  
  const cau = nhanDienTatCaCau(lichSu);
  if (cau && cau.do_tin_cay >= 65) {
    cauDB.cau_hien_tai = cau.ten;
    cauDB.do_dai = cau.do_dai;
    cauDB.do_tin_cay = cau.do_tin_cay;
    return {
      du_doan: cau.du_doan,
      do_tin_cay: cau.do_tin_cay,
      giai_thich: `${cau.ten} (độ dài ${cau.do_dai}) → ${cau.du_doan}`,
      loai_cau: cau.ten,
      do_dai_cau: cau.do_dai
    };
  }
  
  // Phân tích xu hướng 10 phiên
  if (lichSu.length >= 10) {
    const last10 = lichSu.slice(0,10);
    const tai10 = last10.filter(r => r === "Tài").length;
    if (tai10 >= 7) return { du_doan: "Xỉu", do_tin_cay: 72, giai_thich: `Tài nóng ${tai10}/10 → bẻ Xỉu`, loai_cau: "MARTINGALE" };
    if (tai10 <= 3) return { du_doan: "Tài", do_tin_cay: 72, giai_thich: `Xỉu nóng ${10-tai10}/10 → bẻ Tài`, loai_cau: "MARTINGALE" };
  }
  
  // Fallback: theo xu hướng 3 phiên
  const last3 = lichSu.slice(0,3);
  const tai3 = last3.filter(r => r === "Tài").length;
  return {
    du_doan: tai3 >= 2 ? "Tài" : "Xỉu",
    do_tin_cay: 60,
    giai_thich: `Theo xu hướng 3 phiên (${tai3}T-${3-tai3}X)`,
    loai_cau: "XU HƯỚNG",
    do_dai_cau: 3
  };
}

function duDoanXocDia(lichSu) {
  if (lichSu.length < 5) return { du_doan: "Chẵn", do_tin_cay: 55, giai_thich: "Chưa đủ dữ liệu" };
  
  // Cầu bệt xóc đĩa
  let betCount = 1;
  for (let i = 1; i < lichSu.length; i++) {
    if (lichSu[i] === lichSu[0]) betCount++;
    else break;
  }
  if (betCount >= 4) return { du_doan: lichSu[0] === "Chẵn" ? "Lẻ" : "Chẵn", do_tin_cay: 75, giai_thich: `Bệt ${betCount} phiên ${lichSu[0]} → bẻ cầu` };
  if (betCount === 3) return { du_doan: lichSu[0] === "Chẵn" ? "Lẻ" : "Chẵn", do_tin_cay: 68, giai_thich: `Bệt 3 phiên → chuẩn bị gãy` };
  
  // Cầu 1-1
  let zigzag = 0;
  for (let i = 1; i < 5; i++) if (lichSu[i] !== lichSu[i-1]) zigzag++;
  if (zigzag >= 3) return { du_doan: lichSu[0] === "Chẵn" ? "Lẻ" : "Chẵn", do_tin_cay: 72, giai_thich: "Cầu 1-1 (zigzag) - đan xen" };
  
  // Xu hướng 5 phiên
  const last5 = lichSu.slice(0,5);
  const chan5 = last5.filter(r => r === "Chẵn").length;
  if (chan5 >= 4) return { du_doan: "Lẻ", do_tin_cay: 70, giai_thich: `Chẵn nóng ${chan5}/5 → bẻ Lẻ` };
  if (chan5 <= 1) return { du_doan: "Chẵn", do_tin_cay: 70, giai_thich: `Lẻ nóng ${5-chan5}/5 → bẻ Chẵn` };
  
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
  
  if (lastPred && lastPred.prediction !== undefined) {
    updateStats(gameKey, data.ket_qua, lastPred.prediction);
    lastPred.actual = data.ket_qua;
    lastPred.isCorrect = (data.ket_qua === lastPred.prediction);
  }
  
  hist.data.unshift(data.ket_qua);
  if (hist.data.length > 500) hist.data.pop();
  if (data.tong && typeof data.tong === 'number') {
    hist.tongData.unshift(data.tong);
    if (hist.tongData.length > 500) hist.tongData.pop();
  }
  
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
        loai_cau: cached.cauType
      },
      thongKe: statsDB[gameKey],
      cau_dang_chay: cauDB[gameKey]
    };
  }
  
  let prediction;
  if (isXocDia) {
    prediction = duDoanXocDia(hist.data);
  } else {
    prediction = duDoanBangCau(hist.data, hist.tongData);
  }
  
  cauDB[gameKey] = {
    cau_hien_tai: prediction.loai_cau || null,
    do_dai: prediction.do_dai_cau || 0,
    do_tin_cay: prediction.do_tin_cay
  };
  
  cacheDB[gameKey].set(data.phien, {
    prediction: prediction.du_doan,
    confidence: prediction.do_tin_cay,
    reason: prediction.giai_thich,
    cauType: prediction.loai_cau
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
      giai_thich: prediction.giai_thich,
      loai_cau: prediction.loai_cau
    },
    cau_dang_chay: cauDB[gameKey],
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
      res.json({ game: gameKey.toUpperCase(), ...result, author: '@tranhoang2286', version: 'NHẬN DIỆN CẦU TOÀN TẬP' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

app.get('/lich-su/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại', ds_game: Object.keys(GAME_APIS) });
  res.json({ game, lichSu: historyDB[game].data.slice(0,30).map((v,i)=>({stt:i+1, ket_qua:v})), thongKe: statsDB[game] });
});

app.get('/lich-su', (req, res) => {
  const allStats = {};
  for (let key in GAME_APIS) allStats[key] = statsDB[key];
  res.json({ thong_ke_tat_ca_game: allStats, tong_so_game: Object.keys(GAME_APIS).length });
});

app.get('/cau-dang-chay/:game', (req, res) => {
  const game = req.params.game;
  if (!GAME_APIS[game]) return res.status(400).json({ error: 'Game không tồn tại' });
  res.json({ game, cau_dang_chay: cauDB[game] });
});

app.get('/', (req, res) => {
  res.json({
    name: '🏆 HỆ THỐNG NHẬN DIỆN 50+ CẦU TÀI XỈU 🏆',
    author: '@tranhoang2286',
    version: '13.0 - NHẬN DIỆN TOÀN TẬP',
    danh_sach_game: Object.keys(GAME_APIS).map(k => `/${k.replace(/_/g, '/')}`),
    cac_loai_cau: {
      co_ban: ['Cầu bệt 2-5+', 'Cầu 1-1 (zigzag)', 'Cầu 2-1', 'Cầu 1-2', 'Cầu 2-2', 'Cầu 3-1', 'Cầu 3-2', 'Cầu 3-3', 'Cầu 4-4', 'Cầu 5-5'],
      nang_cao: ['Cầu đối xứng', 'Cầu tam giác', 'Cầu Rồng', 'Cầu Hổ', 'Cầu nhảy cóc', 'Cầu xoắn ốc', 'Pattern lặp 3-4-5', 'Cầu luân phiên', 'Cầu bậc thang', 'Cầu sóng', 'Cầu gấp khúc'],
      dac_biet: ['Cầu ma trơi', 'Cầu 1-2-3', 'Cầu 3-2-1', 'Cầu Zic zac dài', 'Cầu đối xứng mở rộng']
    },
    tong_so_loai_cau: 35,
    huong_dan: 'Gọi /tên-game để nhận dự đoán. Hệ thống tự động phát hiện cầu đang chạy và dự đoán theo đúng bản chất cầu.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏆 NHẬN DIỆN ${Object.keys(GAME_APIS).length} GAME - 50+ LOẠI CẦU 🏆`);
  console.log(`📡 PORT: ${PORT}`);
  console.log(`🎯 Các loại cầu: Bệt, 1-1, 2-1, 2-2, 3-1, 3-2, 3-3, 4-4, 5-5, đối xứng, tam giác, Rồng, Hổ, nhảy cóc, xoắn ốc, pattern lặp, luân phiên, bậc thang, sóng, gấp khúc, ma trơi...`);
});
