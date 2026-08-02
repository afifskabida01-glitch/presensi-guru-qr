/**
 * QRPresensi - Application Logic (Phase 4 - Firebase Realtime Sync)
 * Mengelola sistem sinkronisasi database cloud Firebase Firestore.
 */

const APP_VERSION = "prod-5.2";

let state = {
    teachers: [],
    schedules: [],
    attendance: [],
    admins: [{ id: "admin1", username: "admin", password: "123", role: "superadmin" }],
    activeToken: ""
};

let currentUser = null;
let db = null;
let qrHelper = null;
let lastRenderedToken = "";
let isFirebaseActive = false;
let automaticAlpaRunning = false;
let teachersLoaded = false;
let attendanceLoaded = false;

// ==========================================================================
// FIREBASE INIT & SYNC
// ==========================================================================

function initDatabase() {
    if (window.firebaseConfig && window.firebaseConfig.apiKey && window.firebaseConfig.apiKey !== "YOUR_API_KEY") {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(window.firebaseConfig);
            }
            db = firebase.firestore();
            isFirebaseActive = true;
            console.log("Firebase Firestore berhasil diinisialisasi.");
            setupFirebaseListeners();
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

function setupFirebaseListeners() {
    db.collection("admins").onSnapshot((snapshot) => {
        state.admins = [];
        snapshot.forEach((doc) => state.admins.push(doc.data()));
        if(state.admins.length === 0) {
            db.collection("admins").doc("admin1").set({ id: "admin1", username: "admin", password: "123", role: "superadmin" });
        }
        triggerAdminRender();
    });

    db.collection("teachers").onSnapshot((snapshot) => {
        state.teachers = [];
        snapshot.forEach((doc) => state.teachers.push(doc.data()));
        teachersLoaded = true;
        if (!currentUser) renderLoginDropdown();
        triggerAdminRender();
        scheduleAutomaticPicketAlpa();
    });

    db.collection("schedules").onSnapshot((snapshot) => {
        state.schedules = [];
        snapshot.forEach((doc) => state.schedules.push(doc.data()));
        triggerAdminRender();
    });

    db.collection("attendance").onSnapshot((snapshot) => {
        state.attendance = [];
        snapshot.forEach((doc) => state.attendance.push(doc.data()));
        attendanceLoaded = true;
        scheduleAutomaticPicketAlpa();
        triggerAdminRender();
        if (currentUser && currentUser.role === 'guru') {
            updateGuruStatusAndBtn();
            renderGuruHistory();
        }
    });
}

function triggerAdminRender() {
    if (!currentUser || currentUser.role !== 'admin') return;
    try { renderDashboardStats(); } catch (e) { console.error("Gagal renderDashboardStats:", e); }
    try { renderLiveFeed(); } catch (e) { console.error("Gagal renderLiveFeed:", e); }
    try { renderTeachersTable(); } catch (e) { console.error("Gagal renderTeachersTable:", e); }
    try { populateTeacherDropdownsAdmin(); } catch (e) { console.error("Gagal populateTeacherDropdownsAdmin:", e); }
    try { renderManageAttendanceTable(); } catch (e) { console.error("Gagal renderManageAttendanceTable:", e); }
    try { renderAdminsTable(); } catch (e) { console.error("Gagal renderAdminsTable:", e); }
    try { renderReports(); } catch (e) { console.error("Gagal renderReports:", e); }
}

async function saveData(collection, docId, data) {
    if (isFirebaseActive && db) {
        try {
            await db.collection(collection).doc(docId).set(data);
        } catch (e) {
            console.error("Error writing to Firestore:", e);
        }
    } else {
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
    scheduleAutomaticPicketAlpa();
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

function formatDateStr(dateObj) {
    const d = new Date(dateObj);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isPicketScheduled(teacher, dayName) {
    return teacher && (teacher.picketDay === 'Setiap Hari' || teacher.picketDay === dayName);
}

function scheduleAutomaticPicketAlpa() {
    if (isFirebaseActive && (!teachersLoaded || !attendanceLoaded)) return;
    setTimeout(syncMissedPicketAbsences, 300);
}

async function syncMissedPicketAbsences() {
    if (automaticAlpaRunning || !state.teachers.length) return;
    automaticAlpaRunning = true;
    try {
        // Cek 3 hari terakhir agar status alpa otomatis tetap terisi bila hari sebelumnya
        // sudah lewat dan guru piket belum melakukan absen.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const datesToCheck = [];
        for (let offset = 1; offset <= 3; offset++) {
            const dateObj = new Date(today);
            dateObj.setDate(dateObj.getDate() - offset);
            datesToCheck.push(formatDateStr(dateObj));
        }

        for (const date of datesToCheck) {
            const dateObj = new Date(date + 'T00:00:00');
            const dayName = getDayName(dateObj);
            const missingPicketTeachers = state.teachers.filter(teacher =>
                isPicketScheduled(teacher, dayName) &&
                !state.attendance.some(log => log.teacherId === teacher.id && log.date === date)
            );

            await Promise.all(missingPicketTeachers.map(teacher => {
                const alpaId = `alpa-${teacher.id}-${date}`;
                const alreadyRecorded = state.attendance.some(log => log.id === alpaId);
                if (alreadyRecorded) return Promise.resolve();

                return saveData('attendance', alpaId, {
                    id: alpaId,
                    teacherId: teacher.id,
                    teacherName: teacher.name,
                    date,
                    timeIn: '-', timeOut: '-', statusIn: '-', type: 'alpa',
                    keterangan: 'Otomatis alpa: melewati jadwal piket tanpa presensi.',
                    acuanJam: teacher.picketCheckIn || '06:45', acuanMapel: 'Guru Piket'
                });
            }));
        }
    } catch (error) {
        console.error('Gagal membuat alpa otomatis guru piket:', error);
    } finally {
        automaticAlpaRunning = false;
    }
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

    if (isPicketScheduled(teacher, dayName)) {
        return {
            jam: teacher.picketCheckIn || "06:45",
            mapel: "Guru Piket",
            wajibHadir: true
        };
    }

    return {
        jam: "-",
        mapel: "Tidak Wajib Hadir",
        wajibHadir: false
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
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById(viewId);
    if(target) target.classList.add('active');

    if(viewId === 'view-admin') {
        const dashNav = document.querySelector('.nav-item[data-tab="dashboard"]');
        dashNav?.classList.add('active');
        const dashTab = document.getElementById('tab-dashboard');
        dashTab?.classList.add('active');
    }
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
    // Minta izin notifikasi saat interaksi pengguna (click)
    requestNotificationPermission();
    
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

// Timer ID untuk jam real-time guru
let guruClockInterval = null;

function updateGuruClock() {
    const timeEl = document.getElementById('guru-live-time');
    const dateEl = document.getElementById('guru-live-date');
    if (!timeEl && !dateEl) return;
    
    const now = new Date();
    if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
}

function stopGuruClock() {
    if (guruClockInterval) {
        clearInterval(guruClockInterval);
        guruClockInterval = null;
    }
}

function initGuruView() {
    if(!currentUser || currentUser.role !== 'guru') return;
    
    startRundownClassNotify();

    const t = currentUser.data;

    document.getElementById("guru-name-display").textContent = t.name;
    document.getElementById("guru-avatar-init").textContent = t.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();

    const now = new Date();
    document.getElementById("guru-today-day").textContent = getDayName(now);
    
    const scheduleBox = document.getElementById("guru-schedule-list");
    const dayName = getDayName(now);
    const schedule = state.schedules.find(s => s.teacherId === t.id && s.day === dayName);
    
    let schHtml = "";
    if (isPicketScheduled(t, dayName)) {
        schHtml += `<div class="sim-sched-item"><div class="time">${t.picketCheckIn || '06:45'}</div><div class="detail">Guru Piket</div></div>`;
    }
    if (schedule && schedule.entries.length > 0) {
        [...schedule.entries].sort((a, b) => a.jamMulai.localeCompare(b.jamMulai)).forEach((e) => {
            schHtml += `<div class="sim-sched-item"><div class="time">${e.jamMulai}</div><div class="detail">${e.mapel} (${e.kelas})</div></div>`;
        });
    }
    if (schHtml === "") schHtml = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px;">Libur / Tidak ada jadwal mengajar.</div>`;
    scheduleBox.innerHTML = schHtml;
    
    updateGuruStatusAndBtn();
    renderGuruHistory();
    
    // Mulai jam real-time guru
    stopGuruClock();
    updateGuruClock();
    guruClockInterval = setInterval(updateGuruClock, 1000);
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
        statusInd.innerHTML = '<i class="fa-solid fa-circle-question"></i> <span>Belum Absen</span>';
        btnText.textContent = "Absen Datang";
        btnHint.textContent = "Ketuk untuk memindai QR Datang";
    } else {
        btnIzin.style.display = "none";
        
        if (log.type === 'izin' || log.type === 'sakit') {
            statusInd.className = "status-indicator info";
            statusInd.innerHTML = '<i class="fa-solid fa-file-medical"></i> <span>Sedang ' + log.type.toUpperCase() + '</span>';
            btnScan.disabled = true;
            btnScan.style.opacity = "0.5";
            btnText.textContent = "Tidak Bisa Absen";
            btnHint.textContent = "Anda sudah lapor izin hari ini";
        } else if (!log.timeOut) {
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = '<i class="fa-solid fa-sign-in-alt"></i> <span>Hadir (Datang: ' + log.timeIn.substring(0,5) + ')</span>';
            btnScan.className = "btn-scan-main mode-checkout";
            btnText.textContent = "Absen Pulang";
            btnHint.textContent = "Ketuk untuk memindai QR Pulang";
        } else {
            statusInd.className = "status-indicator success";
            statusInd.innerHTML = '<i class="fa-solid fa-check-double"></i> <span>Selesai (Pulang: ' + log.timeOut.substring(0,5) + ')</span>';
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
        list.innerHTML = '<p style="font-size:13px; color:var(--text-muted); text-align:center;">Belum ada riwayat presensi.</p>';
        return;
    }
    
    list.innerHTML = "";
    logs.forEach(log => {
        let badge = "";
        if(log.type === 'izin') badge = '<span class="badge badge-info">Izin</span>';
        else if(log.type === 'sakit') badge = '<span class="badge badge-secondary">Sakit</span>';
        else badge = '<span class="badge ' + (log.statusIn === 'Terlambat' ? 'badge-warning' : 'badge-success') + '">In: ' + log.timeIn.substring(0,5) + '</span>';
        
        let outBadge = log.timeOut ? '<span class="badge badge-secondary" style="margin-left:4px;">Out: ' + log.timeOut.substring(0,5) + '</span>' : '';
        
        list.innerHTML += '<div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:8px;"><div><div style="font-weight:600; font-size:13px;">' + log.date + '</div><div style="font-size:11px; color:var(--text-secondary)">' + (log.acuanMapel || '-') + '</div></div><div>' + badge + outBadge + '</div></div>';
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

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    .catch(() => navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } }
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
            alert('Tidak bisa membuka kamera: ' + err.message);
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
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "both" });
            
            if (code && code.data) {
                console.log("QR terdeteksi:", code.data);
                handleQRScanResult(code.data);
                return;
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
    return 'PRESENSI-' + y + m + d + '-' + h + min;
}

function isValidToken(scannedData) {
    const now = Date.now();
    const nowDate = new Date(now);
    const candidates = [];

    const tokenStepMinutes = 5;
    const toleranceMinutes = 3;
    const maxOffset = Math.ceil(toleranceMinutes / tokenStepMinutes);

    for (let offset = -maxOffset; offset <= maxOffset; offset++) {
        const windowDate = new Date(nowDate.getTime() + offset * tokenStepMinutes * 60000);
        candidates.push(generateTokenForTime(windowDate));
    }

    return candidates.includes(scannedData);
}

function handleQRScanResult(scannedData) {
    const toast = document.getElementById('scan-result-toast');
    if(toast) {
        toast.classList.remove('hidden');
    }
    
    if (!isValidToken(scannedData)) {
        if(toast) {
            toast.textContent = "QR Tidak Valid / Kadaluarsa!";
            toast.style.background = "var(--color-danger)";
        }
        setTimeout(() => {
            if(toast) {
                toast.classList.add('hidden');
                toast.textContent = "QR Terdeteksi!";
                toast.style.background = "var(--color-success)";
            }
            scanActive = true;
            scanAnimFrame = requestAnimationFrame(scanFrame);
        }, 2000);
        return;
    }
    
    stopCamera();
    
    setTimeout(() => {
        if(toast) {
            toast.classList.add('hidden');
        }
        processAttendance(currentUser.data.id);
    }, 500);
}

document.getElementById("btn-trigger-scan").addEventListener("click", () => {
    // Minta izin notifikasi saat interaksi pengguna (tap tombol scan)
    requestNotificationPermission();
    startCamera();
});
document.getElementById("btn-close-scanner").addEventListener("click", stopCamera);

function processAttendance(teacherId) {
    const teacher = state.teachers.find(t => t.id === teacherId);
    const now = new Date();
    const todayStr = getTodayDateStr();
    const timeStr = now.toLocaleTimeString('en-GB');
    
    let log = state.attendance.find(a => a.teacherId === teacherId && a.date === todayStr);
    
    if (!log) {
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

// ======================================================================
// NOTIFIKASI PERGANTIAN KELAS
// ======================================================================
let rundownClassNotifyTimer = null;
let lastRundownClassKey = "";

// Audio context untuk suara notifikasi
let ccAudioCtx = null;
let isCCAudioPlaying = false;

function playClassChangeSound() {
    try {
        if (!ccAudioCtx) {
            ccAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (ccAudioCtx.state === 'suspended') {
            ccAudioCtx.resume();
        }

        isCCAudioPlaying = true;
        const now = ccAudioCtx.currentTime;
        
        // Alarm seperti bel sekolah: 6 beep dengan nada naik-turun
        const beepCount = 6;
        const beepDuration = 0.25;
        const gapDuration = 0.15;
        const totalDuration = beepCount * (beepDuration + gapDuration);
        const baseFreq = 660; // E5
        
        for (let i = 0; i < beepCount; i++) {
            const startTime = now + i * (beepDuration + gapDuration);
            
            // Nada bergantian: tinggi-rendah seperti bel sekolah
            const freq = (i % 2 === 0) ? baseFreq : baseFreq * 1.5; // E5 alternating with B5 (1.5x)
            const vol = 0.45 - (i * 0.03); // sedikit fade out
            
            // Oscillator 1 - sine (nada utama)
            const osc1 = ccAudioCtx.createOscillator();
            const gain1 = ccAudioCtx.createGain();
            osc1.connect(gain1);
            gain1.connect(ccAudioCtx.destination);
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(freq, startTime);
            gain1.gain.setValueAtTime(vol, startTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, startTime + beepDuration);
            osc1.start(startTime);
            osc1.stop(startTime + beepDuration);
            
            // Oscillator 2 - triangle (harmoni untuk suara lebih kaya)
            if (i % 2 === 0) {
                const osc2 = ccAudioCtx.createOscillator();
                const gain2 = ccAudioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(ccAudioCtx.destination);
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(freq * 2, startTime); // satu oktaf di atas
                gain2.gain.setValueAtTime(vol * 0.2, startTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, startTime + beepDuration * 0.8);
                osc2.start(startTime);
                osc2.stop(startTime + beepDuration * 0.8);
            }
        }
        
        // Setelah selesai, reset flag
        setTimeout(() => {
            isCCAudioPlaying = false;
        }, totalDuration * 1000 + 200);
        
    } catch (e) {
        console.warn('Audio notifikasi tidak tersedia:', e);
        isCCAudioPlaying = false;
    }
}

// Fallback alarm menggunakan Audio HTML element sebagai cadangan
function playAlarmFallback() {
    try {
        // Coba buat audio context dulu
        if (ccAudioCtx) {
            playClassChangeSound();
            return;
        }
        
        // Fallback: buat oscillator sederhana
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ccAudioCtx = ctx;
        playClassChangeSound();
    } catch (e) {
        console.warn('Semua metode audio gagal:', e);
    }
}

function vibrateDevice() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
        }
    } catch (e) {
        // ignore
    }
}

function stopRundownClassNotify() {
    if (rundownClassNotifyTimer) {
        clearInterval(rundownClassNotifyTimer);
        rundownClassNotifyTimer = null;
    }
}

function getNowHHmm() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

function parseHHmmToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const parts = hhmm.split(':');
    if (parts.length !== 2) return null;
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
}

function getTodayEntriesForGuru(teacher, dayName) {
    const schedule = state.schedules.find(s => s.teacherId === teacher.id && s.day === dayName);
    let entries = [];
    if (schedule && Array.isArray(schedule.entries)) {
        entries = [...schedule.entries];
    }
    if (isPicketScheduled(teacher, dayName)) {
        entries.push({ jamMulai: teacher.picketCheckIn || '06:45', mapel: 'Guru Piket', kelas: '' });
    }
    entries.sort((a, b) => (a.jamMulai || '00:00').localeCompare(b.jamMulai || '00:00'));
    return entries;
}

// Timer ID untuk countdown auto-dismiss
let ccCountdownTimer = null;
let ccAutoDismissTimer = null;
const CC_DISMISS_SECONDS = 8;

function hideClassChangeNotify() {
    const overlay = document.getElementById('class-change-overlay');
    if (!overlay) return;
    
    // Hentikan timer
    if (ccCountdownTimer) {
        clearInterval(ccCountdownTimer);
        ccCountdownTimer = null;
    }
    if (ccAutoDismissTimer) {
        clearTimeout(ccAutoDismissTimer);
        ccAutoDismissTimer = null;
    }
    
    // Animasi slide-up
    const card = overlay.querySelector('.class-change-card');
    if (card) {
        card.style.animation = 'ccSlideUp 0.3s ease forwards';
    }
    
    setTimeout(() => {
        overlay.classList.add('hidden');
        // Reset animasi untuk pemakaian berikutnya
        if (card) {
            card.style.animation = '';
        }
    }, 300);
}

function showClassChangeNotify(mapel, kelas, jamMulai) {
    if (!currentUser || currentUser.role !== 'guru') return;

    const overlay = document.getElementById('class-change-overlay');
    if (!overlay) return;

    const mapelEl = document.getElementById('cc-mapel');
    const detailEl = document.getElementById('cc-detail');
    const countdownEl = document.getElementById('cc-countdown');

    if (mapelEl) mapelEl.textContent = mapel || 'Mapel';
    if (detailEl) {
        let detail = jamMulai ? 'Jam ' + jamMulai.substring(0, 5) : '';
        if (kelas) detail += (detail ? ' \u00B7 ' : '') + kelas;
        detailEl.textContent = detail || 'Kelas berikutnya dimulai';
    }

    // Reset countdown
    if (countdownEl) countdownEl.textContent = String(CC_DISMISS_SECONDS);

    // Hapus hidden
    overlay.classList.remove('hidden');

    // Mainkan suara notifikasi (alarm)
    playClassChangeSound();

    // Getar HP
    vibrateDevice();

    // Kirim notifikasi desktop/OS jika diizinkan
    sendDesktopNotification(mapel, kelas, jamMulai);

    // Timer countdown
    let remaining = CC_DISMISS_SECONDS;
    if (ccCountdownTimer) clearInterval(ccCountdownTimer);
    ccCountdownTimer = setInterval(() => {
        remaining--;
        if (countdownEl) countdownEl.textContent = String(Math.max(remaining, 0));
        if (remaining <= 0) {
            clearInterval(ccCountdownTimer);
            ccCountdownTimer = null;
        }
    }, 1000);

    // Auto dismiss setelah 8 detik
    if (ccAutoDismissTimer) clearTimeout(ccAutoDismissTimer);
    ccAutoDismissTimer = setTimeout(() => {
        hideClassChangeNotify();
    }, CC_DISMISS_SECONDS * 1000);
}

// Fungsi Notifikasi Desktop / OS
function sendDesktopNotification(mapel, kelas, jamMulai) {
    try {
        if (!('Notification' in window)) return;

        const jamStr = jamMulai ? jamMulai.substring(0, 5) : '';
        const bodyText = kelas
            ? `Kelas ${kelas} · Jam ${jamStr} — Saatnya mengajar! 🏃‍♂️💨`
            : `Jam ${jamStr} — Saatnya mengajar! 🏃‍♂️💨`;
        const notificationTitle = '🔔 Waktunya Masuk Kelas!';
        const notificationBody = `${mapel}\n${bodyText}`;

        if (Notification.permission === 'default') {
            Notification.requestPermission();
            return;
        }

        if (Notification.permission === 'granted') {
            const showServiceWorkerNotification = () => {
                if ('serviceWorker' in navigator && navigator.serviceWorker?.ready) {
                    navigator.serviceWorker.ready.then((registration) => {
                        if (registration && typeof registration.showNotification === 'function') {
                            registration.showNotification(notificationTitle, {
                                body: notificationBody,
                                icon: 'logo.png',
                                badge: 'logo.png',
                                tag: 'class-change-' + Date.now(),
                                requireInteraction: true,
                                vibrate: [200, 100, 200, 100, 200],
                                data: {
                                    url: new URL('./index.html', window.location.href).toString(),
                                    mapel,
                                    kelas,
                                    jamMulai
                                }
                            });
                        }
                    }).catch(() => {
                        // Fallback bawaan browser
                    });
                }
            };

            showServiceWorkerNotification();

            const notif = new Notification(notificationTitle, {
                body: notificationBody,
                icon: 'logo.png',
                badge: 'logo.png',
                tag: 'class-change-' + Date.now(),
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200]
            });

            setTimeout(() => notif.close(), 10000);
            notif.onclick = function() {
                window.focus();
                this.close();
            };
        }
    } catch (e) {
        console.warn('Notifikasi desktop tidak tersedia:', e);
    }
}

// Fungsi untuk meminta izin notifikasi di awal
function requestNotificationPermission() {
    try {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    } catch (e) {
        // ignore
    }
}

// Event listener tombol tutup notifikasi
document.addEventListener('DOMContentLoaded', () => {
    const dismissBtn = document.getElementById('cc-dismiss');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', hideClassChangeNotify);
    }
});

function tickRundownClassNotify() {
    if (!currentUser || currentUser.role !== 'guru') return;

    const teacher = currentUser.data;
    const dayName = getDayName(new Date());
    const entries = getTodayEntriesForGuru(teacher, dayName);

    if (entries.length < 2) {
        lastRundownClassKey = '';
        return;
    }

    const nowMin = parseHHmmToMinutes(getNowHHmm());
    if (nowMin === null) return;

    let currentIdx = -1;
    for (let i = 0; i < entries.length; i++) {
        const m = parseHHmmToMinutes(entries[i].jamMulai);
        if (m === null) continue;
        if (m <= nowMin) currentIdx = i;
    }

    const nextIdx = currentIdx + 1;
    if (nextIdx >= entries.length) return;

    const nextJam = entries[nextIdx].jamMulai;
    const nextMin = parseHHmmToMinutes(nextJam);
    if (nextMin === null) return;
    if (nowMin < nextMin) return;

    const currentJam = entries[currentIdx]?.jamMulai || '';
    const nextMapel = entries[nextIdx]?.mapel || '';
    const nextKelas = entries[nextIdx]?.kelas || '';

    const key = dayName + '|' + teacher.id + '|' + currentJam + '|' + nextJam;
    if (key === lastRundownClassKey) return;
    lastRundownClassKey = key;

    showClassChangeNotify(nextMapel, nextKelas, nextJam);
}

function startRundownClassNotify() {
    stopRundownClassNotify();
    lastRundownClassKey = '';
    tickRundownClassNotify();
    // Interval 5 detik untuk deteksi lebih cepat, mengatasi Chrome throttle
    rundownClassNotifyTimer = setInterval(tickRundownClassNotify, 5000);
}

// ======================================================================
// PAGE VISIBILITY API - Notifikasi Tetap Muncul Saat Tab Kembali Aktif
// ======================================================================
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log('Tab aktif kembali - mengecek notifikasi yang terlewat...');
        
        // Resume AudioContext jika suspended
        if (ccAudioCtx && ccAudioCtx.state === 'suspended') {
            ccAudioCtx.resume().then(() => {
                console.log('AudioContext berhasil di-resume');
            }).catch(err => {
                console.warn('Gagal resume AudioContext:', err);
            });
        }
        
        // Segera cek pergantian jam yang mungkin terlewat
        if (currentUser && currentUser.role === 'guru') {
            // Reset key biar notifikasi bisa muncul lagi untuk jam yg sama
            lastRundownClassKey = '';
            
            // Panggil tick segera untuk mengecek notifikasi yang terlewat
            setTimeout(() => {
                tickRundownClassNotify();
                
                // Panggil sekali lagi setelah 1 detik untuk memastikan
                setTimeout(tickRundownClassNotify, 1000);
            }, 300);
        }
    }
});

// Pastikan AudioContext di-resume saat user pertama kali berinteraksi dengan halaman
function ensureAudioContext() {
    if (!ccAudioCtx) {
        try {
            ccAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            // ignore
        }
    }
    if (ccAudioCtx && ccAudioCtx.state === 'suspended') {
        ccAudioCtx.resume().catch(() => {});
    }
}

// Daftarkan event listener interaksi pengguna untuk resume AudioContext
['click', 'touchstart', 'keydown'].forEach(eventType => {
    document.addEventListener(eventType, ensureAudioContext, { once: false });
});

// RUNDOWN JADWAL (PNG)
const rundownBtn = document.getElementById("btn-open-rundown");
const rundownModal = document.getElementById("rundown-modal");
const rundownClose1 = document.getElementById("btn-close-rundown-modal");
const rundownClose2 = document.getElementById("btn-close-rundown-modal-2");

if (rundownBtn && rundownModal) {
    rundownBtn.addEventListener("click", () => {
        rundownModal.classList.remove("hidden");
        rundownModal.setAttribute("aria-hidden", "false");
        // Reset zoom saat membuka modal
        rundownZoomLevel = 100;
        updateRundownZoom();
    });
}

if (rundownClose1) {
    rundownClose1.addEventListener("click", closeRundownModal);
}
if (rundownClose2) {
    rundownClose2.addEventListener("click", closeRundownModal);
}

function showRundownModal() {
    const m = document.getElementById("rundown-modal");
    if(!m) return;
    m.classList.remove("hidden");
    m.setAttribute("aria-hidden", "false");
    rundownZoomLevel = 100;
    updateRundownZoom();
}

function closeRundownModal() {
    rundownZoomLevel = 100;
    updateRundownZoom();
    if (rundownModal) {
        rundownModal.classList.add("hidden");
        rundownModal.setAttribute("aria-hidden", "true");
    }
}

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
    const todayStr = getTodayDateStr();
    const nowTime = new Date().toLocaleTimeString('en-GB');
    const newRecord = {
        id: logId,
        teacherId: teacher.id,
        teacherName: teacher.name,
        date: todayStr,
        timeIn: nowTime,
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
        
        // Kirim notifikasi WhatsApp
        sendIzinWhatsAppNotification(teacher.name, type, ket, todayStr);
        
        alert('Laporan ' + type + ' berhasil dikirim ke Admin.');
        initGuruView();
    });
});

// ==========================================================================
// NOTIFIKASI WHATSAPP IZIN/SAKIT
// ==========================================================================

// Konfigurasi nomor WhatsApp untuk notifikasi (auto-detect dari data guru)
let notifConfig = {
    headmasterPhone: '',   // Otomatis dari data guru (Kepala Sekolah) - FIXED / READONLY
    picketPhones: []       // Array of nomor guru piket hari ini (bisa 1, 2, atau lebih)
};

// Format nomor HP lokal (08xxx) ke format internasional (628xxx)
function formatPhoneToInternational(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '62' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('62')) {
        cleaned = '62' + cleaned;
    }
    return cleaned;
}

// Cari nomor Kepala Sekolah dari data guru (HANYA dari jabatan "Kepala Sekolah")
function findHeadmasterPhone() {
    if (!state.teachers || state.teachers.length === 0) return '';
    // Cari guru dengan jabatan "Kepala Sekolah" secara spesifik
    const headmaster = state.teachers.find(t => 
        t.jabatan && (
            t.jabatan.toLowerCase().includes('kepala sekolah') ||
            t.jabatan.toLowerCase() === 'kepsek'
        )
    );
    if (headmaster && headmaster.noHp) {
        return formatPhoneToInternational(headmaster.noHp);
    }
    return '';
}

// Cari nomor SEMUA Guru Piket hari ini dari data guru (return array)
function findPicketPhones() {
    if (!state.teachers || state.teachers.length === 0) return [];
    const todayName = getDayName(new Date());
    // Cari semua guru yang piket hari ini dan punya nomor HP
    const picketTeachers = state.teachers.filter(t => 
        isPicketScheduled(t, todayName) && t.noHp && t.noHp.trim()
    );
    // Urutkan: Guru Piket yang punya jadwal datang/piketCheckIn lebih awal lebih dulu
    picketTeachers.sort((a, b) => (a.picketCheckIn || '12:00').localeCompare(b.picketCheckIn || '12:00'));
    return picketTeachers.map(t => formatPhoneToInternational(t.noHp));
}

// Auto-detect nomor WhatsApp dari data guru
function autoDetectNotifNumbers() {
    const detectedHeadmaster = findHeadmasterPhone();
    const detectedPickets = findPicketPhones();
    
    // Kepala Sekolah: FIXED, hanya dari data guru, tidak bisa di-override
    if (detectedHeadmaster) {
        notifConfig.headmasterPhone = detectedHeadmaster;
    }
    
    // Guru Piket: isi array dari data guru
    notifConfig.picketPhones = detectedPickets;
    
    // Update field di UI
    const hmField = document.getElementById('notif-headmaster-phone');
    const pkField1 = document.getElementById('notif-picket-phone-1');
    const pkField2 = document.getElementById('notif-picket-phone-2');
    
    if (hmField) hmField.value = notifConfig.headmasterPhone;
    if (pkField1) pkField1.value = notifConfig.picketPhones[0] || '';
    if (pkField2) pkField2.value = notifConfig.picketPhones[1] || '';
    
    // Simpan otomatis
    localStorage.setItem('qr_presensi_notif_config', JSON.stringify(notifConfig));
}

// Load konfigurasi + auto-detect nomor dari data guru
function loadNotifConfig() {
    try {
        // Baca simpanan sebelumnya (jika ada)
        const saved = localStorage.getItem('qr_presensi_notif_config');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.picketPhones)) {
                    notifConfig.picketPhones = parsed.picketPhones;
                }
            } catch (e) { /* ignore parse error */ }
        }
        
        // Auto-detect nomor dari data guru (prioritas utama untuk kepala sekolah)
        autoDetectNotifNumbers();
        
        // Tampilkan di field
        const hmField = document.getElementById('notif-headmaster-phone');
        const pkField1 = document.getElementById('notif-picket-phone-1');
        const pkField2 = document.getElementById('notif-picket-phone-2');
        
        if (hmField) hmField.value = notifConfig.headmasterPhone;
        if (pkField1) pkField1.value = notifConfig.picketPhones[0] || '';
        if (pkField2) pkField2.value = notifConfig.picketPhones[1] || '';
        
        // Auto-detect ulang setelah 1 detik (tunggu data guru ter-render)
        setTimeout(autoDetectNotifNumbers, 1000);
        
    } catch (e) {
        console.warn('Gagal load konfigurasi notifikasi:', e);
        setTimeout(autoDetectNotifNumbers, 1000);
    }
}

// Simpan konfigurasi notifikasi dari input manual (khusus guru piket)
function saveNotifConfig() {
    const pkField1 = document.getElementById('notif-picket-phone-1');
    const pkField2 = document.getElementById('notif-picket-phone-2');
    
    // Baca nomor dari input manual
    const phone1 = pkField1 ? pkField1.value.trim() : '';
    const phone2 = pkField2 ? pkField2.value.trim() : '';
    
    // Kumpulkan nomor yang valid
    const phones = [];
    if (phone1) phones.push(phone1);
    if (phone2) phones.push(phone2);
    
    // Validasi format nomor (harus angka)
    for (const phone of phones) {
        if (!/^\d+$/.test(phone)) {
            alert('Nomor WhatsApp tidak valid! Harus berupa angka (format: 628xxx)');
            return;
        }
    }
    
    notifConfig.picketPhones = phones;
    localStorage.setItem('qr_presensi_notif_config', JSON.stringify(notifConfig));
    alert('✅ Konfigurasi nomor Guru Piket berhasil disimpan!');
}

window.saveNotifConfig = saveNotifConfig;

// Refresh nomor Kepala Sekolah dari data guru (dipanggil tombol Refresh di UI)
function refreshHeadmasterPhone() {
    const detected = findHeadmasterPhone();
    if (detected) {
        notifConfig.headmasterPhone = detected;
        const hmField = document.getElementById('notif-headmaster-phone');
        if (hmField) hmField.value = detected;
        localStorage.setItem('qr_presensi_notif_config', JSON.stringify(notifConfig));
        alert('✅ Nomor Kepala Sekolah berhasil diperbarui: ' + detected);
    } else {
        alert('⚠️ Tidak ditemukan guru dengan jabatan "Kepala Sekolah". Pastikan data guru sudah diisi dengan jabatan yang benar.');
    }
}

window.refreshHeadmasterPhone = refreshHeadmasterPhone;

// Kirim notifikasi izin/sakit via WhatsApp
function sendIzinWhatsAppNotification(teacherName, type, keterangan, dateStr) {
    try {
        const jenisLabel = type === 'sakit' ? 'SAKIT 🤒' : 'IZIN 📋';
        const todayFormatted = dateStr || getTodayDateStr();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const dayName = getDayName(now);
        
        // Format pesan WhatsApp
        const message = `🔔 *NOTIFIKASI KETIDAKHADIRAN GURU*\n━━━━━━━━━━━━━━━━━━\n\n📋 *Jenis:* ${jenisLabel}\n👤 *Guru:* ${teacherName}\n📅 *Tanggal:* ${dayName}, ${todayFormatted}\n⏰ *Waktu Lapor:* ${timeStr}\n📝 *Alasan:* ${keterangan}\n\n━━━━━━━━━━━━━━━━━━\n_Pesan ini dikirim otomatis oleh sistem presensi E_PGSkabida_`;
        
        // Kirim ke Kepala Sekolah
        if (notifConfig.headmasterPhone) {
            const waUrl1 = `https://wa.me/${notifConfig.headmasterPhone}?text=${encodeURIComponent(message)}`;
            window.open(waUrl1, '_blank');
        }
        
        // Kirim ke SEMUA Guru Piket (dengan jeda agar tidak di-block browser popup)
        if (notifConfig.picketPhones && notifConfig.picketPhones.length > 0) {
            notifConfig.picketPhones.forEach((phone, idx) => {
                setTimeout(() => {
                    if (phone) {
                        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
                        window.open(waUrl, '_blank');
                    }
                }, 800 + (idx * 500)); // jeda 800ms, +500ms per nomor tambahan
            });
        }
        
        console.log('Notifikasi WhatsApp dikirim:', { teacherName, type, keterangan });
        
    } catch (e) {
        console.warn('Gagal mengirim notifikasi WhatsApp:', e);
    }
}

// Panggil loadNotifConfig saat inisialisasi
document.addEventListener('DOMContentLoaded', () => {
    loadNotifConfig();
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

// ===================== QR CODE GENERATOR =====================
let currentQRToken = "";

function generateAdminQR(token) {
    const container = document.getElementById('qr-code-display');
    if (!container) return;
    
    container.innerHTML = "";
    
    if (typeof QRCode === 'undefined') {
        container.innerHTML = '<div style="text-align:center; color:#64748b;"><i class="fa-solid fa-spinner fa-spin" style="font-size:40px;"></i><br><small>Memuat library QR...</small></div>';
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
        const img = container.querySelector('img');
        if(img) { img.style.cssText = 'width:100%;height:100%;border-radius:4px;'; }
        const cvs = container.querySelector('canvas');
        if(cvs) { cvs.style.cssText = 'width:100%;height:100%;border-radius:4px;'; }
    } catch(e) {
        console.error("QRCode error:", e);
    }
}

function updateAdminClock() {
    if(currentUser?.role !== 'admin') return;
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('id-ID');
    document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
        document.getElementById('tab-' + item.getAttribute('data-tab')).classList.add('active');
        
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
    if(countEl) countEl.textContent = todaysLogs.length + ' Aktivitas';
    
    if (todaysLogs.length === 0) {
        feedContainer.innerHTML = '<div class="feed-empty"><p>Belum ada aktivitas presensi hari ini.</p></div>';
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
    
    feedItems.sort((a,b) => new Date('1970/01/01 ' + b.time) - new Date('1970/01/01 ' + a.time));
    
    feedItems.forEach(item => {
        let badge = "badge-success";
        if (item.action === 'Terlambat') badge = "badge-warning";
        else if (item.action === 'Pulang') badge = "badge-secondary";
        else if (item.action === 'IZIN' || item.action === 'SAKIT') badge = "badge-info";
        
        const avatarStr = (item.name || "GU").substring(0, 2).toUpperCase();
        const displayTime = (item.time || "00:00").substring(0, 5);
        
        feedContainer.innerHTML += '<div class="feed-item"><div class="feed-user"><div class="feed-avatar">' + avatarStr + '</div><div class="feed-info"><h4>' + item.name + '</h4><p>' + item.ket + '</p></div></div><div style="text-align:right;"><span class="feed-time">' + displayTime + '</span><br><span class="badge ' + badge + '">' + item.action + '</span></div></div>';
    });
}

// ADMIN: GURU
function renderTeachersTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("teachers-list-body");
    if(!tbody) return;
    
    const searchInput = document.getElementById("search-teacher");
    const search = searchInput ? searchInput.value.toLowerCase() : "";
    
    tbody.innerHTML = "";
    const filtered = state.teachers.filter(t => (t.name || "").toLowerCase().includes(search));
    
    if(filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:16px; color:var(--text-muted);">Tidak ada data guru ditemukan.</td></tr>';
        return;
    }
    
    filtered.forEach(t => {
        const avatarStr = (t.name || "GU").substring(0, 2).toUpperCase();
        const jabatan = t.jabatan || '-';
        const nohp = t.noHp || '-';
        tbody.innerHTML += '<tr><td><div class="feed-avatar">' + avatarStr + '</div></td><td><strong>' + (t.name || "-") + '</strong></td><td>' + jabatan + '</td><td>' + nohp + '</td><td>' + (t.nip || "-") + '</td><td>' + (t.picketDay || "-") + '</td><td>' + (t.picketCheckIn || '-') + '</td><td><div class="action-buttons"><button class="btn-icon" title="Jadwal" onclick="openJadwalForTeacher(\'' + t.id + '\')"><i class="fa-solid fa-calendar-week"></i></button><button class="btn-icon" title="Edit" onclick="editTeacher(\'' + t.id + '\')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" title="Hapus" onclick="deleteTeacher(\'' + t.id + '\')"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
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
    const jabatanEl = document.getElementById("teacher-jabatan");
    const nohpEl = document.getElementById("teacher-nohp");
    const newData = {
        id,
        name: document.getElementById("teacher-name").value,
        nip: document.getElementById("teacher-nip").value,
        jabatan: jabatanEl ? jabatanEl.value : 'Guru Mapel',
        noHp: nohpEl ? nohpEl.value.trim() : '',
        picketDay: document.getElementById("teacher-picket").value,
        picketCheckIn: document.getElementById("teacher-checkin").value
    };
    saveData("teachers", id, newData).then(() => teacherModal.classList.add("hidden"));
});

window.editTeacher = function(id) {
    const t = state.teachers.find(t => t.id === id);
    if (!t) return;
    document.getElementById("teacher-id").value = t.id;
    document.getElementById("teacher-name").value = t.name;
    document.getElementById("teacher-nip").value = t.nip;
    const jabatanEl = document.getElementById("teacher-jabatan");
    const nohpEl = document.getElementById("teacher-nohp");
    if (jabatanEl) jabatanEl.value = t.jabatan || 'Guru Mapel';
    if (nohpEl) nohpEl.value = t.noHp || '';
    document.getElementById("teacher-picket").value = t.picketDay;
    document.getElementById("teacher-checkin").value = t.picketCheckIn || "07:00";
    teacherModal.classList.remove("hidden");
}

window.deleteTeacher = function(id) {
    if (confirm("Hapus guru ini? Ini juga akan menghapus jadwal mengajarnya.")) { 
        deleteData("teachers", id); 
        state.schedules.filter(s => s.teacherId === id).forEach(s => deleteData("schedules", s.id));
    }
}

function populateTeacherDropdownsAdmin() {
    const s1 = document.getElementById("select-jadwal-teacher");
    const s2 = document.getElementById("att-teacher-id");
    const previousJadwalTeacherId = s1?.value || '';
    const previousAttendanceTeacherId = s2?.value || '';

    if(s1) s1.innerHTML = '<option value="">-- Pilih Guru --</option>';
    if(s2) s2.innerHTML = '';
    state.teachers.forEach(t => {
        if(s1) s1.innerHTML += '<option value="' + t.id + '">' + t.name + '</option>';
        if(s2) s2.innerHTML += '<option value="' + t.id + '">' + t.name + '</option>';
    });

    if (s1 && previousJadwalTeacherId) {
        s1.value = state.teachers.some(t => t.id === previousJadwalTeacherId) ? previousJadwalTeacherId : '';
    }
    if (s2 && previousAttendanceTeacherId) {
        s2.value = state.teachers.some(t => t.id === previousAttendanceTeacherId) ? previousAttendanceTeacherId : '';
    }
}

// ADMIN: JADWAL
const selectJadwalTeacher = document.getElementById("select-jadwal-teacher");
selectJadwalTeacher?.addEventListener("change", populateJadwalGrid);

function populateJadwalGrid() {
    const tId = selectJadwalTeacher.value;
    const grid = document.getElementById("jadwal-week-grid");
    if(!tId) { grid.innerHTML = '<p style="padding:20px; grid-column:1/-1;">Pilih guru terlebih dahulu.</p>'; return; }
    
    const t = state.teachers.find(x => x.id === tId);
    grid.innerHTML = "";

    const now = new Date();
    const dayNameNow = getDayName(now);
    const nowMin = parseHHmmToMinutes(getNowHHmm());

    ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].forEach(day => {
        const sch = state.schedules.find(s => s.teacherId === tId && s.day === day);
        let entries = [];

        if (day === 'Jumat') {
            grid.innerHTML += '<div class="jadwal-day-card" onclick="openJadwalModal(\'' + day + '\')"><div class="jadwal-day-header">' + day + '</div><div class="jadwal-day-body"><div style="font-size:11px; color: var(--text-secondary); margin-bottom:10px;">Status: <strong style="color:var(--text-main);">Libur</strong></div><div class="jadwal-entry" style="background: rgba(16,185,129,0.10); border-left-color: #10b981;">Jumat = Libur</div></div></div>';
            return;
        }

        if (sch && sch.entries && sch.entries.length > 0) {
            entries = [...sch.entries];
        }
        if (isPicketScheduled(t, day)) {
            entries.push({ jamMulai: t.picketCheckIn || '06:45', jamSelesai: '', mapel: 'Guru Piket', kelas: '' });
        }

        entries.sort((a, b) => (a.jamMulai || '00:00').localeCompare(b.jamMulai || '00:00'));

        const startJam = entries[0]?.jamMulai || '-';

        let nextInfoHtml = '';
        if (day === dayNameNow && nowMin !== null && entries.length > 0) {
            const nextEntry = entries.find(e => {
                const m = parseHHmmToMinutes(e.jamMulai);
                return m !== null && m > nowMin;
            });

            if (nextEntry) {
                nextInfoHtml = '<div class="jadwal-entry" style="background: rgba(91,134,182,0.10); border-left-color: #5b86b6;">Next: ' + nextEntry.jamMulai + ' - ' + nextEntry.mapel + (nextEntry.kelas ? ' (' + nextEntry.kelas + ')' : '') + '</div>';
            } else {
                nextInfoHtml = '<div class="jadwal-entry" style="background: rgba(16,185,129,0.10); border-left-color: #10b981;">Selesai semua kelas hari ini</div>';
            }
        }

        let eHtml = '';
        if(entries.length > 0) {
            entries.forEach(e => {
                const jamSelesaiStr = e.jamSelesai ? ' - ' + e.jamSelesai : '';
                eHtml += '<div class="jadwal-entry">' + e.jamMulai + jamSelesaiStr + ' - ' + e.mapel + ' (' + e.kelas + ')</div>';
            });
        }

        grid.innerHTML += '<div class="jadwal-day-card" onclick="openJadwalModal(\'' + day + '\')"><div class="jadwal-day-header">' + day + '</div><div class="jadwal-day-body"><div style="font-size:11px; color: var(--text-secondary); margin-bottom:10px;">Mulai: <strong style="color:var(--text-main);">' + startJam + '</strong></div>' + nextInfoHtml + eHtml + '</div></div>';
    });
}

window.openJadwalForTeacher = function(id) {
    navItems.forEach(n => n.classList.remove('active'));
    document.querySelector('[data-tab="jadwal"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-jadwal').classList.add('active');
    selectJadwalTeacher.value = id;
    populateJadwalGrid();
}

const jadwalModal = document.getElementById("jadwal-modal");
window.openJadwalModal = function(day) {
    const tId = selectJadwalTeacher.value;
    document.getElementById("jadwal-teacher-id").value = tId;
    document.getElementById("jadwal-day").value = day;
    document.getElementById("jadwal-day-display").value = day;

    const tObj = state.teachers.find(x => x.id === tId);
    const teacherNameInput = document.getElementById("jadwal-teacher-name-display");
    if(teacherNameInput && tObj?.name) teacherNameInput.value = tObj.name;

    const sch = state.schedules.find(s => s.teacherId === tId && s.day === day);
    const container = document.getElementById("jadwal-entries-container");
    container.innerHTML = "";
    
    if (sch && sch.entries.length > 0) {
        sch.entries.forEach(e => addJadwalEntryRow(e.jamMulai, e.jamSelesai, e.mapel, e.kelas));
    } else {
        addJadwalEntryRow();
    }
    jadwalModal.classList.remove("hidden");
}
document.getElementById("btn-close-jadwal-modal").addEventListener("click", () => jadwalModal.classList.add("hidden"));
document.getElementById("btn-add-jadwal-entry").addEventListener("click", () => addJadwalEntryRow());

function addJadwalEntryRow(jamMulai, jamSelesai, mapel, kelas) {
    jamMulai = jamMulai || "07:00";
    jamSelesai = jamSelesai || "07:50";
    mapel = mapel || "";
    kelas = kelas || "";
    const container = document.getElementById("jadwal-entries-container");
    if(!container) return;

    const div = document.createElement("div");
    div.innerHTML = '<div style="display:flex; gap:10px; margin-bottom:5px;"><input type="time" class="j-jam" value="' + jamMulai + '" required><input type="time" class="j-jam-selesai" value="' + jamSelesai + '" required><input type="text" class="j-mapel" value="' + mapel + '" placeholder="Mapel" required><input type="text" class="j-kelas" value="' + kelas + '" placeholder="Kelas" required><button type="button" class="btn-icon" onclick="this.parentElement.parentElement.remove()" style="background:rgba(239, 68, 68, 0.2); color:#ef4444;"><i class="fa-solid fa-xmark"></i></button></div>';
    container.appendChild(div);
}

document.getElementById("btn-save-jadwal").addEventListener("click", () => {
    const tId = document.getElementById("jadwal-teacher-id").value;
    const day = document.getElementById("jadwal-day").value;
    const container = document.getElementById("jadwal-entries-container");
    if (!container) return;

    const rows = container.querySelectorAll("div > div");
    const rawEntries = [];

    rows.forEach(row => {
        const jamMulai = row.querySelector(".j-jam")?.value;
        const jamSelesai = row.querySelector(".j-jam-selesai")?.value;
        const mapel = row.querySelector(".j-mapel")?.value;
        const kelas = row.querySelector(".j-kelas")?.value;

        if (!jamMulai || !mapel || !mapel.trim()) return;
        rawEntries.push({ jamMulai, jamSelesai: jamSelesai || "", mapel: mapel.trim(), kelas: (kelas || "").trim() });
    });

    const seen = new Set();
    const entries = [];
    rawEntries.forEach(e => {
        const key = e.jamMulai + '|' + e.jamSelesai + '|' + e.mapel + '|' + e.kelas;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(e);
    });

    let schId = "S_" + tId + "_" + day;
    const existing = state.schedules.find(s => s.teacherId === tId && s.day === day);
    if(existing && existing.id) schId = existing.id;

    saveData("schedules", schId, { id: schId, teacherId: tId, day, entries }).then(() => jadwalModal.classList.add("hidden"));
});

// ADMIN: KELOLA KEHADIRAN
document.getElementById("manage-date")?.addEventListener("change", renderManageAttendanceTable);

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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Belum ada data guru. Tambahkan guru di tab Data Guru.</td></tr>';
        return;
    }
    
    state.teachers.forEach(t => {
        const log = state.attendance.find(a => a.teacherId === t.id && a.date === tDate);
        const acuan = getAcuanHadir(t, new Date(tDate + 'T00:00:00'));
        
        const acuanHtml = '<div style="font-size:13px;"><strong>' + acuan.jam + '</strong><br><span style="color:var(--text-muted); font-size:11px;">' + acuan.mapel + '</span></div>';
        let actBtns = '<button class="btn-icon" title="Tambah Presensi" onclick="openAttendanceModal(\'' + t.id + '\',\'' + tDate + '\',null)"><i class="fa-solid fa-plus"></i></button>';
        
        let timeInHtml = '<span style="color:var(--text-muted)">-</span>';
        let timeOutHtml = '<span style="color:var(--text-muted)">-</span>';
        let statusHtml = acuan.wajibHadir 
            ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:var(--color-danger); border-color:rgba(239,68,68,0.3);">Belum Hadir</span>'
            : '<span class="badge" style="background:rgba(100,116,139,0.15); color:var(--text-muted);">Tidak Wajib</span>';
        let ketHtml = '<span style="color:var(--text-muted)">-</span>';
        
        if (log) {
            actBtns = '<button class="btn-icon" title="Edit" onclick="openAttendanceModal(\'' + t.id + '\',\'' + tDate + '\',\'' + log.id + '\')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" title="Hapus" onclick="deleteData(\'attendance\', \'' + log.id + '\')"><i class="fa-solid fa-trash"></i></button>';
            timeInHtml = '<strong style="color:var(--text-main);">' + log.timeIn.substring(0,5) + '</strong>';
            timeOutHtml = log.timeOut ? '<strong style="color:var(--color-info);">' + log.timeOut.substring(0,5) + '</strong>' : '<span style="color:var(--text-muted)">Belum Pulang</span>';
            
            if(log.type === 'izin') statusHtml = '<span class="badge badge-info">Izin</span>';
            else if(log.type === 'sakit') statusHtml = '<span class="badge badge-secondary">Sakit</span>';
            else if(log.type === 'alpa') statusHtml = '<span class="badge badge-danger">Alpa</span>';
            else if(log.statusIn === 'Terlambat') statusHtml = '<span class="badge badge-warning">Terlambat</span>';
            else statusHtml = '<span class="badge badge-success">Tepat Waktu</span>';
            
            if(log.keterangan) ketHtml = '<span style="font-size:12px; color:var(--text-secondary);">' + log.keterangan + '</span>';
        }
        
        tbody.innerHTML += '<tr><td><strong>' + t.name + '</strong></td><td>' + acuanHtml + '</td><td>' + timeInHtml + '</td><td>' + timeOutHtml + '</td><td class="text-center">' + statusHtml + '</td><td>' + ketHtml + '</td><td><div class="action-buttons">' + actBtns + '</div></td></tr>';
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
    
    saveData("attendance", logId, newData).then(() => attModal.classList.add("hidden"));
});

// ADMIN: KELOLA ADMIN
function renderAdminsTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("admins-list-body");
    tbody.innerHTML = "";
    state.admins.forEach(a => {
        let btn = a.username !== 'admin' ? '<button class="btn-icon" onclick="deleteData(\'admins\', \'' + a.id + '\')"><i class="fa-solid fa-trash"></i></button>' : '';
        tbody.innerHTML += '<tr><td>' + a.username + '</td><td><span class="badge badge-info">' + a.role + '</span></td><td><div class="action-buttons">' + btn + '</div></td></tr>';
    });
}
const adminModal = document.getElementById("admin-account-modal");
document.getElementById("btn-add-admin-modal").addEventListener("click", () => adminModal.classList.remove("hidden"));
document.getElementById("btn-close-admin-modal").addEventListener("click", () => adminModal.classList.add("hidden"));
document.getElementById("form-admin-account").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = "A"+Date.now();
    const newData = { id, username: document.getElementById("new-admin-user").value, password: document.getElementById("new-admin-pass").value, role: "admin" };
    saveData("admins", id, newData).then(() => adminModal.classList.add("hidden"));
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

function getSelectedReportMonthValue() {
    const selectedMonthEl = document.getElementById('select-report-month');
    const now = new Date();
    const defaultMonthValue = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    return selectedMonthEl?.value || defaultMonthValue;
}

function getLastWorkingDayOfMonth(monthValue) {
    if (!monthValue || !monthValue.includes('-')) {
        return getTodayDateStr();
    }

    const [year, month] = monthValue.split('-').map(Number);
    if (Number.isNaN(year) || Number.isNaN(month)) {
        return getTodayDateStr();
    }

    let date = new Date(year, month, 0);
    for (let i = 0; i < 31; i++) {
        const dayName = getDayName(date);
        if (dayName !== 'Jumat' && dayName !== 'Sabtu' && dayName !== 'Minggu') {
            return formatDateStr(date);
        }
        date.setDate(date.getDate() - 1);
    }

    return formatDateStr(new Date(year, month - 1, 1));
}

function getMonthLabelFromValue(monthValue) {
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    if (!monthValue || !monthValue.includes('-')) return '';
    const [yr, mo] = monthValue.split('-');
    const monthIndex = parseInt(mo, 10) - 1;
    if (Number.isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return '';
    return monthNames[monthIndex] + ' ' + yr;
}

function updateExportPdfButtonLabels() {
    const monthSelect = document.getElementById('select-report-month');
    const pdfButton = document.getElementById('btn-export-pdf');
    const izinButton = document.getElementById('btn-export-izin-sakit');
    if (!monthSelect) return;

    const monthValue = monthSelect.value;
    const monthLabel = getMonthLabelFromValue(monthValue);
    if (pdfButton) {
        pdfButton.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Export PDF Presensi - ' + monthLabel;
    }
    if (izinButton) {
        izinButton.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Export PDF Izin / Sakit - ' + monthLabel;
    }
}

function renderReports() {
    if(currentUser?.role !== 'admin') return;
    const sel = document.getElementById("select-report-month"); 
    if(!sel) return;
    const m = sel.value;
    const tbody = document.getElementById("report-list-body"); 
    tbody.innerHTML = "";
    
    if(state.teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">Belum ada data guru.</td></tr>';
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

        tbody.innerHTML += '<tr><td><strong>' + item.teacher.name + '</strong></td><td class="text-center"><strong>' + item.hadirTotal + '</strong></td><td class="text-center" style="color:var(--color-success)">' + item.tepat + '</td><td class="text-center" style="color:var(--color-warning)">' + item.lambat + '</td><td class="text-center" style="color:var(--color-info)">' + item.izinSakit + '</td><td class="text-center" style="color:var(--color-danger)">' + item.alpa + '</td><td class="text-right"><div style="font-weight:700; color:' + skorColor + ';">' + (item.skor === '-' ? '-' : item.skor + '/100') + '</div><div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">' + item.label + '</div></td></tr>';
    });
}

if(document.getElementById("select-report-month")) {
    const sel = document.getElementById("select-report-month");
    sel.innerHTML = "";
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const now = new Date();
    for(let i = 0; i < 4; i++) {
        let month = now.getMonth() - i;
        let year = now.getFullYear();
        if(month < 0) { month += 12; year -= 1; }
        const val = year + '-' + ((month+1).toString().padStart(2,'0'));
        const label = monthNames[month] + ' ' + year;
        sel.innerHTML += '<option value="' + val + '">' + label + '</option>';
    }
    sel.addEventListener("change", () => {
        renderReports();
        updateExportPdfButtonLabels();
    });
    updateExportPdfButtonLabels();
}

function exportReportCsv() {
    const m = document.getElementById("select-report-month").value;
    const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
    const [yr, mo] = m.split('-');
    const monthLabel = monthNames[parseInt(mo)-1] + ' ' + yr;

    const rows = [];
    rows.push('"Laporan Presensi Guru - ' + monthLabel + '"');
    rows.push('"Nama Guru","Total Hadir","Tepat Waktu","Terlambat","Izin / Sakit","Alpa","Skor","Keterangan Penilaian"');

    const summaryRows = buildReportSummary(m);
    summaryRows.forEach((item) => {
        const skorText = item.skor === '-' ? '-' : item.skor + '/100';
        rows.push('"' + item.teacher.name + '",' + item.hadirTotal + ',' + item.tepat + ',' + item.lambat + ',' + item.izinSakit + ',' + item.alpa + ',"' + skorText + '","' + item.label + '"');
    });

    rows.push('');
    rows.push('"Keterangan Skor"');
    rows.push('"90-100 = Sangat Baik"');
    rows.push('"80-89 = Baik"');
    rows.push('"70-79 = Cukup"');
    rows.push('"< 70 = Perlu Perbaikan"');

    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(rows.join("\n"));
    const link = document.createElement("a");
    link.href = csvContent;
    link.download = 'Laporan_Presensi_' + m + '.csv';
    link.click();
}


function drawWatermark(doc, pageWidth, pageHeight) {
    // Watermark PDF diperlunak sebagai teks umum agar semua dokumen
    // memiliki tampilan background yang konsisten tanpa mengandalkan logo spesifik.
    try {
        const label = 'DOKUMEN DIGITAL';
        const fontSize = Math.max(24, Math.min(34, pageWidth * 0.14));
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(220, 220, 220);
        doc.text(label, pageWidth / 2 + 10, pageHeight / 2 + 5, {
            align: 'center',
            angle: -30
        });
        doc.setTextColor(0, 0, 0);
    } catch (e) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(220, 220, 220);
        doc.text('DOKUMEN DIGITAL', pageWidth / 2 + 10, pageHeight / 2 + 5, {
            align: 'center',
            angle: -30
        });
        doc.setTextColor(0, 0, 0);
    }
}

function loadPdfLogos(callback) {
    const logoLeft = new Image();
    const logoRight = new Image();
    let loaded = 0;
    const total = 2;

    function onLoad() {
        loaded++;
        if (loaded >= total) {
            callback(logoLeft, logoRight);
        }
    }

    logoLeft.onload = onLoad;
    logoLeft.onerror = onLoad;
    logoRight.onload = onLoad;
    logoRight.onerror = onLoad;

    logoLeft.src = 'logo.png';
    logoRight.src = 'img_smk_bisa.png';
}

function drawPdfHeader(doc, pageWidth, marginLeft, marginRight, yStart, logoLeft, logoRight) {
    // Gambar logo kiri (logo.png - 60x60mm)
    if (logoLeft && logoLeft.width > 0) {
        try {
            doc.addImage(logoLeft, 'PNG', marginLeft, yStart - 5, 14, 14);
        } catch (e) {
            // ignore if image fails
        }
    }

    // Gambar logo kanan (img_smk_bisa.png - lebih lebar)
    if (logoRight && logoRight.width > 0) {
        try {
            const rW = 18, rH = 12;
            doc.addImage(logoRight, 'PNG', pageWidth - marginRight - rW, yStart - 3, rW, rH);
        } catch (e) {
            // ignore
        }
    }

    let y = yStart;
    doc.setFont('Times', 'bold');
    doc.setFontSize(14);
    doc.text('SMK BIDAYATUL HIDAYAH', pageWidth / 2, y + 2, { align: 'center' });
    y += 7;
    doc.setFont('Times', 'normal');
    doc.setFontSize(9);
    doc.text('Jl. Padangasri Ds. Mojogeneng Kec. Jatirejo, Mojokerto', pageWidth / 2, y + 2, { align: 'center' });
    y += 5;
    doc.text('smk.bidayatulhidayah@gmail.com | smkbidayatulhidayah.sch.id', pageWidth / 2, y + 2, { align: 'center' });
    y += 5;
    // Garis pemisah double
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 1.5;
    doc.setLineWidth(0.4);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 8;

    return y; // kembalikan posisi y terakhir
}

function exportReportPdf() {
    const m = getSelectedReportMonthValue();
    const monthLabel = getMonthLabelFromValue(m);
    const printedDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Library PDF belum siap. Silakan refresh halaman dan coba lagi.');
        return;
    }

    // Muat logo dulu, baru generate PDF
    loadPdfLogos((logoLeft, logoRight) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
        const marginLeft = 14;
        const marginRight = 14;
        const contentWidth = pageWidth - marginLeft - marginRight;

        // ---- WATERMARK umum di tengah halaman ----
        drawWatermark(doc, pageWidth, pageHeight);

        // ---- HEADER (Kop Surat) ----
        let y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, 18, logoLeft, logoRight);

        // ---- JUDUL LAPORAN ----
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('LAPORAN PRESENSI GURU DIGITAL', pageWidth / 2, y, { align: 'center' });
        y += 6;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Presensi pada bulan ' + monthLabel, pageWidth / 2, y, { align: 'center' });
        y += 4;
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Periode: ' + m, pageWidth / 2, y, { align: 'center' });
        y += 4;
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        doc.text('Dicetak tanggal: ' + printedDate, pageWidth / 2, y, { align: 'center' });
        y += 8;

        // ---- TABEL RINGKAS PRESENSI ----
        // Susunan mengikuti acuan: No, Nama Guru, Hadir, Poin, Catatan Terakhir.
        const colX = {
            no: marginLeft,
            nama: marginLeft + 10,
            hadir: marginLeft + 82,
            poin: marginLeft + 101,
            catatan: marginLeft + 122
        };
        const summaryRows = buildReportSummary(m);
        const tableBorders = [marginLeft + 10, marginLeft + 82, marginLeft + 101, marginLeft + 122];
        const drawTableGrid = (top, bottom) => {
            doc.setDrawColor(65, 65, 65);
            doc.setLineWidth(0.2);
            tableBorders.forEach(x => doc.line(x, top, x, bottom));
        };

        const drawTableHeader = () => {
            doc.setFillColor(204, 204, 204);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.3);
            doc.rect(marginLeft, y - 4.8, contentWidth, 7, 'FD');
            drawTableGrid(y - 4.8, y + 2.2);
            doc.setFont('Helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.text('No', colX.no + 2, y);
            doc.text('Nama Guru', colX.nama + 2, y);
            doc.text('Hadir', colX.hadir + 2, y);
            doc.text('Poin', colX.poin + 2, y);
            doc.text('Catatan Terakhir', colX.catatan + 2, y);
            y += 7;
        };

        drawTableHeader();
        let pageNum = 1;

        summaryRows.forEach((item, index) => {
            // Cek apakah perlu halaman baru (sisakan ruang untuk footer)
            // Sisakan ruang untuk keterangan status dan tiga tanda tangan.
            const latestLog = [...item.logs].sort((a, b) =>
                (b.date + (b.timeIn || '')).localeCompare(a.date + (a.timeIn || ''))
            )[0];
            const lastNote = latestLog
                ? (latestLog.type === 'hadir'
                    ? (latestLog.statusIn || 'Hadir')
                    : latestLog.type.charAt(0).toUpperCase() + latestLog.type.slice(1))
                : '-';
            const noteLines = doc.splitTextToSize(lastNote || '-', 52);
            const rowHeight = Math.max(7, 5.4 + ((noteLines.length - 1) * 3.6));

            if (y + rowHeight > pageHeight - 60) {
                doc.setFont('Helvetica', 'italic');
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });
                doc.addPage();
                pageNum++;

                // Watermark di halaman baru
                drawWatermark(doc, pageWidth, pageHeight);

                y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, 18, logoLeft, logoRight);
                drawTableHeader();
            }

            const points = item.skor === '-' ? 0 : item.skor;

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.2);
            doc.rect(marginLeft, y - 4.8, contentWidth, rowHeight, 'S');
            drawTableGrid(y - 4.8, y - 4.8 + rowHeight);
            doc.text(String(index + 1), colX.no + 2, y);
            doc.text(doc.splitTextToSize(item.teacher.name, 68)[0], colX.nama + 2, y);
            doc.text(item.hadirTotal + ' hr', colX.hadir + 2, y);
            doc.text(points + '/100', colX.poin + 2, y);
            doc.text(noteLines, colX.catatan + 2, y + 1.2);
            y += rowHeight;
        });

        if (summaryRows.length === 0) {
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(8);
            doc.text('Belum ada data presensi pada periode ini.', marginLeft + 2, y);
            y += 10;
        }

        // Keterangan penilaian sesuai format laporan acuan.
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Keterangan:', marginLeft, y + 3);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('- Tepat Waktu: 100 Poin', marginLeft + 4, y + 7);
        doc.text('- Izin / Sakit: 80 Poin', marginLeft + 4, y + 11);
        doc.text('- Terlambat: 70 Poin', marginLeft + 4, y + 15);
        doc.text('- Alpa / Tanpa Keterangan: 0 Poin', marginLeft + 4, y + 19);
        y += 25;

    // ---- FOOTER / TANDA TANGAN ---- (dengan watermark & header otomatis)
        if (y > pageHeight - 55) {
            doc.setFont('Helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });
            doc.addPage();
            pageNum++;
            y = 18;
            // Watermark di halaman baru
            drawWatermark(doc, pageWidth, pageHeight);
            y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, y, logoLeft, logoRight);
        }

        // Gunakan drawPdfFooter yang sudah mengambil nama otomatis dari data guru
        // Kirim tanggal pertama bulan laporan untuk mencari petugas piket yang sesuai
        const footerSignatureDate = getLastWorkingDayOfMonth(m);
        drawPdfFooter(doc, pageWidth, marginLeft, marginRight, y, footerSignatureDate);

        y += 48;
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text('Dicetak dari sistem presensi guru digital SMK Bidayatul Hidayah - ' + printedDate, pageWidth / 2, y, { align: 'center' });

        // Nomor halaman terakhir
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });

        doc.save('Laporan_Presensi_' + m + '.pdf');
    });
}

// Helper: cari nama guru berdasarkan jabatan dari data guru
function findTeacherNameByJabatan(keyword) {
    if (!state.teachers || state.teachers.length === 0) return '';
    const t = state.teachers.find(t => t.jabatan && t.jabatan.toLowerCase().includes(keyword.toLowerCase()));
    return t ? t.name : '';
}

// Helper: cari nama Kepala Sekolah
function findHeadmasterName() {
    const name = findTeacherNameByJabatan('kepala sekolah');
    return name || 'Kepala Sekolah';
}

// Helper: cari nama Kepala Tata Usaha
function findTUName() {
    if (!state.teachers || state.teachers.length === 0) return 'Kepala Tata Usaha';
    const tuTeacher = state.teachers.find(t => {
        const jabatan = (t.jabatan || '').toLowerCase();
        return jabatan.includes('tata usaha') || (jabatan.includes('tu') && jabatan.includes('usaha'));
    });
    return tuTeacher ? tuTeacher.name : 'Kepala Tata Usaha';
}

// Helper: cari nama Petugas Piket berdasarkan tanggal tertentu
function findPicketName(dateStr) {
    if (!state.teachers || state.teachers.length === 0) return 'Petugas Piket';
    const targetDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    const dayName = getDayName(targetDate);
    const t = state.teachers.find(t => isPicketScheduled(t, dayName) && t.name);
    return t ? t.name : 'Petugas Piket';
}

function findPicketTeachers(dateStr) {
    const targetDate = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    const dayName = getDayName(targetDate);
    return state.teachers
        .filter(teacher => isPicketScheduled(teacher, dayName) && teacher.name)
        .sort((a, b) => (a.picketCheckIn || '12:00').localeCompare(b.picketCheckIn || '12:00'))
        .slice(0, 2);
}

function drawPicketFooter(doc, pageWidth, marginLeft, marginRight, y, reportDateStr) {
    const pickets = findPicketTeachers(reportDateStr);
    const printedDate = new Date(reportDateStr + 'T00:00:00').toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
    const leftX = marginLeft + 45;
    const rightX = pageWidth - marginRight - 45;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Mojokerto, ' + printedDate, pageWidth - marginRight, y, { align: 'right' });
    doc.text('Guru Piket 1', leftX, y + 15, { align: 'center' });
    doc.text('Guru Piket 2', rightX, y + 15, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(pickets[0]?.name || 'Belum dijadwalkan', leftX, y + 40, { align: 'center' });
    doc.text(pickets[1]?.name || 'Belum dijadwalkan', rightX, y + 40, { align: 'center' });
}

// Helper: draw footer tanda tangan dengan nama otomatis dari data guru
function drawPdfFooter(doc, pageWidth, marginLeft, marginRight, y, reportDateStr) {
    const headmasterName = findHeadmasterName();
    const tuName = findTUName();
    const pickets = findPicketTeachers(reportDateStr);

    const leftX = marginLeft + 35;
    const middleX = pageWidth / 2;
    const rightX = pageWidth - marginRight - 35;
    const printedDate = new Date((reportDateStr ? reportDateStr + 'T00:00:00' : new Date().toISOString())).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Mojokerto, ' + printedDate, pageWidth - marginRight, y, { align: 'right' });

    // Baris atas: Guru piket 1 dan 2
    doc.text('Guru Piket 1', middleX - 35, y + 15, { align: 'center' });
    doc.text('Guru Piket 2', middleX + 35, y + 15, { align: 'center' });

    // Nama atas (piket) otomatis dari data guru
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(pickets[0]?.name || 'Belum dijadwalkan', middleX - 35, y + 40, { align: 'center' });
    doc.text(pickets[1]?.name || 'Belum dijadwalkan', middleX + 35, y + 40, { align: 'center' });

    // Baris bawah: Kepala Sekolah dan Kepala Tata Usaha
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Kepala Sekolah', leftX, y + 62, { align: 'center' });
    doc.text('Kepala Tata Usaha', rightX, y + 62, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(headmasterName, leftX, y + 87, { align: 'center' });
    doc.text(tuName, rightX, y + 87, { align: 'center' });
}

// ==========================================================================
// EXPORT PDF LAPORAN IZIN & SAKIT
// ==========================================================================

function exportIzinSakitPdf() {
    const now = new Date();
    const m = getSelectedReportMonthValue();
    const monthLabel = getMonthLabelFromValue(m);
    const printedDate = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert('Library PDF belum siap. Silakan refresh halaman dan coba lagi.');
        return;
    }

    // Filter data izin/sakit sesuai periode bulan yang dipilih
    const izinSakitLogs = state.attendance.filter(a => 
        (a.type === 'izin' || a.type === 'sakit') && a.date.startsWith(m)
    ).sort((a, b) => a.date.localeCompare(b.date));

    // Muat logo dulu, baru generate PDF
    loadPdfLogos((logoLeft, logoRight) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const marginLeft = 14;
        const marginRight = 14;
        const contentWidth = pageWidth - marginLeft - marginRight;

        // ---- WATERMARK umum di tengah halaman ----
        drawWatermark(doc, pageWidth, pageHeight);

        // ---- HEADER (pake drawPdfHeader) ----
        let y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, 18, logoLeft, logoRight);

        // ---- JUDUL ----
        doc.setFont('Times', 'bold');
        doc.setFontSize(13);
        doc.text('LAPORAN IZIN / SAKIT GURU', pageWidth / 2, y, { align: 'center' });
        y += 6;
        doc.setFont('Times', 'normal');
        doc.setFontSize(10);
        doc.text('Presensi pada bulan ' + monthLabel, pageWidth / 2, y, { align: 'center' });
        y += 4;
        doc.setFont('Times', 'normal');
        doc.setFontSize(9);
        doc.text('Periode: ' + m, pageWidth / 2, y, { align: 'center' });
        y += 4;
        doc.setFont('Times', 'italic');
        doc.setFontSize(8);
        doc.text('Dicetak tanggal: ' + printedDate, pageWidth / 2, y, { align: 'center' });
        y += 8;

    // ---- TABEL IZIN / SAKIT ----
    // Setiap kolom diberi grid dan keterangan dibatasi agar tidak keluar tabel.
    const colX2 = {
        no: marginLeft,
        tgl: marginLeft + 8,
        nama: marginLeft + 31,
        jenis: marginLeft + 80,
        jam: marginLeft + 99,
        keterangan: marginLeft + 117
    };
    const tableBorders2 = [marginLeft + 8, marginLeft + 31, marginLeft + 80, marginLeft + 99, marginLeft + 117];
    const drawGrid2 = (top, bottom) => {
        doc.setDrawColor(65, 65, 65);
        doc.setLineWidth(0.2);
        tableBorders2.forEach(x => doc.line(x, top, x, bottom));
    };
    const drawTableHeader2 = () => {
        doc.setFillColor(204, 204, 204);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.rect(marginLeft, y - 4.8, contentWidth, 7, 'FD');
        drawGrid2(y - 4.8, y + 2.2);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text('No', colX2.no + 2, y);
        doc.text('Tanggal', colX2.tgl + 2, y);
        doc.text('Nama Guru', colX2.nama + 2, y);
        doc.text('Jenis', colX2.jenis + 2, y);
        doc.text('Jam', colX2.jam + 2, y);
        doc.text('Keterangan', colX2.keterangan + 2, y);
        y += 7;
    };
    drawTableHeader2();

    // ---- ISI DATA ----
    let pageNum = 1;

    if (izinSakitLogs.length === 0) {
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text('Belum ada data izin/sakit pada bulan yang dipilih.', marginLeft + 2, y);
        y += 10;
    } else {
        izinSakitLogs.forEach((log, index) => {
            const ketText = (log.keterangan || '-').trim();
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.5);
            const ketLines = doc.splitTextToSize(ketText, 56);
            const rowHeight = Math.max(8, 6 + ((ketLines.length - 1) * 3.6));

            if (y + rowHeight > pageHeight - 58) {
                doc.setFont('Times', 'italic');
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });
                doc.addPage();
                pageNum++;
                y = 20;

                // Watermark di halaman baru
                drawWatermark(doc, pageWidth, pageHeight);

                // Header ulang
                y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, y, logoLeft, logoRight);

                drawTableHeader2();
            }

            const jenisLabel = log.type === 'sakit' ? 'SAKIT' : 'IZIN';
            const jamLabel = log.timeIn ? log.timeIn.substring(0, 5) : '-';

            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(0, 0, 0);
            doc.setDrawColor(65, 65, 65);
            doc.setLineWidth(0.2);
            doc.rect(marginLeft, y - 4.8, contentWidth, rowHeight, 'S');
            drawGrid2(y - 4.8, y - 4.8 + rowHeight);
            doc.text(String(index + 1), colX2.no + 2, y);
            doc.text(log.date, colX2.tgl + 2, y);
            doc.text(doc.splitTextToSize(log.teacherName || '-', 45)[0], colX2.nama + 2, y);
            doc.text(jenisLabel, colX2.jenis + 2, y);
            doc.text(jamLabel, colX2.jam + 2, y);
            doc.text(ketLines, colX2.keterangan + 2, y + 1.5);
            y += rowHeight;
        });
    }

    y += 12;

    // ---- FOOTER (pake drawPdfFooter) ----
    if (y > pageHeight - 55) {
        doc.setFont('Times', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.addPage();
        pageNum++;
        y = 20;
        drawWatermark(doc, pageWidth, pageHeight);
        y = drawPdfHeader(doc, pageWidth, marginLeft, marginRight, y, logoLeft, logoRight);
    }

    // TTD mengikuti dua guru piket pada hari kerja terakhir bulan yang dipilih,
    // menyesuaikan aturan Jumat libur.
    const picketDate = getLastWorkingDayOfMonth(m);
    drawPdfFooter(doc, pageWidth, marginLeft, marginRight, y, picketDate);

    y += 48;
    doc.setFont('Times', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('Dicetak dari sistem presensi guru digital SMK Bidayatul Hidayah - ' + printedDate, pageWidth / 2, y, { align: 'center' });

    doc.setFont('Times', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Halaman ' + pageNum, pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save('Laporan_IzinSakit_' + m + '.pdf');
    });
}

window.exportIzinSakitPdf = exportIzinSakitPdf;

document.getElementById("btn-export-csv")?.addEventListener("click", exportReportCsv);
document.getElementById("btn-export-pdf")?.addEventListener("click", exportReportPdf);

// ==========================================================================
// RUNDOWN ZOOM CONTROLS (Zoom in/out + Touch Pan & Pinch)
// ==========================================================================
let rundownZoomLevel = 100;
let rundownPanX = 0;
let rundownPanY = 0;
const RUNDOWN_ZOOM_MIN = 30;
const RUNDOWN_ZOOM_MAX = 300;
const RUNDOWN_ZOOM_STEP = 15;

function updateRundownZoom() {
    const img = document.getElementById('rundown-png-image');
    const display = document.getElementById('rundown-zoom-display');
    if (img) {
        img.style.transform = `translate(${rundownPanX}px, ${rundownPanY}px) scale(${rundownZoomLevel / 100})`;
        img.style.transformOrigin = '0 0';
    }
    if (display) {
        display.textContent = rundownZoomLevel + '%';
    }
}

function clampPan() {
    const img = document.getElementById('rundown-png-image');
    const wrapper = document.getElementById('rundown-image-wrapper');
    if (!img || !wrapper) return;
    
    const imgW = img.naturalWidth || img.width || 400;
    const imgH = img.naturalHeight || img.height || 200;
    const scale = rundownZoomLevel / 100;
    const scaledW = imgW * scale;
    const scaledH = imgH * scale;
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;
    
    // Max pan: allow overscroll 50px for smooth edge feel
    const maxX = Math.max(0, (scaledW - wrapperW) / 2) + 50;
    const minX = -maxX;
    const maxY = Math.max(0, (scaledH - wrapperH) / 2) + 50;
    const minY = -maxY;
    
    rundownPanX = Math.max(minX, Math.min(maxX, rundownPanX));
    rundownPanY = Math.max(minY, Math.min(maxY, rundownPanY));
    
    // If zoomed out to fit, always center
    if (scaledW <= wrapperW) rundownPanX = 0;
    if (scaledH <= wrapperH) rundownPanY = 0;
}

// Touch pan & pinch state
let rundownTouchState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    panStartX: 0,
    panStartY: 0,
    lastPinchDist: 0,
    lastPinchZoom: 100
};

function setupRundownTouchHandlers() {
    const wrapper = document.getElementById('rundown-image-wrapper');
    if (!wrapper) return;

    // --- Mouse drag support (desktop) ---
    wrapper.addEventListener('mousedown', (e) => {
        if (rundownZoomLevel <= 100) return; // only drag when zoomed in
        rundownTouchState.isDragging = true;
        rundownTouchState.startX = e.clientX;
        rundownTouchState.startY = e.clientY;
        rundownTouchState.panStartX = rundownPanX;
        rundownTouchState.panStartY = rundownPanY;
        wrapper.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!rundownTouchState.isDragging) return;
        const dx = e.clientX - rundownTouchState.startX;
        const dy = e.clientY - rundownTouchState.startY;
        rundownPanX = rundownTouchState.panStartX + dx;
        rundownPanY = rundownTouchState.panStartY + dy;
        clampPan();
        updateRundownZoom();
    });

    document.addEventListener('mouseup', () => {
        if (rundownTouchState.isDragging) {
            rundownTouchState.isDragging = false;
            const wrapper = document.getElementById('rundown-image-wrapper');
            if (wrapper) wrapper.style.cursor = rundownZoomLevel > 100 ? 'grab' : 'default';
        }
    });

    // --- Touch support (mobile touchscreen) ---
    let touchStartTime = 0;
    let touchMoved = false;
    let touchStartX = 0;
    let touchStartY = 0;

    wrapper.addEventListener('touchstart', (e) => {
        const touches = e.touches;
        touchMoved = false;
        touchStartTime = Date.now();

        if (touches.length === 1 && rundownZoomLevel > 100) {
            // Single finger drag: PREVENT DEFAULT agar browser tidak scroll halaman
            e.preventDefault();
            rundownTouchState.isDragging = true;
            touchStartX = touches[0].clientX;
            touchStartY = touches[0].clientY;
            rundownTouchState.startX = touches[0].clientX;
            rundownTouchState.startY = touches[0].clientY;
            rundownTouchState.panStartX = rundownPanX;
            rundownTouchState.panStartY = rundownPanY;
        } else if (touches.length === 2) {
            // Two finger pinch: selalu prevent default
            e.preventDefault();
            rundownTouchState.isDragging = false;
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            rundownTouchState.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            rundownTouchState.lastPinchZoom = rundownZoomLevel;
        }
    }, { passive: false });

    wrapper.addEventListener('touchmove', (e) => {
        const touches = e.touches;
        touchMoved = true;

        if (touches.length === 1 && rundownTouchState.isDragging) {
            // Pan dengan satu jari: selalu prevent default
            e.preventDefault();
            const dx = touches[0].clientX - rundownTouchState.startX;
            const dy = touches[0].clientY - rundownTouchState.startY;
            rundownPanX = rundownTouchState.panStartX + dx;
            rundownPanY = rundownTouchState.panStartY + dy;
            clampPan();
            updateRundownZoom();
        } else if (touches.length === 2) {
            // Pinch zoom dengan dua jari: selalu prevent default
            e.preventDefault();
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (rundownTouchState.lastPinchDist > 0) {
                const scaleFactor = dist / rundownTouchState.lastPinchDist;
                rundownZoomLevel = Math.round(rundownTouchState.lastPinchZoom * scaleFactor);
                rundownZoomLevel = Math.max(RUNDOWN_ZOOM_MIN, Math.min(RUNDOWN_ZOOM_MAX, rundownZoomLevel));
                clampPan();
                updateRundownZoom();
            }
        }
    }, { passive: false });

    wrapper.addEventListener('touchend', (e) => {
        // Reset pinch & drag state
        rundownTouchState.lastPinchDist = 0;
        rundownTouchState.isDragging = false;
        
        // If it was a quick tap (not drag), toggle zoom
        if (!touchMoved && Date.now() - touchStartTime < 300) {
            e.preventDefault(); // Mencegah event click terpicu
            if (rundownZoomLevel <= 100) {
                // Zoom in to 200% centered on tap point
                rundownZoomLevel = 200;
                if (e.changedTouches.length > 0) {
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const touchX = e.changedTouches[0].clientX - wrapperRect.left;
                    const touchY = e.changedTouches[0].clientY - wrapperRect.top;
                    const scale = rundownZoomLevel / 100;
                    const wrapperW = wrapperRect.width;
                    const wrapperH = wrapperRect.height;
                    rundownPanX = -(touchX * scale - wrapperW / 2);
                    rundownPanY = -(touchY * scale - wrapperH / 2);
                }
            } else {
                // Zoom out to fit
                rundownZoomLevel = 100;
                rundownPanX = 0;
                rundownPanY = 0;
            }
            clampPan();
            updateRundownZoom();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const zoomInBtn = document.getElementById('btn-rundown-zoom-in');
    const zoomOutBtn = document.getElementById('btn-rundown-zoom-out');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            rundownZoomLevel = Math.min(RUNDOWN_ZOOM_MAX, rundownZoomLevel + RUNDOWN_ZOOM_STEP);
            clampPan();
            updateRundownZoom();
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            rundownZoomLevel = Math.max(RUNDOWN_ZOOM_MIN, rundownZoomLevel - RUNDOWN_ZOOM_STEP);
            clampPan();
            updateRundownZoom();
        });
    }
    
    // Setup touch drag & pinch handlers
    setupRundownTouchHandlers();
    
    // Reset zoom when modal opens
    const rundownModal = document.getElementById('rundown-modal');
    if (rundownModal) {
        const observer = new MutationObserver(() => {
            if (!rundownModal.classList.contains('hidden')) {
                rundownZoomLevel = 100;
                rundownPanX = 0;
                rundownPanY = 0;
                updateRundownZoom();
            }
        });
        observer.observe(rundownModal, { attributes: true, attributeFilter: ['class'] });
    }
});

// ==========================================================================
// PAGE VISIBILITY API — Refresh notifikasi saat tab kembali aktif
// ==========================================================================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser && currentUser.role === 'guru') {
        // Tab kembali aktif: refresh jadwal notifikasi
        if (rundownClassNotifyTimer) {
            lastRundownClassKey = '';
            tickRundownClassNotify();
        }
    }
});

// ==========================================================================
// BOOTSTRAP
// ==========================================================================
window.addEventListener("load", () => {
    initDatabase();
    
    try {
        const mql = window.matchMedia("(max-width: 768px)");
        const onChange = () => {
            if(!currentUser) return;
            if(currentUser.role === 'admin') {
                navigateTo('view-admin');
                initAdminView();
            } else if(currentUser.role === 'guru') {
                navigateTo('view-guru');
                initGuruView();
            }
        };
        mql.addEventListener('change', onChange);
        onChange();
    } catch(e) {}
});

