/**
 * QRPresensi - Application Logic (Phase 4 - Firebase Realtime Sync)
 * Mengelola sistem sinkronisasi database cloud Firebase Firestore.
 */

const APP_VERSION = "prod-5.0"; // Versi cache (Fase 4 Firebase)

let state = {
    teachers: [],
    schedules: [],
    attendance: [],
    admins: [{ id: "admin1", username: "admin", password: "123", role: "superadmin" }], // Fallback admin
    settings: { defaultCheckIn: "07:00" },
    activeToken: ""
};

const SETTINGS_DOC_ID = "app";

function getSettingsTimeValue() {
    return state.settings?.defaultCheckIn || "07:00";
}

function setSettingsTimeValue(timeStr) {
    if(!timeStr) return;
    state.settings = state.settings || {};
    state.settings.defaultCheckIn = timeStr;
    if (!isFirebaseActive || !db) {
        localStorage.setItem("qr_presensi_settings_defaultCheckIn", timeStr);
    }
}

async function loadSettings() {
    try {
        if(isFirebaseActive && db) {
            const snap = await db.collection("settings").doc(SETTINGS_DOC_ID).get();
            if(snap.exists) {
                const data = snap.data();
                if(data && data.defaultCheckIn) setSettingsTimeValue(data.defaultCheckIn);
            }
        } else {
            const saved = localStorage.getItem("qr_presensi_settings_defaultCheckIn");
            if(saved) setSettingsTimeValue(saved);
        }
    } catch(e) {
        console.warn("Gagal load settings:", e);
    }
}

function renderAdminWajibHadir() {
    const input = document.getElementById("admin-wajib-hadir-time");
    if(!input) return;
    input.value = getSettingsTimeValue();
}

function bindAdminWajibHadirSave() {
    const btn = document.getElementById("btn-save-admin-wajib-hadir");
    const input = document.getElementById("admin-wajib-hadir-time");
    if(!btn || !input) return;

    btn.addEventListener("click", async () => {
        if(currentUser?.role !== 'admin') return;
        const v = input.value;
        if(!v) return alert("Waktu wajib hadir tidak boleh kosong");

        setSettingsTimeValue(v);

        if(isFirebaseActive && db) {
            try {
                await db.collection("settings").doc(SETTINGS_DOC_ID).set({ defaultCheckIn: v }, { merge: true });
            } catch(e) {
                console.error("Gagal menyimpan settings:", e);
                alert("Gagal menyimpan ke Firebase. Coba lagi.");
            }
        }

        // Update UI guru bila sudah terbuka
        const wajibGuru = document.getElementById("guru-wajib-hadir-time");
        if(wajibGuru) wajibGuru.textContent = v;
    });
}


let currentUser = null; // { role: 'admin'|'guru', data: {} }
let db = null;
let qrHelper = null;
let lastRenderedToken = "";
let isFirebaseActive = false;

// ==========================================================================
// FIREBASE INIT & SYNC
// ==========================================================================

function initDatabase() {
    // Cek apakah konfigurasi firebase tersedia di window
    if (window.firebaseConfig && window.firebaseConfig.apiKey && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(window.firebaseConfig);
            }
            db = firebase.firestore();
            isFirebaseActive = true;
            console.log("🔥 Firebase Firestore berhasi diinisialisasi.");
            setupFirebaseListeners();
            
            // Check session setelah init (karena bergantung pada data)
            setTimeout(checkSession, 500); 
        } catch (e) {
            console.error("Gagal inisialisasi Firebase. Beralih ke mode Offline/Lokal.", e);
            setupLocalStorageFallback();
            checkSession();
        }
    } else {
        console.warn("Konfigurasi Firebase tidak ditemukan. Beralih ke mode Offline/Lokal.");
        setupLocalStorageFallback();
        checkSession();
    }
}

// REALTIME LISTENERS
function setupFirebaseListeners() {
    // 1. Listen Admins
    db.collection("admins").onSnapshot((snapshot) => {
        state.admins = [];
        snapshot.forEach((doc) => state.admins.push(doc.data()));
        // Jika kosong di cloud, masukkan default
        if(state.admins.length === 0) {
            db.collection("admins").doc("admin1").set({ id: "admin1", username: "admin", password: "123", role: "superadmin" });
        }
        triggerAdminRender();
    });

    // 2. Listen Teachers
    db.collection("teachers").onSnapshot((snapshot) => {
        state.teachers = [];
        snapshot.forEach((doc) => state.teachers.push(doc.data()));
        
        if (!currentUser) renderLoginDropdown();
        triggerAdminRender();
    });

    // 3. Listen Schedules
    db.collection("schedules").onSnapshot((snapshot) => {
        state.schedules = [];
        snapshot.forEach((doc) => state.schedules.push(doc.data()));
        triggerAdminRender();
    });

    // 4. Listen Attendance (real-time di semua perangkat)
    db.collection("attendance").onSnapshot((snapshot) => {
        state.attendance = [];
        snapshot.forEach((doc) => state.attendance.push(doc.data()));
        triggerAdminRender();
        if (currentUser && currentUser.role === 'guru') {
            updateGuruStatusAndBtn();
            renderGuruHistory();
        }
    });
}

// FUNGSI UTAMA UNTUK UPDATE REAL-TIME SELURUH UI ADMIN
function triggerAdminRender() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
        renderDashboardStats();
    } catch (e) {
        console.error("Gagal renderDashboardStats:", e);
    }
    try {
        renderLiveFeed();
    } catch (e) {
        console.error("Gagal renderLiveFeed:", e);
    }
    try {
        renderTeachersTable();
    } catch (e) {
        console.error("Gagal renderTeachersTable:", e);
    }
    try {
        populateTeacherDropdownsAdmin();
    } catch (e) {
        console.error("Gagal populateTeacherDropdownsAdmin:", e);
    }
    try {
        renderManageAttendanceTable();
    } catch (e) {
        console.error("Gagal renderManageAttendanceTable:", e);
    }
    try {
        renderAdminsTable();
    } catch (e) {
        console.error("Gagal renderAdminsTable:", e);
    }
    try {
        renderReports();
    } catch (e) {
        console.error("Gagal renderReports:", e);
    }
}

// SIMPAN KE FIREBASE (Atau LocalStorage jika offline)
async function saveData(collection, docId, data) {
    if (isFirebaseActive && db) {
        try {
            await db.collection(collection).doc(docId).set(data);
        } catch (e) {
            console.error("Error writing to Firestore:", e);
        }
    } else {
        // Fallback
        const idx = state[collection].findIndex(item => item.id === docId);
        if(idx >= 0) state[collection][idx] = data; else state[collection].push(data);
        localStorage.setItem(`qr_presensi_${collection}`, JSON.stringify(state[collection]));
        triggerAdminRender();
        if (currentUser && currentUser.role === 'guru') {
            updateGuruStatusAndBtn();
            renderGuruHistory();
        }
    }
}

async function deleteData(collection, docId) {
    if (isFirebaseActive && db) {
        try {
            await db.collection(collection).doc(docId).delete();
        } catch (e) {
            console.error("Error deleting from Firestore:", e);
        }
    } else {
        state[collection] = state[collection].filter(item => item.id !== docId);
        localStorage.setItem(`qr_presensi_${collection}`, JSON.stringify(state[collection]));
        triggerAdminRender();
        if (currentUser && currentUser.role === 'guru') {
            updateGuruStatusAndBtn();
            renderGuruHistory();
        }
    }
}

// Expose ke window agar bisa dipanggil dari onclick di HTML
window.deleteData = deleteData;

function setupLocalStorageFallback() {
    const storedVersion = localStorage.getItem('qr_presensi_version');
    if (storedVersion !== APP_VERSION) {
        localStorage.clear();
        localStorage.setItem('qr_presensi_version', APP_VERSION);
    }
    state.teachers = JSON.parse(localStorage.getItem('qr_presensi_teachers')) || [];
    state.schedules = JSON.parse(localStorage.getItem('qr_presensi_schedules')) || [];
    state.attendance = JSON.parse(localStorage.getItem('qr_presensi_attendance')) || [];
    state.admins = JSON.parse(localStorage.getItem('qr_presensi_admins')) || [{ id: "admin1", username: "admin", password: "123", role: "superadmin" }];

    // load settings defaultCheckIn dari localStorage bila belum ada Firebase
    const savedCheckIn = localStorage.getItem("qr_presensi_settings_defaultCheckIn");
    if(savedCheckIn) state.settings.defaultCheckIn = savedCheckIn;
}

window.resetDatabaseLocal = function() {
    if(confirm("PERINGATAN: Semua data guru, jadwal, dan riwayat presensi akan dihapus permanen. Lanjutkan?")) {
        localStorage.clear();
        sessionStorage.clear();
        alert("Data berhasil dibersihkan. Aplikasi akan dimuat ulang.");
        location.reload();
    }
}

// ==========================================================================
// CORE LOGIC: PENENTUAN STATUS & JAM
// ==========================================================================

function getDayName(dateObj) {
    if(!dateObj || isNaN(new Date(dateObj).getTime())) dateObj = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[new Date(dateObj).getDay()];
}

function getTodayDateStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getAcuanHadir(teacher, dateObj) {
    if(!teacher) return { jam: "-", mapel: "Tidak Wajib Hadir", wajibHadir: false };
    
    const dayName = getDayName(dateObj);
    const schedule = state.schedules.find(s => s.teacherId === teacher.id && s.day === dayName);
    
    if (schedule && schedule.entries && schedule.entries.length > 0) {
        const sortedEntries = [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
        return {
            jam: sortedEntries[0].jamMulai,
            mapel: `${sortedEntries[0].mapel} (${sortedEntries[0].kelas})`,
            wajibHadir: true
        };
    }
    
    if (teacher.picketDay === dayName) {
        return {
            jam: teacher.picketCheckIn || "06:45",
            mapel: "Guru Piket",
            wajibHadir: true
        };
    }

    // Fallback: guru tanpa jadwal/piket hari ini -> dianggap wajib hadir
    // menggunakan "Waktu Wajib Hadir" (di-set admin)
    return {
        jam: getSettingsTimeValue(),
        mapel: "Wajib Hadir (Default)",
        wajibHadir: true
    };
}

function determineStatusIn(timeScanned, acuanJam) {
    if (acuanJam === "-") return "Tepat Waktu";
    return (timeScanned.substring(0, 5) <= acuanJam) ? "Tepat Waktu" : "Terlambat";
}

// ==========================================================================
// ROUTING & VIEW CONTROLLER
// ==========================================================================

function navigateTo(viewId) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function checkSession() {
    const session = sessionStorage.getItem('qr_presensi_session');
    if (session && !currentUser) {
        currentUser = JSON.parse(session);
    }
    
    if (!currentUser) {
        navigateTo('view-login');
        renderLoginDropdown();
    } else if (currentUser.role === 'admin') {
        navigateTo('view-admin');
        initAdminView();
    } else if (currentUser.role === 'guru') {
        navigateTo('view-guru');
        initGuruView();
    }
}

// ==========================================================================
// LOGIN SYSTEM
// ==========================================================================

const loginTabs = document.querySelectorAll('.login-tab-btn');
loginTabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
        loginTabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.login-form-container').forEach(c => c.classList.remove('active'));
        document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
    });
});

function renderLoginDropdown() {
    const select = document.getElementById("login-select-guru");
    if(!select) return;
    select.innerHTML = '<option value="">-- Pilih Nama Anda --</option>';
    state.teachers.forEach(t => {
        const nameStr = t.name || "Guru";
        const nipStr = t.nip ? ` (NIP: ${t.nip})` : "";
        select.innerHTML += `<option value="${t.id}">${nameStr}${nipStr}</option>`;
    });
}

document.getElementById("btn-login-guru").addEventListener('click', () => {
    const tId = document.getElementById("login-select-guru").value;
    if (!tId) return alert("Pilih nama Anda dari daftar!");
    const tData = state.teachers.find(t => t.id === tId);
    
    currentUser = { role: 'guru', data: tData };
    sessionStorage.setItem('qr_presensi_session', JSON.stringify(currentUser));
    checkSession();
});

document.getElementById("btn-login-admin").addEventListener('click', () => {
    const user = document.getElementById("login-admin-user").value;
    const pass = document.getElementById("login-admin-pass").value;
    
    const adminMatch = state.admins.find(a => a.username === user && a.password === pass);
    if (adminMatch) {
        currentUser = { role: 'admin', data: adminMatch };
        sessionStorage.setItem('qr_presensi_session', JSON.stringify(currentUser));
        document.getElementById("login-admin-user").value = '';
        document.getElementById("login-admin-pass").value = '';
        checkSession();
    } else {
        alert("Username atau password salah!");
    }
});

document.getElementById("btn-logout-admin").addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('qr_presensi_session');
    checkSession();
});

document.getElementById("btn-logout-guru").addEventListener('click', () => {
    currentUser = null;
    sessionStorage.removeItem('qr_presensi_session');
    checkSession();
});

// ==========================================================================
// VIEW: GURU (MOBILE APP)
// ==========================================================================

function initGuruView() {
    if(!currentUser || currentUser.role !== 'guru') return;
    
    const t = currentUser.data;
    document.getElementById("guru-name-display").textContent = t.name;
    document.getElementById("guru-avatar-init").textContent = t.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    
    const now = new Date();
    document.getElementById("guru-today-day").textContent = getDayName(now);
    
    // Render Schedule
    const scheduleBox = document.getElementById("guru-schedule-list");
    const dayName = getDayName(now);
    const schedule = state.schedules.find(s => s.teacherId === t.id && s.day === dayName);

    // Display waktu wajib hadir (read-only untuk guru, hanya jika wajib)
    const wajibEl = document.getElementById("guru-wajib-hadir-time");
    const wajibInfoEl = document.getElementById("guru-wajib-hadir-info");
    const acuan = getAcuanHadir(t, now);
    if(wajibEl) {
        if(acuan && acuan.wajibHadir) {
            wajibEl.textContent = acuan.jam && acuan.jam !== "-" ? acuan.jam : (state.settings?.defaultCheckIn || "07:00");
            if(wajibInfoEl) wajibInfoEl.style.display = "block";
        } else {
            if(wajibInfoEl) wajibInfoEl.style.display = "none";
        }
    }

    
    let schHtml = "";
    if (t.picketDay === dayName) {
        schHtml += `<div class="sim-sched-item"><div class="time">${t.picketCheckIn || '06:45'}</div><div class="detail">Guru Piket</div></div>`;
    }
    if (schedule && schedule.entries.length > 0) {
        [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai)).forEach((e, idx) => {
            schHtml += `<div class="sim-sched-item"><div class="time">${e.jamMulai}</div><div class="detail">${e.mapel} (${e.kelas})</div></div>`;
        });
    }
    if (schHtml === "") schHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px;">Libur / Tidak ada jadwal mengajar.</div>`;
    scheduleBox.innerHTML = schHtml;
    
    updateGuruStatusAndBtn();
    renderGuruHistory();
}

function updateGuruStatusAndBtn() {
    const t = currentUser.data;
    const todayStr = getTodayDateStr();
    const log = state.attendance.find(a => a.teacherId === t.id && a.date === todayStr);
    
    const statusInd = document.getElementById("guru-status-indicator");
    const btnScan = document.getElementById("btn-trigger-scan");
    const btnText = document.getElementById("scan-btn-text");
    const btnHint = document.getElementById("scan-hint-text");
    const btnIzin = document.getElementById("btn-lapor-izin");
    
    btnIzin.style.display = "block";
    btnScan.className = "btn-scan-main";
    btnScan.disabled = false;
    btnScan.style.opacity = "1";
    
    if (!log) {
        statusInd.className = "status-indicator";
        statusInd.innerHTML = `<i class="fa-solid fa-circle-question"></i> <span>Belum Absen</span>`;
        btnText.textContent = "Absen Datang";
        btnHint.textContent = "Ketuk untuk memindai QR Datang";
    } else {
        btnIzin.style.display = "none";
        
        if (log.type === 'izin' || log.type === 'sakit') {
            statusInd.className = "status-indicator info";
            statusInd.innerHTML = `<i class="fa-solid fa-file-medical"></i> <span>Sedang ${log.type.toUpperCase()}</span>`;
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnText.textContent = "Tidak Bisa Absen";
            btnHint.textContent = "Anda sudah lapor izin hari ini";
        } else if (!log.timeOut) {
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = `<i class="fa-solid fa-sign-in-alt"></i> <span>Hadir (Datang: ${log.timeIn.substring(0,5)})</span>`;
            
            btnScan.className = "btn-scan-main mode-checkout";
            btnText.textContent = "Absen Pulang";
            btnHint.textContent = "Ketuk untuk memindai QR Pulang";
        } else {
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = `<i class="fa-solid fa-check-double"></i> <span>Selesai (Pulang: ${log.timeOut.substring(0,5)})</span>`;
            
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnText.textContent = "Tugas Selesai";
            btnHint.textContent = "Anda sudah absen pulang hari ini";
        }
    }
}

function renderGuruHistory() {
    const list = document.getElementById("guru-personal-logs");
    const t = currentUser.data;
    const logs = state.attendance.filter(a => a.teacherId === t.id).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (logs.length === 0) {
        list.innerHTML = `<p style="font-size:13px; color:var(--text-muted); text-align:center;">Belum ada riwayat presensi.</p>`;
        return;
    }
    
    list.innerHTML = "";
    logs.forEach(log => {
        let badge = "";
        if(log.type === 'izin') badge = `<span class="badge badge-info">Izin</span>`;
        else if(log.type === 'sakit') badge = `<span class="badge badge-secondary">Sakit</span>`;
        else badge = `<span class="badge ${log.statusIn === 'Terlambat' ? 'badge-warning' : 'badge-success'}">In: ${log.timeIn.substring(0,5)}</span>`;
        
        let outBadge = log.timeOut ? `<span class="badge badge-secondary" style="margin-left:4px;">Out: ${log.timeOut.substring(0,5)}</span>` : '';
        
        list.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:8px;">
                <div><div style="font-weight:600; font-size:13px;">${log.date}</div><div style="font-size:11px; color:var(--text-secondary)">${log.acuanMapel || '-'}</div></div>
                <div>${badge}${outBadge}</div>
            </div>
        `;
    });
}

// ===================== KAMERA SCANNER (GURU - jsQR) =====================
let cameraStream = null;
let scanAnimFrame = null;
let scanActive = false;

const scannerOverlay = document.getElementById("scanner-view-overlay");
const successDialog = document.getElementById("success-dialog");
const videoEl = document.getElementById("camera-video");
const canvasEl = document.getElementById("camera-canvas");

function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Browser Anda tidak mendukung akses kamera. Coba gunakan Chrome atau Safari versi terbaru.");
        return;
    }

    const preferredConstraints = {
        video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(preferredConstraints)
        .catch(() => navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "user" },
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        }))
        .then((stream) => {
            cameraStream = stream;
            videoEl.srcObject = stream;
            videoEl.play();
            scanActive = true;
            scannerOverlay.classList.remove("hidden");
            requestAnimationFrame(scanFrame);
        })
        .catch((err) => {
            console.error("Akses kamera gagal:", err);
            if (err.name === 'NotAllowedError') {
                alert("Akses kamera ditolak. Silakan izinkan akses kamera di pengaturan browser Anda, lalu coba lagi.");
            } else {
                alert(`Tidak bisa membuka kamera: ${err.message}`);
            }
        });
}

function stopCamera() {
    scanActive = false;
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    if (scanAnimFrame) {
        cancelAnimationFrame(scanAnimFrame);
        scanAnimFrame = null;
    }
    videoEl.srcObject = null;
    scannerOverlay.classList.add("hidden");
}

function scanFrame() {
    if (!scanActive) return;
    
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
        const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        
        const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "both"
            });
            
            if (code && code.data) {
                console.log("QR terdeteksi:", code.data);
                handleQRScanResult(code.data);
                return; // Hentikan scanning setelah berhasil
            }
        }
    }
    
    scanAnimFrame = requestAnimationFrame(scanFrame);
}

function getTokenTimeWindow(dateObj) {
    const normalized = new Date(dateObj);
    const roundedMinute = Math.floor(normalized.getMinutes() / 5) * 5;
    normalized.setMinutes(roundedMinute, 0, 0);
    return normalized;
}

function generateTokenForTime(dateObj) {
    const normalized = getTokenTimeWindow(dateObj);
    const y = normalized.getFullYear();
    const m = String(normalized.getMonth() + 1).padStart(2, '0');
    const d = String(normalized.getDate()).padStart(2, '0');
    const h = String(normalized.getHours()).padStart(2, '0');
    const min = String(normalized.getMinutes()).padStart(2, '0');
    return `PRESENSI-${y}${m}${d}-${h}${min}`;
}

function isValidToken(scannedData) {
    const now = Date.now();
    const nowDate = new Date(now);
    const candidates = [];

    for (let offset = -2; offset <= 2; offset++) {
        const windowDate = new Date(nowDate.getTime() + offset * 5 * 60000);
        candidates.push(generateTokenForTime(windowDate));
    }

    return candidates.includes(scannedData);
}

function handleQRScanResult(scannedData) {
    // Tampilkan toast sementara
    const toast = document.getElementById('scan-result-toast');
    if(toast) {
        toast.classList.remove('hidden');
    }
    
    // Verifikasi: apakah data yang di-scan valid dengan toleransi waktu
    if (!isValidToken(scannedData)) {
        if(toast) {
            toast.textContent = "❌ QR Tidak Valid / Kadaluarsa!";
            toast.style.background = "var(--color-danger)";
        }
        setTimeout(() => {
            if(toast) {
                toast.classList.add('hidden');
                toast.textContent = "✅ QR Terdeteksi!";
                toast.style.background = "var(--color-success)";
            }
            // Lanjutkan scanning jika QR tidak valid
            scanActive = true;
            scanAnimFrame = requestAnimationFrame(scanFrame);
        }, 2000);
        return;
    }
    
    // QR Valid! Hentikan kamera dan proses absen
    stopCamera();
    
    setTimeout(() => {
        if(toast) {
            toast.classList.add('hidden');
        }
        processAttendance(currentUser.data.id);
    }, 500);
}

document.getElementById("btn-trigger-scan").addEventListener("click", () => {
    startCamera();
});

document.getElementById("btn-close-scanner").addEventListener("click", () => {
    stopCamera();
});


function processAttendance(teacherId) {
    const teacher = state.teachers.find(t => t.id === teacherId);
    const now = new Date();
    const todayStr = getTodayDateStr();
    const timeStr = now.toLocaleTimeString('en-GB');
    
    let log = state.attendance.find(a => a.teacherId === teacherId && a.date === todayStr);
    
    if (!log) {
        // ABSEN DATANG
        const acuan = getAcuanHadir(teacher, now);
        const status = determineStatusIn(timeStr, acuan.jam);
        
        const logId = "L" + Date.now();
        log = {
            id: logId,
            teacherId: teacher.id,
            teacherName: teacher.name,
            date: todayStr,
            timeIn: timeStr,
            timeOut: "",
            statusIn: status,
            statusOut: "",
            type: 'hadir',
            keterangan: '',
            acuanJam: acuan.jam,
            acuanMapel: acuan.mapel
        };
        
        saveData("attendance", logId, log).then(() => {
            showSuccessDialog("Absen Datang", timeStr, log.statusIn);
            initGuruView(); 
        });
        
    } else if (!log.timeOut && log.type === 'hadir') {
        // ABSEN PULANG
        log.timeOut = timeStr;
        log.statusOut = "Selesai";
        
        saveData("attendance", log.id, log).then(() => {
            showSuccessDialog("Absen Pulang", timeStr, log.statusOut);
            initGuruView(); 
        });
    }
}

function showSuccessDialog(type, time, status) {
    document.getElementById("success-time").textContent = time.substring(0,5);
    document.getElementById("success-acuan").textContent = type;
    document.getElementById("success-status-badge").textContent = status;
    document.getElementById("success-status-badge").className = "badge " + (status === 'Terlambat' ? 'badge-warning' : 'badge-success');
    successDialog.classList.remove("hidden");
}

document.getElementById("btn-close-success").addEventListener("click", () => successDialog.classList.add("hidden"));

// IZIN (GURU)
const izinOverlay = document.getElementById("izin-overlay");
document.getElementById("btn-lapor-izin").addEventListener("click", () => {
    document.getElementById("izin-type").value = "izin";
    document.getElementById("izin-keterangan").value = "";
    izinOverlay.classList.remove("hidden");
});
document.getElementById("btn-close-izin").addEventListener("click", () => izinOverlay.classList.add("hidden"));

document.getElementById("btn-submit-izin").addEventListener("click", () => {
    const type = document.getElementById("izin-type").value;
    const ket = document.getElementById("izin-keterangan").value;
    if(!ket.trim()) return alert("Keterangan/alasan wajib diisi!");
    
    const teacher = currentUser.data;
    const logId = "L" + Date.now();
    const newRecord = {
        id: logId,
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: getTodayDateStr(),
        timeIn: new Date().toLocaleTimeString('en-GB'),
        timeOut: "",
        statusIn: "-",
        statusOut: "-",
        type: type,
        keterangan: ket,
        acuanJam: "-",
        acuanMapel: "-"
    };
    
    saveData("attendance", logId, newRecord).then(() => {
        izinOverlay.classList.add("hidden");
        alert(`Laporan ${type} berhasil dikirim ke Admin.`);
        initGuruView();
    });
});

// ==========================================================================
// VIEW: ADMIN
// ==========================================================================

let adminClockInterval;

function initAdminView() {
    if(!currentUser || currentUser.role !== 'admin') return;
    
    document.getElementById("admin-name-display").textContent = currentUser.data.username || "Admin";
    const dt = document.getElementById("manage-date");
    if (dt && !dt.value) dt.value = getTodayDateStr();
    
    triggerAdminRender();
    
    if(adminClockInterval) clearInterval(adminClockInterval);
    adminClockInterval = setInterval(updateAdminClock, 1000);
}

// ===================== QR CODE GENERATOR (Admin - qrcode.js) =====================
let currentQRInstance = null;
let currentQRToken = "";

function generateAdminQR(token) {
    const container = document.getElementById('qr-code-display');
    if (!container) return;
    
    // Bersihkan QR lama
    container.innerHTML = "";
    
    if (typeof QRCode === 'undefined') {
        container.innerHTML = `<div style="text-align:center; color:#64748b;"><i class="fa-solid fa-spinner fa-spin" style="font-size:40px;"></i><br><small>Memuat library QR...</small></div>`;
        return;
    }

    try {
        new QRCode(container, {
            text: token,
            width: 248,
            height: 248,
            colorDark: "#0f172a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H,
            margin: 2,
            scale: 6
        });
        // Pastikan gambar/canvas tidak overflow
        const img = container.querySelector('img');
        if(img) { img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '4px'; }
        const cvs = container.querySelector('canvas');
        if(cvs) { cvs.style.width = '100%'; cvs.style.height = '100%'; cvs.style.borderRadius = '4px'; }
    } catch(e) {
        console.error("QRCode error:", e);
    }
}


function updateAdminClock() {
    if(currentUser?.role !== 'admin') return;
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('id-ID');
    document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Gunakan fungsi terpusat untuk membentuk token
    const tokenStr = generateTokenForTime(now);
    
    if (tokenStr !== currentQRToken) {
        currentQRToken = tokenStr;
        state.activeToken = tokenStr;
        const el = document.getElementById('active-token');
        if(el) el.textContent = tokenStr.substring(0, 22) + "...";
        generateAdminQR(state.activeToken);
    }
}

document.getElementById("btn-regenerate-qr").addEventListener("click", () => { currentQRToken = ""; updateAdminClock(); });


// TABS ADMIN
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        item.classList.add('active');
        const tabId = 'tab-' + item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        // Trigger render saat tab aktif
        const tab = item.getAttribute('data-tab');
        if(tab === 'manage') renderManageAttendanceTable();
        if(tab === 'reports') renderReports();
        if(tab === 'jadwal') populateJadwalGrid();
    });
});


function renderDashboardStats() {
    if(currentUser?.role !== 'admin') return;
    const today = getTodayDateStr();
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    document.getElementById("stat-total-teachers").textContent = state.teachers.length;
    document.getElementById("stat-present-teachers").textContent = todaysLogs.filter(log => (log.type === 'hadir') && log.statusIn === 'Tepat Waktu').length;
    document.getElementById("stat-late-teachers").textContent = todaysLogs.filter(log => (log.type === 'hadir') && log.statusIn === 'Terlambat').length;
    document.getElementById("stat-izin-teachers").textContent = todaysLogs.filter(log => log.type === 'izin' || log.type === 'sakit').length;
}

function renderLiveFeed() {
    if(currentUser?.role !== 'admin') return;
    const feedContainer = document.getElementById("feed-scans-list");
    if(!feedContainer) return;
    
    const today = getTodayDateStr();
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    const countEl = document.getElementById("feed-count");
    if(countEl) countEl.textContent = `${todaysLogs.length} Aktivitas`;
    
    if (todaysLogs.length === 0) {
        feedContainer.innerHTML = `<div class="feed-empty"><p>Belum ada aktivitas presensi hari ini.</p></div>`;
        return;
    }
    
    feedContainer.innerHTML = "";
    
    let feedItems = [];
    todaysLogs.forEach(l => {
        const nameStr = l.teacherName || "Guru";
        feedItems.push({ 
            name: nameStr, 
            time: l.timeIn || "00:00:00", 
            action: l.type === 'hadir' ? (l.statusIn || "Hadir") : (l.type || "INFO").toUpperCase(), 
            ket: l.acuanMapel || l.keterangan || "-" 
        });
        if (l.timeOut) {
            feedItems.push({ 
                name: nameStr, 
                time: l.timeOut, 
                action: "Pulang", 
                ket: "Selesai Mengajar" 
            });
        }
    });
    
    feedItems.sort((a,b) => new Date(`1970/01/01 ${b.time}`) - new Date(`1970/01/01 ${a.time}`));
    
    feedItems.forEach(item => {
        let badge = "badge-success";
        if (item.action === 'Terlambat') badge = "badge-warning";
        else if (item.action === 'Pulang') badge = "badge-secondary";
        else if (item.action === 'IZIN' || item.action === 'SAKIT') badge = "badge-info";
        
        const avatarStr = (item.name || "GU").substring(0, 2).toUpperCase();
        const displayTime = (item.time || "00:00").substring(0, 5);
        
        feedContainer.innerHTML += `
            <div class="feed-item">
                <div class="feed-user">
                    <div class="feed-avatar">${avatarStr}</div>
                    <div class="feed-info">
                        <h4>${item.name}</h4>
                        <p>${item.ket}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <span class="feed-time">${displayTime}</span><br>
                    <span class="badge ${badge}">${item.action}</span>
                </div>
            </div>
        `;
    });
}

// ADMIN: GURU & JADWAL (CRUD)
function renderTeachersTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("teachers-list-body");
    if(!tbody) return;
    
    const searchInput = document.getElementById("search-teacher");
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    
    tbody.innerHTML = "";
    const filtered = state.teachers.filter(t => {
        const nameStr = t.name || "";
        return nameStr.toLowerCase().includes(search);
    });
    
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">Tidak ada data guru ditemukan.</td></tr>`;
        return;
    }
    
    filtered.forEach(t => {
        const avatarStr = (t.name || "GU").substring(0, 2).toUpperCase();
        tbody.innerHTML += `
            <tr>
                <td><div class="feed-avatar">${avatarStr}</div></td>
                <td><strong>${t.name || "-"}</strong></td>
                <td>${t.nip || "-"}</td>
                <td>${t.picketDay || "-"}</td>
                <td>${t.picketCheckIn || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" title="Jadwal" onclick="openJadwalForTeacher('${t.id}')"><i class="fa-solid fa-calendar-week"></i></button>
                        <button class="btn-icon" title="Edit" onclick="editTeacher('${t.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon" title="Hapus" onclick="deleteTeacher('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}
document.getElementById("search-teacher")?.addEventListener("input", renderTeachersTable);

const teacherModal = document.getElementById("teacher-modal");
document.getElementById("btn-add-teacher-modal").addEventListener("click", () => {
    document.getElementById("form-teacher").reset();
    document.getElementById("teacher-id").value = "";
    teacherModal.classList.remove("hidden");
});
document.getElementById("btn-close-teacher-modal").addEventListener("click", () => teacherModal.classList.add("hidden"));
document.getElementById("form-teacher").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("teacher-id").value || "T" + Date.now();
    const newData = {
        id,
        name: document.getElementById("teacher-name").value,
        nip: document.getElementById("teacher-nip").value,
        picketDay: document.getElementById("teacher-picket").value,
        picketCheckIn: document.getElementById("teacher-checkin").value
    };
    
    saveData("teachers", id, newData).then(() => {
        teacherModal.classList.add("hidden");
    });
});
window.editTeacher = function(id) {
    const t = state.teachers.find(t => t.id === id);
    if (!t) return;
    document.getElementById("teacher-id").value = t.id;
    document.getElementById("teacher-name").value = t.name;
    document.getElementById("teacher-nip").value = t.nip;
    document.getElementById("teacher-picket").value = t.picketDay;
    document.getElementById("teacher-checkin").value = t.picketCheckIn || "07:00";
    teacherModal.classList.remove("hidden");
}
window.deleteTeacher = function(id) {
    if (confirm("Hapus guru ini? Ini juga akan menghapus jadwal mengajarnya.")) { 
        deleteData("teachers", id); 
        // Idealnya hapus jadwalnya juga
        const sch = state.schedules.filter(s => s.teacherId === id);
        sch.forEach(s => deleteData("schedules", s.id));
    }
}

function populateTeacherDropdownsAdmin() {
    const s1 = document.getElementById("select-jadwal-teacher");
    const s2 = document.getElementById("att-teacher-id");
    if(s1) s1.innerHTML = '<option value="">-- Pilih Guru --</option>';
    if(s2) s2.innerHTML = '';
    state.teachers.forEach(t => {
        if(s1) s1.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        if(s2) s2.innerHTML += `<option value="${t.id}">${t.name}</option>`;
    });
}

const selectJadwalTeacher = document.getElementById("select-jadwal-teacher");
selectJadwalTeacher?.addEventListener("change", populateJadwalGrid);
function populateJadwalGrid() {
    const tId = selectJadwalTeacher.value;
    const grid = document.getElementById("jadwal-week-grid");
    if(!tId) { grid.innerHTML = `<p style="padding:20px; grid-column:1/-1;">Pilih guru terlebih dahulu.</p>`; return; }
    
    const t = state.teachers.find(x => x.id === tId);
    grid.innerHTML = "";
    ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].forEach(day => {
        const sch = state.schedules.find(s => s.teacherId === tId && s.day === day);
        let eHtml = "";
        if (sch && sch.entries.length > 0) {
            [...sch.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai)).forEach(e => {
                eHtml += `<div class="jadwal-entry">${e.jamMulai} - ${e.mapel} (${e.kelas})</div>`;
            });
        }
        grid.innerHTML += `
            <div class="jadwal-day-card" onclick="openJadwalModal('${day}')">
                <div class="jadwal-day-header">${day}</div>
                <div class="jadwal-day-body">${eHtml}</div>
            </div>
        `;
    });
}
window.openJadwalForTeacher = function(id) {
    navItems.forEach(n => n.classList.remove('active')); document.querySelector('[data-tab="jadwal"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); document.getElementById('tab-jadwal').classList.add('active');
    selectJadwalTeacher.value = id; populateJadwalGrid();
}

const jadwalModal = document.getElementById("jadwal-modal");
window.openJadwalModal = function(day) {
    document.getElementById("jadwal-teacher-id").value = selectJadwalTeacher.value;
    document.getElementById("jadwal-day").value = day;
    document.getElementById("jadwal-day-display").value = day;
    
    const tId = selectJadwalTeacher.value;
    const sch = state.schedules.find(s => s.teacherId === tId && s.day === day);
    const container = document.getElementById("jadwal-entries-container");
    container.innerHTML = "";
    
    if (sch && sch.entries.length > 0) {
        sch.entries.forEach(e => addJadwalEntryRow(e.jamMulai, e.mapel, e.kelas));
    } else {
        addJadwalEntryRow();
    }
    jadwalModal.classList.remove("hidden");
}
document.getElementById("btn-close-jadwal-modal").addEventListener("click", () => jadwalModal.classList.add("hidden"));
document.getElementById("btn-add-jadwal-entry").addEventListener("click", () => addJadwalEntryRow());
function addJadwalEntryRow(jam="07:00", mapel="", kelas="") {
    const div = document.createElement("div"); div.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom:5px;">
            <input type="time" class="j-jam" value="${jam}" required>
            <input type="text" class="j-mapel" value="${mapel}" placeholder="Mapel" required>
            <input type="text" class="j-kelas" value="${kelas}" placeholder="Kelas" required>
            <button type="button" class="btn-icon" onclick="this.parentElement.parentElement.remove()" style="background:rgba(239, 68, 68, 0.2); color:#ef4444;"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    document.getElementById("jadwal-entries-container").appendChild(div);
}
document.getElementById("btn-save-jadwal").addEventListener("click", () => {
    const tId = document.getElementById("jadwal-teacher-id").value;
    const day = document.getElementById("jadwal-day").value;
    const entries = [];
    document.getElementById("jadwal-entries-container").querySelectorAll("div > div").forEach(row => {
        entries.push({ jamMulai: row.querySelector(".j-jam").value, mapel: row.querySelector(".j-mapel").value, kelas: row.querySelector(".j-kelas").value });
    });
    
    let schId = "S_" + tId + "_" + day;
    const existing = state.schedules.find(s => s.teacherId === tId && s.day === day);
    if(existing && existing.id) schId = existing.id;
    
    const newData = { id: schId, teacherId: tId, day, entries };
    saveData("schedules", schId, newData).then(() => {
        jadwalModal.classList.add("hidden");
    });
});

// ADMIN: KELOLA KEHADIRAN
document.getElementById("manage-date")?.addEventListener("change", renderManageAttendanceTable);

// Tombol Tambah Manual
document.getElementById("btn-add-manual-attendance")?.addEventListener("click", () => {
    if(state.teachers.length === 0) return alert("Belum ada data guru.");
    const tDate = document.getElementById("manage-date").value || getTodayDateStr();
    openAttendanceModal(state.teachers[0].id, tDate, null);
});

function renderManageAttendanceTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("manage-attendance-body");
    const tDate = document.getElementById("manage-date").value;
    if(!tDate) return;
    tbody.innerHTML = "";
    
    if(state.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Belum ada data guru. Tambahkan guru di tab Data Guru.</td></tr>`;
        return;
    }
    
    state.teachers.forEach(t => {
        const log = state.attendance.find(a => a.teacherId === t.id && a.date === tDate);
        const acuan = getAcuanHadir(t, new Date(tDate + 'T00:00:00'));
        
        const acuanHtml = `<div style="font-size:13px;"><strong>${acuan.jam}</strong><br><span style="color:var(--text-muted); font-size:11px;">${acuan.mapel}</span></div>`;
        let actBtns = `<button class="btn-icon" title="Tambah Presensi" onclick="openAttendanceModal('${t.id}','${tDate}',null)"><i class="fa-solid fa-plus"></i></button>`;
        
        let timeInHtml = `<span style="color:var(--text-muted)">-</span>`;
        let timeOutHtml = `<span style="color:var(--text-muted)">-</span>`;
        let statusHtml = acuan.wajibHadir 
            ? `<span class="badge" style="background:rgba(239,68,68,0.15); color:var(--color-danger); border-color:rgba(239,68,68,0.3);">Belum Hadir</span>`
            : `<span class="badge" style="background:rgba(100,116,139,0.15); color:var(--text-muted);">Tidak Wajib</span>`;
        let ketHtml = `<span style="color:var(--text-muted)">-</span>`;
        
        if (log) {
            actBtns = `
                <button class="btn-icon" title="Edit" onclick="openAttendanceModal('${t.id}','${tDate}','${log.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon" title="Hapus" onclick="deleteData('attendance', '${log.id}')"><i class="fa-solid fa-trash"></i></button>
            `;
            timeInHtml = `<strong style="color:var(--text-main);">${log.timeIn.substring(0,5)}</strong>`;
            timeOutHtml = log.timeOut 
                ? `<strong style="color:var(--color-info);">${log.timeOut.substring(0,5)}</strong>` 
                : `<span style="color:var(--text-muted)">Belum Pulang</span>`;
            
            if(log.type === 'izin') statusHtml = `<span class="badge badge-info">Izin</span>`;
            else if(log.type === 'sakit') statusHtml = `<span class="badge badge-secondary">Sakit</span>`;
            else if(log.type === 'alpa') statusHtml = `<span class="badge badge-danger">Alpa</span>`;
            else if(log.statusIn === 'Terlambat') statusHtml = `<span class="badge badge-warning">Terlambat</span>`;
            else statusHtml = `<span class="badge badge-success">Tepat Waktu</span>`;
            
            if(log.keterangan) ketHtml = `<span style="font-size:12px; color:var(--text-secondary);">${log.keterangan}</span>`;
        }
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td>${acuanHtml}</td>
                <td>${timeInHtml}</td>
                <td>${timeOutHtml}</td>
                <td class="text-center">${statusHtml}</td>
                <td>${ketHtml}</td>
                <td><div class="action-buttons">${actBtns}</div></td>
            </tr>`;
    });
}

const attModal = document.getElementById("attendance-modal");
window.openAttendanceModal = function(tId, date, logId) {
    document.getElementById("att-id").value = logId || "";
    document.getElementById("att-teacher-id").value = tId;
    document.getElementById("att-date").value = date;
    
    if (logId) {
        const log = state.attendance.find(a => a.id === logId);
        document.getElementById("att-time").value = log.timeIn.substring(0,5);
        document.getElementById("att-time-out").value = log.timeOut ? log.timeOut.substring(0,5) : "";
        document.getElementById("att-status").value = log.type==='hadir' ? log.statusIn : (log.type.charAt(0).toUpperCase()+log.type.slice(1));
        document.getElementById("att-keterangan").value = log.keterangan||"";
    } else {
        document.getElementById("att-time").value = "07:00";
        document.getElementById("att-time-out").value = "";
    }
    attModal.classList.remove("hidden");
}
document.getElementById("btn-close-attendance-modal").addEventListener("click", () => attModal.classList.add("hidden"));
document.getElementById("form-attendance").addEventListener("submit", (e) => {
    e.preventDefault();
    const lId = document.getElementById("att-id").value;
    const tId = document.getElementById("att-teacher-id").value;
    const t = state.teachers.find(x => x.id === tId);
    
    const timeIn = document.getElementById("att-time").value + (document.getElementById("att-time").value.length === 5 ? ":00" : "");
    let timeOut = document.getElementById("att-time-out").value;
    if(timeOut && timeOut.length === 5) timeOut += ":00";
    
    const st = document.getElementById("att-status").value;
    const logId = lId || "L"+Date.now();
    const selectedDate = new Date(document.getElementById("att-date").value + 'T00:00:00');
    const acuan = getAcuanHadir(t, selectedDate);
    
    const newData = {
        id: logId, teacherId: tId, teacherName: t.name, date: document.getElementById("att-date").value,
        timeIn, timeOut, statusIn: st==='Izin'||st==='Sakit'||st==='Alpa'?'-':st, type: st==='Izin'||st==='Sakit'||st==='Alpa'?st.toLowerCase():'hadir',
        keterangan: document.getElementById("att-keterangan").value, acuanJam: acuan.jam, acuanMapel: acuan.mapel
    };
    
    saveData("attendance", logId, newData).then(() => {
        attModal.classList.add("hidden");
    });
});

// ADMIN: KELOLA ADMIN
function renderAdminsTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("admins-list-body");
    tbody.innerHTML = "";
    state.admins.forEach(a => {
        let btn = a.username !== 'admin' ? `<button class="btn-icon" onclick="deleteData('admins', '${a.id}')"><i class="fa-solid fa-trash"></i></button>` : '';
        tbody.innerHTML += `<tr><td>${a.username}</td><td><span class="badge badge-info">${a.role}</span></td><td><div class="action-buttons">${btn}</div></td></tr>`;
    });
}
const adminModal = document.getElementById("admin-account-modal");
document.getElementById("btn-add-admin-modal").addEventListener("click", () => adminModal.classList.remove("hidden"));
document.getElementById("btn-close-admin-modal").addEventListener("click", () => adminModal.classList.add("hidden"));
document.getElementById("form-admin-account").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = "A"+Date.now();
    const newData = { id, username: document.getElementById("new-admin-user").value, password: document.getElementById("new-admin-pass").value, role: "admin" };
    saveData("admins", id, newData).then(() => {
        adminModal.classList.add("hidden");
    });
});

// ADMIN: REPORTS
function getScoreLabel(score) {
    if (score === '-') return 'Belum ada data';
    if (score >= 90) return 'Sangat Baik';
    if (score >= 80) return 'Baik';
    if (score >= 70) return 'Cukup';
    return 'Perlu Perbaikan';
}

function buildReportSummary(month) {
    const summary = [];

    state.teachers.forEach((t) => {
        const logs = state.attendance.filter(a => a.teacherId === t.id && a.date.startsWith(month));
        const tepat = logs.filter(l => l.type === 'hadir' && l.statusIn === 'Tepat Waktu').length;
        const lambat = logs.filter(l => l.type === 'hadir' && l.statusIn === 'Terlambat').length;
        const izinSakit = logs.filter(l => l.type === 'izin' || l.type === 'sakit').length;
        const alpa = logs.filter(l => l.type === 'alpa').length;
        const hadirTotal = tepat + lambat;

        let skor = '-';
        let label = 'Belum ada data';
        if (logs.length > 0) {
            const totalPoin = (tepat * 100) + (lambat * 70) + (izinSakit * 80) + (alpa * 0);
            skor = Math.round(totalPoin / logs.length);
            label = getScoreLabel(skor);
        }

        summary.push({ teacher: t, logs, tepat, lambat, izinSakit, alpa, hadirTotal, skor, label });
    });

    return summary;
}

function renderReports() {
    if(currentUser?.role !== 'admin') return;
    const sel = document.getElementById("select-report-month"); 
    if(!sel) return;
    const m = sel.value; // YYYY-MM
    const tbody = document.getElementById("report-list-body"); 
    tbody.innerHTML = "";
    
    if(state.teachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Belum ada data guru.</td></tr>`;
        return;
    }

    const summaryRows = buildReportSummary(m);

    summaryRows.forEach(item => {
        let skorColor = 'var(--text-muted)';
        if (item.skor !== '-') {
            if (item.skor >= 90) skorColor = 'var(--color-success)';
            else if (item.skor >= 80) skorColor = 'var(--color-info)';
            else if (item.skor >= 70) skorColor = 'var(--color-warning)';
            else skorColor = 'var(--color-danger)';
        }

        tbody.innerHTML += `
            <tr>
                <td><strong>${item.teacher.name}</strong></td>
                <td class="text-center"><strong>${item.hadirTotal}</strong></td>
                <td class="text-center" style="color:var(--color-success)">${item.tepat}</td>
                <td class="text-center" style="color:var(--color-warning)">${item.lambat}</td>
                <td class="text-center" style="color:var(--color-info)">${item.izinSakit}</td>
                <td class="text-center" style="color:var(--color-danger)">${item.alpa}</td>
                <td class="text-right">
                    <div style="font-weight:700; color:${skorColor};">${item.skor === '-' ? '-' : item.skor + '/100'}</div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${item.label}</div>
                </td>
            </tr>`;
    });
}

// Inisialisasi dropdown bulan (3 bulan terakhir)
if(document.getElementById("select-report-month")) {
    const sel = document.getElementById("select-report-month");
    sel.innerHTML = "";
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const now = new Date();
    for(let i = 0; i < 4; i++) {
        let month = now.getMonth() - i;
        let year = now.getFullYear();
        if(month < 0) { month += 12; year -= 1; }
        const val = `${year}-${(month+1).toString().padStart(2,'0')}`;
        const label = `${monthNames[month]} ${year}`;
        sel.innerHTML += `<option value="${val}">${label}</option>`;
    }
    sel.addEventListener("change", renderReports);
}

function exportReportCsv() {
    const m = document.getElementById("select-report-month").value;
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const [yr, mo] = m.split('-');
    const monthLabel = `${monthNames[parseInt(mo)-1]} ${yr}`;

    const rows = [];
    rows.push(`"Laporan Presensi Guru - ${monthLabel}"`);
    rows.push('"Nama Guru","Total Hadir","Tepat Waktu","Terlambat","Izin/Sakit","Alpa","Skor","Keterangan Penilaian"');

    const summaryRows = buildReportSummary(m);
    summaryRows.forEach((item) => {
        const skorText = item.skor === '-' ? '-' : `${item.skor}/100`;
        rows.push(`"${item.teacher.name}",${item.hadirTotal},${item.tepat},${item.lambat},${item.izinSakit},${item.alpa},"${skorText}","${item.label}"`);
    });

    rows.push('');
    rows.push('"Keterangan Skor"');
    rows.push('"90-100 = Sangat Baik"');
    rows.push('"80-89 = Baik"');
    rows.push('"70-79 = Cukup"');
    rows.push('"< 70 = Perlu Perbaikan"');

    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Laporan_Presensi_${m}.csv`;
    link.click();
}

function exportReportPdf() {
    const m = document.getElementById("select-report-month").value;
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const [yr, mo] = m.split('-');
    const monthLabel = `${monthNames[parseInt(mo)-1]} ${yr}`;
    const printedDate = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Library PDF belum siap. Silakan refresh halaman dan coba lagi.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 18;

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Laporan Presensi Guru', 14, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Periode: ${monthLabel}`, 14, y + 15);
    doc.text('Sistem Presensi Digital', 14, y + 21);

    doc.setTextColor(0, 0, 0);
    y = 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SMK Bidayatul Hidayah', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Nama Sekolah', 14, y + 5);
    doc.text(`Dicetak tanggal: ${printedDate}`, pageWidth - 54, y + 5);

    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Keterangan Penilaian', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('90-100 = Sangat Baik', 14, y);
    doc.text('80-89 = Baik', 56, y);
    doc.text('70-79 = Cukup', 98, y);
    doc.text('< 70 = Perlu Perbaikan', 140, y);
    y += 8;

    const summaryRows = buildReportSummary(m);
    summaryRows.forEach((item, index) => {
        if (y > 250) {
            doc.addPage();
            y = 18;
        }

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.roundedRect(12, y - 3, pageWidth - 24, 24, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${index + 1}. ${item.teacher.name}`, 16, y + 3);

        const skorText = item.skor === '-' ? '-' : `${item.skor}/100`;
        const scoreColor = item.skor >= 90 ? [24, 121, 81] : item.skor >= 80 ? [37, 99, 235] : item.skor >= 70 ? [217, 119, 6] : [185, 28, 28];
        doc.setTextColor(...scoreColor);
        doc.text(`Skor: ${skorText}`, pageWidth - 44, y + 3);
        doc.setTextColor(0, 0, 0);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`Hadir ${item.hadirTotal} | Tepat ${item.tepat} | Lambat ${item.lambat} | Izin/Sakit ${item.izinSakit} | Alpa ${item.alpa}`, 16, y + 10);
        doc.text(`Penilaian: ${item.label}`, 16, y + 16);
        y += 28;
    });

    y = 270;
    doc.setDrawColor(180, 180, 180);
    doc.line(14, y, 70, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Disetujui oleh', 14, y + 6);
    doc.text('Kepala Sekolah', 14, y + 12);

    doc.line(pageWidth - 70, y, pageWidth - 14, y);
    doc.text('Admin', pageWidth - 70, y + 6);
    doc.text('Penanggung Jawab', pageWidth - 70, y + 12);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Dicetak dari sistem presensi guru digital.', 14, 290);
    doc.save(`Laporan_Presensi_${m}.pdf`);
}

document.getElementById("btn-export-csv")?.addEventListener("click", exportReportCsv);
document.getElementById("btn-export-pdf")?.addEventListener("click", exportReportPdf);

// ==========================================================================
// BOOTSTRAP
// ==========================================================================
window.addEventListener("load", () => {
    initDatabase();
    // Load pengaturan wajib hadir (default fallback 07:00)
    setTimeout(() => {
        loadSettings().then(() => {
            // Pastikan UI admin terisi saat sudah render
            renderAdminWajibHadir();
            bindAdminWajibHadirSave();
            // Update display guru bila sudah berada di view guru
            const wajibGuru = document.getElementById("guru-wajib-hadir-time");
            if (wajibGuru) wajibGuru.textContent = getSettingsTimeValue();
        });
    }, 1000);
});

