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
        if (currentUser && currentUser.role === 'admin') renderAdminsTable();
    });

    // 2. Listen Teachers
    db.collection("teachers").onSnapshot((snapshot) => {
        state.teachers = [];
        snapshot.forEach((doc) => state.teachers.push(doc.data()));
        
        if (!currentUser) renderLoginDropdown();
        if (currentUser && currentUser.role === 'admin') {
            renderTeachersTable();
            populateTeacherDropdownsAdmin();
            renderDashboardStats();
        }
    });

    // 3. Listen Schedules
    db.collection("schedules").onSnapshot((snapshot) => {
        state.schedules = [];
        snapshot.forEach((doc) => state.schedules.push(doc.data()));
        if (currentUser && currentUser.role === 'admin') populateJadwalGrid();
    });

    // 4. Listen Attendance (Hari ini saja untuk performa, tapi di sini kita tarik semua untuk laporan bulanan)
    db.collection("attendance").onSnapshot((snapshot) => {
        state.attendance = [];
        snapshot.forEach((doc) => state.attendance.push(doc.data()));
        
        if (currentUser && currentUser.role === 'admin') {
            renderDashboardStats();
            renderLiveFeed();
            renderManageAttendanceTable();
            renderReports();
        }
        if (currentUser && currentUser.role === 'guru') {
            initGuruView(); // Auto-refresh UI guru jika ada perubahan (misal diaudit admin)
        }
    });
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
    }
}

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
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return days[dateObj.getDay()];
}

function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
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
    
    return { jam: "-", mapel: "Tidak Wajib Hadir", wajibHadir: false };
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
    select.innerHTML = '<option value="">-- Pilih Nama Anda --</option>';
    state.teachers.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.name} (NIP: ${t.nip})</option>`;
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

const scannerOverlay = document.getElementById("scanner-view-overlay");
const successDialog = document.getElementById("success-dialog");

document.getElementById("btn-trigger-scan").addEventListener("click", () => {
    scannerOverlay.classList.remove("hidden");
    
    // Simulate real QR scanning delay (In a real app, this opens the camera)
    setTimeout(() => {
        scannerOverlay.classList.add("hidden");
        // We simulate a successful scan by simply processing the attendance.
        // The QR code for Check-in and Check-out is THE SAME.
        processAttendance(currentUser.data.id);
    }, 1500);
});

document.getElementById("btn-close-scanner").addEventListener("click", () => scannerOverlay.classList.add("hidden"));

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
    
    document.getElementById("admin-name-display").textContent = currentUser.data.username;
    const dt = document.getElementById("manage-date");
    if (!dt.value) dt.value = getTodayDateStr();
    
    renderDashboardStats();
    renderLiveFeed();
    renderTeachersTable();
    populateTeacherDropdownsAdmin();
    renderManageAttendanceTable();
    renderAdminsTable();
    renderReports();
    
    if(adminClockInterval) clearInterval(adminClockInterval);
    adminClockInterval = setInterval(updateAdminClock, 1000);
}

function updateAdminClock() {
    if(currentUser?.role !== 'admin') return;
    const now = new Date();
    document.getElementById('live-time').textContent = now.toLocaleTimeString('id-ID');
    document.getElementById('live-date').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const tokenStr = "QR-" + now.getFullYear() + (now.getMonth()+1) + now.getDate() + "-" + now.getHours() + now.getMinutes();
    
    if (tokenStr !== lastRenderedToken && qrHelper) {
        state.activeToken = btoa(tokenStr).substring(0, 10);
        document.getElementById('active-token').textContent = state.activeToken;
        document.getElementById('qr-code-display').innerHTML = qrHelper.generateMockSVG(state.activeToken);
        lastRenderedToken = tokenStr;
    }
}

document.getElementById("btn-regenerate-qr").addEventListener("click", () => { lastRenderedToken = ""; updateAdminClock(); });

// TABS ADMIN
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        item.classList.add('active');
        const tabId = 'tab-' + item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
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
    const today = getTodayDateStr();
    const todaysLogs = state.attendance.filter(log => log.date === today);
    
    document.getElementById("feed-count").textContent = `${todaysLogs.length} Aktivitas`;
    
    if (todaysLogs.length === 0) {
        feedContainer.innerHTML = `<div class="feed-empty"><p>Belum ada aktivitas presensi hari ini.</p></div>`;
        return;
    }
    
    feedContainer.innerHTML = "";
    
    let feedItems = [];
    todaysLogs.forEach(l => {
        feedItems.push({ name: l.teacherName, time: l.timeIn, action: l.type === 'hadir' ? l.statusIn : l.type.toUpperCase(), ket: l.acuanMapel || l.keterangan });
        if (l.timeOut) {
            feedItems.push({ name: l.teacherName, time: l.timeOut, action: "Pulang", ket: "Selesai Mengajar" });
        }
    });
    
    feedItems.sort((a,b) => new Date(`1970/01/01 ${b.time}`) - new Date(`1970/01/01 ${a.time}`));
    
    feedItems.forEach(item => {
        let badge = "badge-success";
        if (item.action === 'Terlambat') badge = "badge-warning";
        else if (item.action === 'Pulang') badge = "badge-secondary";
        else if (item.action === 'IZIN' || item.action === 'SAKIT') badge = "badge-info";
        
        feedContainer.innerHTML += `
            <div class="feed-item">
                <div class="feed-user">
                    <div class="feed-avatar">${item.name.substring(0,2).toUpperCase()}</div>
                    <div class="feed-info">
                        <h4>${item.name}</h4>
                        <p>${item.ket}</p>
                    </div>
                </div>
                <div style="text-align:right;">
                    <span class="feed-time">${item.time.substring(0,5)}</span><br>
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
    const search = document.getElementById("search-teacher") ? document.getElementById("search-teacher").value.toLowerCase() : "";
    
    tbody.innerHTML = "";
    const filtered = state.teachers.filter(t => t.name.toLowerCase().includes(search));
    
    filtered.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td><div class="feed-avatar">${t.name.substring(0,2).toUpperCase()}</div></td>
                <td>${t.name}</td><td>${t.nip}</td><td>${t.picketDay}</td><td>${t.picketCheckIn || '-'}</td>
                <td><div class="action-buttons"><button class="btn-icon" onclick="openJadwalForTeacher('${t.id}')"><i class="fa-solid fa-calendar-week"></i></button><button class="btn-icon" onclick="editTeacher('${t.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" onclick="deleteTeacher('${t.id}')"><i class="fa-solid fa-trash"></i></button></div></td>
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
    ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].forEach(day => {
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
function renderManageAttendanceTable() {
    if(currentUser?.role !== 'admin') return;
    const tbody = document.getElementById("manage-attendance-body");
    const tDate = document.getElementById("manage-date").value;
    tbody.innerHTML = "";
    
    state.teachers.forEach(t => {
        const log = state.attendance.find(a => a.teacherId === t.id && a.date === tDate);
        const acuan = getAcuanHadir(t, new Date(tDate));
        
        let actBtns = `<button class="btn-icon" onclick="openAttendanceModal('${t.id}','${tDate}',null)"><i class="fa-solid fa-pen"></i></button>`;
        let hHtml = `<td>${t.name}</td><td>${acuan.jam}</td><td>-</td><td>-</td><td>-</td><td>-</td><td><div class="action-buttons">${actBtns}</div></td>`;
        
        if (log) {
            actBtns = `<button class="btn-icon" onclick="openAttendanceModal('${t.id}','${tDate}','${log.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" onclick="deleteData('attendance', '${log.id}')"><i class="fa-solid fa-trash"></i></button>`;
            hHtml = `<td>${t.name}</td><td>${acuan.jam}</td><td>${log.timeIn.substring(0,5)}</td><td>${log.timeOut ? log.timeOut.substring(0,5) : '-'}</td><td><span class="badge ${log.statusIn==='Terlambat'?'badge-warning':(log.type==='hadir'?'badge-success':'badge-info')}">${log.type==='hadir'?log.statusIn:log.type}</span></td><td>${log.keterangan||'-'}</td><td><div class="action-buttons">${actBtns}</div></td>`;
        }
        tbody.innerHTML += `<tr>${hHtml}</tr>`;
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
    const newData = {
        id: logId, teacherId: tId, teacherName: t.name, date: document.getElementById("att-date").value,
        timeIn, timeOut, statusIn: st==='Izin'||st==='Sakit'||st==='Alpa'?'-':st, type: st==='Izin'||st==='Sakit'||st==='Alpa'?st.toLowerCase():'hadir',
        keterangan: document.getElementById("att-keterangan").value, acuanJam: getAcuanHadir(t, new Date()).jam, acuanMapel: getAcuanHadir(t, new Date()).mapel
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
function renderReports() {
    if(currentUser?.role !== 'admin') return;
    const t = document.getElementById("select-report-month"); if(!t) return;
    const m = t.value; // YYYY-MM
    const tbody = document.getElementById("report-list-body"); tbody.innerHTML = "";
    
    state.teachers.forEach(t => {
        const logs = state.attendance.filter(a => a.teacherId === t.id && a.date.startsWith(m));
        const tepat = logs.filter(l => l.type==='hadir' && l.statusIn==='Tepat Waktu').length;
        const lambat = logs.filter(l => l.type==='hadir' && l.statusIn==='Terlambat').length;
        const izin = logs.filter(l => l.type==='izin' || l.type==='sakit').length;
        const alpa = logs.filter(l => l.type==='alpa').length;
        const h = tepat+lambat;
        tbody.innerHTML += `<tr><td>${t.name}</td><td class="text-center">${h}</td><td class="text-center" style="color:var(--color-success)">${tepat}</td><td class="text-center" style="color:var(--color-warning)">${lambat}</td><td class="text-center" style="color:var(--color-info)">${izin}</td><td class="text-center" style="color:var(--color-danger)">${alpa}</td><td class="text-right"><span class="badge badge-success">OK</span></td></tr>`;
    });
}
if(document.getElementById("select-report-month")) {
    const sel = document.getElementById("select-report-month");
    const d = new Date(); sel.innerHTML = `<option value="${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}">Bulan Ini</option>`;
    sel.addEventListener("change", renderReports);
}

document.getElementById("btn-export-csv").addEventListener("click", () => {
    let csvContent = "data:text/csv;charset=utf-8,Nama Guru,Total Hadir,Tepat Waktu,Terlambat,Izin/Sakit,Alpa\n";
    document.querySelectorAll("#report-list-body tr").forEach(row => {
        const cols = Array.from(row.querySelectorAll("td")).map(c => `"${c.innerText}"`);
        if(cols.length > 5) csvContent += cols.slice(0,6).join(",") + "\n";
    });
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Laporan_${document.getElementById("select-report-month").value}.csv`;
    link.click();
});

// ==========================================================================
// BOOTSTRAP
// ==========================================================================
if (!window.QRHelper) {
    qrHelper = { generateMockSVG: (text) => `<div style="text-align:center; padding:10px;"><i class="fa-solid fa-qrcode" style="font-size:64px; color:#3b82f6;"></i><br>${text}</div>` }
} else { qrHelper = new QRHelper(); }

window.addEventListener("load", () => {
    // 1. Init Database (Will trigger checkSession automatically after loading)
    initDatabase();
});
