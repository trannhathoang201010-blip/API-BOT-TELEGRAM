const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ==================== API NGUỒN MỚI ====================
const API_SUNWIN_TX = 'https://bracket-ellen-roads-prefer.trycloudflare.com/api/tx';
const API_SUNWIN_SICBO = 'https://afterwards-motels-honors-vendors.trycloudflare.com/api/sunsicbo';
const API_CLUB789_SICBO = 'https://demo7892.fun/history/getLastResult?gameId=ktrng_3986&size=100&tableId=398625062021&curPage=1';
const API_HITCLUB = 'https://letting-tackle-newton-oak.trycloudflare.com/api/tx';
const API_LC79_TX = 'https://chance-compete-chambers-feelings.trycloudflare.com/api/tx';
const API_LC79_MD5 = 'https://chance-compete-chambers-feelings.trycloudflare.com/api/txmd5';
const API_BETVIP_TX = 'https://plastic-diet-visits-opens.trycloudflare.com/api/tx';
const API_BETVIP_MD5 = 'https://plastic-diet-visits-opens.trycloudflare.com/api/txmd5';
const API_MAX789 = 'https://cage-adjustment-whose-banner.trycloudflare.com/api/tx';
const API_B52 = 'https://gold-ultra-fails-handles.trycloudflare.com/txmd5';
const API_LUCK8_MD5 = 'https://heroes-presents-pound-tablet.trycloudflare.com/api/txmd5';

// ==================== LỊCH SỬ & THỐNG KÊ RIÊNG CHO TỪNG API ====================
const historyDB = {
    sunwin_tx: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    sunwin_sicbo: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    club789_sicbo: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    hitclub: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    lc79_tx: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    lc79_md5: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    betvip_tx: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    betvip_md5: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    max789: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    b52: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() },
    luck8_md5: { data: [], stats: { tong: 0, dung: 0, sai: 0, tiLe: '0%' }, cache: new Map() }
};

// Cập nhật thống kê
function updateStats(dbKey, thucTe, duDoan) {
    const stats = historyDB[dbKey]?.stats;
    if (!stats || !thucTe || !duDoan) return;
    const dung = (thucTe === duDoan);
    if (dung) stats.dung++;
    else stats.sai++;
    stats.tong++;
    stats.tiLe = ((stats.dung / stats.tong) * 100).toFixed(1) + '%';
    return dung;
}

// ==================== HÀM FETCH CHUẨN HÓA DỮ LIỆU ====================
async function fetchAPI(url, transformFn) {
    try {
        const res = await axios.get(url, { timeout: 10000 });
        return transformFn(res.data);
    } catch (error) {
        console.error(`Lỗi fetch ${url}:`, error.message);
        return null;
    }
}

// Các hàm transform cho từng API
const transformSunwinTX = (data) => {
    if (data?.ket_qua) {
        return {
            phien: data.phien,
            ket_qua: data.ket_qua === 'Tài' ? 'Tài' : 'Xỉu',
            tong: data.tong,
            dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3]
        };
    }
    return null;
};

const transformSunwinSicbo = (data) => {
    if (data?.ket_qua) {
        return {
            phien: data.phien,
            ket_qua: data.ket_qua,
            tong: data.tong,
            dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3]
        };
    }
    return null;
};

const transformClub789 = (data) => {
    if (data?.data?.resultList?.length) {
        const last = data.data.resultList[0];
        const tong = last.score;
        return {
            phien: parseInt(last.gameNum.replace('#', '')),
            ket_qua: tong >= 11 ? 'Tài' : 'Xỉu',
            tong: tong,
            dice: last.facesList
        };
    }
    return null;
};

const transformDefault = (data) => {
    if (data?.ket_qua) {
        let ketQua = data.ket_qua;
        if (ketQua === 'Tài' || ketQua === 'TAI' || ketQua === 'tài') ketQua = 'Tài';
        else if (ketQua === 'Xỉu' || ketQua === 'XIU' || ketQua === 'xiu') ketQua = 'Xỉu';
        return {
            phien: data.phien,
            ket_qua: ketQua,
            tong: data.tong,
            dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3]
        };
    }
    return null;
};

// ==================== THUẬT TOÁN DỰ ĐOÁN (KHÔNG RANDOM) ====================
function duDoanTaiXiu(lichSuKetQua, lichSuDice) {
    if (lichSuKetQua.length < 10) {
        return { du_doan: 'Tài', do_tin_cay: 55, giai_thich: 'Chưa đủ dữ liệu (cần 10 phiên)' };
    }

    let diemTai = 0, diemXiu = 0;
    const last5 = lichSuKetQua.slice(0, 5);
    const tai5 = last5.filter(r => r === 'Tài').length;
    
    // 1. Xu hướng 5 phiên (trọng số 40)
    if (tai5 >= 4) diemXiu += 40;
    else if (tai5 <= 1) diemTai += 40;
    else if (tai5 >= 3) diemTai += 25;
    else diemXiu += 25;

    // 2. Chuỗi dài (trọng số 25)
    let streak = 1;
    for (let i = 1; i < lichSuKetQua.length; i++) {
        if (lichSuKetQua[i] === lichSuKetQua[0]) streak++;
        else break;
    }
    if (streak >= 4) {
        if (lichSuKetQua[0] === 'Tài') diemXiu += 25;
        else diemTai += 25;
    } else if (streak === 3) {
        if (lichSuKetQua[0] === 'Tài') diemXiu += 18;
        else diemTai += 18;
    }

    // 3. Phân tích xúc xắc (trọng số 20)
    if (lichSuDice.length >= 10) {
        const recentDice = lichSuDice.slice(0, 10);
        let tongDuDoan = 0;
        for (let i = 0; i < 3; i++) {
            const vals = recentDice.map(d => d[i]);
            const trend = (vals[0] - vals[4]) / 4;
            const next = Math.min(6, Math.max(1, Math.round(vals[0] + trend)));
            tongDuDoan += next;
        }
        if (tongDuDoan > 10) diemTai += 20;
        else diemXiu += 20;
    }

    // 4. Tổng hợp
    const duDoan = diemTai > diemXiu ? 'Tài' : 'Xỉu';
    let doTinCay = 50 + Math.min(30, Math.abs(diemTai - diemXiu) / 2);
    doTinCay = Math.min(85, Math.max(50, doTinCay));
    
    return { du_doan: duDoan, do_tin_cay: Math.round(doTinCay), giai_thich: `TAI:${diemTai} | XIU:${diemXiu}` };
}

// ==================== XỬ LÝ REQUEST TỔNG QUÁT ====================
async function xuLyGame(dbKey, fetchFn, transformFn) {
    const data = await fetchFn(transformFn);
    if (!data) throw new Error('Không thể fetch dữ liệu');
    
    const hist = historyDB[dbKey];
    const lastPred = hist.data[0];
    
    // Cập nhật kết quả dự đoán trước
    if (lastPred && lastPred.phien_thuc_te === data.phien - 1) {
        const dung = updateStats(dbKey, data.ket_qua, lastPred.du_doan);
        lastPred.thuc_te = data.ket_qua;
        lastPred.dice_thuc_te = data.dice;
        lastPred.ket_qua = dung ? '✅ ĐÚNG' : '❌ SAI';
    }
    
    // Cache theo phiên (F5 không đổi)
    if (hist.cache.has(data.phien)) {
        const cached = hist.cache.get(data.phien);
        const newPred = {
            phien_du_doan: data.phien + 1,
            du_doan: cached.du_doan,
            do_tin_cay: cached.doTinCay,
            phien_thuc_te: data.phien,
            thuc_te: null,
            dice_thuc_te: null,
            ket_qua: null,
            thoi_gian: new Date()
        };
        hist.data.unshift(newPred);
        if (hist.data.length > 100) hist.data.pop();
        
        return {
            phien_hien_tai: data.phien,
            ket_qua_truoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
            du_doan: { phien: data.phien + 1, du_doan: cached.du_doan, do_tin_cay: cached.doTinCay + '%' },
            thong_ke: hist.stats
        };
    }
    
    // Xây dựng lịch sử
    const lichSuKetQua = [data.ket_qua];
    const lichSuDice = [data.dice];
    for (let item of hist.data) {
        if (item.thuc_te) {
            lichSuKetQua.push(item.thuc_te);
            if (item.dice_thuc_te) lichSuDice.push(item.dice_thuc_te);
        }
    }
    
    const duDoan = duDoanTaiXiu(lichSuKetQua, lichSuDice);
    
    // Lưu cache
    hist.cache.set(data.phien, { du_doan: duDoan.du_doan, doTinCay: duDoan.do_tin_cay });
    if (hist.cache.size > 20) {
        const firstKey = hist.cache.keys().next().value;
        hist.cache.delete(firstKey);
    }
    
    const newPred = {
        phien_du_doan: data.phien + 1,
        du_doan: duDoan.du_doan,
        do_tin_cay: duDoan.do_tin_cay,
        phien_thuc_te: data.phien,
        thuc_te: null,
        dice_thuc_te: null,
        ket_qua: null,
        thoi_gian: new Date()
    };
    hist.data.unshift(newPred);
    if (hist.data.length > 100) hist.data.pop();
    
    return {
        phien_hien_tai: data.phien,
        ket_qua_truoc: { phien: data.phien, ket_qua: data.ket_qua, dice: data.dice, tong: data.tong },
        du_doan: { phien: data.phien + 1, du_doan: duDoan.du_doan, do_tin_cay: duDoan.do_tin_cay + '%', giai_thich: duDoan.giai_thich },
        thong_ke: hist.stats
    };
}

// ==================== ĐỊNH NGHĨA CÁC ENDPOINT ====================
// Sunwin TX
app.get('/sunwin/tx', async (req, res) => {
    try {
        const result = await xuLyGame('sunwin_tx', 
            (fn) => fetchAPI(API_SUNWIN_TX, fn), transformSunwinTX);
        res.json({ game: 'Sunwin Tài Xỉu', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sunwin Sicbo
app.get('/sunwin/sicbo', async (req, res) => {
    try {
        const result = await xuLyGame('sunwin_sicbo',
            (fn) => fetchAPI(API_SUNWIN_SICBO, fn), transformSunwinSicbo);
        res.json({ game: 'Sunwin Sicbo', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 789Club Sicbo
app.get('/club789/sicbo', async (req, res) => {
    try {
        const result = await xuLyGame('club789_sicbo',
            (fn) => fetchAPI(API_CLUB789_SICBO, fn), transformClub789);
        res.json({ game: '789Club Sicbo', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(503).json({ error: 'API 789Club có thể bị chặn, thử lại sau', detail: e.message }); }
});

// Hitclub
app.get('/hitclub', async (req, res) => {
    try {
        const result = await xuLyGame('hitclub',
            (fn) => fetchAPI(API_HITCLUB, fn), transformDefault);
        res.json({ game: 'Hitclub Hũ', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// LC79 TX
app.get('/lc79/tx', async (req, res) => {
    try {
        const result = await xuLyGame('lc79_tx',
            (fn) => fetchAPI(API_LC79_TX, fn), transformDefault);
        res.json({ game: 'LC79 Tài Xỉu', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// LC79 MD5
app.get('/lc79/md5', async (req, res) => {
    try {
        const result = await xuLyGame('lc79_md5',
            (fn) => fetchAPI(API_LC79_MD5, fn), transformDefault);
        res.json({ game: 'LC79 MD5', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Betvip TX
app.get('/betvip/tx', async (req, res) => {
    try {
        const result = await xuLyGame('betvip_tx',
            (fn) => fetchAPI(API_BETVIP_TX, fn), transformDefault);
        res.json({ game: 'Betvip Hũ', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Betvip MD5
app.get('/betvip/md5', async (req, res) => {
    try {
        const result = await xuLyGame('betvip_md5',
            (fn) => fetchAPI(API_BETVIP_MD5, fn), transformDefault);
        res.json({ game: 'Betvip MD5', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Max789
app.get('/max789', async (req, res) => {
    try {
        const result = await xuLyGame('max789',
            (fn) => fetchAPI(API_MAX789, fn), transformDefault);
        res.json({ game: 'Max789', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// B52
app.get('/b52', async (req, res) => {
    try {
        const result = await xuLyGame('b52',
            (fn) => fetchAPI(API_B52, fn), (data) => {
                if (data?.ket_qua) {
                    let ketQua = data.ket_qua === 'tài' ? 'Tài' : 'Xỉu';
                    return {
                        phien: parseInt(data.phien?.replace('#', '') || data.phien),
                        ket_qua: ketQua,
                        tong: data.tong,
                        dice: [data.xuc_xac_1, data.xuc_xac_2, data.xuc_xac_3]
                    };
                }
                return null;
            });
        res.json({ game: 'B52', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Luck8 MD5
app.get('/luck8/md5', async (req, res) => {
    try {
        const result = await xuLyGame('luck8_md5',
            (fn) => fetchAPI(API_LUCK8_MD5, fn), transformDefault);
        res.json({ game: 'Luck8 MD5', ...result, author: '@tranhoang2286' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== LỊCH SỬ DỰ ĐOÁN CỦA TỪNG API ====================
app.get('/lich-su/:game', (req, res) => {
    const game = req.params.game;
    const validGames = ['sunwin_tx', 'sunwin_sicbo', 'club789_sicbo', 'hitclub', 'lc79_tx', 'lc79_md5', 'betvip_tx', 'betvip_md5', 'max789', 'b52', 'luck8_md5'];
    if (!validGames.includes(game)) {
        return res.status(400).json({ error: 'Game không hợp lệ', valid_games: validGames });
    }
    const hist = historyDB[game];
    res.json({
        game: game,
        lich_su_du_doan: hist.data.slice(0, 30).map(p => ({
            phien_du_doan: p.phien_du_doan,
            du_doan: p.du_doan,
            do_tin_cay: p.do_tin_cay + '%',
            thuc_te: p.thuc_te,
            ket_qua: p.ket_qua,
            thoi_gian: p.thoi_gian
        })),
        thong_ke: hist.stats
    });
});

// Lịch sử tất cả
app.get('/lich-su', (req, res) => {
    const allStats = {};
    for (const [key, value] of Object.entries(historyDB)) {
        allStats[key] = {
            thong_ke: value.stats,
            so_luong_du_doan: value.data.length
        };
    }
    res.json({ all_stats: allStats });
});

// ==================== ROOT ====================
app.get('/', (req, res) => {
    res.json({
        name: 'TỔNG HỢP API TÀI XỈU (11 GAME)',
        author: '@tranhoang2286',
        endpoints: {
            'Sunwin Tài Xỉu': '/sunwin/tx',
            'Sunwin Sicbo': '/sunwin/sicbo',
            '789Club Sicbo': '/club789/sicbo',
            'Hitclub Hũ': '/hitclub',
            'LC79 Tài Xỉu': '/lc79/tx',
            'LC79 MD5': '/lc79/md5',
            'Betvip Hũ': '/betvip/tx',
            'Betvip MD5': '/betvip/md5',
            'Max789': '/max789',
            'B52': '/b52',
            'Luck8 MD5': '/luck8/md5'
        },
        lich_su: {
            'Xem lịch sử 1 game': '/lich-su/:game',
            'Xem thống kê tất cả': '/lich-su'
        },
        ghi_chu: 'Mỗi game có lịch sử và thống kê riêng. Dự đoán dựa trên thuật toán xác suất, KHÔNG RANDOM. F5 không đổi kết quả.'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SERVER TỔNG HỢP ${Object.keys(historyDB).length} GAME`);
    console.log(`📡 PORT: ${PORT}`);
    console.log(`✅ Mỗi game có lịch sử và thống kê RIÊNG`);
    console.log(`✅ Dự đoán KHÔNG RANDOM, F5 không đổi kết quả`);
    console.log(`✅ Tỉ lệ đúng/sai thực tế được cập nhật sau mỗi phiên`);
});